// One wallet's positions across all three market families, folded into one
// card per market, open and finished. Home reads this once and hands it to
// Your picks and the win moment, so the three queries run once between them.
import { useMemo } from 'react';

import { useFreeUserActivity, usePaidMajorityUserPositions, usePaidMarketUserPositions } from '@/api/queries';
import { fromFree, fromPaidMajority, fromPaidYesNo, groupByMarket, groupPositions, type MarketGroup, type PositionRow, type PositionSummary } from '@/markets/positions';

export type PositionGroups = {
  open: MarketGroup[];
  finished: MarketGroup[];
  summary: PositionSummary;
  /** All three families have answered. Anything that decides from the whole set waits for this. */
  loaded: boolean;
  refetch: () => Promise<unknown>;
};

export function usePositionGroups(wallet: string | null, focused: boolean): PositionGroups {
  const pm = usePaidMajorityUserPositions(wallet, focused);
  const pa = usePaidMarketUserPositions(wallet, focused);
  const fr = useFreeUserActivity(wallet, focused);

  const groups = useMemo(() => {
    const rows: PositionRow[] = [...(pm.data ?? []).map(fromPaidMajority), ...(pa.data ?? []).map(fromPaidYesNo), ...(fr.data ? fromFree(fr.data) : [])];
    const split = groupPositions(rows);
    return { open: groupByMarket(split.open), finished: groupByMarket(split.finished), summary: split.summary };
  }, [pm.data, pa.data, fr.data]);

  return {
    ...groups,
    loaded: !!wallet && pm.data !== undefined && pa.data !== undefined && fr.data !== undefined,
    refetch: () => Promise.all([pm.refetch(), pa.refetch(), fr.refetch()]),
  };
}
