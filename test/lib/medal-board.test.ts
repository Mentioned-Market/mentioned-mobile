// The medal list has to say the right thing in every state a medal can be in,
// and has to keep saying something sensible about a medal or a state this
// build has never seen: the web changes both mid-season.
import { MedalBoard, type MedalResult } from '@/api/arena';
import { ARENAS } from '@/arena/arenas';
import type { Season } from '@/arena/seasons';
import { medalTable, medalViews, winningsLabel, standingDetail, standingLine } from '@/lib/medal-board';

import fixture from '../fixtures/teams-bounties.json';

const season: Season = ARENAS.find((a) => a.slug === 'worlds-fair') as Season;
const board = MedalBoard.parse(fixture);

const team = (id: number, name: string) => ({ id, name, slug: name.toLowerCase() });
const result = (over: Partial<MedalResult> = {}): MedalResult => ({ id: 'longshot', state: 'live', holders: [], contenders: [], opensAt: null, note: null, ...over });
const only = (r: MedalResult) => medalViews(season, { ...board, bounties: [r] }).find((v) => v.medal.id === r.id);

describe('medalViews against the live board', () => {
  const views = medalViews(season, board);

  it('keeps the season order and gives every medal a status', () => {
    expect(views.map((v) => v.medal.id)).toEqual(season.bounty?.bounties.map((b) => b.id));
    for (const v of views) expect(v.status).toBeTruthy();
  });

  it('matches every medal on the board to one the season defines', () => {
    const defined = season.bounty?.bounties.map((b) => b.id) ?? [];
    expect(board.bounties.map((b) => b.id).sort()).toEqual([...defined].sort());
  });

  it('names a single holder and what they did', () => {
    const tour = views.find((v) => v.medal.id === 'trigger_happy');
    expect(tour?.status).toBe('Held by The Sovereign Order · 16 markets');
    expect(tour?.held).toBe(true);
    expect(tour?.contendersLabel).toBe('Next in line');
  });

  it('counts the teams on a tie rather than naming one of them', () => {
    const prix = views.find((v) => v.medal.id === 'big_game_hunter');
    expect(prix?.heldLabel).toBe('Shared by 2 teams');
    expect(prix?.status).toBe('Shared by 2 teams · +$14.90');
  });

  it('says when a medal opens later in the season', () => {
    expect(views.find((v) => v.medal.id === 'last_stand')?.status).toBe('Opens Oct 9');
  });

  it('carries the server note on an unclaimed medal', () => {
    const marksman = views.find((v) => v.medal.id === 'sharpshooter');
    expect(marksman?.status).toBe('Unclaimed');
    expect(marksman?.held).toBe(false);
    expect(marksman?.note).toBe('Teams need calls in 5+ resolved markets');
  });
});

describe('medal states', () => {
  it('awards a medal once the season is final', () => {
    const v = only(result({ state: 'final', holders: [{ team: team(1, 'Boss'), display: '4%', detail: '@a', context: 'A market' }] }));
    expect(v?.heldLabel).toBe('Awarded to');
    expect(v?.status).toBe('Awarded to Boss · 4%');
  });

  it('says a final medal nobody earned was not awarded', () => {
    expect(only(result({ state: 'final' }))?.status).toBe('Not awarded');
  });

  it('gives the opening day before kickoff, and a plain line for a waiting medal with no date', () => {
    expect(only(result({ state: 'upcoming' }))?.status).toBe('Opens Sep 28');
    expect(only(result({ state: 'waiting', opensAt: null }))?.status).toBe('Not open yet');
  });

  it('reads a state it has never heard of as an open medal, not a crash', () => {
    expect(only(result({ state: 'paused-for-review' }))?.status).toBe('Unclaimed');
  });

  it('labels the chasers by whether anyone is ahead of them', () => {
    const chasers = [{ team: team(2, 'Two'), display: '3 calls' }];
    expect(only(result({ contenders: chasers }))?.contendersLabel).toBe('Closest');
    expect(only(result({ holders: [{ team: team(1, 'One'), display: '5 calls' }], contenders: chasers }))?.contendersLabel).toBe('Next in line');
  });

  it('never repeats the web saying bettors in a note', () => {
    expect(only(result({ note: 'Fewer than half the bettors were betting this side' }))?.note).not.toMatch(/\bbet/i);
  });
});

