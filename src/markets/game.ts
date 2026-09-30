// What a newcomer needs told about a market before the board makes sense: which
// of the two games it is, how that game is won, and what the money on the card
// is. Pure, so the wording is pinned by tests and every screen says the same.
import { tokens, usd } from '@/lib/format';
import { isMajority, type MarketKind, type MarketSummary } from '@/markets/merge';

export type Game = 'majority' | 'yesno';

export const gameOf = (kind: MarketKind): Game => (isMajority({ kind }) ? 'majority' : 'yesno');

/** The game's name, as the market card's badge and the market screen both show it. */
export const GAME_NAME: Record<Game, string> = {
  majority: 'Most said wins',
  yesno: 'Yes or no on each word',
};

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
 * The money line on a card. A free market says it is free and that its tokens
 * are for play: "300 tokens" alone read as a price. A paid YES/NO market has
 * no pool figure in the list, so it names its currency instead.
 */
export function poolLabel(pool: MarketSummary['pool']): string {
  if (pool.kind === 'tokens') return `Free · ${tokens(pool.tokens)} play tokens`;
  return pool.usd > 0 ? `${usd(pool.usd)} pool` : 'USDC market';
}
