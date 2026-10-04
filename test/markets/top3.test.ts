// Top 3 majority markets (docs/MM_V2_SPEC.md). The vectors in section 10 of the
// spec are checked here, against markets captured from staging where one
// exists, and a market that pays one winner is pinned to the numbers and words
// it had before any of this.
import { FreeBoard, FreeListEntry } from '@/api/free';
import { PaidMajorityListEntry, PaidMajorityMarket } from '@/api/paidMajority';
import { deserializeMajorityMarket, MajorityStatus, winnerPayoutBaseUnits, wordEntryPlace, WordOutcome } from '@/chain/majority';
import { potentialWin } from '@/chain/majorityWords';
import { base64ToBytes } from '@/lib/bytes';
import {
  boardTitle,
  finishText,
  freePodium,
  freeResult,
  freeWeights,
  freshPickWin,
  heldPickWin,
  listPodium,
  mentionsText,
  netText,
  paidPodium,
  paidPositionPayout,
  paidWeights,
  paysPlaces,
  paysText,
  pickResults,
  placesLine,
  podiumHeadline,
  podiumSubline,
  standingOrder,
  stepDelayMs,
  winLine,
  type PodiumTier,
} from '@/markets/top3';

import legacyPaid from '../fixtures/paid-majority-market.json';
import freeBoardFixture from '../fixtures/top3-free-board.json';
import freeTieFixture from '../fixtures/top3-free-board-tie.json';
import freeListFixture from '../fixtures/top3-free-list.json';
import paidListFixture from '../fixtures/top3-paid-list.json';
import paidOpenFixture from '../fixtures/top3-paid-market-open.json';
import paidResolvedFixture from '../fixtures/top3-paid-market-resolved.json';

const T3 = [3, 2, 1];

describe('the staging responses parse', () => {
  it('reads the free board, its weights and each word place', () => {
    const board = FreeBoard.parse(freeBoardFixture);
    expect(board.market.payout_weights).toEqual(T3);
    expect(board.board.filter((w) => w.place != null).map((w) => [w.word, w.place])).toEqual([
      ['football', 1],
      ['sport', 2],
      ['corner', 3],
    ]);
  });

  it('reads the free list, the paid market and the paid list with its podium', () => {
    for (const m of freeListFixture) expect(FreeListEntry.safeParse(m).success).toBe(true);
    expect(PaidMajorityMarket.parse(paidResolvedFixture).board.find((w) => w.word === 'china')?.place).toBe(2);
    const listed = paidListFixture.markets.map((m) => PaidMajorityListEntry.parse(m));
    expect(listed.find((m) => m.status === MajorityStatus.Resolved)?.podium).toHaveLength(3);
    expect(listed.find((m) => m.status !== MajorityStatus.Resolved)?.podium ?? null).toBeNull();
  });

  it('still parses responses from a server that sends none of the new fields', () => {
    const { payout_weights: _w, ...oldMarket } = freeBoardFixture.market;
    const old = { ...freeBoardFixture, market: oldMarket, board: freeBoardFixture.board.map(({ place: _p, ...w }) => w) };
    const parsed = FreeBoard.parse(old);
    expect(paysPlaces(freeWeights(parsed.market.payout_weights))).toBe(false);
    expect(PaidMajorityMarket.safeParse(legacyPaid).success).toBe(true);
  });
});

describe('is this a top 3 market', () => {
  it('free: more than one weight', () => {
    expect(paysPlaces(freeWeights([3, 2, 1]))).toBe(true);
    for (const wta of [[1], undefined, null, [], 'nonsense']) expect(paysPlaces(freeWeights(wta))).toBe(false);
  });

  it('paid: a second non-zero byte', () => {
    expect(paidWeights([3, 2, 1])).toEqual([3, 2, 1]);
    expect(paidWeights([3, 2, 0])).toEqual([3, 2]);
    for (const wta of [[0, 0, 0], [1, 0, 0], [5, 0, 0], undefined, null]) {
      expect(paidWeights(wta)).toHaveLength(1);
      expect(paysPlaces(paidWeights(wta))).toBe(false);
    }
  });
});

