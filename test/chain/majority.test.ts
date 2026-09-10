// Paid majority SDK: the decoder, the on-chain word identity, PDA derivation
// and the payout maths. The word-hash test is the important one: a word's
// identity on chain is blake3(normalize(word)), and if our hash disagrees
// with the chain's the app would show picks against the wrong word.
import {
  deserializeMajorityMarket,
  deserializePosition,
  deserializeWordEntry,
  getConfigPDA,
  getMarketPDA,
  getPositionPDA,
  getWordEntryPDA,
  majorityWordError,
  MajorityStatus,
  payoutBaseUnits,
  poolBaseUnits,
  PROGRAM_ID,
  refundBaseUnits,
  UNIT_PRICE,
  wordHashBytes,
  wordHashHex,
} from '@/chain/majority';
import { base64ToBytes } from '@/lib/bytes';

import market from '../fixtures/paid-majority-market.json';

const WALLET = '49GT1N8mRLp4Q9JYJDRR3YopGtfHFGTrwg6cmbm3u2fY';

describe('deserializeMajorityMarket', () => {
  const acct = deserializeMajorityMarket(base64ToBytes(market.account));

  it('decodes the account the route returned', () => {
    expect(acct).not.toBeNull();
    expect(acct!.marketId.toString()).toBe(market.marketId);
  });

  it('agrees with the route on the pool size', () => {
    // totalUnits is the number the board is drawn from, so a decoder drift
    // here would mis-state every percentage on the screen.
    expect(acct!.totalUnits.toString()).toBe(market.totalUnits);
    expect(acct!.wordCount).toBe(market.board.length);
  });

  it('decodes a sane fee and unit price', () => {
    expect(acct!.unitPrice).toBe(UNIT_PRICE);
    expect(acct!.feeBps).toBeGreaterThanOrEqual(0);
    expect(acct!.feeBps).toBeLessThan(10_000);
    expect(Object.values(MajorityStatus)).toContain(acct!.status);
  });

  it('returns null for junk', () => {
    expect(deserializeMajorityMarket(new Uint8Array(4))).toBeNull();
    expect(deserializeMajorityMarket(new Uint8Array(500))).toBeNull();
    expect(deserializeWordEntry(new Uint8Array(4))).toBeNull();
    expect(deserializePosition(new Uint8Array(4))).toBeNull();
  });
});

describe('word identity', () => {
  it.each(market.board.map((w) => [w.word, w.wordHash] as const))(
    'hashes "%s" to the hash the chain stores',
    (word, expected) => {
      expect(wordHashHex(word)).toBe(expected);
    },
  );

  it('is 32 bytes', () => {
    expect(wordHashBytes('creative')).toHaveLength(32);
  });

  it('ignores case and surrounding space, as normalize does', () => {
    const base = wordHashHex('creative');
    expect(wordHashHex('CREATIVE')).toBe(base);
    expect(wordHashHex('  Creative  ')).toBe(base);
  });

  it('separates different words', () => {
    expect(wordHashHex('creative')).not.toBe(wordHashHex('creatives'));
  });
});

describe('PDA derivation', () => {
  // Needs crypto.subtle, which is exactly what the polyfill provides on
  // device. If this fails in Node the maths is wrong, not the polyfill.
  it('derives a stable market address', async () => {
    const a = await getMarketPDA(BigInt(market.marketId));
    const b = await getMarketPDA(BigInt(market.marketId));
    expect(a).toBe(b);
    expect(a).not.toBe(PROGRAM_ID);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it('gives different markets different addresses', async () => {
    const a = await getMarketPDA(1n);
    const b = await getMarketPDA(2n);
    expect(a).not.toBe(b);
  });

  it('derives one word entry per word and one position per holder', async () => {
    const pda = await getMarketPDA(BigInt(market.marketId));
    const entryA = await getWordEntryPDA(pda, market.board[0].word);
    const entryB = await getWordEntryPDA(pda, market.board[1].word);
    expect(entryA).not.toBe(entryB);
    // Case and spacing normalize, so the same pick lands on the same entry.
    expect(await getWordEntryPDA(pda, market.board[0].word.toUpperCase())).toBe(entryA);

    const position = await getPositionPDA(entryA, WALLET as never);
    expect(position).not.toBe(entryA);
    expect(await getPositionPDA(entryB, WALLET as never)).not.toBe(position);
    expect(await getConfigPDA()).toBeTruthy();
  });
});

describe('payout maths', () => {
  it('splits the distributable pool pro rata by units', () => {
    // Two holders, 3 and 1 units, $4 distributable: 3:1 split.
    expect(payoutBaseUnits(3n, 4_000_000n, 4n)).toBe(3_000_000n);
    expect(payoutBaseUnits(1n, 4_000_000n, 4n)).toBe(1_000_000n);
  });

  it('pays nothing when nobody backed the winner', () => {
    expect(payoutBaseUnits(5n, 4_000_000n, 0n)).toBe(0n);
  });

  it('never pays out more than the pool', () => {
    const dist = 12_000_000n;
    const winners = 7n;
    const total = [1n, 2n, 4n].reduce((sum, u) => sum + payoutBaseUnits(u, dist, winners), 0n);
    expect(total).toBeLessThanOrEqual(dist);
  });

  it('refunds exactly what was staked', () => {
    expect(refundBaseUnits(3n, UNIT_PRICE)).toBe(3_000_000n);
    expect(refundBaseUnits(0n, UNIT_PRICE)).toBe(0n);
  });

  it('prices the pool as units times unit price', () => {
    expect(poolBaseUnits(12n, UNIT_PRICE)).toBe(12_000_000n);
  });
});

describe('majorityWordError', () => {
  it('accepts a normal word', () => {
    expect(majorityWordError('creative')).toBeNull();
  });

  it('rejects words that are too short or too long', () => {
    expect(majorityWordError('ab')).toMatch(/at least/);
    expect(majorityWordError('a'.repeat(13))).toMatch(/at most/);
  });

  it('rejects stopwords and mixed symbols', () => {
    expect(majorityWordError('the')).toMatch(/too common/);
    // The paid program's copy differs from the free market's; both are ported.
    expect(majorityWordError('and1')).toMatch(/letters, or/);
    expect(majorityWordError('hey!')).toMatch(/letters, or/);
  });

  it('accepts all-digit words', () => {
    expect(majorityWordError('2026')).toBeNull();
  });
});
