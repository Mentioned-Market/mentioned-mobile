// What else to show at the bottom of a market.
//
// Deliberately not random: a list that reshuffles under a thumb on every poll
// is worse than a list that does not, and a fixed order can be tested. The
// order is the one the Markets tab already uses, soonest to close first, with
// markets of the same kind preferred so a majority board suggests majority
// boards.
import { type MarketSummary } from '@/markets/merge';

/**
 * Up to `limit` open markets to show beneath `currentKey`
 * (`"<kind>:<id>"`), the current one excluded.
 */
export function similarMarkets(all: MarketSummary[], currentKey: string, limit = 4): MarketSummary[] {
  const open = all.filter((m) => m.status === 'open' && `${m.kind}:${m.id}` !== currentKey);
  const currentKind = currentKey.split(':')[0];
  const sameKind = open.filter((m) => m.kind === currentKind);
  const rest = open.filter((m) => m.kind !== currentKind);
  return [...sameKind, ...rest].slice(0, limit);
}
