// Profile, weekly leaderboard and prize pool. Shapes captured Sep 9 2026.
import { z } from 'zod';

import { get, patch, put, q } from './client';

export const Profile = z.object({
  username: z.string().nullable(),
  pfpEmoji: z.string().nullable(),
  referralCode: z.string().nullable(),
  referralCount: z.number(),
  bonusPointsEarned: z.number(),
  earningsUsd: z.number(),
  // Present on the current web build; optional so an older one still parses.
  discordId: z.string().nullable().optional(),
  discordUsername: z.string().nullable().optional(),
  discordAgeVerified: z.boolean().optional(),
});
export type Profile = z.infer<typeof Profile>;

export const LeaderboardEntry = z.object({
  wallet: z.string(),
  username: z.string().nullable(),
  pfpEmoji: z.string().nullable(),
  weeklyPoints: z.number(),
  allTimePoints: z.number(),
  breakdown: z.record(z.string(), z.number()),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntry>;

export const Leaderboard = z.object({
  data: z.array(LeaderboardEntry),
  /** The wallet passed as ?wallet= when it has points but sits outside the list. */
  userEntry: LeaderboardEntry.nullable(),
  weekStart: z.string(),
  weekEnd: z.string().nullable(),
  week: z.string(),
});
export type Leaderboard = z.infer<typeof Leaderboard>;

export const PrizePool = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  volumeUsd: z.number(),
  ammFeesUsd: z.number(),
  poolUsd: z.number(),
  floorUsd: z.number(),
  split: z.array(
    z.object({
      kind: z.string(),
      place: z.number().nullable().optional(),
      label: z.string(),
      medal: z.string().nullable().optional(),
      pct: z.number(),
      usd: z.number(),
    }),
  ),
  isCurrent: z.boolean(),
  /** Set for a week an Arena season replaced: no payouts, no raffle. Absent before the web sent it. */
  paused: z.object({ arena: z.string(), name: z.string(), displayRange: z.string(), resumesAt: z.string() }).nullable().optional(),
});
export type PrizePool = z.infer<typeof PrizePool>;

// Public profile by username. Paid positions/history on this route are
// legacy and always empty; the wallet-keyed position routes are the source.
export const PublicProfile = z.object({
  username: z.string(),
  wallet: z.string(),
  pfpEmoji: z.string().nullable(),
  createdAt: z.string().nullable(),
  stats: z.object({
    realizedPnl: z.number(),
    totalPnl: z.number(),
    tradesCount: z.number(),
    biggestWin: z.number(),
    allTimePoints: z.number(),
    weeklyPoints: z.number(),
  }),
  freeMarket: z.object({
    stats: z.object({
      totalMarkets: z.number(),
      totalTrades: z.number(),
      totalTokensSpent: z.number(),
      totalTokensReceived: z.number(),
      activePositions: z.number(),
      totalPoints: z.number(),
    }),
  }),
});
export type PublicProfile = z.infer<typeof PublicProfile>;

export const SearchResults = z.object({
  results: z.array(z.object({ wallet: z.string(), username: z.string().nullable(), pfpEmoji: z.string().nullable() })),
  markets: z.array(z.object({ id: z.number(), title: z.string(), slug: z.string(), status: z.string(), coverImageUrl: z.string().nullable() })),
});
export type SearchResults = z.infer<typeof SearchResults>;

export const getPublicProfile = (username: string) => get(`/api/profile/${encodeURIComponent(username)}`, PublicProfile);
export const search = (query: string) => get(`/api/search${q({ q: query })}`, SearchResults);

export const getProfile = (wallet: string) => get(`/api/profile${q({ wallet })}`, Profile);

/**
 * Whether the website counts this wallet as an admin (its `ADMIN_WALLETS`).
 * The answer only decides what the app shows; every admin action is checked
 * again by the server against a verified session.
 */
export const AdminCheck = z.object({ admin: z.boolean() });
export const getIsAdmin = async (wallet: string) => (await get(`/api/auth/admin${q({ wallet })}`, AdminCheck)).admin;
const RafflePerson = z.object({ wallet: z.string(), username: z.string().nullable(), pfpEmoji: z.string().nullable() });

export const Raffle = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  totalTickets: z.number(),
  topHolders: z.array(RafflePerson.extend({ tickets: z.number(), eligible: z.boolean(), reason: z.string().nullable() })),
  placed: z.array(RafflePerson.extend({ rank: z.number(), points: z.number() })),
  winner: RafflePerson.extend({ tickets: z.number().optional(), raffleUsd: z.number().optional() }).nullable(),
  lastWinner: RafflePerson.extend({ tickets: z.number(), totalTickets: z.number(), raffleUsd: z.number(), weekStart: z.string() }).nullable(),
  isCurrent: z.boolean(),
  me: z.object({ tickets: z.number(), oddsPct: z.number(), eligible: z.boolean(), reason: z.string().nullable() }).nullable(),
});
export type Raffle = z.infer<typeof Raffle>;

/** The leaderboard route knows two weeks: the current one and 'last'. */
export type LeaderboardWeek = 'current' | 'last';

export const getLeaderboard = (week: LeaderboardWeek = 'current', wallet?: string) =>
  get(`/api/polymarket/leaderboard/points${q({ sort: 'weekly', week: week === 'last' ? 'last' : undefined, wallet })}`, Leaderboard);
/** `week` is a UTC Monday as YYYY-MM-DD for a past week; omit for the current one. */
export const getPrizePool = (week?: string) => get(`/api/prize-pool${q({ week })}`, PrizePool);
export const getRaffle = (wallet?: string, week?: string) => get(`/api/raffle/tickets${q({ wallet, week })}`, Raffle);

/**
 * Save the signed-in wallet's username. This is also what creates the user's
 * profile row on the server: signing in does not, so an account that never
 * picks a name has no row, and nothing that needs one (linking Discord,
 * admin verification) has anything to attach to.
 */
export const setUsername = (username: string) =>
  put('/api/profile', { username }, z.object({ success: z.boolean() }).passthrough());

/** The website's rule for usernames, checked on the device first. */
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/**
 * Set or clear the profile emoji.
 *
 * The server only accepts an emoji belonging to an achievement this wallet has
 * unlocked, which is why the picker is built from `/api/achievements` rather
 * than from a list of its own.
 */
export const setPfpEmoji = (pfpEmoji: string | null) =>
  patch('/api/profile', { pfpEmoji }, z.object({ success: z.boolean(), pfpEmoji: z.string().nullable() }));
