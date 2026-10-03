// Gate a real-money trade or an Arena entry on the integrity confirmation.
//
//   const attestation = useAttestationGate();
//   const gate = await attestation.requireTrade('amm', id);
//   if (!gate.ok) { if (gate.error) setInputError(gate.error); return; }
//   ...simulate, sign, send...
//   return <>{...}{attestation.sheet}</>
//
// The server says which confirmation is due and records it; this only holds
// the open sheet and the promise waiting on it. Cancelling resolves
// `{ ok: false }` with no error and writes nothing. The rules are in
// src/trade/attestation.ts.
import { useCallback, useRef, useState, type ReactNode } from 'react';

import type { AttestationCopy, AttestationMarketKind, AttestationVariant } from '@/lib/attestation';
import { confirmAttestation, requiredAttestation, type AttestationTarget, type GateResult } from '@/trade/attestation';
import { AttestationSheet } from '@/ui/attestation-sheet';

type OpenState = {
  variant: AttestationVariant;
  target: AttestationTarget;
  copy?: AttestationCopy;
  resolve: (result: GateResult) => void;
};

export function useAttestationGate() {
  const [open, setOpen] = useState<OpenState | null>(null);
  // One gate at a time: a second swipe while the first is still being checked
  // or read reuses the pending promise rather than opening a second sheet.
  const pending = useRef<Promise<GateResult> | null>(null);

  const run = useCallback((target: AttestationTarget, copy?: AttestationCopy): Promise<GateResult> => {
    if (pending.current) return pending.current;
    const p = (async (): Promise<GateResult> => {
      const status = await requiredAttestation(target);
      if ('error' in status) return { ok: false, error: status.error };
      if (status.required === null) return { ok: true };
      const variant = status.required;
      return new Promise<GateResult>((resolve) => setOpen({ variant, target, copy, resolve }));
    })();
    pending.current = p;
    void p.finally(() => {
      pending.current = null;
    });
    return p;
  }, []);

  const requireTrade = useCallback((kind: AttestationMarketKind, marketId: string) => run({ scope: 'trade', kind, marketId }), [run]);
  /** `copy` swaps the framing only (e.g. ARENA_EXISTING_MEMBER_COPY); the row recorded is the same. */
  const requireArena = useCallback((opts?: { copy?: AttestationCopy }) => run({ scope: 'arena' }, opts?.copy), [run]);

  const confirm = useCallback(async (): Promise<true | string | null> => {
    if (!open) return null;
    const outcome = await confirmAttestation(open.target, open.variant);
    if (outcome.status === 'saved') return true;
    if (outcome.status === 'error') return outcome.message;
    // The wording changed since this sheet opened: show the one that is due now.
    setOpen({ variant: outcome.variant, target: open.target, resolve: open.resolve });
    return null;
  }, [open]);

  const closed = useCallback(
    (confirmed: boolean) => {
      open?.resolve(confirmed ? { ok: true } : { ok: false });
      setOpen(null);
    },
    [open],
  );

  const sheet: ReactNode = open ? (
    // Keyed by variant so a switch (compact to full) remounts with every box unticked.
    <AttestationSheet key={open.variant} variant={open.variant} copy={open.copy} onConfirm={confirm} onClosed={closed} />
  ) : null;

  return { requireTrade, requireArena, sheet };
}
