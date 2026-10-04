// Every zod schema parsed against a captured production response. This is the
// offline half of the contract test: `npm run contract` proves the shapes
// against the live API, these prove a schema edit does not break a shape that
// was already working.
import { z } from 'zod';

import { FreeActivityPosition, FreeBoard, FreeChart, FreeListEntry, FreeMarketDetail, FreePositions, FreeUserActivity } from '@/api/free';
import { PaidMajorityListEntry, PaidMajorityMarket, PaidMajorityMetadata, PaidMajorityUserPosition } from '@/api/paidMajority';
import { PaidMarketAccount, PaidMarketChart, PaidMarketListEntry, PaidMarketMetadata, PaidMarketTrade, PaidMarketUserPosition } from '@/api/paidMarkets';
import { FreeResults, PaidMajorityResults } from '@/api/results';
import { Arenas, MedalBoard, MyTeam, TeamLeaderboard, TeamProfile } from '@/api/arena';
import { ARENAS, CURRENT_ARENA } from '@/arena/arenas';
import { Referral } from '@/api/referral';
import { Leaderboard, PrizePool, Profile, PublicProfile, Raffle, SearchResults } from '@/api/user';

import customBoard from '../fixtures/custom-board.json';
import customChart from '../fixtures/custom-chart.json';
import customList from '../fixtures/custom-list.json';
import customMarket from '../fixtures/custom-market.json';
import customPositions from '../fixtures/custom-positions.json';
import customResults from '../fixtures/custom-results.json';
import customActivity from '../fixtures/custom-user-activity.json';
import leaderboard from '../fixtures/leaderboard.json';
import referral from '../fixtures/referral.json';
import teamMyTeam from '../fixtures/team-my-team.json';
import teamsBounties from '../fixtures/teams-bounties.json';
import teamProfile from '../fixtures/team-profile.json';
import teamsLeaderboard from '../fixtures/teams-leaderboard.json';
import majList from '../fixtures/paid-majority-list.json';
import majMarket from '../fixtures/paid-majority-market.json';
import majMetadata from '../fixtures/paid-majority-metadata.json';
import majResults from '../fixtures/paid-majority-results.json';
import majUserPositions from '../fixtures/paid-majority-user-positions.json';
import ammAccount from '../fixtures/paid-market-account.json';
import ammChart from '../fixtures/paid-market-chart.json';
import ammMetadata from '../fixtures/paid-market-metadata.json';
import ammTrades from '../fixtures/paid-market-trades.json';
import ammList from '../fixtures/paid-markets-list.json';
import ammUserPositions from '../fixtures/paid-markets-user-positions.json';
import prizePool from '../fixtures/prize-pool.json';
import profile from '../fixtures/profile.json';
import publicProfile from '../fixtures/public-profile.json';
import raffle from '../fixtures/raffle.json';
import search from '../fixtures/search.json';

/** Parses and, on failure, reports the offending path rather than a wall of zod. */
function expectParses(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.map(String).join('.') || '(root)';
    throw new Error(`${path}: ${issue.message}`);
  }
  expect(result.success).toBe(true);
}

describe('paid majority schemas', () => {
  it('parses every list entry', () => {
    for (const m of majList.markets) expectParses(PaidMajorityListEntry, m);
  });
  it('parses the market route', () => expectParses(PaidMajorityMarket, majMarket));
  it('parses every metadata row', () => {
    for (const m of majMetadata) expectParses(PaidMajorityMetadata, m);
  });
  it('parses user positions', () => {
    for (const p of majUserPositions.positions) expectParses(PaidMajorityUserPosition, p);
  });
  it('parses results', () => expectParses(PaidMajorityResults, majResults));
});

describe('paid YES/NO schemas', () => {
  it('parses every list entry', () => {
    for (const m of ammList.markets) expectParses(PaidMarketListEntry, m);
  });
  // The website sends a null slug when a market's metadata has none, and one
  // such market used to fail the whole paid list on the Markets tab.
  it('accepts a market without a slug', () => {
    expectParses(PaidMarketListEntry, { ...ammList.markets[0], slug: null });
    expectParses(PaidMajorityListEntry, { ...majList.markets[0], slug: null });
  });
  it('parses the account route', () => expectParses(PaidMarketAccount, { account: ammAccount.account, vaultAmount: ammAccount.vaultAmount }));
  it('parses metadata', () => expectParses(PaidMarketMetadata, ammMetadata));
  it('parses the chart', () => expectParses(PaidMarketChart, ammChart));
  it('parses every trade', () => {
    for (const t of ammTrades.trades) expectParses(PaidMarketTrade, t);
  });
  it('parses user positions', () => {
    for (const p of ammUserPositions.positions) expectParses(PaidMarketUserPosition, p);
  });
});

describe('free market schemas', () => {
  it('parses every list entry', () => {
    for (const m of customList.markets) expectParses(FreeListEntry, m);
  });
  it('parses the market detail', () => expectParses(FreeMarketDetail, customMarket));
  it('parses positions', () => expectParses(FreePositions, customPositions));
  it('parses the board', () => expectParses(FreeBoard, customBoard));
  it('parses the board with no wallet, where balance is null', () => {
    expectParses(FreeBoard, { ...customBoard, balance: null, userEntry: null, hasEntered: false });
  });
  it('parses the chart', () => expectParses(FreeChart, customChart));
  it('parses user activity', () => expectParses(FreeUserActivity, customActivity));
  it('parses a majority PICK trade side', () => {
    const trade = { ...customActivity.trades[0], side: 'PICK' };
    expectParses(FreeUserActivity, { ...customActivity, trades: [trade] });
  });
  it('parses results', () => expectParses(FreeResults, customResults));
});

