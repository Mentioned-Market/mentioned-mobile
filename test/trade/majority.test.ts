// Majority basket construction. The batching rule is a hard physical limit, not
// a preference: exceed it and the transaction fails at encoding time, after the
// user has already committed to their picks.
import { wordHashHex } from '@/chain/majority';
import { BUYS_PER_TX, checkCoinedWord, friendlyMajorityError, planMajorityBuy } from '@/trade/majority';
import { TradeInputError } from '@/trade/amm';

const WALLET = 'GjwcWFQYzemBtpUoN5fMAbtTfqxr3HHnMWxHzGoEt7HZ';
const MARKET = 1789117562931n;

const plan = (words: string[]) => planMajorityBuy({ wallet: WALLET, marketId: MARKET, words });

describe('planMajorityBuy', () => {
  it('puts three buys in a transaction', async () => {
    expect(BUYS_PER_TX).toBe(3);
    const p = await plan(['one', 'two', 'three']);
    expect(p.batches).toHaveLength(1);
    // Three buys plus the one account-creation instruction.
    expect(p.batches[0]).toHaveLength(4);
  });

  it('splits a bigger basket across transactions', async () => {
    const p = await plan(['one', 'two', 'three', 'four', 'five']);
    expect(p.batches).toHaveLength(2);
    expect(p.batches[0]).toHaveLength(4);
    expect(p.batches[1]).toHaveLength(2);
  });

  it('creates the USDC account once, on the first transaction only', async () => {
    // Repeating it would waste bytes the buys need, on the batch least able to
    // spare them.
    const p = await plan(['one', 'two', 'three', 'four']);
    expect(p.batches[0]).toHaveLength(4);
    expect(p.batches[1]).toHaveLength(1);
  });

  it('prices one unit per word', async () => {
    const p = await plan(['one', 'two', 'three', 'four']);
    expect(p.totalUsd).toBe(4);
    expect(p.words).toHaveLength(4);
  });

  it('normalises words the way the chain does', async () => {
    const p = await plan(['  Goal  ']);
    expect(p.words).toEqual(['goal']);
  });

  it('rejects a basket that picks the same word twice', async () => {
    // Two buys of one word are legal on chain but never what someone meant by
    // tapping it twice, and they would silently charge double.
    await expect(plan(['goal', 'GOAL'])).rejects.toBeInstanceOf(TradeInputError);
  });

  it('rejects an empty basket', async () => {
    await expect(plan([])).rejects.toBeInstanceOf(TradeInputError);
  });

  it('rejects a basket of only blanks', async () => {
    await expect(plan(['   '])).rejects.toBeInstanceOf(TradeInputError);
  });
});

describe('checkCoinedWord', () => {
  const ctx = { basket: ['goal'], ownedHashes: new Set([wordHashHex('taylor')]), refunding: new Set(['pouches']), banned: ['Ronaldo'] };
  const check = (w: string) => checkCoinedWord(w, ctx);

  it('accepts a fresh word, normalised', () => {
    expect(check('  Penalty ')).toEqual({ word: 'penalty' });
  });

  it.each([
    ['ab', /at least 3/],
    ['abcdefghijklm', /at most 12/],
    ['pen alty', /letters, or 3-12 digits/],
    ['abc123', /letters, or 3-12 digits/],
  ])('refuses the malformed %p', (w, message) => {
    const r = check(w);
    expect('error' in r && r.error).toMatch(message);
  });

  it('refuses a word on the market ban list, whatever its case', () => {
    expect(check('RONALDO')).toEqual({ error: "That word isn't allowed in this market." });
  });

  it('refuses a word already in the basket', () => {
    expect(check('Goal')).toEqual({ error: 'That word is already in your picks.' });
  });

  it('refuses a word the wallet already holds: one pick per word', () => {
    expect(check('taylor')).toEqual({ error: 'You have already picked this word.' });
  });

  it('refuses a word being refunded, which the program would reject', () => {
    expect(check('pouches')).toEqual({ error: 'That word is being refunded.' });
  });

  it('refuses a slur', () => {
    expect(check('cunt')).toEqual({ error: 'That word is not allowed.' });
  });
});

describe('friendlyMajorityError', () => {
  it.each([
    ['Error: MarketNotOpen', 'This market is closed.'],
    ['TradingLocked', 'Trading has closed for this event.'],
    ['word is banned', "That word isn't allowed in this market."],
    ['ResultWithNegativeLamports', 'Not enough SOL for network fees.'],
  ])('maps %p', (raw, expected) => {
    expect(friendlyMajorityError(raw)).toBe(expected);
  });
});
