// PORTED_FROM mentioned/lib/arenas.ts @ 392a892
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

export type BountyId =
  | 'big_game_hunter'
  | 'trigger_happy'
  | 'sharpshooter'
  | 'longshot'
  | 'last_stand'
  | 'maverick'
  | 'wanted'
  | 'quick_draw'

// A fixed one-off prize for a standout achievement, awarded once at season
// close independent of leaderboard rank. Computed live by lib/arenaBounties.ts.
export interface ArenaBounty {
  id: BountyId
  name: string
  emoji: string
  amount: string   // display string, e.g. '$45'
  blurb: string    // one-line pitch shown on the card
  rules: string    // exact scoring rule shown in the card's fine print
}

export interface ArenaBountyConfig {
  bounties: ArenaBounty[]
  bountyPool: string        // display total, e.g. '$320'
  leaderboardPool: string   // display total, e.g. '$680'
  quickDrawPoints: number   // Quick Draw: first team to this many season points
  sharpshooterMinMarkets: number // Sharpshooter: min distinct resolved markets called
  lastStandDays: number     // Last Stand: final N days of the window
  // Wanted bounty target. wallet null = not configured yet (bounty stays open).
  wanted: { name: string; wallet: string | null }
  // One-off points for setting a team profile picture (awarded to the captain).
  teamPfpPoints: number
}

// A season can ship its own page layout. 'exhibition' is the World's Fair
// look (components/WorldsFairArena.tsx), run alongside the Crypto
// World's Fair hackathon we co-market with. Absent = the default arena page.
export type ArenaTheme = 'exhibition'

export interface Arena {
  id: number          // numeric key persisted on teams.arena_id (never reuse)
  theme?: ArenaTheme
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
  bounty?: ArenaBountyConfig // present only for seasons with a bounty board
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
  {
    id: 3,
    slug: 'worlds-fair',
    name: 'World’s Fair', // pages that append "Arena" read "World’s Fair Arena"
    emoji: '🎪',
    theme: 'exhibition',
    tagline: 'Mentioned at the Crypto World’s Fair. Two weeks, ten prizes, eight medals.',
    // 14 days on UTC week boundaries: Mon Sep 28 through Sun Oct 11 in full.
    // End is exclusive (Mon Oct 12 00:00 UTC), the night before Colosseum's
    // Crypto World's Fair submissions close.
    start: new Date('2026-09-28T00:00:00.000Z'),
    end: new Date('2026-10-12T00:00:00.000Z'),
    displayRange: 'Sep 28 – Oct 11, 2026',
    maxMembers: 2,
    prizePool: '$1,500',
    // $1,000 across the top 10 (top-heavy). Bounties hold the other $500.
    prizes: [
      { place: 1, amount: '$300' },
      { place: 2, amount: '$190' },
      { place: 3, amount: '$130' },
      { place: 4, amount: '$95' },
      { place: 5, amount: '$75' },
      { place: 6, amount: '$60' },
      { place: 7, amount: '$50' },
      { place: 8, amount: '$40' },
      { place: 9, amount: '$35' },
      { place: 10, amount: '$25' },
    ],
    heroImage: '/src/img/grand_exhibition_hero.jpg', // painted backdrop for the stage; the page falls back to black if missing
    bounty: {
      bountyPool: '$500',
      leaderboardPool: '$1,000',
      quickDrawPoints: 500,
      sharpshooterMinMarkets: 5,
      lastStandDays: 3,
      wanted: { name: 'ZeroXirem', wallet: null },
      teamPfpPoints: 50,
      // The Fair's medals: jury awards in the manner of the historic
      // world's fairs, given once at the close, whatever a team's rank.
      // Ordered by amount (sums to $500). Rebalance if a category is added.
      bounties: [
        {
          id: 'trigger_happy',
          name: 'The Grand Tour',
          emoji: '🎟️',
          amount: '$80',
          blurb: 'Played the most markets.',
          rules: 'Each member’s distinct markets entered during the season (any buy on a free, paid or majority market), summed for the team. Ties split the medal.',
        },
        {
          id: 'big_game_hunter',
          name: 'Grand Prix',
          emoji: '🏆',
          amount: '$70',
          blurb: 'Biggest profit on a single market.',
          rules: 'Biggest USDC profit one member made on a single resolved paid market (AMM or majority) that locked during the season.',
        },
        {
          id: 'sharpshooter',
          name: 'Midway Marksman',
          emoji: '🎯',
          amount: '$70',
          blurb: 'Highest share of correct calls.',
          rules: 'Correct calls ÷ total calls across resolved markets. A call is a side held to close on a word, or a majority pick. Teams need calls in at least 5 markets to qualify.',
        },
        {
          id: 'longshot',
          name: 'Lightning in a Bottle',
          emoji: '⚡',
          amount: '$65',
          blurb: 'Won at the longest odds.',
          rules: 'Lowest entry probability on a correct call held to close. Price paid for YES/NO buys; share of the pool for majority picks. Tiny buys don’t count.',
        },
        {
          id: 'last_stand',
          name: 'Closing Ceremony',
          emoji: '🎆',
          amount: '$60',
          blurb: 'Most points in the final 3 days.',
          rules: 'Most team points earned in the last 3 days of the Fair (Oct 9 – 11).',
        },
        {
          id: 'maverick',
          name: 'The Inventor’s Medal',
          emoji: '💡',
          amount: '$55',
          blurb: 'Most correct calls against the crowd.',
          rules: 'Most correct calls where fewer than half of that word’s bettors were on your side. On majority markets: a winning word fewer than half the market’s bettors picked.',
        },
        {
          id: 'wanted',
          name: 'Beat the Strongman',
          emoji: '🔔',
          amount: '$55',
          blurb: 'Biggest win betting against ZeroXirem.',
          rules: 'Largest USDC win on a paid market word where you took the opposite side to ZeroXirem (or picked a winning word when all of his lost). His teammate can’t claim it. If nobody beats him, the medal is his.',
        },
        {
          id: 'quick_draw',
          name: 'Opening Day',
          emoji: '🎀',
          amount: '$45',
          blurb: 'First team to reach 500 points.',
          rules: 'The first team whose season points reach 500. Points are timed by when their market locked.',
        },
      ],
    },
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
