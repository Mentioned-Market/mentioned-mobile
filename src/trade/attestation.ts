// The rules around the integrity confirmation: what is due, what a tap on
// Confirm does, and what each failure says. The sheet and the hook that opens
// it (src/ui/attestation-sheet.tsx, src/trade/use-attestation-gate.tsx) only
// hold state; everything they decide is decided here, where it is unit tested.
//
// The website refuses to broadcast a real-money trade, or to enter a wallet in
// the Arena, until that wallet has confirmed. The copy, the versions and the
// rule for which confirmation is due are the web's own, ported in
// src/lib/attestation.ts. Asking first is the friendly path, not the only
// check: the RPC proxy enforces it again on broadcast.
import { ApiError } from '@/api/client';
import { getArenaAttestation, getTradeAttestation, recordArenaAttestation, recordTradeAttestation } from '@/api/attestations';
import { ATTESTATION_REQUIRED, type AttestationMarketKind, type AttestationVariant } from '@/lib/attestation';
import { errorMessage } from '@/lib/error-message';

export type AttestationTarget = { scope: 'trade'; kind: AttestationMarketKind; marketId: string } | { scope: 'arena' };

/** How a gate ends. No `error` on a refusal means the user cancelled, which needs no message. */
export type GateResult = { ok: true } | { ok: false; error?: string };

/** The four calls the gate makes, injectable so the rules can be tested without a network. */
export type AttestationApi = {
  getTrade: typeof getTradeAttestation;
  getArena: typeof getArenaAttestation;
  recordTrade: typeof recordTradeAttestation;
  recordArena: typeof recordArenaAttestation;
};

const LIVE: AttestationApi = {
  getTrade: getTradeAttestation,
  getArena: getArenaAttestation,
  recordTrade: recordTradeAttestation,
  recordArena: recordArenaAttestation,
};

export const SESSION_EXPIRED = 'Your session expired. Sign in again, then try again.';
export const CHECK_FAILED = 'Could not check your confirmation. Try again.';
export const SAVE_FAILED = 'Could not save your confirmation. Try again.';
/** Said when the server refuses a trade the app thought was confirmed. */
export const TRADE_REFUSED = 'Confirm the trading rules for this market, then try again.';
export const ARENA_REFUSED = 'Confirm the Arena rules, then try again.';

/**
 * A failure in the app's own words. Being offline or timing out keeps its
 * usual sentence; anything else gets `fallback`, because the server's wording
 * for these routes ("kind and marketId are required") is written for us.
 */
function explain(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return SESSION_EXPIRED;
    if (e.status === 429) return errorMessage(e);
    if (/arena has ended/i.test(e.message)) return 'This season has ended.';
    return fallback;
  }
  const said = errorMessage(e);
  return /offline|took too long/i.test(said) ? said : fallback;
}

/** Which confirmation the wallet owes before this action, or null when it owes none. */
export async function requiredAttestation(
  target: AttestationTarget,
  api: AttestationApi = LIVE,
): Promise<{ required: AttestationVariant | null } | { error: string }> {
  try {
    const required = target.scope === 'arena' ? await api.getArena() : await api.getTrade(target.kind, target.marketId);
    return { required };
  } catch (e) {
    return { error: explain(e, CHECK_FAILED) };
  }
}

export type ConfirmOutcome =
  | { status: 'saved' }
  /** The wording that is due changed since the sheet opened: show this one instead. */
  | { status: 'switch'; variant: AttestationVariant }
  | { status: 'error'; message: string };

/**
 * Record the confirmation the user just ticked.
 *
 * Posted once and never retried, like every write to the website. A 409
 * VARIANT_MISMATCH means the server wants a different sheet than the one shown
 * (a compact one where the full is due), so nothing was recorded: it asks what
 * is due now, and that read is safe to make.
 */
export async function confirmAttestation(target: AttestationTarget, variant: AttestationVariant, api: AttestationApi = LIVE): Promise<ConfirmOutcome> {
  try {
    if (target.scope === 'arena') await api.recordArena();
    else if (variant === 'arena') return { status: 'error', message: SAVE_FAILED };
    else await api.recordTrade(target.kind, target.marketId, variant);
    return { status: 'saved' };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && e.message === 'VARIANT_MISMATCH') {
      const now = await requiredAttestation(target, api);
      if ('error' in now) return { status: 'error', message: now.error };
      return now.required === null ? { status: 'saved' } : { status: 'switch', variant: now.required };
    }
    return { status: 'error', message: explain(e, SAVE_FAILED) };
  }
}

/**
 * Whether a raw failure is the server refusing for want of a confirmation.
 * The RPC proxy answers a broadcast with this code as its JSON-RPC message, and
 * the Arena routes answer with it as their error.
 */
export function isAttestationRefusal(raw: string): boolean {
  return raw.includes(ATTESTATION_REQUIRED);
}
