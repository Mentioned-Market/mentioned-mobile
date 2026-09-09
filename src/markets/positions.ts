// Merges the three position sources into one row model, grouped open /
// finished, with the CTA each row will get once trading lands (v3).
import type { FreeUserActivity } from '@/api/free';
import type { PaidMajorityUserPosition } from '@/api/paidMajority';
import type { PaidMarketUserPosition } from '@/api/paidMarkets';
import { shares as fmtShares, tokens, usd, usdc } from '@/lib/format';
import type { MarketKind } from '@/markets/merge';

export type PositionCta = { label: string; tone: 'gold' | 'yes' | 'neutral' } | null;

export type PositionRow = {
  key: string;
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
};

export function fromPaidMajority(p: PaidMajorityUserPosition): PositionRow {
  const finished = p.status !== 0;
  const claim = p.claimableUsdc > 0;
  return {
    key: `pm:${p.marketId}:${p.wordHash}`,
    kind: 'paid-majority',
    cover: null,
    href: finished ? `/result/majority/${p.marketId}` : `/majority/${p.marketId}`,
    title: p.title,
    line: `${p.word} ×${p.units}`,
    value: claim ? `Claim ${usd(p.claimableUsdc)}` : `${usd(p.stakeUsdc)} staked`,
    finished,
    won: finished ? claim : null,
    stakeUsd: finished ? undefined : p.stakeUsdc,
    claimableUsd: claim ? p.claimableUsdc : undefined,
    cta: claim ? { label: `Claim ${usd(p.claimableUsdc)}`, tone: 'yes' } : p.refundable ? { label: 'Refund', tone: 'gold' } : finished ? { label: 'View result', tone: 'neutral' } : null,
  };
}

export function fromPaidYesNo(p: PaidMarketUserPosition): PositionRow {
  const yes = BigInt(p.yesShares);
  const no = BigInt(p.noShares);
  const side = yes >= no ? 'YES' : 'NO';
  const held = side === 'YES' ? yes : no;
  const finished = p.marketStatus === 2 || p.outcome !== null;
  const won = p.outcome === null ? null : (p.outcome ? 'YES' : 'NO') === side;
  return {
    key: `pa:${p.marketId}:${p.wordIndex}:${side}`,
    kind: 'paid-yesno',
    cover: p.coverImageUrl,
    href: finished ? `/result/paid/${p.marketId}` : `/paid/${p.marketId}`,
    title: p.marketTitle,
    line: `${side} ${fmtShares(held)} shares · ${p.wordLabel}`,
    value: finished ? (won ? `Redeem ${usdc(held)}` : 'Lost') : `Worth ${usdc(p.estValueUsdc)} (cost ${usdc(p.costBasisUsdc)})`,
    finished,
    won,
    stakeUsd: finished ? undefined : Number(p.costBasisUsdc) / 1e6,
    claimableUsd: finished && won ? Number(held) / 1e6 : undefined,
    // Won: redeem the shares for $1 each. Lost: the empty token account still
    // holds rent, so the CTA is to reclaim it. Both are wired in v3.
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
      kind: majority ? 'free-majority' : 'free-yesno',
      cover: null,
      href: finished ? `/result/${majority ? 'free-majority' : 'free'}/${p.market_id}` : majority ? `/free-majority/${p.market_id}` : `/free/${p.market_id}`,
      title: p.market_title,
      line: majority ? `${p.word} · ${tokens(spent)} tokens` : `${side} ${(side === 'YES' ? yes : no).toFixed(2)} shares · ${p.word}`,
      value: finished ? (received > 0 ? `Returned ${tokens(received)} tokens` : 'No return') : `${tokens(spent)} tokens in`,
      finished,
      won,
      tokensIn: finished ? undefined : spent,
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
