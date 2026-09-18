// A referral code arriving by App Link (`/ref/<code>`). The website's codes
// are short and alphanumeric; anything else is dropped rather than stored,
// because whatever is stored is later sent to the sign-in route as is.
const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;

/** The code as it should be stored and sent, or null if it is not a code. */
export function cleanReferralCode(raw: string | undefined | null): string | null {
  const code = (raw ?? '').trim();
  return CODE_RE.test(code) ? code : null;
}
