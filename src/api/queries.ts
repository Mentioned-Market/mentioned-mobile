// TanStack Query wrappers. Detail queries poll every 5s only while the screen
// is focused (the server caches at 3s/8s, so this costs nothing upstream).
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { deserializeMarketAccount } from '@/chain/amm';
import { getSolBalance, getUsdcBalance } from '@/chain/balance';
import { base64ToBytes } from '@/lib/bytes';
import { fetchAmmClaim } from '@/trade/claim';
import * as free from './free';
import * as paidMajority from './paidMajority';
import * as paidMarkets from './paidMarkets';
import * as results from './results';
import * as user from './user';

export const DETAIL_POLL_MS = 5_000;
export const LIST_POLL_MS = 15_000;

/** True while the calling screen is focused. Drives refetchInterval. */
export function useIsScreenFocused(): boolean {
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}

function poll(focused: boolean, ms: number) {
  return { refetchInterval: focused ? ms : false, refetchIntervalInBackground: false } as const;
}

export const keys = {
  paidMajorityList: ['paid-majority', 'list'] as const,
  paidMajorityMarket: (id: string) => ['paid-majority', 'market', id] as const,
  paidMajorityMetadata: ['paid-majority', 'metadata'] as const,
  paidMajorityPositions: (id: string, wallet: string) => ['paid-majority', 'positions', id, wallet] as const,
  paidMajorityUserPositions: (wallet: string) => ['paid-majority', 'user-positions', wallet] as const,
  paidMarketsList: ['paid-markets', 'list'] as const,
  paidMarket: (id: string) => ['paid-markets', 'market', id] as const,
  paidMarketMetadata: (id: string) => ['paid-markets', 'metadata', id] as const,
  paidMarketChart: (id: string) => ['paid-markets', 'chart', id] as const,
  paidMarketTrades: (id: string) => ['paid-markets', 'trades', id] as const,
  paidMarketUserPositions: (wallet: string) => ['paid-markets', 'user-positions', wallet] as const,
  freeList: ['free', 'list'] as const,
  freeMarket: (id: number) => ['free', 'market', id] as const,
  freePositions: (id: number, wallet: string) => ['free', 'positions', id, wallet] as const,
  freeBoard: (id: number, wallet?: string) => ['free', 'board', id, wallet ?? ''] as const,
  freeChart: (id: number) => ['free', 'chart', id] as const,
  freeUserActivity: (wallet: string) => ['free', 'user-activity', wallet] as const,
  profile: (wallet: string) => ['profile', wallet] as const,
  publicProfile: (username: string) => ['profile', 'u', username] as const,
  search: (q: string) => ['search', q] as const,
  paidMajorityResults: (id: string) => ['paid-majority', 'results', id] as const,
  freeResults: (id: number) => ['free', 'results', id] as const,
  leaderboard: (week: user.LeaderboardWeek, wallet?: string) => ['leaderboard', week, wallet ?? ''] as const,
  prizePool: (week?: string) => ['prize-pool', week ?? 'current'] as const,
  raffle: (wallet?: string, week?: string) => ['raffle', wallet ?? '', week ?? 'current'] as const,
  usdcBalance: (wallet: string) => ['chain', 'usdc-balance', wallet] as const,
  solBalance: (wallet: string) => ['chain', 'sol-balance', wallet] as const,
  paidMarketWordSpend: (wallet: string, id: string) => ['paid-markets', 'word-spend', wallet, id] as const,
  ammClaimAll: ['chain', 'amm-claim'] as const,
  ammClaim: (wallet: string, id: string) => ['chain', 'amm-claim', wallet, id] as const,
};

// Lists
export const usePaidMajorityList = (focused: boolean) =>
  useQuery({ queryKey: keys.paidMajorityList, queryFn: paidMajority.listPaidMajority, ...poll(focused, LIST_POLL_MS) });
export const usePaidMarketsList = (focused: boolean) =>
  useQuery({ queryKey: keys.paidMarketsList, queryFn: paidMarkets.listPaidMarkets, ...poll(focused, LIST_POLL_MS) });