describe('the paid market account', () => {
  const resolved = deserializeMajorityMarket(base64ToBytes(paidResolvedFixture.account));
  const open = deserializeMajorityMarket(base64ToBytes(paidOpenFixture.account));
  const legacy = deserializeMajorityMarket(base64ToBytes(legacyPaid.account as string));

  it('decodes the weights and pots that sit after the vault', () => {
    expect(resolved?.payoutWeights).toEqual([3, 2, 1]);
    expect(open?.payoutWeights).toEqual([3, 2, 1]);
    expect(resolved?.status).toBe(MajorityStatus.Resolved);
    // One word on each place; america had two units, china and wolf one each.
    expect(resolved?.placeUnits).toEqual([2n, 1n, 1n]);
    expect(resolved?.placePot.every((p) => p > 0n)).toBe(true);
    // 1st pays more per unit than 2nd, and 2nd more than 3rd.
    const perUnit = resolved!.placePot.map((pot, i) => Number(pot) / Number(resolved!.placeUnits[i]));
    expect(perUnit[0]).toBeGreaterThan(perUnit[1]);
    expect(perUnit[1]).toBeGreaterThan(perUnit[2]);
  });

  it('pays out exactly the pool after the fee across the three pots, to within rounding', () => {
    const paid = resolved!.placePot.reduce((s, p) => s + p, 0n);
    expect(paid <= resolved!.distributable).toBe(true);
    expect(resolved!.distributable - paid < 3n).toBe(true);
  });

  it('reads a market from before the upgrade as all zeros, which is winner takes all', () => {
    expect(legacy?.payoutWeights).toEqual([0, 0, 0]);
    expect(paysPlaces(paidWeights(legacy?.payoutWeights))).toBe(false);
  });

  it('reads a word place from byte 114, and nothing from a short or unplaced entry', () => {
    const entry = new Uint8Array(120);
    expect(wordEntryPlace(entry)).toBe(0);
    entry[114] = 2;
    expect(wordEntryPlace(entry)).toBe(2);
    entry[114] = 9;
    expect(wordEntryPlace(entry)).toBe(0);
    expect(wordEntryPlace(new Uint8Array(114))).toBe(0);
  });
});

describe('claimable amount, paid (spec section 5 and the section 10 vectors)', () => {
  const row = (placePot: bigint[], placeUnits: bigint[]) => ({ distributable: 0n, winnerUnits: 0n, placePot, placeUnits, unitPrice: 10_000n });

  it('pays a unit on each place its share of that place pot', () => {
    const terms = row([188160n, 156800n, 47040n], [8n, 10n, 6n]);
    expect(winnerPayoutBaseUnits(1n, 1, terms)).toBe(23520n);
    expect(winnerPayoutBaseUnits(1n, 2, terms)).toBe(15680n);
    expect(winnerPayoutBaseUnits(1n, 3, terms)).toBe(7840n);
  });

  it('floors, and pays the whole pot across the place when every unit claims', () => {
    const terms = row([19000n, 12666n, 6333n], [1n, 1n, 2n]);
    expect(winnerPayoutBaseUnits(1n, 3, terms)).toBe(3166n);
    expect(winnerPayoutBaseUnits(2n, 3, terms)).toBe(6333n);
  });

  it('pays nothing for a place a tie skipped, or one nobody held', () => {
    const tieForFirst = row([96055n, 0n, 27444n], [7n, 0n, 5n]);
    expect(winnerPayoutBaseUnits(1n, 2, tieForFirst)).toBe(0n);
    expect(winnerPayoutBaseUnits(7n, 1, tieForFirst)).toBe(96055n);
    expect(winnerPayoutBaseUnits(5n, 3, tieForFirst)).toBe(27444n);
  });

  it('keeps the original formula for a word with no place', () => {
    expect(winnerPayoutBaseUnits(2n, 0, { distributable: 900_000n, winnerUnits: 6n })).toBe(300_000n);
    expect(winnerPayoutBaseUnits(2n, 0, { distributable: 900_000n, winnerUnits: 0n })).toBe(0n);
  });

  it('prices a position by its outcome: placed, refunded, or nothing', () => {
    const terms = { ...row([188160n, 156800n, 47040n], [8n, 10n, 6n]) };
    expect(paidPositionPayout(1n, WordOutcome.Winner, 2, terms)).toBe(15680n);
    expect(paidPositionPayout(3n, WordOutcome.Refunding, 0, terms)).toBe(30_000n);
    expect(paidPositionPayout(3n, WordOutcome.Unresolved, 0, terms)).toBe(0n);
  });

  it('matches the staging market: every placed unit claims its pot share', () => {
    const acct = deserializeMajorityMarket(base64ToBytes(paidResolvedFixture.account))!;
    const america = winnerPayoutBaseUnits(2n, 1, acct);
    expect(america).toBe(acct.placePot[0]);
    expect(winnerPayoutBaseUnits(1n, 2, acct)).toBe(acct.placePot[1]);
    expect(winnerPayoutBaseUnits(1n, 3, acct)).toBe(acct.placePot[2]);
  });
});

