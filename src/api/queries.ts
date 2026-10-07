// TanStack Query wrappers. Detail queries poll every 5s only while the screen
// is focused (the server caches at 3s/8s, so this costs nothing upstream).
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { deserializeMarketAccount } from '@/chain/amm';
import { getSolBalance, getUsdcBalance } from '@/chain/balance';
import { base64ToBytes } from '@/lib/bytes';
import { standingsPollMs, type SeasonPhase } from '@/lib/arena-view';
import { markSeekerVerified } from '@/store/seeker-verified';
import { fetchAmmClaim } from '@/trade/claim';
import * as achievements from './achievements';
import * as arena from './arena';
import * as chat from './chat';
import * as free from './free';
import * as mobileConfig from './mobileConfig';
import * as notifications from './notifications';
import * as paidMajority from './paidMajority';
import * as paidMarkets from './paidMarkets';
import * as referral from './referral';
import * as results from './results';
import * as categories from './categories';
import * as seeker from './seeker';
import * as transfers from './transfers';
import * as sidebar from './sidebar';
import * as ticker from './ticker';
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
  // A query that has failed stops polling until something asks again (pull to
  // refresh, a remount, a trade). Polling on regardless made every failing
  // list flip to "pending" on each attempt, which swapped the whole screen for
  // a loader every fifteen seconds; a failure that stays put is one the user
  // reads once and clears themselves.
  return {
    refetchInterval: (query: { state: { status: string } }) => (focused && query.state.status !== 'error' ? ms : false),
    refetchIntervalInBackground: false,
  } as const;
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
  isAdmin: (wallet: string) => ['auth', 'admin', wallet] as const,
  publicProfile: (username: string) => ['profile', 'u', username] as const,
  search: (q: string) => ['search', q] as const,
  paidMajorityResults: (id: string) => ['paid-majority', 'results', id] as const,
  paidMarketResults: (id: string) => ['paid-markets', 'results', id] as const,
  freeResults: (id: number) => ['free', 'results', id] as const,
  leaderboard: (week: user.LeaderboardWeek, wallet?: string) => ['leaderboard', week, wallet ?? ''] as const,
  prizePool: (week?: string) => ['prize-pool', week ?? 'current'] as const,
  raffle: (wallet?: string, week?: string) => ['raffle', wallet ?? '', week ?? 'current'] as const,
  usdcBalance: (wallet: string) => ['chain', 'usdc-balance', wallet] as const,
  solBalance: (wallet: string) => ['chain', 'sol-balance', wallet] as const,
  paidMarketWordSpend: (wallet: string, id: string) => ['paid-markets', 'word-spend', wallet, id] as const,
  notifications: ['notifications'] as const,
  notificationsUnread: ['notifications', 'unread'] as const,
  achievements: (wallet: string) => ['achievements', wallet] as const,
  notificationSettings: ['notifications', 'settings'] as const,
  mobileConfig: ['mobile', 'config'] as const,
  arenas: ['arena', 'seasons'] as const,
  medalBoard: (arenaSlug: string) => ['arena', 'medals', arenaSlug] as const,
  teamLeaderboard: (arenaSlug: string) => ['arena', 'leaderboard', arenaSlug] as const,
  myTeam: (wallet: string, arenaSlug: string) => ['arena', 'my-team', wallet, arenaSlug] as const,
  team: (slug: string, wallet: string) => ['arena', 'team', slug, wallet] as const,
  arenaAll: ['arena'] as const,
  referral: (wallet: string) => ['referral', wallet] as const,
  seekerStatus: (wallet: string) => ['seeker', 'status', wallet] as const,
  walletTransfers: (wallet: string) => ['wallet', 'transfers', wallet] as const,
  ammClaimAll: ['chain', 'amm-claim'] as const,
  recentTrades: ['trades', 'recent'] as const,
  trendingWords: ['trending', 'words'] as const,
  categories: ['categories'] as const,
  chatPreview: (eventId: string) => ['chat', 'preview', eventId] as const,
  globalChatLatest: ['chat', 'global', 'latest'] as const,
  ammClaim: (wallet: string, id: string) => ['chain', 'amm-claim', wallet, id] as const,
};

// Lists
export const usePaidMajorityList = (focused: boolean) =>
  useQuery({ queryKey: keys.paidMajorityList, queryFn: paidMajority.listPaidMajority, ...poll(focused, LIST_POLL_MS) });
export const usePaidMarketsList = (focused: boolean) =>
  useQuery({ queryKey: keys.paidMarketsList, queryFn: paidMarkets.listPaidMarkets, ...poll(focused, LIST_POLL_MS) });
export const useFreeList = (focused: boolean) =>
  useQuery({ queryKey: keys.freeList, queryFn: free.listFreeMarkets, ...poll(focused, LIST_POLL_MS) });

