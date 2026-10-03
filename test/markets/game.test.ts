// What a newcomer is told about a market: the game, how it is won, and what the
// money on the card is. "300 tokens" on its own once read as a price.
import { GAME_NAME, HOW_TO_PLAY, gameOf, poolLabel } from '@/markets/game';

describe('gameOf', () => {
  it('puts free and paid of the same game together', () => {
    expect(gameOf('paid-majority')).toBe('majority');
    expect(gameOf('free-majority')).toBe('majority');
    expect(gameOf('paid-yesno')).toBe('yesno');
    expect(gameOf('free-yesno')).toBe('yesno');
  });
});

describe('poolLabel', () => {
  it('says a token market is free and its tokens are for play', () => {
    expect(poolLabel({ kind: 'tokens', tokens: 300 })).toBe('Free · 300 play tokens');
  });

  it('shows a paid pool in dollars', () => {
    expect(poolLabel({ kind: 'usdc', usd: 12 })).toBe('$12.00 pool');
  });

  it('names the currency when a paid market has no pool figure', () => {
    expect(poolLabel({ kind: 'usdc', usd: 0 })).toBe('USDC market');
  });
});

describe('how to play', () => {
  const all = [...Object.values(GAME_NAME), ...Object.values(HOW_TO_PLAY)].join(' ');

  it('says how a majority board is won', () => {
    expect(HOW_TO_PLAY.majority).toMatch(/said most/);
    expect(HOW_TO_PLAY.majority).toMatch(/shares the pool/);
  });

  it('says what the percentage on a word means', () => {
    expect(HOW_TO_PLAY.yesno).toMatch(/%/);
  });

  it('keeps to the house style', () => {
    expect(all).not.toMatch(/\bbet(s|ting)?\b/i);
    expect(all).not.toMatch(/—/);
  });
});