describe('the estimate while a market is open (spec section 6)', () => {
  it('gives the worked example: $1 on a word with 2 of 20 units, rivals at 6 and 4, a 2% fee', () => {
    // Other words: 6, 4 and the remaining 8 spread thin. Only the two biggest rivals count.
    const state = { weights: T3, pool: 20, stakes: [2, 6, 4, 3, 3, 2], fee: 0.02, floor: 0 };
    expect(freshPickWin(state, 0, 1)).toBeCloseTo(2.4696, 4);
  });

  it('counts a brand new word as a stake of nothing before the pick', () => {
    const state = { weights: T3, pool: 20, stakes: [6, 4, 10], fee: 0.02, floor: 0 };
    // pool 21, word 1, rivals 10 and 6: 3 * 20.58 / (3 + 20 + 6)
    expect(freshPickWin(state, -1, 1)).toBeCloseTo((3 * 20.58) / 29, 6);
  });

  it('uses the rivals that exist when there are fewer than the places', () => {
    const state = { weights: T3, pool: 4, stakes: [1, 3], fee: 0, floor: 0 };
    // pool 5, word 2, one rival at 3: 3 * 5 / (6 + 6)
    expect(freshPickWin(state, 0, 1)).toBeCloseTo(1.25, 6);
  });

  it('applies the floor on a free market and none on a paid one', () => {
    const crowded = { weights: T3, pool: 1000, stakes: [900, 60, 40], fee: 0 };
    expect(freshPickWin({ ...crowded, floor: 1.5 }, 0, 150)).toBe(150 * 1.5);
    expect(freshPickWin({ ...crowded, floor: 0 }, 0, 150)).toBeLessThan(150 * 1.5);
  });

  it('prices a pick already placed against the pool as it stands', () => {
    const state = { weights: T3, pool: 20, stakes: [2, 6, 4, 8], fee: 0.02, floor: 0 };
    // rivals 8 and 6: 3 * 19.6 / (6 + 16 + 6)
    expect(heldPickWin(state, 0, 1)).toBeCloseTo((3 * 19.6) / 28, 6);
  });

  it('is never less than what the pick actually paid once the market resolved', () => {
    // The staging free market, replayed: football finished 1st on a stake of 900.
    const board = FreeBoard.parse(freeBoardFixture);
    const stakes = board.board.map((w) => w.staked);
    const pool = stakes.reduce((s, x) => s + x, 0);
    const estimate = heldPickWin({ weights: T3, pool, stakes, fee: 0, floor: 1.5 }, 0, 1);
    const actual = freePodium(board.board.map((w) => ({ key: String(w.word_id), word: w.word, place: w.place, staked: w.staked })), T3, 0, 1.5)![0].multiple;
    expect(actual).toBeGreaterThanOrEqual(estimate - 1e-9);
  });
});

