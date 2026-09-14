// Arena: the team competition, as the website runs it. Shapes captured Sep 14
// 2026 from app/api/teams/* on Mentioned-Market/mentioned main.
//
// Reading is public and addressed by `?wallet=`. Writing (create, join, edit,
// avatar) sends the wallet in the request body, because that is how the
// website's routes take it: they do not read the session. The app only ever
// sends its own signed-in wallet.
import { z } from 'zod';

import { API_BASE } from '@/config';
import { ApiError, get, patch, post, q } from './client';

export const TeamLeaderboardEntry = z.object({
  team_id: z.number(),
  team_name: z.string(),
  team_slug: z.string(),
  member_count: z.number(),
  /** Points earned inside the season window: the team's season score. */
  weekly_points: z.number(),
  all_time_points: z.number(),
});
export type TeamLeaderboardEntry = z.infer<typeof TeamLeaderboardEntry>;

export const TeamLeaderboard = z.object({
  data: z.array(TeamLeaderboardEntry),
  /** The season the server resolved: the one asked for, or its current season. */
  arena: z.string(),
  compStart: z.string(),
  compEnd: z.string(),
});
export type TeamLeaderboard = z.infer<typeof TeamLeaderboard>;

/**
 * A team. `join_code` is only sent to the team's captain. The stored avatar
 * (`pfp_data`, a data URL) is dropped by the schema: it can be a megabyte, and
 * the avatar route serves the same image as a cacheable file.
 */
export const Team = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  join_code: z.string().optional(),
  created_by: z.string(),
  created_at: z.string(),
  bio: z.string().nullable().optional(),
  /** An X handle without the @, as the server normalises it. */
  x_url: z.string().nullable().optional(),
  arena_id: z.number(),
});
export type Team = z.infer<typeof Team>;

export const MyTeam = Team.extend({ role: z.string() });
export type MyTeam = z.infer<typeof MyTeam>;

export const TeamMember = z.object({
  wallet: z.string(),
  role: z.string(),
  joined_at: z.string(),
  username: z.string().nullable(),
  pfp_emoji: z.string().nullable(),
  weekly_points: z.number(),
  all_time_points: z.number(),
});
export type TeamMember = z.infer<typeof TeamMember>;

export const TeamProfile = z.object({
  team: Team,
  members: z.array(TeamMember),
  weeklyTotal: z.number(),
  allTimeTotal: z.number(),
  compStart: z.string(),
  compEnd: z.string(),
  arena: z.object({
    slug: z.string(),
    name: z.string(),
    emoji: z.string(),
    displayRange: z.string(),
    status: z.enum(['upcoming', 'active', 'ended']),
  }),
});
export type TeamProfile = z.infer<typeof TeamProfile>;

/** A season's team standings. No `arena` asks the server for its current season. */
export const getTeamLeaderboard = (arena?: string) => get(`/api/teams/leaderboard${q({ arena })}`, TeamLeaderboard);

/** The wallet's team in a season, or null. */
export const getMyTeam = (wallet: string, arena: string) =>
  get(`/api/teams/my-team${q({ wallet, arena })}`, z.object({ team: MyTeam.nullable() })).then((r) => r.team);

/** A team's profile. Passing the viewer's wallet reveals the join code when they captain it. */
export const getTeam = (slug: string, wallet?: string) => get(`/api/teams/${encodeURIComponent(slug)}${q({ wallet })}`, TeamProfile);

/** The team's avatar image. `version` busts the cache after an upload. */
export const teamAvatarUrl = (slug: string, version = 0) =>
  `${API_BASE}/api/teams/pfp/${encodeURIComponent(slug)}${version ? `?v=${version}` : ''}`;

export const createTeam = (name: string, wallet: string) =>
  post('/api/teams/create', { name, wallet }, z.object({ team: Team }).passthrough()).then((r) => r.team);

export const joinTeam = (code: string, wallet: string) =>
  post('/api/teams/join', { code, wallet }, z.object({ team: Team }).passthrough()).then((r) => r.team);

/** Captain only. An `x_url` of null or "" removes the link. */
export const updateTeam = (slug: string, wallet: string, fields: { name?: string; bio?: string; x_url?: string | null }) =>
  patch(`/api/teams/${encodeURIComponent(slug)}`, { wallet, ...fields }, z.object({ ok: z.boolean() }));

/**
 * Upload a new team avatar. Multipart, not JSON, so it bypasses the JSON
 * client; errors still come back as ApiError so callers handle them alike.
 */
export async function uploadTeamAvatar(slug: string, wallet: string, file: { uri: string; mimeType: string; name: string }): Promise<void> {
  const path = `/api/teams/pfp/${encodeURIComponent(slug)}`;
  const form = new FormData();
  form.append('wallet', wallet);
  // React Native's FormData takes a file reference in this shape rather than a Blob.
  form.append('file', { uri: file.uri, type: file.mimeType, name: file.name } as unknown as Blob);
  const res = await fetch(API_BASE + path, { method: 'POST', body: form });
  if (!res.ok) {
    let message: string | undefined;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // non-JSON body; the status is enough
    }
    throw new ApiError(path, res.status, message);
  }
}
