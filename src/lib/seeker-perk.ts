// The Seeker perk: link the Seeker's Seed Vault wallet to the account, then
// get a first pick paid for. The server offers that one of two ways and says
// which: `freePick`, one sponsored pick on a paid "Most said wins" market
// (src/trade/seeker-pick.ts), or `grant`, the older cash stake ($1 USDC plus
// the SOL for a first pick), which people withdrew instead of playing.
//
// Everything the card says and every decision about what it offers lives here,
// tested; src/ui/seeker-card.tsx only draws it. The server decides eligibility
// (app/api/seeker on the web); this module never guesses at it.
import { ApiError } from '@/api/client';
import type { PaidMajorityListEntry } from '@/api/paidMajority';
import type { SeekerStatus } from '@/api/seeker';
import type { WalletProvider } from '@/auth/wallet-routing';
import { formatSol } from '@/chain/amm';
import { errorMessage } from '@/lib/error-message';
import { usdc } from '@/lib/format';

const SIGNATURE_BYTES = 64;

/**
 * The wallet the Seeker perk is offered to, or null when it is not offered.
 *
 * An account signed in with the Seeker's own wallet is left out. The perk is
 * "link your Seeker to your account", and there the two are one wallet. It is
 * also a pick that account cannot place: the sponsored pick is signed by the
 * funder first and co-signed by the account, and the Seed Vault adds to what
 * it signs (src/trade/wallet-edit.ts), which the funder's signature does not
 * cover.
 *
 * This is the one rule every part of the perk asks: the status query, the
 * link flow, and the co-signing path. Version 1.2.0 hid the offer by disabling
 * the status query alone, and a pull to refresh on Me fetched it anyway (a
 * manual refetch ignores `enabled`). A Seeker account was then offered the
 * link, linked to itself, and was offered a pick that failed at signing.
 */
export function seekerPerkWallet(sessionWallet: string | null, provider: WalletProvider): string | null {
  return provider === 'seeker' ? null : sessionWallet;
}

/** Said if a Seeker account reaches the perk some other way. */
export const SEEKER_ACCOUNT_NO_PERK = 'The free Seeker pick is not available yet on an account signed in with a Seeker.';

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

/**
 * 'pick' opens the markets, 'history' Transactions and 'positions' Positions.
 * The rest call the server: 'check' asks about a cash stake on its way,
 * 'check-pick' about a free pick that was sent.
 */
export type SeekerAction = 'link' | 'claim' | 'check' | 'check-pick' | 'pick' | 'history' | 'positions';

/** "$1.00": what the free pick covers. */
const pickAmount = (pick: SeekerStatus['freePick']) => usdc(pick.usdcBaseUnits, { dp: 2 });

/** The free pick's card once the Seeker is linked, or null when the account's perk is not a pick. */
function freePickCard(pick: SeekerStatus['freePick'], justPlaced: boolean): SeekerCard | null {
  switch (pick.status) {
    case 'unavailable':
      return null;
    case 'available':
      return {
        title: 'Seeker verified',
        body: `Your first pick is on us: one word in a paid "Most said wins" market, and we cover the ${pickAmount(pick)}. It works on those markets only.`,
        action: 'pick',
        cta: 'Use my free pick',
        verified: true,
      };
    case 'processing':
      return {
        title: 'Seeker verified',
        body: 'Your free pick is being placed. It can take a minute to show.',
        action: 'check-pick',
        cta: 'Check again',
        verified: true,
      };
    case 'used': {
      const on = pick.word ? ` on "${pick.word}"` : '';
      if (justPlaced) {
        return {
          title: 'Free pick placed',
          body: `Your pick${on} is in, on us. If it wins, the winnings are yours.`,
          action: 'positions',
          cta: 'See my picks',
          verified: true,
          celebrate: true,
        };
      }
      return { title: 'Seeker verified', body: `Free pick used${on}.`, action: 'positions', cta: 'See my picks', verified: true };
    }
  }
}

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
    if (status.freePick.status === 'available') {
      return {
        title: 'Got a Seeker?',
        body: `Link it to your account and your first pick is on us: ${pickAmount(status.freePick)} on one word in a paid "Most said wins" market. One per Seeker.`,
        action: 'link',
        cta: 'Link my Seeker',
        verified: false,
      };
    }
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

  const pick = freePickCard(status.freePick, justFunded);
  if (pick) return pick;

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
  const { grant, freePick } = status;
  if (freePick.status === 'available') {
    const pickDollars = pickAmount(freePick);
    if (!status.linked) {
      return {
        title: `Got a Seeker? A ${pickDollars} pick, free`,
        amount: pickDollars,
        subtitle: 'Link it for one word on a "Most said wins" market.',
        action: 'link',
        cta: 'Link',
        celebrate: false,
      };
    }
    return {
      title: `Your free ${pickDollars} pick is waiting`,
      amount: pickDollars,
      subtitle: 'For one word on a paid "Most said wins" market.',
      action: 'pick',
      cta: 'Pick',
      celebrate: false,
    };
  }
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

