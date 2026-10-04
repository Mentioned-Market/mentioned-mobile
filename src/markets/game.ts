// What a newcomer needs told about a market before the board makes sense: which
// of the two games it is, how that game is won, and what the money on the card
// is. Pure, so the wording is pinned by tests and every screen says the same.
import { usd } from '@/lib/format';
import { isMajority, isPaid, type MarketKind, type MarketSummary } from '@/markets/merge';

export type Game = 'majority' | 'yesno';

export const gameOf = (kind: MarketKind): Game => (isMajority({ kind }) ? 'majority' : 'yesno');

/** The game's name, as the market card's badge and the market screen both show it. */
export const GAME_NAME: Record<Game, string> = {
  majority: 'Most said wins',
  yesno: 'Yes or no on each word',
};

/**
 * The game on a market card's badge. Shorter than the name, because the badge
 * sits beside the stake badge and the market screen has the room to explain.
 */
export const GAME_BADGE: Record<Game, string> = {
  majority: 'Most said wins',
  yesno: 'Yes or no',
};

export type Stake = 'paid' | 'free';

export const stakeOf = (kind: MarketKind): Stake => (isPaid({ kind }) ? 'paid' : 'free');

/** Whether a market is played with USDC or with play tokens, as its card's badge says it. */
export const STAKE_NAME: Record<Stake, string> = { paid: 'Paid', free: 'Free' };

/** The Ionicons glyph beside the name. */
export const GAME_ICON: Record<Game, 'podium' | 'checkmark-done'> = {
  majority: 'podium',
  yesno: 'checkmark-done',
};

/** How the game is won, in a line. The same for free and paid: only the unit differs. */
export const HOW_TO_PLAY: Record<Game, string> = {
  majority: 'Pick words. Everyone who picked the word said most shares the pool.',
  yesno: 'Pick Yes if you think it gets said, No if not. The % is how likely players think it is.',
};

/**
 * The name and the how-to-play line for one market. A majority market that
 * pays several places (docs/MM_V2_SPEC.md) is a different promise from one
 * that pays the single most-said word, so it says so; every other market gets
 * the lines above. `paidPlaces` is 1 unless the market says otherwise.
 */
export function gameName(game: Game, paidPlaces = 1): string {
  return game === 'majority' && paidPlaces > 1 ? `Top ${paidPlaces} said win` : GAME_NAME[game];
}

export function howToPlay(game: Game, paidPlaces = 1): string {
  return game === 'majority' && paidPlaces > 1
    ? `The ${paidPlaces} most-mentioned words all pay from one pool. 1st pays the most per pick, then each place below it. Rare picks pay big and popular picks pay small.`
    : HOW_TO_PLAY[game];
}

type Money = Pick<MarketSummary, 'pool' | 'traderCount'>;

/**
 * The figure on a market card, beside its badges: the pool on a paid majority
 * market, the number of traders on a paid YES/NO market, nothing on a free
 * one. The list carries no pool or volume for a YES/NO market, and traders is
 * the one figure it does have. A free market says nothing here, since the
 * badge already says Free and every free market starts with the same tokens.
 */
export function moneyLine({ pool, traderCount }: Money): string | null {
  if (pool.kind === 'tokens') return null;
  if (pool.usd > 0) return `${usd(pool.usd)} pool`;
  if (traderCount > 0) return `${traderCount} ${traderCount === 1 ? 'trader' : 'traders'}`;
  return null;
}

/**
 * The same, for a row or tile with no badges, which therefore has to say Free
 * or Paid itself. A pool in dollars already says paid.
 */
export function poolLabel(market: Money): string {
  const line = moneyLine(market);
  if (market.pool.kind === 'tokens') return 'Free';
  if (!line) return 'Paid';
  return market.pool.usd > 0 ? line : `Paid · ${line}`;
}
