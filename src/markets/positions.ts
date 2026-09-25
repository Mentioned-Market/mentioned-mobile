// Merges the three position sources into one row model, grouped open /
// finished. `cta` names what a row is waiting on and ranks the finished list;
// claims themselves run from the per-market claim cards.
import type { FreeUserActivity } from '@/api/free';
import type { PaidMajorityUserPosition } from '@/api/paidMajority';
import type { PaidMarketUserPosition } from '@/api/paidMarkets';
import { tokens, usd, usdc } from '@/lib/format';
import type { MarketKind } from '@/markets/merge';

export type PositionCta = { label: string; tone: 'gold' | 'yes' | 'neutral' } | null;

export type PositionRow = {
  key: string;
  /** Same for every position in one market, e.g. "pm:1789117562931". */
  marketKey: string;
  kind: MarketKind;
  cover: string | null;
  href: string;
  title: string;
  /** e.g. "creative ×2" or "YES 2.00 shares · Carreras" */
  line: string;
  /** e.g. "$2.00 staked" or "Worth $1.00" */
  value: string;
  finished: boolean;
  won: boolean | null;
  cta: PositionCta;
  /** Open paid stake in dollars, for the summary. */
  stakeUsd?: number;
  /** Open free tokens in, for the summary. */
  tokensIn?: number;
  /** Claimable or redeemable dollars on finished rows. */
  claimableUsd?: number;
  /** Tokens paid back on finished free rows. */
  tokensOut?: number;
};

export function fromPaidMajority(p: PaidMajorityUserPosition): PositionRow {
  const finished = p.status !== 0;
  const claim = p.claimableUsdc > 0;
  return {
    key: `pm:${p.marketId}:${p.wordHash}`,
    marketKey: `pm:${p.marketId}`,
    kind: 'paid-majority',
    cover: null,
    href: finished ? `/result/majority/${p.marketId}` : `/majority/${p.marketId}`,
    title: p.title,
    line: `${p.word} ×${p.units}`,
    value: claim ? `Claim ${usd(p.claimableUsdc)}` : p.refundable ? `${usd(p.stakeUsdc)} refund` : `${usd(p.stakeUsdc)} staked`,
    finished,
    won: finished ? claim : null,
    stakeUsd: finished ? undefined : p.stakeUsdc,
    claimableUsd: claim ? p.claimableUsdc : undefined,
    // A refundable position gets its amount and no action. Refunds on majority
    // markets are settled from the admin tab on the website, never from the app
    // (SPEC section 7.1), so a Refund button here could only mislead.
    cta: claim
      ? { label: `Claim ${usd(p.claimableUsdc)}`, tone: 'yes' }
      : p.refundable
        ? null
        : finished
          ? { label: 'View result', tone: 'neutral' }
          : null,
  };
}

export function fromPaidYesNo(p: PaidMarketUserPosition): PositionRow {
  const yes = BigInt(p.yesShares);
  const no = BigInt(p.noShares);
  const side = yes >= no ? 'YES' : 'NO';
  const held = side === 'YES' ? yes : no;
  const finished = p.marketStatus === 2 || p.outcome !== null;
  const won = p.outcome === null ? null : (p.outcome ? 'YES' : 'NO') === side;
  // The cost basis comes from the trade indexer, which trails the chain: for a
  // few seconds on production, and indefinitely on a deployment with no
  // webhook. Shares here are read from the chain, so a position can exist with
  // no recorded cost yet. "$0.00" would be a confident wrong number, so say the
  // cost is updating, and count the position at its current value until then.
  const costKnown = Number(p.costBasisUsdc) > 0 || held === 0n;
  const costText = costKnown ? `cost ${usdc(p.costBasisUsdc)}` : 'cost updating';
  return {
    key: `pa:${p.marketId}:${p.wordIndex}:${side}`,
    marketKey: `pa:${p.marketId}`,
    kind: 'paid-yesno',
    cover: p.coverImageUrl,
    href: finished ? `/result/paid/${p.marketId}` : `/paid/${p.marketId}`,
    title: p.marketTitle,
    // An AMM position is shown as what it pays, never as a share count (see
    // src/trade/amm-display.ts). The rake is not on this route; it is 0 or a
    // hundredth of a percent on live markets, and the claim card uses the exact
    // figure when it matters.
    line: `${side} on ${p.wordLabel} · pays ${usdc(held)}`,
    value: finished ? (won ? `Redeem ${usdc(held)}` : 'Lost') : `Worth ${usdc(p.estValueUsdc)} (${costText})`,
    finished,
    won,
    stakeUsd: finished ? undefined : Number(costKnown ? p.costBasisUsdc : p.estValueUsdc) / 1e6,
    claimableUsd: finished && won ? Number(held) / 1e6 : undefined,
    // Won: redeem the shares for $1 each. Lost: the token account still holds
    // its rent deposit. Either way the action itself is the market's claim
    // card (src/ui/claim-card.tsx); this only ranks the row.
    cta: finished ? (won ? { label: `Redeem ${usdc(held)}`, tone: 'yes' } : { label: 'Reclaim rent', tone: 'neutral' }) : null,
  };
}