describe('a winner-takes-all market is unchanged', () => {
  it('free: the estimate is the old potentialWin, to the token', () => {
    const stakes = [300, 150, 150, 0];
    const state = { weights: [1], pool: 600, stakes, fee: 0, floor: 1.5 };
    stakes.forEach((staked, i) => expect(freshPickWin(state, i, 150)).toBe(potentialWin(staked, 600, 150, 0, 1.5)));
    expect(freshPickWin(state, -1, 150)).toBe(potentialWin(0, 600, 150, 0, 1.5));
  });

  it('paid: the estimate is the old share-of-pool formula', () => {
    const units = [2, 2, 1, 1, 1, 1];
    const total = 8;
    const fee = 0.05;
    const old = (wordUnits: number) => ((total + 1) * (1 - fee)) / (wordUnits + 1);
    units.forEach((u, i) => expect(freshPickWin({ weights: [1], pool: total, stakes: units, fee, floor: 0 }, i, 1)).toBeCloseTo(old(u), 12));
  });

  it('keeps its wording and has no podium', () => {
    expect(winLine(false, '$2.40')).toBe('Wins $2.40 if said most');
    expect(boardTitle(false, true)).toBe('Pick the word said the most');
    expect(boardTitle(false, false)).toBe('Board');
    expect(listPodium(undefined)).toBeNull();
    expect(listPodium(null)).toBeNull();
  });
});

describe('wording on a market that pays places', () => {
  it('says what the pick pays if 1st, and asks for the right number of words', () => {
    expect(winLine(true, '$2.47')).toBe('If 1st, at least $2.47');
    expect(boardTitle(true, true)).toBe('Pick the 3 words said the most');
    expect(boardTitle(true, true, 2)).toBe('Pick the 2 words said the most');
  });

  it('names a finish, or says the pick did not place', () => {
    expect(finishText('2nd')).toBe('Finished 2nd');
    expect(finishText(null)).toBe('Did not place');
  });

  it('formats a net result in the market unit', () => {
    expect(netText(369.4, 'tokens')).toBe('+369');
    expect(netText(-150, 'tokens')).toBe('-150');
    expect(netText(1.345, 'usd')).toMatch(/^\+\$1\.3[45]$/);
    expect(netText(-1, 'usd')).toBe('-$1.00');
    expect(netText(0, 'usd')).toBe('+$0.00');
  });
});

describe('the free podium (spec section 10)', () => {
  const word = (key: string, place: number | null, staked: number, mentions = 0) => ({ key, word: key, place, staked, mentions });
  const rest = [word('d', null, 1200), word('e', null, 1500)];

  it('pays 3.46x, 2.31x and 1.15x on a pool of 4,500 with 600, 900 and 300 placed', () => {
    const tiers = freePodium([word('a', 1, 600, 11), word('b', 2, 900, 6), word('c', 3, 300, 7), ...rest], T3, 0, 1.5)!;
    expect(tiers.map((t) => t.multiple.toFixed(2))).toEqual(['3.46', '2.31', '1.15']);
    expect(tiers.map((t) => paysText(t.multiple))).toEqual(['pays 3.46x', 'pays 2.31x', 'pays 1.15x']);
  });

  it('pays 2.78x and 1.11x on a tie for 1st then 3rd, and leaves 2nd out', () => {
    const tiers = freePodium([word('a', 1, 900, 14), word('b', 1, 600, 14), word('c', 3, 300, 9), word('d', null, 2700)], T3, 0, 1.5)!;
    expect(tiers.map((t) => t.place)).toEqual([1, 3]);
    expect(tiers.map((t) => t.multiple.toFixed(2))).toEqual(['2.78', '1.11']);
    expect(tiers[0].words.map((w) => w.word)).toEqual(['a', 'b']);
  });

  it('draws the staging markets: three steps, and the tie as two', () => {
    const tiersOf = (fixture: unknown) => {
      const b = FreeBoard.parse(fixture);
      return freePodium(
        b.board.map((w) => ({ key: String(w.word_id), word: w.word, place: w.place, staked: w.staked, mentions: w.mention_count })),
        freeWeights(b.market.payout_weights),
        Number(b.market.takeout_pct),
        Number(b.market.floor_multiple),
      )!;
    };
    const plain = tiersOf(freeBoardFixture);
    expect(plain.map((t) => [t.place, t.words.map((w) => w.word).join('+')])).toEqual([
      [1, 'football'],
      [2, 'sport'],
      [3, 'corner'],
    ]);
    expect(plain[0].multiple).toBeGreaterThan(plain[1].multiple);
    expect(plain[1].multiple).toBeGreaterThan(plain[2].multiple);

    const tie = tiersOf(freeTieFixture);
    expect(tie.map((t) => [t.place, t.words.map((w) => w.word).join('+')])).toEqual([
      [1, 'football+penalty'],
      [3, 'keeper'],
    ]);
    expect(podiumHeadline(tie)).toBe('football & penalty');
    expect(podiumSubline(tie, 3)).toBe('Tied for the most said, 14 times each. The top 3 share the pool.');
    expect(mentionsText(tie[0])).toBe('Tied · 14 mentions');
    expect(podiumSubline(plain, 3)).toBe('Said the most, 11 times. The top 3 share the pool.');
    expect(mentionsText(plain[2])).toBe('7 mentions');
  });

  it('gives the same multiples from the list route, where a stake is a share of the pool', () => {
    const listed = FreeListEntry.parse(freeListFixture.find((m) => m.id === 75));
    const fromList = freePodium(
      listed.words_prices.map((w) => ({ key: String(w.word_id), word: w.word, place: w.place, staked: w.yes_price })),
      freeWeights(listed.payout_weights),
      Number(listed.takeout_pct),
      Number(listed.floor_multiple),
    )!;
    const b = FreeBoard.parse(freeBoardFixture);
    const fromBoard = freePodium(b.board.map((w) => ({ key: String(w.word_id), word: w.word, place: w.place, staked: w.staked })), T3, 0, 1.5)!;
    fromList.forEach((t, i) => expect(t.multiple).toBeCloseTo(fromBoard[i].multiple, 6));
  });

  it('marks a place nobody backed, and draws nothing when no placed word had a pick', () => {
    const tiers = freePodium([word('a', 1, 600), word('b', 2, 0), word('c', 3, 300), word('d', null, 600)], T3, 0, 1.5)!;
    expect(paysText(tiers[1].multiple)).toBe('no picks');
    expect(freePodium([word('a', 1, 0), word('b', 2, 0), word('d', null, 600)], T3, 0, 1.5)).toBeNull();
    expect(freePodium([word('d', null, 600)], T3, 0, 1.5)).toBeNull();
  });

  it('handles a result with only two places called', () => {
    const tiers = freePodium([word('a', 1, 300), word('b', 2, 300), word('d', null, 900)], T3, 0, 1.5)!;
    expect(tiers.map((t) => t.place)).toEqual([1, 2]);
  });
});