export const useFreeList = (focused: boolean) =>
  useQuery({ queryKey: keys.freeList, queryFn: free.listFreeMarkets, ...poll(focused, LIST_POLL_MS) });

// Paid majority
export const usePaidMajorityMarket = (id: string, focused: boolean) =>
  useQuery({ queryKey: keys.paidMajorityMarket(id), queryFn: () => paidMajority.getPaidMajorityMarket(id), ...poll(focused, DETAIL_POLL_MS) });
export const usePaidMajorityMetadata = () =>
  useQuery({ queryKey: keys.paidMajorityMetadata, queryFn: paidMajority.getPaidMajorityMetadata, staleTime: 60_000 });
export const usePaidMajorityPositions = (id: string, wallet: string | null, focused: boolean) =>
  useQuery({
    queryKey: keys.paidMajorityPositions(id, wallet ?? ''),
    queryFn: () => paidMajority.getPaidMajorityPositions(id, wallet as string),
    enabled: !!wallet,
    ...poll(focused, DETAIL_POLL_MS),
  });
export const usePaidMajorityUserPositions = (wallet: string | null, focused: boolean) =>
  useQuery({
    queryKey: keys.paidMajorityUserPositions(wallet ?? ''),
    queryFn: () => paidMajority.getPaidMajorityUserPositions(wallet as string),
    enabled: !!wallet,
    ...poll(focused, LIST_POLL_MS),
  });

// Paid YES/NO
export const usePaidMarket = (id: string, focused: boolean) =>
  useQuery({ queryKey: keys.paidMarket(id), queryFn: () => paidMarkets.getPaidMarket(id), ...poll(focused, DETAIL_POLL_MS) });
export const usePaidMarketMetadata = (id: string) =>
  useQuery({ queryKey: keys.paidMarketMetadata(id), queryFn: () => paidMarkets.getPaidMarketMetadata(id), staleTime: 60_000 });
export const usePaidMarketChart = (id: string, focused: boolean) =>
  useQuery({ queryKey: keys.paidMarketChart(id), queryFn: () => paidMarkets.getPaidMarketChart(id), ...poll(focused, LIST_POLL_MS) });
export const usePaidMarketTrades = (id: string, focused: boolean) =>
  useQuery({ queryKey: keys.paidMarketTrades(id), queryFn: () => paidMarkets.getPaidMarketTrades(id), ...poll(focused, LIST_POLL_MS) });
export const usePaidMarketUserPositions = (wallet: string | null, focused: boolean) =>
  useQuery({
    queryKey: keys.paidMarketUserPositions(wallet ?? ''),
    queryFn: () => paidMarkets.getPaidMarketUserPositions(wallet as string),
    enabled: !!wallet,
    ...poll(focused, LIST_POLL_MS),
  });

// Free
export const useFreeMarket = (id: number, focused: boolean) =>
  useQuery({ queryKey: keys.freeMarket(id), queryFn: () => free.getFreeMarket(id), ...poll(focused, DETAIL_POLL_MS) });
export const useFreePositions = (id: number, wallet: string | null, focused: boolean) =>
  useQuery({
    queryKey: keys.freePositions(id, wallet ?? ''),
    queryFn: () => free.getFreePositions(id, wallet as string),
    enabled: !!wallet,
    ...poll(focused, DETAIL_POLL_MS),
  });
export const useFreeBoard = (id: number, wallet: string | null, focused: boolean) =>
  useQuery({ queryKey: keys.freeBoard(id, wallet ?? undefined), queryFn: () => free.getFreeBoard(id, wallet ?? undefined), ...poll(focused, DETAIL_POLL_MS) });
export const useFreeChart = (id: number, focused: boolean) =>
  useQuery({ queryKey: keys.freeChart(id), queryFn: () => free.getFreeChart(id), ...poll(focused, LIST_POLL_MS) });
