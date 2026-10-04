// How points are earned, as the "How to earn points" sheet explains it.
//
// The numbers are the server's: the mobile config route sends the scorers' own
// constants, and this turns them into the sheet's wording. They used to be
// written into the screen, and the screen went on promising "+150 per $1,
// capped at 200 a free market" after the website had changed both.
//
// The defaults below are what the website paid on Oct 3 2026. They are only
// what a build shows before its first config arrives, or against a server that
// sends none.
import { VIRTUAL_MARKET_POINTS_CAP, VIRTUAL_MARKET_POINTS_MULTIPLIER } from '@/free/marketUtils';

export type PointsRules = {
  /** Flat points for taking part in a Yes/No market, win or lose. */
  paidHoldBonus: number;
  /** USDC that has to be held to the close to earn it. */
  paidHoldMinStake: number;
  /** Points per $1 of profit on a paid market. */
  paidProfitMultiplier: number;
  /** Most points profit alone can earn on one Yes/No market. */
  paidProfitCap: number;
  /** Most points one Yes/No market can earn in total. */
  paidCap: number;
  majorityHoldBonus: number;
  majorityHoldMinStake: number;
  majorityProfitCap: number;
  majorityCap: number;
  /** Points per play token of profit on a free market. */
  freeMultiplier: number;
  /** Most points one free market can earn. */
  freeCap: number;
  /** Points per chat message, for the first `chatDailyCap` messages a day. */
  chatPoints: number;
  chatDailyCap: number;
};

export const DEFAULT_POINTS: PointsRules = {
  paidHoldBonus: 100,
  paidHoldMinStake: 1,
  paidProfitMultiplier: 150,
  paidProfitCap: 200,
  paidCap: 300,
  majorityHoldBonus: 100,
  majorityHoldMinStake: 1,
  majorityProfitCap: 100,
  majorityCap: 200,
  // The free market numbers already live in the ported scoring module, which
  // the trade preview reads; one copy in the build, not two.
  freeMultiplier: VIRTUAL_MARKET_POINTS_MULTIPLIER,
  freeCap: VIRTUAL_MARKET_POINTS_CAP,
  chatPoints: 1,
  chatDailyCap: 5,
};

/**
 * The server's numbers over the defaults. Only a real, non-negative number
 * replaces a default: a missing key, a string or a NaN keeps the bundled value,
 * so a malformed config can make the sheet a little stale but never nonsense.
 */
export function readPoints(given: Record<string, unknown> | null | undefined): PointsRules {
  const out = { ...DEFAULT_POINTS };
  if (!given) return out;
  for (const key of Object.keys(DEFAULT_POINTS) as (keyof PointsRules)[]) {
    const v = given[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v;
  }
  return out;
}

export type EarnRule = { title: string; body: string };
export type EarnSection = { heading: string; rules: EarnRule[] };

/** The sheet's two blocks: paid markets, then free ones. */
export function earnSections(p: PointsRules): EarnSection[] {
  const sameBonus = p.paidHoldBonus === p.majorityHoldBonus;
  return [
    {
      heading: '💰 Paid markets · main event',
      rules: [
        {
          title: sameBonus ? `+${p.paidHoldBonus} just for playing.` : `+${p.paidHoldBonus} (Yes/No) or +${p.majorityHoldBonus} (majority) just for playing.`,
          body: `Hold at least $${p.paidHoldMinStake} on a Yes/No market when it closes, or make one $${p.majorityHoldMinStake} majority pick. Win or lose, once per market.`,
        },
        { title: `+${p.paidProfitMultiplier} per $1 of profit.`, body: 'The more you win, the more you earn.' },
        {
          title: `Profit points cap at ${p.paidProfitCap} on Yes/No and ${p.majorityProfitCap} on majority.`,
          body: `So a market is worth at most ${p.paidCap} or ${p.majorityCap} points. It rewards being right, not staking big.`,
        },
      ],
    },
    {
      heading: '🎮 Free markets · warm up',
      rules: [
        { title: 'Start with play tokens.', body: 'No real money, just predict and trade.' },
        { title: `Earn ${p.freeMultiplier} points per token of profit.`, body: 'Turn a profit and part of it converts to points.' },
        { title: `Capped at ${p.freeCap} points per market.`, body: 'Free play is the on-ramp; paid markets are where it adds up.' },
      ],
    },
  ];
}

/** The line about chat, or null while chat pays nothing: the website hides it at 0 too. */
export function chatRule(p: PointsRules): string | null {
  if (p.chatPoints <= 0 || p.chatDailyCap <= 0) return null;
  return `Chat earns ${p.chatPoints} ${p.chatPoints === 1 ? 'point' : 'points'} a message, for your first ${p.chatDailyCap} messages each day.`;
}
