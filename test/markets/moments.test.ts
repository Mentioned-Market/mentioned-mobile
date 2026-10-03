// Wins get their moment once, never on a first launch, and a week's standing
// is only compared within the same week.
import type { Leaderboard, LeaderboardEntry } from '@/api/user';
import { CELEBRATED_KEEP, pendingWins, rememberWins, standingChange, standingOf, winKeys } from '@/markets/moments';
import type { MarketGroup } from '@/markets/positions';

const group = (key: string, over: Partial<MarketGroup> = {}): MarketGroup => ({
  key,
  kind: 'paid-majority',
  cover: null,
  href: `/result/majority/${key}`,
  title: key,
  finished: true,
  won: true,
  rows: [],
  count: '1 position',
  value: '$2.00 to claim',
  ...over,
});

describe('pendingWins', () => {
  it('has nothing pending the first time a wallet is seen', () => {
    expect(pendingWins([group('pm:1'), group('pm:2')], undefined)).toEqual([]);
  });

  it('is every win not yet celebrated', () => {
    expect(pendingWins([group('pm:1'), group('pm:2')], ['pm:1']).map((g) => g.key)).toEqual(['pm:2']);
  });

  it('never includes a loss or a market still open', () => {
    expect(pendingWins([group('pm:lost', { won: false }), group('pm:open', { finished: false, won: null })], [])).toEqual([]);
  });
});

describe('rememberWins', () => {
  it('seeds a new wallet with its existing wins, so none are replayed', () => {
    const finished = [group('pm:1'), group('pm:2'), group('pm:3', { won: false })];
    const remembered = rememberWins(finished, undefined, winKeys(finished));
    expect(remembered).toEqual(['pm:1', 'pm:2']);
    expect(pendingWins(finished, remembered)).toEqual([]);
  });

  it('marks one win at a time, leaving the others pending', () => {
    const finished = [group('pm:1'), group('pm:2')];
    const after = rememberWins(finished, [], ['pm:1']);
    expect(pendingWins(finished, after).map((g) => g.key)).toEqual(['pm:2']);
  });

  it('keeps every listed win however many there are, and trims only unlisted keys', () => {
    const listed = Array.from({ length: CELEBRATED_KEEP + 10 }, (_, i) => group(`pm:${i}`));
    const old = Array.from({ length: CELEBRATED_KEEP + 5 }, (_, i) => `pm:old${i}`);
    const remembered = rememberWins(listed, [...listed.map((g) => g.key), ...old], []);
    for (const g of listed) expect(remembered).toContain(g.key);
    expect(remembered).toHaveLength(listed.length + CELEBRATED_KEEP);
  });
});

const entry = (wallet: string, weeklyPoints: number): LeaderboardEntry => ({ wallet, username: null, pfpEmoji: null, weeklyPoints, allTimePoints: weeklyPoints, breakdown: {} });
const board = (data: LeaderboardEntry[], userEntry: LeaderboardEntry | null = null): Leaderboard => ({ data, userEntry, weekStart: '2026-09-21', weekEnd: null, week: 'current' });

describe('standingOf', () => {
  it('ranks a wallet by its place on the list', () => {
    expect(standingOf(board([entry('a', 90), entry('me', 50)]), 'me')).toEqual({ week: '2026-09-21', points: 50, rank: 2 });
  });

  it('has points but no rank for a wallet outside the list', () => {
    expect(standingOf(board([entry('a', 90)], entry('me', 5)), 'me')).toEqual({ week: '2026-09-21', points: 5, rank: null });
  });

  it('is null for a wallet with no points this week', () => {
    expect(standingOf(board([entry('a', 90)]), 'me')).toBeNull();
  });
});

describe('standingChange', () => {
  const week = '2026-09-21';

  it('reports points gained and places climbed', () => {
    expect(standingChange({ week, points: 40, rank: 12 }, { week, points: 150, rank: 8 })).toEqual({ points: 110, places: 4 });
  });

  it('reports places dropped as negative', () => {
    expect(standingChange({ week, points: 40, rank: 3 }, { week, points: 40, rank: 5 })).toEqual({ points: 0, places: -2 });
  });

  it('says nothing when nothing moved, on a first look, or across a new week', () => {
    expect(standingChange({ week, points: 40, rank: 3 }, { week, points: 40, rank: 3 })).toBeNull();
    expect(standingChange(undefined, { week, points: 40, rank: 3 })).toBeNull();
    expect(standingChange({ week: '2026-09-14', points: 400, rank: 1 }, { week, points: 10, rank: 30 })).toBeNull();
  });

  it('does not report a points correction as a change', () => {
    expect(standingChange({ week, points: 100, rank: null }, { week, points: 90, rank: null })).toBeNull();
  });
});
