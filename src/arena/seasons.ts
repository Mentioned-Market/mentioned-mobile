// The Arena's seasons, as the screens read them.
//
// The website is the source of truth: `GET /api/teams/arenas` serves its
// registry, so a new season, a swapped medal or an edited rule reaches the app
// without a release. The ported copy in `./arenas` is only the fallback, for a
// first launch with no signal and for a server that predates the route.
//
// Once the server has answered, its list replaces the bundled one whole rather
// than being merged with it. A merge would keep a season the web has since
// withdrawn, and would let a build newer than the server open entry for a
// season the server refuses.
//
// Everything here is typed against `Season`, not the ported `Arena`: a season
// from the server can carry a medal id or a field this build has never heard
// of, and the screens only need what is listed below.
import type { ArenaWire } from '@/api/arena';
import { ARENAS } from './arenas';

export type Medal = {
  id: string;
  name: string;
  emoji: string;
  amount: string;
  blurb: string;
  rules: string;
};

export type SeasonMedals = {
  bounties: Medal[];
  /** Display total of the medals, e.g. "$500". */
  bountyPool: string;
  /** Display total the leaderboard's paid places share, e.g. "$1,000". */
  leaderboardPool: string;
};

export type Season = {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  tagline: string;
  /** Window open, inclusive. */
  start: Date;
  /** Window close, exclusive. */
  end: Date;
  displayRange: string;
  maxMembers: number;
  prizePool: string;
  prizes: { place: number; amount: string }[];
  heroImage: string;
  bounty?: SeasonMedals;
};

export type SeasonStatus = 'upcoming' | 'active' | 'ended';

/** The registry this build shipped with. */
export const BUNDLED_SEASONS: Season[] = ARENAS;

/** A season from the server, or null when its window is not a real one. */
export function toSeason(wire: ArenaWire): Season | null {
  const start = new Date(wire.start);
  const end = new Date(wire.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return {
    id: wire.id,
    slug: wire.slug,
    name: wire.name,
    emoji: wire.emoji,
    tagline: wire.tagline,
    start,
    end,
    displayRange: wire.displayRange,
    maxMembers: wire.maxMembers,
    prizePool: wire.prizePool,
    prizes: wire.prizes,
    heroImage: wire.heroImage ?? '',
    ...(wire.bounty ? { bounty: wire.bounty } : {}),
  };
}

/**
 * The seasons to show: the server's when it has sent any usable ones, the
 * bundled registry otherwise. Oldest first, as the registry lists them.
 */
export function resolveSeasons(server: ArenaWire[] | null | undefined, bundled: Season[] = BUNDLED_SEASONS): Season[] {
  const seen = new Set<number>();
  const usable: Season[] = [];
  for (const wire of server ?? []) {
    const season = toSeason(wire);
    // An id is a season's identity on the server, so a repeat is dropped.
    if (!season || seen.has(season.id)) continue;
    seen.add(season.id);
    usable.push(season);
  }
  return (usable.length > 0 ? usable : [...bundled]).sort((a, b) => a.id - b.id);
}

/** The season open for entry: the highest id, which is the website's own rule. */
export function currentSeason(seasons: Season[]): Season {
  const list = seasons.length > 0 ? seasons : BUNDLED_SEASONS;
  return list.reduce((a, b) => (b.id > a.id ? b : a));
}

export function seasonBySlug(seasons: Season[], slug: string | null | undefined): Season | undefined {
  return slug ? seasons.find((s) => s.slug === slug) : undefined;
}

export function seasonStatus(season: Season, now: Date = new Date()): SeasonStatus {
  if (now < season.start) return 'upcoming';
  if (now >= season.end) return 'ended';
  return 'active';
}

/**
 * What the bundled registry gets wrong about the server's, as lines for the
 * contract check to print. Empty means the fallback matches. A difference is
 * not a failure, because the app shows the server's version either way; it is
 * what a phone with no signal on its first launch would see.
 */
export function bundledDrift(server: ArenaWire[], bundled: Season[] = BUNDLED_SEASONS): string[] {
  const out: string[] = [];
  for (const wire of server) {
    const live = toSeason(wire);
    if (!live) continue;
    const ours = bundled.find((s) => s.id === live.id);
    if (!ours) {
      out.push(`season "${live.slug}" is not in the bundled registry`);
      continue;
    }
    if (ours.start.getTime() !== live.start.getTime() || ours.end.getTime() !== live.end.getTime()) out.push(`"${live.slug}": the window differs`);
    if (JSON.stringify(ours.prizes) !== JSON.stringify(live.prizes) || ours.prizePool !== live.prizePool) out.push(`"${live.slug}": the prizes differ`);
    const medals = (s: Season) => JSON.stringify((s.bounty?.bounties ?? []).map((m) => [m.id, m.name, m.amount, m.blurb, m.rules]));
    if (medals(ours) !== medals(live)) out.push(`"${live.slug}": the medals differ`);
  }
  return out;
}
