// What a newcomer is told about a market: the game, how it is won, and what the
// money on the card is. "300 tokens" on its own once read as a price.
import { GAME_BADGE, GAME_NAME, HOW_TO_PLAY, STAKE_NAME, gameName, gameOf, howToPlay, moneyLine, poolLabel, stakeOf } from '@/markets/game';

describe('gameOf', () => {
  it('puts free and paid of the same game together', () => {
    expect(gameOf('paid-majority')).toBe('majority');
    expect(gameOf('free-majority')).toBe('majority');
    expect(gameOf('paid-yesno')).toBe('yesno');
    expect(gameOf('free-yesno')).toBe('yesno');
  });
});

describe('stakeOf', () => {
  it('puts both games of the same stake together', () => {
    expect(stakeOf('paid-majority')).toBe('paid');
    expect(stakeOf('paid-yesno')).toBe('paid');
    expect(stakeOf('free-majority')).toBe('free');
    expect(stakeOf('free-yesno')).toBe('free');
  });

  it('gives every one of the four markets its own pair of badges', () => {
    const kinds = ['paid-majority', 'paid-yesno', 'free-majority', 'free-yesno'] as const;
    const badges = kinds.map((k) => `${STAKE_NAME[stakeOf(k)]} ${GAME_BADGE[gameOf(k)]}`);
    expect(new Set(badges).size).toBe(4);
  });
});

const free = { pool: { kind: 'tokens', tokens: 300 }, traderCount: 12 } as const;
const majority = { pool: { kind: 'usdc', usd: 12 }, traderCount: 4 } as const;
const yesno = { pool: { kind: 'usdc', usd: 0 }, traderCount: 30 } as const;

describe('moneyLine', () => {
  it('says nothing on a free market: the badge says Free and the tokens are always the same', () => {
    expect(moneyLine(free)).toBeNull();
  });

  it('shows a paid pool in dollars', () => {
    expect(moneyLine(majority)).toBe('$12.00 pool');
  });

  it('counts traders where the list has no pool figure', () => {
    expect(moneyLine(yesno)).toBe('30 traders');
    expect(moneyLine({ ...yesno, traderCount: 1 })).toBe('1 trader');
  });

  it('says nothing rather than "0 traders"', () => {
    expect(moneyLine({ ...yesno, traderCount: 0 })).toBeNull();
  });
});

describe('poolLabel', () => {
  it('says Free or Paid itself, for a row that has no badges', () => {
    expect(poolLabel(free)).toBe('Free');
    expect(poolLabel(majority)).toBe('$12.00 pool');
    expect(poolLabel(yesno)).toBe('Paid · 30 traders');
    expect(poolLabel({ ...yesno, traderCount: 0 })).toBe('Paid');
  });
});

describe('how to play', () => {
  const all = [...Object.values(GAME_NAME), ...Object.values(GAME_BADGE), ...Object.values(HOW_TO_PLAY)].join(' ');

  it('says how a majority board is won', () => {
    expect(HOW_TO_PLAY.majority).toMatch(/said most/);
    expect(HOW_TO_PLAY.majority).toMatch(/shares the pool/);
  });

  it('says what the multiplier on a word means, and never calls it a percentage', () => {
    expect(HOW_TO_PLAY.yesno).toMatch(/2x doubles it/);
    expect(HOW_TO_PLAY.yesno).not.toMatch(/%/);
  });

  it('keeps to the house style', () => {
    expect(all).not.toMatch(/\bbet(s|ting)?\b/i);
    expect(all).not.toMatch(/—/);
  });
});

describe('a majority market that pays places', () => {
  it('says how many words pay, and how', () => {
    expect(gameName('majority', 3)).toBe('Top 3 said win');
    expect(howToPlay('majority', 3)).toMatch(/3 most-mentioned words all pay from one pool/);
    expect(howToPlay('majority', 3)).not.toMatch(/\bbet/i);
  });

  it('leaves every other market with the lines it had', () => {
    expect(gameName('majority')).toBe(GAME_NAME.majority);
    expect(gameName('majority', 1)).toBe(GAME_NAME.majority);
    expect(howToPlay('majority', 1)).toBe(HOW_TO_PLAY.majority);
    expect(gameName('yesno', 3)).toBe(GAME_NAME.yesno);
    expect(howToPlay('yesno', 3)).toBe(HOW_TO_PLAY.yesno);
  });
});