// The route caches for five minutes server side, so asking more often than
// that only costs a round trip.
// The category list changes when an admin adds one, which is rare.
export const useCategories = () => useQuery({ queryKey: keys.categories, queryFn: categories.getCategories, staleTime: 10 * 60_000 });

export const useTrendingWords = (focused: boolean) =>
  useQuery({ queryKey: keys.trendingWords, queryFn: sidebar.getTrendingWords, staleTime: 5 * 60_000, ...poll(focused, 5 * 60_000) });

export const useRecentTrades = (focused: boolean) =>
  useQuery({ queryKey: keys.recentTrades, queryFn: ticker.getRecentTrades, staleTime: 30_000, ...poll(focused, 60_000) });

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
export const useFreeBoard = (id: number, wallet: string | null, focused: boolean, enabled = true) =>
  useQuery({
    queryKey: keys.freeBoard(id, wallet ?? undefined),
    queryFn: () => free.getFreeBoard(id, wallet ?? undefined),
    enabled,
    ...poll(focused, DETAIL_POLL_MS),
  });
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
// Asked fresh every time and never kept: the query cache is written to disk,
// and a remembered yes would outlive a wallet's removal from the admin list.
export const useIsAdmin = (wallet: string | null, enabled = true) =>
  useQuery({ queryKey: keys.isAdmin(wallet ?? ''), queryFn: () => user.getIsAdmin(wallet as string), enabled: enabled && !!wallet, staleTime: 0, gcTime: 0, retry: 1 });
export const useLeaderboard = (week: user.LeaderboardWeek, wallet: string | null, focused: boolean) =>
  useQuery({ queryKey: keys.leaderboard(week, wallet ?? undefined), queryFn: () => user.getLeaderboard(week, wallet ?? undefined), ...poll(focused, 30_000) });
export const usePrizePool = (week: string | undefined, focused: boolean) =>
  useQuery({ queryKey: keys.prizePool(week), queryFn: () => user.getPrizePool(week), ...poll(focused, 30_000) });
export const useRaffle = (wallet: string | null, week: string | undefined, focused: boolean) =>
  useQuery({ queryKey: keys.raffle(wallet ?? undefined, week), queryFn: () => user.getRaffle(wallet ?? undefined, week), ...poll(focused, 60_000) });

// Results, public profiles, search
export const usePaidMajorityResults = (id: string) =>
  useQuery({ queryKey: keys.paidMajorityResults(id), queryFn: () => results.getPaidMajorityResults(id), staleTime: 60_000 });
// Asked only once the market has resolved: before that the route answers
// with an empty list, and a resolved market's leaderboard does not change.
export const usePaidMarketResults = (id: string, resolved: boolean) =>
  useQuery({ queryKey: keys.paidMarketResults(id), queryFn: () => results.getPaidMarketResults(id), enabled: resolved, staleTime: 60_000 });
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

/** How many rows one page of the feed asks for, and so what a full page looks like. */
const FEED_PAGE = 30;

// The feed and its badge are for the signed-in wallet only: both routes read
// the bearer, not a ?wallet=, so there is nothing to show when signed out.
export const useNotifications = (signedIn: boolean) =>
  useInfiniteQuery({
    queryKey: keys.notifications,
    queryFn: ({ pageParam }) => notifications.listNotifications({ before: pageParam, limit: FEED_PAGE }),
    initialPageParam: undefined as string | undefined,
    // A short page is the end of the feed; a full one means there may be more,
    // and the oldest id is where the next page starts.
    getNextPageParam: (last) => (last.length < FEED_PAGE ? undefined : last[last.length - 1]?.id),
    enabled: signedIn,
    staleTime: 15_000,
  });

export const useUnreadCount = (signedIn: boolean, focused: boolean) =>
  useQuery({
    queryKey: keys.notificationsUnread,
    queryFn: notifications.getUnreadCount,
    enabled: signedIn,
    staleTime: 15_000,
    ...poll(focused && signedIn, LIST_POLL_MS * 4),
  });

/** Every achievement with its unlocked flag. Also the emoji picker's source. */
export const useAchievements = (wallet: string | null) =>
  useQuery({
    queryKey: keys.achievements(wallet ?? ''),
    queryFn: () => achievements.listAchievements(wallet as string),
    enabled: !!wallet,
    staleTime: 60_000,
  });

/** Push preferences for the signed-in wallet. */
export const useNotificationSettings = (signedIn: boolean) =>
  useQuery({
    queryKey: keys.notificationSettings,
    queryFn: notifications.getNotificationSettings,
    enabled: signedIn,
    staleTime: 30_000,
  });

