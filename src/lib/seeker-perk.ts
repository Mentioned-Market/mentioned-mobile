// The Seeker perk: link the Seeker's Seed Vault wallet to the account, then
// collect a one-time welcome stake ($1 USDC plus the SOL for a first pick).
//
// Everything the card says and every decision about what it offers lives here,
// tested; src/ui/seeker-card.tsx only draws it. The server decides eligibility
// (app/api/seeker on the web); this module never guesses at it.
import { ApiError } from '@/api/client';
import type { SeekerStatus } from '@/api/seeker';
import { formatSol } from '@/chain/amm';
import { errorMessage } from '@/lib/error-message';
import { usdc } from '@/lib/format';

const SIGNATURE_BYTES = 64;

/**
 * The Ed25519 signature out of what MWA `signMessages` returns. The protocol
 * hands back a "signed payload", which Seed Vault returns as the message with
 * the 64-byte signature appended; a wallet that returns the bare signature is
 * handled too. Either way the signature is the last 64 bytes, as Solana
 * Mobile's own wallet adapter reads it.
 */
export function signatureFromSignedPayload(signed: Uint8Array): Uint8Array {
  if (signed.length < SIGNATURE_BYTES) throw new Error('The wallet returned no signature');
  return signed.slice(signed.length - SIGNATURE_BYTES);
}

/** "$1.00 and 0.006 SOL" */
export function grantAmountText(grant: SeekerStatus['grant']): string {
  return `${usdc(grant.usdcBaseUnits, { dp: 2 })} and ${formatSol(BigInt(grant.lamports))} SOL`;
}

/** What the button says while the stake is being sent: the amounts, so it is plain that money is moving. */
export function sendingLabel(grant: SeekerStatus['grant']): string {
  return `Sending ${grantAmountText(grant)}`;
}

/** 'pick' opens the markets; 'history' opens Transactions. The rest call the server. */
export type SeekerAction = 'link' | 'claim' | 'check' | 'pick' | 'history';

export type SeekerCard = {
  title: string;
  body: string;
  /** What the button does, or null when there is nothing to do. */
  action: SeekerAction | null;
  cta: string | null;
  /** Show the verified tick. */
  verified: boolean;
  /** The moment the stake landed: the card is drawn as a gold announcement. */
  celebrate?: boolean;
};

/**
 * What the Seeker card shows for this status. Null when there is no card.
 * `justFunded` is true only in the session where the stake landed: a $1 rise on
 * a large balance is easy to miss, so that moment gets its own loud card, and
 * every later visit gets the quiet one.
 */
export function seekerCard(status: SeekerStatus | undefined, justFunded = false): SeekerCard | null {
  if (!status) return null;
  const { grant } = status;
  const amount = grantAmountText(grant);

  if (!status.linked) {
    if (grant.status === 'available') {
      return {
        title: 'Got a Seeker?',
        body: `Link it to your account and get ${amount} for your first pick, on us. One per Seeker.`,
        action: 'link',
        cta: 'Link my Seeker',
        verified: false,
      };
    }
    return {
      title: 'Got a Seeker?',
      body: 'Link it to your account to verify you are on a Seeker.',
      action: 'link',
      cta: 'Link my Seeker',
      verified: false,
    };
  }

  switch (grant.status) {
    case 'available':
      return {
        title: 'Seeker verified',
        body: `Your welcome stake of ${amount} is ready to collect.`,
        action: 'claim',
        cta: 'Collect welcome stake',
        verified: true,
      };
    case 'processing':
      return {
        title: 'Seeker verified',
        body: 'Your welcome stake is on its way. It can take a minute to arrive.',
        action: 'check',
        cta: 'Check again',
        verified: true,
      };
    case 'funded':
      if (justFunded) {
        const sol = formatSol(BigInt(grant.lamports));
        return {
          title: 'Welcome stake sent',
          body: `+${usdc(grant.usdcBaseUnits, { dp: 2 })} and +${sol} SOL just landed in your wallet. Your first pick is on us.`,
          action: 'pick',
          cta: 'Make your first pick',
          verified: true,
          celebrate: true,
        };
      }
      return {
        title: 'Seeker verified',
        body: `Welcome stake received: ${amount}. Your first pick is covered.`,
        action: 'history',
        cta: 'See it in Transactions',
        verified: true,
      };
    case 'unavailable':
      return { title: 'Seeker verified', body: 'Your Seeker is linked to this account.', action: null, cta: null, verified: true };
  }
}

/** The Seeker offer as Home shows it: one compact row, led by the money. */
export type SeekerHomeOffer = {
  /** One line; `amount` inside it is drawn in gold. */
  title: string;
  amount: string;
  subtitle: string;
  action: SeekerAction;
  /** Short: it sits on a small button beside the text. */
  cta: string;
  /** The moment the stake landed: drawn as a gold announcement. */
  celebrate: boolean;
};

/**
 * What Home offers a Seeker owner, or null for nothing. Home only carries the
 * offer while there is money in it: a Seeker that cannot get the stake gets
 * nothing on Home (Me still offers the link, to verify), and once the stake
 * has landed the card shows once, as a celebration, then goes. The server
 * decides whether the stake is available; this never promises one it has not.
 */
export function seekerHomeOffer(status: SeekerStatus | undefined, justFunded = false): SeekerHomeOffer | null {
  if (!status) return null;
  const { grant } = status;
  const dollars = usdc(grant.usdcBaseUnits, { dp: 2 });
  const sol = formatSol(BigInt(grant.lamports));
  if (grant.status === 'funded') {
    if (!justFunded) return null;
    return {
      title: `+${dollars} just landed`,
      amount: `+${dollars}`,
      subtitle: `Plus ${sol} SOL for fees. Your first pick is on us.`,
      action: 'pick',
      cta: 'Pick',
      celebrate: true,
    };
  }
  if (grant.status !== 'available') return null;
  if (!status.linked) {
    return {
      title: `Got a Seeker? Get ${dollars} free`,
      amount: dollars,
      subtitle: `Your first pick is on us, plus ${sol} SOL for fees.`,
      action: 'link',
      cta: 'Link',
      celebrate: false,
    };
  }
  return {
    title: `Your ${dollars} is waiting`,
    amount: dollars,
    subtitle: 'Verified. Collect it for your first pick.',
    action: 'claim',
    cta: 'Collect',
    celebrate: false,
  };
}

/**
 * What a failed link or claim says. The server's seeker routes send a sentence
 * written for the person with every refusal, so that wins over the generic
 * status mapping, which would turn a 503 "could not check your Seeker" into
 * "Mentioned is having trouble".
 */
export function seekerErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.code && e.message && !e.message.startsWith('/api/')) return e.message;
  const raw = e instanceof Error ? e.message : String(e);
  if (/declined|rejected|cancel|user denied/i.test(raw)) return 'The wallet did not approve it. Nothing was linked.';
  return errorMessage(e);
}