export function fromFree(a: FreeUserActivity): PositionRow[] {
  return a.positions.map((p) => {
    const majority = p.market_type === 'majority';
    const yes = Number(p.yes_shares);
    const no = Number(p.no_shares);
    const spent = Number(p.tokens_spent);
    const received = Number(p.tokens_received);
    const finished = p.market_status !== 'open';
    const won = finished ? received > spent : null;
    const side = yes >= no ? 'YES' : 'NO';
    return {
      key: `fr:${p.id}`,
      marketKey: `fr:${p.market_id}`,
      kind: majority ? 'free-majority' : 'free-yesno',
      cover: null,
      href: finished ? `/result/${majority ? 'free-majority' : 'free'}/${p.market_id}` : majority ? `/free-majority/${p.market_id}` : `/free/${p.market_id}`,
      title: p.market_title,
      line: majority ? `${p.word} · ${tokens(spent)} tokens` : `${side} ${(side === 'YES' ? yes : no).toFixed(2)} shares · ${p.word}`,
      value: finished ? (received > 0 ? `Returned ${tokens(received)} tokens` : 'No return') : `${tokens(spent)} tokens in`,
      finished,
      won,
      tokensIn: finished ? undefined : spent,
      tokensOut: finished ? received : undefined,
      cta: finished ? { label: 'View result', tone: 'neutral' } : null,
    };
  });
}

export type PositionSummary = { open: number; finished: number; actionable: number; stakedUsd: number; tokensIn: number; claimableUsd: number };

/** Open first; within finished, anything with a claim/redeem/refund first, then wins. */
export function groupPositions(rows: PositionRow[]): { open: PositionRow[]; finished: PositionRow[]; summary: PositionSummary } {
  const open = rows.filter((r) => !r.finished);
  const actionRank = (r: PositionRow) => (r.cta && r.cta.tone !== 'neutral' ? 0 : r.won ? 1 : 2);
  const finished = rows.filter((r) => r.finished).sort((a, b) => actionRank(a) - actionRank(b));
  const summary: PositionSummary = {
    open: open.length,
    finished: finished.length,
    actionable: finished.filter((r) => actionRank(r) === 0).length,
    stakedUsd: open.reduce((s, r) => s + (r.stakeUsd ?? 0), 0),
    tokensIn: open.reduce((s, r) => s + (r.tokensIn ?? 0), 0),
    claimableUsd: finished.reduce((s, r) => s + (r.claimableUsd ?? 0), 0),
  };
  return { open, finished, summary };
}

/** Every position one wallet holds in one market, shown as a single card. */
export type MarketGroup = {
  key: string;
  kind: MarketKind;
  cover: string | null;
  href: string;
  title: string;
  finished: boolean;
  /** True if anything in the market won, false if everything lost, else null. */
  won: boolean | null;
  rows: PositionRow[];
  /** e.g. "3 positions" */
  count: string;
  /** The market's total, e.g. "$3.00 at stake" or "$1.91 to claim". */
  value: string;
};

/**
 * Fold positions into one group per market, keeping the order the rows came
 * in, so a market sits where its most pressing position would have.
 */
export function groupByMarket(rows: PositionRow[]): MarketGroup[] {
  const byKey = new Map<string, PositionRow[]>();
  for (const r of rows) {
    const list = byKey.get(r.marketKey);
    if (list) list.push(r);
    else byKey.set(r.marketKey, [r]);
  }
  return [...byKey.entries()].map(([key, list]) => {
    const first = list[0];
    const finished = first.finished;
    const sum = (f: (r: PositionRow) => number | undefined) => list.reduce((s, r) => s + (f(r) ?? 0), 0);
    const won = !finished ? null : list.some((r) => r.won === true) ? true : list.every((r) => r.won === false) ? false : null;
    const paid = first.kind === 'paid-majority' || first.kind === 'paid-yesno';
    const claimable = sum((r) => r.claimableUsd);
    let value: string;
    if (!finished) value = paid ? `${usd(sum((r) => r.stakeUsd))} at stake` : `${tokens(sum((r) => r.tokensIn))} tokens in`;
    else if (claimable > 0) value = `${usd(claimable)} to claim`;
    else if (!paid) value = sum((r) => r.tokensOut) > 0 ? `Returned ${tokens(sum((r) => r.tokensOut))} tokens` : 'No return';
    else value = won === true ? 'Won' : won === false ? 'Lost' : 'Finished';
    return {
      key,
      kind: first.kind,
      cover: list.find((r) => r.cover)?.cover ?? null,
      href: first.href,
      title: first.title,
      finished,
      won,
      rows: list,
      count: `${list.length} position${list.length === 1 ? '' : 's'}`,
      value,
    };
  });
}