// The server's rules for this build. Persisted with the rest of the cache, so a
// kill switch or a required update still applies on a launch with no signal,
// and refreshed every few minutes rather than on every screen.
export const useMobileConfig = () =>
  useQuery({
    queryKey: keys.mobileConfig,
    queryFn: mobileConfig.getMobileConfig,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

// The Arena's seasons, from the website's registry. Fetched once in a while
// rather than per screen: a season changes a few times in its life. It is
// persisted with the rest of the cache, so a launch with no signal shows the
// last seasons the server sent, not the older copy bundled in the build.
export const useArenas = () =>
  useQuery({
    queryKey: keys.arenas,
    queryFn: arena.getArenas,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

// Who holds each medal. The server caches the finished board for a minute and
// refreshes it when a trade or a result moves one, so half a minute is as live
// as a poll can usefully be. The pace comes from `standingsPollMs`, which also
// keeps asking past the end of a season until the board says it is final, and
// slowly for a week after, while late results can still change a winner.
export const useMedalBoard = (arenaSlug: string, hasMedals: boolean, phase: SeasonPhase, focused: boolean) =>
  useQuery({
    queryKey: keys.medalBoard(arenaSlug),
    queryFn: () => arena.getMedalBoard(arenaSlug),
    enabled: hasMedals,
    staleTime: phase === 'done' ? 10 * 60_000 : 20_000,
    // Reads the board it already holds: "final" is what slows the poll down.
    refetchInterval: (query) => {
      if (!focused || query.state.status === 'error') return false;
      return standingsPollMs(phase, query.state.data?.state ?? null) ?? false;
    },
    refetchIntervalInBackground: false,
  });

// Arena. A live season's standings move as markets resolve, so the board polls
// while it is on screen. It keeps polling, slowly, for a week after the end:
// points are dated by when a market locked, so one that resolves late still
// moves the final standings. A season long over never changes, and is not asked.
export const useTeamLeaderboard = (arenaSlug: string, phase: SeasonPhase, focused: boolean) => {
  const every = standingsPollMs(phase);
  return useQuery({
    queryKey: keys.teamLeaderboard(arenaSlug),
    queryFn: () => arena.getTeamLeaderboard(arenaSlug),
    staleTime: phase === 'done' ? 10 * 60_000 : 30_000,
    ...poll(focused && every !== null, every ?? LIST_POLL_MS),
  });
};

export const useMyTeam = (wallet: string | null, arenaSlug: string) =>
  useQuery({
    queryKey: keys.myTeam(wallet ?? '', arenaSlug),
    queryFn: () => arena.getMyTeam(wallet as string, arenaSlug),
    enabled: !!wallet,
    staleTime: 30_000,
  });

export const useTeam = (slug: string, wallet: string | null) =>
  useQuery({
    queryKey: keys.team(slug, wallet ?? ''),
    queryFn: () => arena.getTeam(slug, wallet ?? undefined),
    staleTime: 30_000,
  });

export const useReferral = (wallet: string | null) =>
  useQuery({
    queryKey: keys.referral(wallet ?? ''),
    queryFn: () => referral.getReferral(wallet as string),
    enabled: !!wallet,
    staleTime: 60_000,
  });

// The signed-in account's Seeker link and welcome stake. Keyed by the session
// wallet because the route answers for the bearer, not for a wallet it is told.
export const useSeekerStatus = (sessionWallet: string | null, enabled: boolean) =>
  useQuery({
    queryKey: keys.seekerStatus(sessionWallet ?? ''),
    queryFn: async () => {
      const status = await seeker.getSeekerStatus();
      // The account's own mark needs no second request: this already says it is linked.
      if (status.linked && sessionWallet) markSeekerVerified(sessionWallet);
      return status;
    },
    enabled: enabled && !!sessionWallet,
    staleTime: 60_000,
  });

// Deposits and withdrawals, read from the chain by the server. Keyed by the
// session wallet for the same reason as the Seeker status.
export const useWalletTransfers = (sessionWallet: string | null) =>
  useQuery({
    queryKey: keys.walletTransfers(sessionWallet ?? ''),
    queryFn: transfers.getWalletTransfers,
    enabled: !!sessionWallet,
    staleTime: 30_000,
  });

// Chat. The rooms themselves are live over SSE (src/chat/use-chat.ts); these
// are the two cheap reads around them, polled slowly and only while focused.

/** The latest few messages for a market screen's chat card. */
export const useChatPreview = (eventId: string, focused: boolean) =>
  useQuery({ queryKey: keys.chatPreview(eventId), queryFn: () => chat.getChat(eventId), staleTime: 15_000, ...poll(focused, 30_000) });

/** The newest global message id, for the unread dot on Home. Served from memory on the web. */
export const useGlobalChatLatest = (focused: boolean) =>
  useQuery({ queryKey: keys.globalChatLatest, queryFn: () => chat.getGlobalChatLatest(), staleTime: 30_000, ...poll(focused, 60_000) });