describe('the paid podium', () => {
  const board = (places: [string, number][]) => places.map(([word, place]) => ({ key: word, word, place }));

  it('prices each place from its pot: pot / (units * unit price)', () => {
    const tiers = paidPodium(board([['a', 1], ['b', 2], ['c', 3], ['d', 0]]), { placePot: [188160n, 156800n, 47040n], placeUnits: [8n, 10n, 6n], unitPrice: 10_000n })!;
    expect(tiers.map((t) => t.multiple.toFixed(3))).toEqual(['2.352', '1.568', '0.784']);
    expect(tiers[0].words[0].mentions).toBeUndefined();
    expect(podiumSubline(tiers, 3)).toBe('Said the most. The top 3 share the pool.');
    expect(mentionsText(tiers[0])).toBeNull();
  });

  it('draws a tie for 1st then 3rd as two steps', () => {
    const tiers = paidPodium(board([['a', 1], ['b', 1], ['c', 3]]), { placePot: [96055n, 0n, 27444n], placeUnits: [7n, 0n, 5n], unitPrice: 10_000n })!;
    expect(tiers.map((t) => t.place)).toEqual([1, 3]);
    expect(podiumSubline(tiers, 3)).toBe('Tied for the most said. The top 3 share the pool.');
  });

  it('matches the list route for the staging market', () => {
    const market = PaidMajorityMarket.parse(paidResolvedFixture);
    const acct = deserializeMajorityMarket(base64ToBytes(paidResolvedFixture.account))!;
    const fromAccount = paidPodium(market.board.map((w) => ({ key: w.wordHash, word: w.word ?? '', place: w.place })), acct)!;
    const fromList = listPodium(paidListFixture.markets.find((m) => m.marketId === '1791107887379')?.podium)!;
    expect(fromAccount.map((t) => t.words[0].word)).toEqual(['america', 'china', 'wolf']);
    fromAccount.forEach((t, i) => expect(t.multiple).toBeCloseTo(fromList[i].multiple, 5));
  });

  it('draws nothing while the words have no places yet, which is the moment right after a resolve', () => {
    expect(paidPodium(board([['a', 0], ['b', 0]]), { placePot: [1n, 1n, 1n], placeUnits: [1n, 1n, 1n], unitPrice: 10_000n })).toBeNull();
  });
});

