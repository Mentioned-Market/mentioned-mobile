// PORTED_FROM mentioned/lib/seekerLinkMessage.ts @ uncommitted
// Keep byte-identical to the web copy. If the signed message format changes, change both.
// Mobile edits: none.

// ── Seeker link message (shared with the mobile app) ────────────────────────
//
// The text a Seeker's Seed Vault wallet signs to prove it belongs to the person
// signed in to Mentioned. The mobile app builds it, the server rebuilds it from
// what it already trusts (the session wallet) and compares byte for byte, so the
// format lives in exactly one file and the app carries a byte-identical copy
// (mentioned-mobile/src/lib/seekerLinkMessage.ts). Change both or neither.
//
// Pure: no imports, no Node or DOM globals, so it ports unchanged.
//
// Why the account is in the message: without it, a signature from one Seeker
// could be replayed to link that Seeker to someone else's account. With it, the
// signature is only good for the one pairing the Seeker owner approved.

export const SEEKER_LINK_TITLE = 'Link this Seeker to Mentioned'

/** How long a signed link message stays valid, either side of the server clock. */
export const SEEKER_LINK_MAX_AGE_S = 10 * 60

/** The exact message the Seed Vault signs. `timestamp` is unix seconds. */
export function buildSeekerLinkMessage(seekerWallet: string, account: string, timestamp: number): string {
  return [
    SEEKER_LINK_TITLE,
    `Seeker: ${seekerWallet}`,
    `Account: ${account}`,
    `Timestamp: ${Math.floor(timestamp)}`,
  ].join('\n')
}

/** The timestamp inside a link message, or null when it is not one. */
export function seekerLinkTimestamp(message: string): number | null {
  const line = message.split('\n')[3]
  if (!line || !line.startsWith('Timestamp: ')) return null
  const raw = line.slice('Timestamp: '.length)
  if (!/^\d{1,12}$/.test(raw)) return null
  return Number(raw)
}

/**
 * True when `message` is exactly the link message for this Seeker and account,
 * signed within the allowed window of `nowS`.
 */
export function isValidSeekerLinkMessage(
  message: string,
  seekerWallet: string,
  account: string,
  nowS: number,
): boolean {
  const ts = seekerLinkTimestamp(message)
  if (ts === null) return false
  if (Math.abs(nowS - ts) > SEEKER_LINK_MAX_AGE_S) return false
  return message === buildSeekerLinkMessage(seekerWallet, account, ts)
}