export const useFreeUserActivity = (wallet: string | null, focused: boolean) =>
  useQuery({
    queryKey: keys.freeUserActivity(wallet ?? ''),
    queryFn: () => free.getFreeUserActivity(wallet as string),
    enabled: !!wallet,
    ...poll(focused, LIST_POLL_MS),
  });

// User
export const useProfile = (wallet: string | null) =>
  useQuery({ queryKey: keys.profile(wallet ?? ''), queryFn: () => user.getProfile(wallet as string), enabled: !!wallet, staleTime: 30_000 });
export const useLeaderboard = (week: user.LeaderboardWeek, wallet: string | null, focused: boolean) =>
  useQuery({ queryKey: keys.leaderboard(week, wallet ?? undefined), queryFn: () => user.getLeaderboard(week, wallet ?? undefined), ...poll(focused, 30_000) });
export const usePrizePool = (week: string | undefined, focused: boolean) =>
  useQuery({ queryKey: keys.prizePool(week), queryFn: () => user.getPrizePool(week), ...poll(focused, 30_000) });
export const useRaffle = (wallet: string | null, week: string | undefined, focused: boolean) =>
  useQuery({ queryKey: keys.raffle(wallet ?? undefined, week), queryFn: () => user.getRaffle(wallet ?? undefined, week), ...poll(focused, 60_000) });

// Results, public profiles, search
export const usePaidMajorityResults = (id: string) =>
  useQuery({ queryKey: keys.paidMajorityResults(id), queryFn: () => results.getPaidMajorityResults(id), staleTime: 60_000 });
export const useFreeResults = (id: number) =>
  useQuery({ queryKey: keys.freeResults(id), queryFn: () => results.getFreeResults(id), staleTime: 60_000 });
export const usePublicProfile = (username: string) =>
  useQuery({ queryKey: keys.publicProfile(username), queryFn: () => user.getPublicProfile(username), staleTime: 30_000 });
export const useSearch = (q: string) =>
  useQuery({ queryKey: keys.search(q), queryFn: () => user.search(q), enabled: q.trim().length >= 2, staleTime: 30_000, placeholderData: (prev) => prev });

// Wallet USDC, read from the chain rather than the API. Polled slowly: it only
// moves when the user trades or deposits, and both of those refetch it directly.
export const useUsdcBalance = (wallet: string | null, focused: boolean) =>
  useQuery({
    queryKey: keys.usdcBalance(wallet ?? ''),
    queryFn: () => getUsdcBalance(wallet as string),
    enabled: !!wallet,
    staleTime: 30_000,
    ...poll(focused && !!wallet, LIST_POLL_MS * 4),
  });

export const useSolBalance = (wallet: string | null, focused: boolean) =>
  useQuery({
    queryKey: keys.solBalance(wallet ?? ''),
    queryFn: () => getSolBalance(wallet as string),
    enabled: !!wallet,
    staleTime: 30_000,
    ...poll(focused && !!wallet, LIST_POLL_MS * 4),
  });

export const usePaidMarketWordSpend = (wallet: string | null, id: string, focused: boolean) =>
  useQuery({
    queryKey: keys.paidMarketWordSpend(wallet ?? '', id),
    queryFn: () => paidMarkets.getPaidMarketWordSpend(wallet as string, id),
    enabled: !!wallet,
    ...poll(focused && !!wallet, LIST_POLL_MS),
  });

// What the wallet can collect from a resolved paid YES/NO market, read from its
// token accounts on chain. Not polled: it only changes when the user claims,
// and the claim refetches it.
export const useAmmClaim = (wallet: string | null, id: string) =>
  useQuery({
    queryKey: keys.ammClaim(wallet ?? '', id),
    queryFn: async () => {
      const market = deserializeMarketAccount(base64ToBytes((await paidMarkets.getPaidMarket(id)).account));
      return market ? fetchAmmClaim(wallet as string, market) : null;
    },
    enabled: !!wallet,
    staleTime: 30_000,
  });
