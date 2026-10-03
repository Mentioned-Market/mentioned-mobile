// PORTED_FROM mentioned/lib/attestation.ts @ b077b8c
// Keep byte-identical to the web copy. If the confirmation copy or its versions change, change both.
// Mobile edits: none.

// Trading integrity confirmations ("attestations"): copy, versions and the
// pure rules that decide which modal a trade needs. Client-safe (no DB, no RPC),
// shared by the modal, the gate hook, the API routes and the tests.
//
// Two copy families, versioned independently so rewording the Arena copy never
// forces every trader back through the full trading modal (and vice versa):
//  - trading: 'full' once per version, then 'compact' once per market
//  - arena:   once per Arena season per version
//
// Bump a version whenever the words a user agrees to change. Every row records
// the version it was confirmed on, so old confirmations stay provable after a bump.
//
// Free markets (play tokens) never use any of this.

export const TRADING_ATTESTATION_VERSION = 'attest-v1'
export const ARENA_ATTESTATION_VERSION = 'arena-v1'

export type TradeAttestationVariant = 'full' | 'compact'
export type AttestationVariant = TradeAttestationVariant | 'arena'
/** The two real-money market engines. Their numeric market ids overlap. */
export type AttestationMarketKind = 'amm' | 'majority'

export const INTEGRITY_RULES_PATH = '/integrity'

/** JSON error code shared by the proxy, the sponsored-pick routes and Arena. */
export const ATTESTATION_REQUIRED = 'ATTESTATION_REQUIRED'
/** JSON-RPC error code the paid RPC proxy returns for an unattested trade. */
export const ATTESTATION_RPC_CODE = -32050

export interface AttestationCopy {
  title: string
  intro: string
  checkboxes: string[]
  footer?: string
  cancelLabel: string
  confirmLabel: string
  /** Show the "Integrity rules" link. */
  rulesLink: boolean
}

export const ATTESTATION_COPY: Record<AttestationVariant, AttestationCopy> = {
  full: {
    title: 'Before you trade',
    intro: 'Mention markets only work if they’re fair. By trading, you confirm:',
    checkboxes: [
      'I’m not connected to anyone speaking in this market, including their team, crew or mods, and I can’t influence what they say.',
      'I don’t have inside knowledge of what will be said, like scripts, prepared remarks or early access to a recording.',
      'I won’t try to get a word said, including through paid messages, donations or asking a speaker directly.',
    ],
    footer: 'If a word market is manipulated, accounts involved are closed and are not guaranteed to be able to claim funds.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Confirm and trade',
    rulesLink: true,
  },
  compact: {
    title: 'Quick check',
    intro: 'By trading, you confirm you’re not connected to anyone speaking in this market, have no inside knowledge of what will be said, and won’t try to influence it.',
    checkboxes: ['I confirm'],
    cancelLabel: 'Cancel',
    confirmLabel: 'Trade',
    rulesLink: true,
  },
  arena: {
    title: 'One account, one player',
    intro: 'Arena prizes are for real players. By joining, you confirm:',
    checkboxes: [
      'This is my only account taking part in this Arena season.',
      'I won’t trade with myself or coordinate trades with other accounts to farm points.',
    ],
    footer: 'We review top accounts before prizes are paid. Prizes can be withheld for multi-accounting or wash trading.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Join Arena',
    rulesLink: false,
  },
}

/**
 * Wording for players who joined an Arena team before the confirmation existed
 * and are prompted on /arena. Same commitments (the checkboxes are the Arena
 * ones by reference), so it records the same 'arena' row on the same version;
 * only the framing changes, so "Cancel" / "Join Arena" can't read as leaving
 * or re-joining the team they're already on.
 */
export const ARENA_EXISTING_MEMBER_COPY: AttestationCopy = {
  ...ATTESTATION_COPY.arena,
  intro: 'You’re on a team this season. To stay eligible for prizes, confirm:',
  cancelLabel: 'Not now',
  confirmLabel: 'Confirm',
}

/**
 * Which trading modal a wallet needs before trading a given market, on the
 * current version. `hasFull`: any full confirmation on this version (any
 * market). `hasMarket`: a full or compact confirmation for THIS market on this
 * version. An Arena confirmation never counts toward either.
 */
export function decideTradeVariant(hasFull: boolean, hasMarket: boolean): TradeAttestationVariant | null {
  if (hasMarket) return null
  return hasFull ? 'compact' : 'full'
}

/**
 * Whether a variant the user actually saw satisfies what the server requires.
 * Seeing the full modal when only the compact one was due is stricter, so it
 * counts; the reverse never does.
 */
export function variantSatisfies(shown: TradeAttestationVariant, required: TradeAttestationVariant): boolean {
  return shown === required || (shown === 'full' && required === 'compact')
}

/** The confirm button is enabled only when every box is ticked. */
export function canConfirm(ticked: readonly boolean[], variant: AttestationVariant): boolean {
  const n = ATTESTATION_COPY[variant].checkboxes.length
  return ticked.length === n && ticked.every(Boolean)
}

/** Numeric on-chain market ids only (u64). */
export function isValidMarketId(id: unknown): id is string {
  if (typeof id !== 'string' || !/^\d{1,20}$/.test(id)) return false
  return BigInt(id) <= 18446744073709551615n
}
