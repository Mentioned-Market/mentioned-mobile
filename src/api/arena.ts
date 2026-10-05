// Arena: the team competition, as the website runs it. Shapes captured Sep 14
// 2026 from app/api/teams/* on Mentioned-Market/mentioned main.
//
// Reading is public and addressed by `?wallet=`. Writing (create, join, edit,
// avatar) sends the wallet in the request body, because that is how the
// website's routes take it: they do not read the session. The app only ever
// sends its own signed-in wallet.
import { z } from 'zod';

import { API_BASE } from '@/config';
import { ApiError, authHeader, get, patch, post, q } from './client';

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

/**
 * A season as the website's registry defines it, with its window as ISO
 * strings. Kept as strings here because the query cache is written to disk as
 * JSON, and a Date would come back from it as a string anyway;
 * `src/arena/seasons.ts` turns these into the seasons the screens use.
 *
 * Medal ids are plain strings on purpose: the web adds and renames medals
 * mid-season, and an id this build has never heard of is still a medal.
 */
export const ArenaWire = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  emoji: z.string(),
  tagline: z.string(),
  start: z.string(),
  end: z.string(),
  displayRange: z.string(),
  maxMembers: z.number(),
  prizePool: z.string(),
  prizes: z.array(z.object({ place: z.number(), amount: z.string() })),
  heroImage: z.string().nullable().optional(),
  bounty: z
    .object({
      bountyPool: z.string(),
      leaderboardPool: z.string(),
      bounties: z.array(
        z.object({ id: z.string(), name: z.string(), emoji: z.string(), amount: z.string(), blurb: z.string(), rules: z.string() }),
      ),
    })
    .nullable()
    .optional(),
});
export type ArenaWire = z.infer<typeof ArenaWire>;

export const Arenas = z.object({
  /** The slug of the season open for entry. */
  current: z.string(),
  arenas: z.array(ArenaWire),
});
export type Arenas = z.infer<typeof Arenas>;

const MedalStanding = z.object({
  team: z.object({ id: z.number(), name: z.string(), slug: z.string() }),
  /** The headline value, e.g. "+$12.40" or "16 markets". */
  display: z.string(),
  /** A second line, e.g. "@alice" or "18 of 25 calls". */
  detail: z.string().nullable().optional(),
  /** Where it happened, e.g. the title of the market a win came from. */
  context: z.string().nullable().optional(),
});
export type MedalStanding = z.infer<typeof MedalStanding>;

export const MedalResult = z.object({
  id: z.string(),
  /** 'upcoming' | 'waiting' | 'live' | 'final' today; a string so a new state does not fail the parse. */
  state: z.string(),
  /** Everyone tied for first; a tie splits the medal. */
  holders: z.array(MedalStanding),
  contenders: z.array(MedalStanding),
  /** For a medal that opens partway through the season. */
  opensAt: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});
export type MedalResult = z.infer<typeof MedalResult>;

/** Who holds each medal right now, or who was awarded it once the season is final. */
export const MedalBoard = z.object({
  arena: z.string(),
  state: z.string(),
  generatedAt: z.string(),
  bounties: z.array(MedalResult),
  /** Made-up standings, which staging can switch on to show a full board. */
  preview: z.boolean().optional(),
});
export type MedalBoard = z.infer<typeof MedalBoard>;

/** Null when the route answers 404: "not there", which each caller reads its own way. */
async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Every season, or null from a server that predates the route (the app then uses its bundled copy). */
export const getArenas = () => orNull(get('/api/teams/arenas', Arenas));

/** A season's medal standings, or null for a season that has no medals. */
export const getMedalBoard = (arena: string) => orNull(get(`/api/teams/bounties${q({ arena })}`, MedalBoard));

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
 *
 * It must carry the session itself for the same reason: the route takes the
 * captain from the verified session and ignores `wallet` in the form.
 *
 * The file part is NOT React Native's `{ uri, type, name }`. Expo SDK 57
 * replaces the global `fetch` with its own (expo/src/winter), and that one
 * builds the multipart body itself and refuses a `uri` part outright
 * ("Unsupported FormDataPart implementation"). It threw before any request
 * left the phone, and the screen reported it as "check your connection"
 * (Oct 5 2026). What it does accept is anything with `bytes()`, a name and a
 * type, so that is what the caller hands over. The caller supplies `bytes`
 * (the screen reads the picked file with expo-file-system) because this module
 * is also loaded by the Node scripts, which cannot import a native package.
 */
export type AvatarFile = { name: string; mimeType: string; bytes: () => Promise<Uint8Array> };

/** The file as a multipart part Expo's fetch will take: never a `uri`. */
export const avatarPart = (file: AvatarFile) => ({ name: file.name, type: file.mimeType, bytes: file.bytes });

export async function uploadTeamAvatar(slug: string, wallet: string, file: AvatarFile): Promise<void> {
  const path = `/api/teams/pfp/${encodeURIComponent(slug)}`;
  const form = new FormData();
  form.append('wallet', wallet);
  form.append('file', avatarPart(file) as unknown as Blob);
  const res = await fetch(API_BASE + path, { method: 'POST', body: form, headers: { Accept: 'application/json', ...authHeader() } });
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