describe('standing order and motion', () => {
  const tier = (place: number, n = 1): PodiumTier => ({ place, words: Array.from({ length: n }, (_, i) => ({ key: `${place}-${i}`, word: 'w' })), multiple: 1 });

  it('stands 2nd, 1st, 3rd', () => {
    expect(standingOrder([tier(1), tier(2), tier(3)]).map((t) => t.place)).toEqual([2, 1, 3]);
  });

  it('leaves a missing place out', () => {
    expect(standingOrder([tier(1, 2), tier(3)]).map((t) => t.place)).toEqual([1, 3]);
    expect(standingOrder([tier(1), tier(2)]).map((t) => t.place)).toEqual([2, 1]);
  });

  it('raises the lowest step first and the winner last', () => {
    expect([1, 2, 3].map(stepDelayMs)).toEqual([240, 120, 0]);
  });
});

describe('the viewer picks on a resolved market', () => {
  it('gives each pick its finish and net, and the total', () => {
    const { rows, net } = pickResults([
      { key: '1', word: 'football', place: 1, stake: 150, payout: 519 },
      { key: '2', word: 'tackle', place: null, stake: 150, payout: 0 },
    ]);
    expect(rows.map((r) => [r.word, finishText(r.placeText), r.net])).toEqual([
      ['football', 'Finished 1st', 369],
      ['tackle', 'Did not place', -150],
    ]);
    expect(net).toBe(219);
  });

  it('can pay on more than one pick, and a lower place can pay less than the stake', () => {
    const { rows, net } = pickResults([
      { key: '1', word: 'a', place: 2, stake: 1, payout: 1.57 },
      { key: '2', word: 'b', place: 3, stake: 1, payout: 0.78 },
    ]);
    expect(rows[1].net).toBeCloseTo(-0.22, 6);
    expect(net).toBeCloseTo(0.35, 6);
  });
});

describe('placesLine', () => {
  const tier = (place: number, ...words: string[]): PodiumTier => ({ place, words: words.map((w) => ({ key: w, word: w })), multiple: 1 });

  it('names each place in order, and joins a tie', () => {
    expect(placesLine([tier(1, 'america'), tier(2, 'china'), tier(3, 'wolf')])).toBe('1st america · 2nd china · 3rd wolf');
    expect(placesLine([tier(1, 'football', 'penalty'), tier(3, 'keeper')])).toBe('1st football & penalty · 3rd keeper');
  });
});

describe('a free result does not quote mention counts yet', () => {
  it('leaves them off the podium, so the headline says only what placed', () => {
    const { podium } = freeResult(FreeBoard.parse(freeTieFixture), true);
    expect(podium?.every((t) => t.words.every((w) => w.mentions === undefined))).toBe(true);
    expect(podiumSubline(podium!, 3)).toBe('Tied for the most said. The top 3 share the pool.');
    expect(mentionsText(podium![0])).toBeNull();
  });

  it('gives the viewer picks their finish from the board places', () => {
    const board = FreeBoard.parse(freeBoardFixture);
    const withEntry = { ...board, userEntry: [{ word_id: board.board[1].word_id, word: board.board[1].word, tokens: 150, tokens_received: 282 }] };
    const { picks } = freeResult(withEntry, true);
    expect(picks).toEqual([{ key: String(board.board[1].word_id), word: 'sport', place: 2, stake: 150, payout: 282 }]);
  });

  it('is empty for a market that is not resolved, or pays one winner', () => {
    const board = FreeBoard.parse(freeBoardFixture);
    expect(freeResult(board, false)).toEqual({ podium: null, picks: [] });
    expect(freeResult({ ...board, market: { ...board.market, payout_weights: [1] } }, true)).toEqual({ podium: null, picks: [] });
  });
});