/** What the free pick means for the basket on a paid majority market. */
export type FreePickUse =
  /** This basket is the free pick: one word, paid for. */
  | { free: true }
  /** There is a free pick, but not for this basket as it stands; `note` says how to use it. */
  | { free: false; note: string };

/**
 * Whether the basket on a paid majority market is the Seeker's free pick.
 * Null when there is no free pick to speak of here.
 *
 * The free pick is exactly one word, because the server sponsors exactly one
 * buy in one transaction. A bigger basket is paid for as usual and keeps the
 * free pick for later, and says so, so nobody pays for a word they could have
 * had free. A market that costs more per word than the pick covers is not
 * offered: the server would refuse it.
 */
export function freePickUse(status: SeekerStatus | undefined, basketSize: number, unitPriceBaseUnits: bigint): FreePickUse | null {
  if (!status?.linked || status.freePick.status !== 'available') return null;
  if (unitPriceBaseUnits > BigInt(status.freePick.usdcBaseUnits)) return null;
  if (basketSize === 1) return { free: true };
  // Short: it sits beside a button, under `FREE_PICK_BAR_TITLE`.
  if (basketSize === 0) return { free: false, note: 'With your Seeker. Tap one.' };
  return { free: false, note: 'Your free Seeker pick covers one word. Review one word on its own to use it.' };
}

/** The pinned bar's title on a market that takes the free pick, before a word is chosen. */
export const FREE_PICK_BAR_TITLE = 'First word free';

/** Said when the free pick is tapped and no market takes it right now. */
export const NO_FREE_PICK_MARKET = 'No "Most said wins" market is open right now. Your free pick keeps until one is.';

/**
 * Said on a paid market that is not a majority board, to an account holding
 * an unused free pick, so nobody looks for it there. Null for everyone else.
 */
export function freePickElsewhereNote(status: SeekerStatus | undefined): string | null {
  if (!status?.linked || status.freePick.status !== 'available') return null;
  return 'Your free Seeker pick works on "Most said wins" markets, not on this one.';
}

/** A market is not offered this close to its lock: the pick could lock under the signature. */
const PICK_LOCK_MARGIN_MS = 2 * 60_000;

/**
 * Where "Use my free pick" goes: the open paid majority market that closes
 * soonest and costs no more per word than the pick covers. Null when there is
 * none, and the person is told so, since the markets list would only show
 * markets the pick cannot be used on.
 */
export function freePickMarket(markets: readonly PaidMajorityListEntry[], status: SeekerStatus | undefined, now = Date.now()): string | null {
  if (!status || status.freePick.status !== 'available') return null;
  const cap = BigInt(status.freePick.usdcBaseUnits);
  const open = markets
    .filter((m) => m.status === 0 && Number(m.lockTs) * 1000 > now + PICK_LOCK_MARGIN_MS && BigInt(m.unitPrice) <= cap)
    .sort((a, b) => Number(a.lockTs) - Number(b.lockTs));
  return open[0] ? `/majority/${open[0].marketId}` : null;
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
  // The wallet sheet was left open until the session gave up. Its raw form is a Java exception.
  if (/timed out|timeoutexception/i.test(raw)) return 'The wallet did not answer in time. Nothing was linked. Try again.';
  return errorMessage(e);
}