describe('user schemas', () => {
  it('parses a profile', () => expectParses(Profile, profile));
  it('parses a public profile', () => expectParses(PublicProfile, publicProfile));
  it('parses the leaderboard', () => expectParses(Leaderboard, leaderboard));
  it('parses the prize pool', () => expectParses(PrizePool, prizePool));
  it('reads the Arena pause on a week a season replaced, and its absence on any other', () => {
    expect(PrizePool.parse(prizePool).paused?.arena).toBe('worlds-fair');
    const { paused: _paused, ...normalWeek } = prizePool;
    expect(PrizePool.parse(normalWeek).paused).toBeUndefined();
    expect(PrizePool.parse({ ...prizePool, paused: null }).paused).toBeNull();
  });
  it('parses a prize split with no place or medal', () => {
    // The raffle row carries a null place and medal; a strict schema broke here.
    expectParses(PrizePool, { ...prizePool, split: [{ kind: 'raffle', place: null, label: 'Raffle', medal: null, pct: 0.1, usd: 10 }] });
  });
  it('parses the raffle', () => expectParses(Raffle, raffle));
  it('parses the raffle with no wallet', () => expectParses(Raffle, { ...raffle, me: null }));
  it('parses search results', () => expectParses(SearchResults, search));
  it('parses empty search results', () => expectParses(SearchResults, { results: [], markets: [] }));
});

describe('schemas reject the wrong shape', () => {
  it('rejects a numeric string where a number is expected', () => {
    expect(PaidMarketTrade.safeParse({ ...ammTrades.trades[0], quantity: '100' }).success).toBe(false);
  });

  it('accepts a list word whose text is not known yet', () => {
    // Seen on staging Sep 15 2026: a word bought before the server had its
    // text. One null word must not take the whole list down.
    const entry = majList.markets[0] as { words: { word: string }[] };
    const withNull = { ...entry, words: [{ ...entry.words[0], word: null }, ...entry.words.slice(1)] };
    expect(PaidMajorityListEntry.safeParse(withNull).success).toBe(true);
  });

  it('rejects a missing required field', () => {
    const { marketId, ...rest } = majList.markets[0] as Record<string, unknown>;
    expect(PaidMajorityListEntry.safeParse(rest).success).toBe(false);
  });

  it('rejects an unknown free market type', () => {
    expect(FreeActivityPosition.safeParse({ ...customActivity.positions[0], market_type: 'lottery' }).success).toBe(false);
  });

  it('rejects a decimal string where whole base units are expected', () => {
    expect(PaidMajorityMarket.safeParse({ ...majMarket, totalUnits: '12.5' }).success).toBe(false);
  });
});

describe('PaidMajorityMarket nulls', () => {
  // The route sends word: null until the server knows the text behind a hash,
  // and account: null for a market that is not on chain. Rejecting either
  // failed the whole market screen for every mobile user.
  it('accepts a board word whose text is not known yet', () => {
    const parsed = PaidMajorityMarket.safeParse({
      account: 'AAAA',
      vaultAmount: '5000000',
      board: [{ wordHash: 'ab', word: null, units: '1', oddsPct: 100, outcome: 0 }],
      totalUnits: '1',
      traderCount: 1,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a market that is not on chain', () => {
    const parsed = PaidMajorityMarket.safeParse({ account: null, vaultAmount: '0', board: [], totalUnits: '0', traderCount: 0 });
    expect(parsed.success).toBe(true);
  });
});

describe('arena and referral schemas', () => {
  it('parses the team standings', () => expectParses(TeamLeaderboard, teamsLeaderboard));

  it('parses a team profile', () => expectParses(TeamProfile, teamProfile));

  it('drops the stored avatar rather than carrying a megabyte around', () => {
    const parsed = TeamProfile.parse(teamProfile);
    expect('pfp_data' in parsed.team).toBe(false);
  });

  it('parses my-team, which carries the member role', () => {
    expectParses(MyTeam, teamMyTeam.team);
  });

  it('parses the medal board, and a medal id it has never seen', () => {
    expectParses(MedalBoard, teamsBounties);
    const withNew = { ...teamsBounties, bounties: [{ ...teamsBounties.bounties[0], id: 'a_medal_added_next_week', state: 'a_new_state' }] };
    expect(MedalBoard.safeParse(withNew).success).toBe(true);
  });

  it('parses the seasons route: the registry as JSON, with fields this build does not know', () => {
    // The route is the web's ARENAS serialised, which is what this builds.
    const body = JSON.parse(JSON.stringify({ current: CURRENT_ARENA.slug, arenas: ARENAS.map((a) => ({ ...a, somethingNew: true })) }));
    const parsed = Arenas.parse(body);
    expect(parsed.arenas).toHaveLength(ARENAS.length);
    expect(typeof parsed.arenas[0].start).toBe('string');
    expect('somethingNew' in parsed.arenas[0]).toBe(false);
  });

  it('parses the referral route', () => expectParses(Referral, referral));
});
