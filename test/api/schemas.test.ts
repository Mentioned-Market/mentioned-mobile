// Every zod schema parsed against a captured production response. This is the
// offline half of the contract test: `npm run contract` proves the shapes
// against the live API, these prove a schema edit does not break a shape that
// was already working.
import { z } from 'zod';

import { FreeActivityPosition, FreeBoard, FreeChart, FreeListEntry, FreeMarketDetail, FreePositions, FreeUserActivity } from '@/api/free';
import { PaidMajorityListEntry, PaidMajorityMarket, PaidMajorityMetadata, PaidMajorityUserPosition } from '@/api/paidMajority';
import { PaidMarketAccount, PaidMarketChart, PaidMarketListEntry, PaidMarketMetadata, PaidMarketTrade, PaidMarketUserPosition } from '@/api/paidMarkets';
import { FreeResults, PaidMajorityResults } from '@/api/results';
import { Leaderboard, PrizePool, Profile, PublicProfile, Raffle, SearchResults } from '@/api/user';

import customBoard from '../fixtures/custom-board.json';
import customChart from '../fixtures/custom-chart.json';
import customList from '../fixtures/custom-list.json';
import customMarket from '../fixtures/custom-market.json';
import customPositions from '../fixtures/custom-positions.json';
import customResults from '../fixtures/custom-results.json';
import customActivity from '../fixtures/custom-user-activity.json';
import leaderboard from '../fixtures/leaderboard.json';
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