describe('medalViews without standings', () => {
  it('shows the medals alone while the board is loading or missing', () => {
    for (const none of [undefined, null]) {
      const views = medalViews(season, none);
      expect(views).toHaveLength(season.bounty?.bounties.length ?? 0);
      for (const v of views) expect(v.status).toBeNull();
    }
  });

  it('ignores a board that belongs to another season', () => {
    for (const v of medalViews(season, { ...board, arena: 'world-cup' })) expect(v.status).toBeNull();
  });

  it('leaves a medal the board does not mention without a status, and skips one the season does not define', () => {
    const views = medalViews(season, { ...board, bounties: [result({ id: 'not-in-this-season', holders: [{ team: team(1, 'One'), display: '1' }] })] });
    expect(views.every((v) => v.status === null)).toBe(true);
  });

  it('is empty for a season with no medals', () => {
    const plain = ARENAS.find((a) => !a.bounty) as Season;
    expect(medalViews(plain, board)).toEqual([]);
  });
});

describe('standing lines', () => {
  it('puts the team beside what it did, and the member beside the market', () => {
    const s = { team: team(1, 'Boss'), display: '+$14.90', detail: '@moneybelly', context: 'The Micron call' };
    expect(standingLine(s)).toBe('Boss · +$14.90');
    expect(standingDetail(s)).toBe('@moneybelly · The Micron call');
    expect(standingDetail({ ...s, context: null })).toBe('@moneybelly');
    expect(standingDetail({ team: s.team, display: '1' })).toBeNull();
  });
});

describe('medalTable', () => {
  const held = (id: string, ...teams: ReturnType<typeof team>[]) => result({ id, holders: teams.map((t) => ({ team: t, display: '1' })) });
  const table = (...results: MedalResult[]) => medalTable(medalViews(season, { ...board, bounties: results }));
  const amount = (id: string) => Number(season.bounty?.bounties.find((b) => b.id === id)?.amount.replace('$', ''));
  const a = team(1, 'Alpha');
  const b = team(2, 'Bravo');
  const c = team(3, 'Charlie');

  it('adds up the purses a team holds and puts the richest first', () => {
    const rows = table(held('trigger_happy', a), held('longshot', a), held('big_game_hunter', b));
    expect(rows.map((r) => r.team.name)).toEqual(['Alpha', 'Bravo']);
    expect(rows[0].winnings).toBe(amount('trigger_happy') + amount('longshot'));
    expect(rows[0].medals.map((m) => m.id)).toEqual(['trigger_happy', 'longshot']);
  });

  it('splits a shared medal between the teams on it', () => {
    const rows = table(held('trigger_happy', a, b));
    expect(rows.map((r) => r.winnings)).toEqual([amount('trigger_happy') / 2, amount('trigger_happy') / 2]);
  });

  it('ranks by money over count: one rich medal beats two halves of poorer ones', () => {
    const rows = table(held('trigger_happy', a), held('hot_streak', b, c), held('wanted', b, c));
    expect(rows[0].team.name).toBe('Alpha');
    expect(rows[1].medals).toHaveLength(2);
  });

  it('breaks equal money by more medals, then by name, so the order holds still between polls', () => {
    expect(table(held('big_game_hunter', b), held('sharpshooter', a)).map((r) => r.team.name)).toEqual(['Alpha', 'Bravo']);
    expect(table(held('sharpshooter', c, a)).map((r) => r.team.name)).toEqual(['Alpha', 'Charlie']);
  });

  it('leaves out teams that are only chasing, and is empty with no standings', () => {
    const rows = table(result({ id: 'longshot', holders: [{ team: a, display: '4%' }], contenders: [{ team: b, display: '6%' }] }));
    expect(rows.map((r) => r.team.name)).toEqual(['Alpha']);
    expect(medalTable(medalViews(season, null))).toEqual([]);
  });

  it('counts a team once on a medal even if the board lists it twice', () => {
    const rows = table(held('trigger_happy', a, a));
    expect(rows).toHaveLength(1);
    expect(rows[0].medals).toHaveLength(1);
  });

  it('accounts for every held purse on the live board', () => {
    const views = medalViews(season, board);
    const total = medalTable(views).reduce((sum, r) => sum + r.winnings, 0);
    const heldPurses = views.filter((v) => v.held).reduce((sum, v) => sum + Number(v.medal.amount.replace('$', '')), 0);
    expect(total).toBeCloseTo(heldPurses, 6);
    expect(medalTable(views)[0].winnings).toBeGreaterThanOrEqual(medalTable(views)[1].winnings);
  });
});

describe('winningsLabel', () => {
  it('shows whole dollars without cents at any size, and cents only for a split that leaves some', () => {
    expect(winningsLabel(55)).toBe('$55');
    expect(winningsLabel(115)).toBe('$115');
    expect(winningsLabel(27.5)).toBe('$27.50');
    expect(winningsLabel(105.5)).toBe('$105.50');
  });
});
