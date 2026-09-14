// PORTED_FROM mentioned/lib/arenas.ts @ 13e3418
// Keep byte-identical to the web copy below this header. The web starts a new
// season by appending to ARENAS, so re-port when it does: the daily contract
// test compares the web's current season with CURRENT_ARENA here and fails
// when they differ. Mobile edits: none.
// ── Arena (team competition) registry ─────────────────────────────────────
//
// Single source of truth for every Arena season. Each season is a fixed time
// window; team scores are the sum of member `point_events.points` inside that
// window. Teams + memberships are scoped per arena (`teams.arena_id` /
// `team_members.arena_id`), so a wallet can be on a different team each season.
//
// This module is pure data + helpers — NO server-only deps (no `pg`/`fs`), so
// it is safe to import from both client components and API routes.
//
// To launch a new season: append a new Arena to ARENAS with a higher `id`.
// `CURRENT_ARENA` is always the highest-id season and is the one open for
// create/join. Past seasons stay viewable read-only.

export interface ArenaPrize {
  place: number
  amount: string   // display string, e.g. '$350'
}

export interface Arena {
  id: number          // numeric key persisted on teams.arena_id (never reuse)
  slug: string        // url-safe season identifier (NOT a team slug)
  name: string        // display name, e.g. 'World Cup'
  emoji: string
  tagline: string
  start: Date         // window open  (UTC, inclusive)
  end: Date           // window close (UTC, exclusive)
  displayRange: string // human label for the window
  maxMembers: number
  prizePool: string   // display string, e.g. '$1,000'
  prizes: ArenaPrize[] // ordered by place, length = number of paid places
  heroImage: string   // public path to the hero illustration
}

export const ARENAS: Arena[] = [
  {
    id: 1,
    slug: 'genesis',
    name: 'Genesis',
    emoji: '🛡️',
    tagline: 'The first Arena. Where it all began.',
    start: new Date('2026-05-04T00:00:00.000Z'),
    end: new Date('2026-05-18T00:00:00.000Z'),
    displayRange: 'May 4 – 17, 2026',
    maxMembers: 3,
    prizePool: '$750',
    prizes: [
      { place: 1, amount: '$375' },
      { place: 2, amount: '$250' },
      { place: 3, amount: '$125' },
    ],
    heroImage: '/src/img/mentioned_arena_animated_right_facing.svg',
  },
  {
    id: 2,
    slug: 'world-cup',
    name: 'World Cup',
    emoji: '⚽',
    tagline: 'One trophy. Pick your partner and play to the final.',
    // Runs through the World Cup final (Jul 19). End is exclusive, so the
    // final day (Jul 19 UTC) is fully counted.
    start: new Date('2026-06-26T00:00:00.000Z'),
    end: new Date('2026-07-20T00:00:00.000Z'),
    displayRange: 'Jun 26 – Jul 19, 2026',
    maxMembers: 2,
    prizePool: '$1,000',
    // Top-heavy split across the top 10 (sums to $1,000).
    prizes: [
      { place: 1, amount: '$350' },
      { place: 2, amount: '$200' },
      { place: 3, amount: '$120' },
      { place: 4, amount: '$80' },
      { place: 5, amount: '$60' },
      { place: 6, amount: '$50' },
      { place: 7, amount: '$45' },
      { place: 8, amount: '$40' },
      { place: 9, amount: '$30' },
      { place: 10, amount: '$25' },
    ],
    heroImage: '/src/img/mentioned_football_juggler.svg',
  },
]

// The active season: highest id. Open for create/join until its window closes.
export const CURRENT_ARENA: Arena = ARENAS.reduce((a, b) => (b.id > a.id ? b : a))

export function getArenaBySlug(slug: string): Arena | undefined {
  return ARENAS.find(a => a.slug === slug)
}

export function getArenaById(id: number): Arena | undefined {
  return ARENAS.find(a => a.id === id)
}

/** Resolve an arena from a slug query param, falling back to the current season. */
export function resolveArena(slug: string | null | undefined): Arena {
  if (!slug) return CURRENT_ARENA
  return getArenaBySlug(slug) ?? CURRENT_ARENA
}

export type ArenaStatus = 'upcoming' | 'active' | 'ended'

export function arenaStatus(arena: Arena, now: Date = new Date()): ArenaStatus {
  if (now < arena.start) return 'upcoming'
  if (now >= arena.end) return 'ended'
  return 'active'
}

/** Prize for a given finishing rank in an arena, or null if out of the money. */
export function prizeForRank(arena: Arena, rank: number): ArenaPrize | null {
  return arena.prizes.find(p => p.place === rank) ?? null
}
