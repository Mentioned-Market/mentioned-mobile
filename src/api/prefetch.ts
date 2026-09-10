// Warm the shared queries at launch.
//
// The tabs mount lazily, so before this the first visit to a tab was where its
// data started loading: tap, skeletons, wait. Every list here is small, public,
// cached by the server, and needed by at least two screens, so fetching them
// once up front costs one round of requests and makes every first tab visit
// land on real content.
//
// Fired and forgotten on purpose. A prefetch that fails is not an error: the
// screen that needs the data will ask for it again and show its own error state
// then, with a retry the user can actually see.
import type { QueryClient } from '@tanstack/react-query';

import * as free from './free';
import * as paidMajority from './paidMajority';
import * as paidMarkets from './paidMarkets';
import { keys } from './queries';
import * as user from './user';

export function prefetchSharedData(client: QueryClient, wallet: string | null): void {
  const warm = (queryKey: readonly unknown[], queryFn: () => Promise<unknown>) => {
    void client.prefetchQuery({ queryKey, queryFn });
  };

  // The three market lists. Home shows the soonest and the newest resolved,
  // Markets shows all of them, and both read the same cache entries.
  warm(keys.paidMajorityList, paidMajority.listPaidMajority);
  warm(keys.paidMarketsList, paidMarkets.listPaidMarkets);
  warm(keys.freeList, free.listFreeMarkets);

  // Home and Ranks share these two exactly.
  warm(keys.prizePool(undefined), () => user.getPrizePool(undefined));
  warm(keys.leaderboard('current', wallet ?? undefined), () => user.getLeaderboard('current', wallet ?? undefined));

  if (!wallet) return;

  // Positions and the Home portfolio. Only worth fetching once we know who to
  // ask about, which is why this is keyed on the wallet rather than run blind.
  warm(keys.paidMajorityUserPositions(wallet), () => paidMajority.getPaidMajorityUserPositions(wallet));
  warm(keys.paidMarketUserPositions(wallet), () => paidMarkets.getPaidMarketUserPositions(wallet));
  warm(keys.freeUserActivity(wallet), () => free.getFreeUserActivity(wallet));
}
