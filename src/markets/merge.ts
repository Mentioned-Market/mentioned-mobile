// Merges the three list routes into one card model for the Markets tab.
// Pure: unit-testable, no React. Order: featured first, open by soonest lock,
// then pending resolution, then resolved and cancelled (most recent first).
import type { FreeListEntry } from '@/api/free';
import type { PaidMajorityListEntry } from '@/api/paidMajority';
import type { PaidMarketListEntry } from '@/api/paidMarkets';
import { getDisplayStatus } from '@/free/marketUtils';
import { toMs } from '@/lib/time';

export type MarketKind = 'paid-majority' | 'paid-yesno' | 'free-yesno' | 'free-majority';
export type MarketStatus = 'open' | 'pending' | 'resolved' | 'cancelled';
export type WordOutcome = 'yes' | 'no' | 'winner' | 'loser' | null;

export type MarketSummary = {
  kind: MarketKind;
  id: string;
  href: string;
  title: string;
  cover: string | null;
  status: MarketStatus;
  lockAt: number | null;
  eventAt: number | null;
  /** Up to five words for the card. `pct` is YES price or pool share, 0..1. */
  words: { label: string; pct: number; outcome: WordOutcome }[];
  pool: { kind: 'usdc'; usd: number } | { kind: 'tokens'; tokens: number };
  traderCount: number;
  isFeatured: boolean;
};

export const isPaid = (m: { kind: MarketKind }) => m.kind === 'paid-majority' || m.kind === 'paid-yesno';
export const isMajority = (m: { kind: MarketKind }) => m.kind === 'paid-majority' || m.kind === 'free-majority';

function paidStatus(status: number, lockAt: number | null, now: number, resolvedCode: number, cancelledCode?: number): MarketStatus {
  if (status === resolvedCode) return 'resolved';
  if (cancelledCode !== undefined && status === cancelledCode) return 'cancelled';
  if (lockAt && now >= lockAt) return 'pending';
  return 'open';
}

export function fromPaidMajority(m: PaidMajorityListEntry, now = Date.now()): MarketSummary {
  const lockAt = toMs(m.lockTs);
  const status = paidStatus(m.status, lockAt, now, 1, 2);
  return {
    kind: 'paid-majority',
    id: m.marketId,
    href: `/majority/${m.marketId}`,
    title: m.title,
    cover: m.coverImageUrl,
    status,
    lockAt,
    eventAt: toMs(m.eventStartTime),
    words: m.words.slice(0, 5).map((w) => ({
      // A word the server has not resolved to text yet (the market route says
      // the same, see UNNAMED on the majority screen).
      label: w.word ?? 'Word not shown yet',
      pct: w.oddsPct / 100,
      outcome: status === 'resolved' ? (w.outcome === 1 ? 'winner' : 'loser') : null,
    })),
    pool: { kind: 'usdc', usd: Number(m.poolUsdc) / 1e6 },
    traderCount: m.traderCount,
    isFeatured: m.isFeatured,
  };
}

export function fromPaidYesNo(m: PaidMarketListEntry, now = Date.now()): MarketSummary {
  const lockAt = toMs(m.locksAt);
  return {
    kind: 'paid-yesno',
    id: m.marketId,
    href: `/paid/${m.marketId}`,
    title: m.title,
    cover: m.coverImageUrl,
    status: paidStatus(m.status, lockAt, now, 2),
    lockAt,
    eventAt: toMs(m.eventStartTime),
    words: m.words.slice(0, 5).map((w) => ({
      label: w.label,
      pct: w.yesPrice,
      outcome: w.outcome === null ? null : w.outcome ? 'yes' : 'no',
    })),
    pool: { kind: 'usdc', usd: 0 },
    traderCount: m.traderCount,
    isFeatured: m.isFeatured,
  };
}

export function fromFree(m: FreeListEntry): MarketSummary {
  const majority = m.market_type === 'majority';
  const ds = getDisplayStatus(m);
  const status: MarketStatus =
    ds === 'cancelled' ? 'cancelled' : ds === 'resolved' || ds === 'closed' ? 'resolved' : ds === 'pending_resolution' ? 'pending' : 'open';
  return {
    kind: majority ? 'free-majority' : 'free-yesno',
    id: String(m.id),
    href: majority ? `/free-majority/${m.id}` : `/free/${m.id}`,
    title: m.title,
    cover: m.cover_image_url,
    status,
    lockAt: toMs(m.lock_time),
    eventAt: toMs(m.event_start_time),
    words: m.words_prices.slice(0, 5).map((w) => ({
      label: w.word,
      pct: w.yes_price,
      outcome:
        w.resolved_outcome === null ? null : majority ? (w.resolved_outcome ? 'winner' : 'loser') : w.resolved_outcome ? 'yes' : 'no',
    })),
    pool: { kind: 'tokens', tokens: m.play_tokens },
    traderCount: m.trader_count,
    isFeatured: m.is_featured,
  };
}

const STATUS_RANK: Record<MarketStatus, number> = { open: 0, pending: 1, resolved: 2, cancelled: 3 };

/** A featured market only takes the hero slot while it is still open. */
export const isHero = (m: MarketSummary) => m.isFeatured && m.status === 'open';

export function sortMarkets(list: MarketSummary[]): MarketSummary[] {
  return [...list].sort((a, b) => {
    const ha = isHero(a);
    const hb = isHero(b);
    if (ha !== hb) return ha ? -1 : 1;
    const ra = STATUS_RANK[a.status];
    const rb = STATUS_RANK[b.status];
    if (ra !== rb) return ra - rb;
    const la = a.lockAt ?? Number.MAX_SAFE_INTEGER;
    const lb = b.lockAt ?? Number.MAX_SAFE_INTEGER;
    // Open: the market closing soonest first. Pending and finished: most recent first.
    return ra === 0 ? la - lb : lb - la;
  });
}

export type MarketSection = { key: MarketStatus; title: string; data: MarketSummary[] };
const SECTION_TITLES: Record<MarketStatus, string> = { open: 'Open', pending: 'Pending resolution', resolved: 'Resolved', cancelled: 'Cancelled' };

/** Sorted list split into status sections for the Markets tab. */
export function sectionMarkets(sorted: MarketSummary[]): MarketSection[] {
  const order: MarketStatus[] = ['open', 'pending', 'resolved', 'cancelled'];
  return order.map((key) => ({ key, title: SECTION_TITLES[key], data: sorted.filter((m) => m.status === key) })).filter((s) => s.data.length > 0);
}

export function mergeMarkets(
  paidMajority: PaidMajorityListEntry[],
  paidYesNo: PaidMarketListEntry[],
  free: FreeListEntry[],
  now = Date.now(),
): MarketSummary[] {
  return sortMarkets([
    ...paidMajority.map((m) => fromPaidMajority(m, now)),
    ...paidYesNo.map((m) => fromPaidYesNo(m, now)),
    ...free.map(fromFree),
  ]);
}

export type MarketFilter = 'all' | 'free' | 'paid';
export function filterMarkets(list: MarketSummary[], f: MarketFilter): MarketSummary[] {
  if (f === 'all') return list;
  return list.filter((m) => (f === 'paid' ? isPaid(m) : !isPaid(m)));
}
