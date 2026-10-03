// Arena and referral rules: the checks have to agree with the server's, or a
// form accepts what the server then refuses; and the errors have to read as the
// app's, never as a raw server string.
import { ApiError } from '@/api/client';
import { ARENAS, CURRENT_ARENA, type Arena } from '@/arena/arenas';
import {
  avatarError,
  bioError,
  canEnter,
  formatCountdown,
  friendlyTeamError,
  joinCodeError,
  placeLabel,
  readXHandle,
  seasonCountdown,
  statusLabel,
  teamNameError,
  teamSizeCopy,
  leaderboardPool,
  appCopy,
  arenaPrizeLine,
  weeklyPaused,
  weeklyPauseNotice,
} from '@/lib/arena-view';

const season = (over: Partial<Arena> = {}): Arena => ({ ...CURRENT_ARENA, ...over });

describe('the ported season registry', () => {
  it('makes the highest id the current season', () => {
    expect(CURRENT_ARENA.id).toBe(Math.max(...ARENAS.map((a) => a.id)));
  });

  it('gives every season a paid place for each prize and a real window', () => {
    for (const a of ARENAS) {
      expect(a.prizes.map((p) => p.place)).toEqual(a.prizes.map((_, i) => i + 1));
      expect(a.end.getTime()).toBeGreaterThan(a.start.getTime());
    }
  });
});

describe('countdown', () => {
  it('uses days once there is more than one left', () => {
    expect(formatCountdown(((3 * 24 + 4) * 60 + 12) * 60_000 + 9_000)).toBe('3d 04h 12m 09s');
  });

  it('uses a clock under a day, and zeros once passed', () => {
    expect(formatCountdown((4 * 60 + 12) * 60_000 + 9_000)).toBe('04:12:09');
    expect(formatCountdown(-5)).toBe('00:00:00');
  });

  it('counts to the start, then the end, then stops', () => {
    const a = season({ start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-10-15T00:00:00Z') });
    expect(seasonCountdown(a, Date.parse('2026-09-30T00:00:00Z'))?.label).toBe('Starts in');
    expect(seasonCountdown(a, Date.parse('2026-10-05T00:00:00Z'))?.label).toBe('Ends in');
    expect(seasonCountdown(a, Date.parse('2026-10-15T00:00:00Z'))).toBeNull();
  });
});

describe('appCopy', () => {
  it('rewrites the web\'s wagering words for the app', () => {
    expect(appCopy('Biggest win betting against ZeroXirem.')).toBe('Biggest win predicting against ZeroXirem.');
    expect(appCopy("fewer than half of that word's bettors")).toBe("fewer than half of that word's players");
    expect(appCopy('Alphabet stays')).toBe('Alphabet stays');
  });
});

describe('leaderboardPool', () => {
  it('is the whole pool for a season without medals', () => {
    expect(leaderboardPool({ prizePool: '$1,000' } as never)).toBe('$1,000');
  });
  it('is the leaderboard share when medals take part of the pool', () => {
    expect(leaderboardPool({ prizePool: '$1,500', bounty: { leaderboardPool: '$1,000' } } as never)).toBe('$1,000');
  });
});

describe('labels', () => {
  it('names each status the way the website does', () => {
    expect(statusLabel('active', true)).toBe('Live');
    expect(statusLabel('upcoming', true)).toBe('Starting soon');
    expect(statusLabel('ended', false)).toBe('Final standings');
  });

  it('gets ordinals right past the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(placeLabel)).toEqual([
      '1st place', '2nd place', '3rd place', '4th place', '11th place', '12th place', '13th place', '21st place', '22nd place', '23rd place',
    ]);
  });

  it('describes a two-player season as partners', () => {
    expect(teamSizeCopy(season({ maxMembers: 2 }))).toMatch(/1 or 2 players/);
    expect(teamSizeCopy(season({ maxMembers: 3 }))).toMatch(/1 to 3 members/);
  });
});

describe('entering', () => {
  const current = season({ id: 9, start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-10-15T00:00:00Z') });

  it('is open in the current season until it ends, including before kickoff', () => {
    expect(canEnter(current, current, new Date('2026-09-20T00:00:00Z'))).toBe(true);
    expect(canEnter(current, current, new Date('2026-10-10T00:00:00Z'))).toBe(true);
    expect(canEnter(current, current, new Date('2026-10-15T00:00:00Z'))).toBe(false);
  });

  it('is never open in a past season', () => {
    expect(canEnter(season({ id: 1 }), current, new Date('2026-10-10T00:00:00Z'))).toBe(false);
  });
});

describe('input checks match the server', () => {
  it('takes team names of 2 to 30 characters once trimmed', () => {
    expect(teamNameError(' a ')).not.toBeNull();
    expect(teamNameError('ab')).toBeNull();
    expect(teamNameError('x'.repeat(30))).toBeNull();
    expect(teamNameError('x'.repeat(31))).not.toBeNull();
  });

  it('takes six letters or digits as a join code, in any case', () => {
    expect(joinCodeError('abc123')).toBeNull();
    expect(joinCodeError(' ABC123 ')).toBeNull();
    expect(joinCodeError('ABC12')).not.toBeNull();
    expect(joinCodeError('ABC-12')).not.toBeNull();
  });

  it('caps a bio at 300 characters', () => {
    expect(bioError('x'.repeat(300))).toBeNull();
    expect(bioError('x'.repeat(301))).not.toBeNull();
  });

  it('reads an X handle from a handle, an @ or a profile link', () => {
    expect(readXHandle('@mentioned')).toEqual({ handle: 'mentioned' });
    expect(readXHandle('https://x.com/mentioned?s=21')).toEqual({ handle: 'mentioned' });
    expect(readXHandle('https://www.twitter.com/mentioned/status/1')).toEqual({ handle: 'mentioned' });
    expect(readXHandle('   ')).toEqual({ handle: null });
    expect(readXHandle('not a handle!')).toHaveProperty('error');
  });

  it('refuses images the server would refuse', () => {
    expect(avatarError(900_000, 'image/jpeg')).toBeNull();
    expect(avatarError(2_000_000, 'image/png')).not.toBeNull();
    expect(avatarError(10_000, 'image/heic')).not.toBeNull();
    // A picker that cannot say the size or type is left for the server to judge.
    expect(avatarError(undefined, undefined)).toBeNull();
  });
});

describe('friendlyTeamError', () => {
  const api = (status: number, message: string) => new ApiError('/api/teams/x', status, message);

  it('rewrites a range without turning its dash into a sentence break', () => {
    const text = friendlyTeamError(api(400, 'Team name must be 2–30 characters'));
    expect(text).toBe('Team names are 2 to 30 characters.');
    expect(text).not.toMatch(/[—–]/);
  });

  it('keeps the team size from a full team', () => {
    expect(friendlyTeamError(api(409, 'This team is full (max 2 members)'))).toBe('That team is full. Teams are 2 at most.');
  });

  it('explains both Discord refusals', () => {
    expect(friendlyTeamError(api(403, 'You must link your Discord account before joining a team'))).toMatch(/Link a Discord account/);
    expect(friendlyTeamError(api(403, 'Your Discord account must be at least 30 days old to join a team'))).toMatch(/30 days old/);
  });

  it('tells a bad code from a malformed one', () => {
    expect(friendlyTeamError(api(404, 'Invalid join code'))).toBe('That code does not match a team.');
    expect(friendlyTeamError(api(400, 'Invalid join code format'))).toBe('A join code is 6 letters or numbers.');
  });

  it('never passes an unknown server string through', () => {
    expect(friendlyTeamError(api(400, 'Something the app has never seen'))).toBe('That did not go through. Try again.');
    expect(friendlyTeamError(new Error('network'))).toMatch(/connection/);
  });
});

describe('the weekly pause', () => {
  const season = ARENAS.find((a) => a.slug === 'worlds-fair') ?? CURRENT_ARENA;
  const during = new Date(season.start.getTime() + 86_400_000);
  const before = new Date(season.start.getTime() - 86_400_000);
  const after = new Date(season.end.getTime() + 86_400_000);
  const server = { arena: season.slug, name: season.name, displayRange: season.displayRange, resumesAt: season.end.toISOString() };

  it('pauses only while the season is live', () => {
    expect(weeklyPaused(season, before)).toBe(false);
    expect(weeklyPaused(season, during)).toBe(true);
    expect(weeklyPaused(season, season.end)).toBe(false);
    expect(weeklyPaused(season, after)).toBe(false);
  });

  it('says nothing about a week that runs as normal', () => {
    expect(weeklyPauseNotice('current', season, null, before)).toBeNull();
    expect(weeklyPauseNotice('current', season, undefined, after)).toBeNull();
    expect(weeklyPauseNotice('last', season, null, during)).toBeNull();
  });

  it('names the season, where the money went and when the week returns', () => {
    const notice = weeklyPauseNotice('current', season, undefined, during);
    expect(notice?.title).toBe(`Weekly leaderboard paused for the ${season.name} Arena`);
    expect(notice?.body).toContain('No weekly payouts and no raffle');
    expect(notice?.body).toContain(arenaPrizeLine(season));
    expect(notice?.body).toContain('whole season');
    // The end is exclusive, so the day it names is the end date itself, in UTC.
    const day = season.end.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
    expect(notice?.returns).toBe(`The weekly leaderboard returns on ${day}.`);
  });

  it('needs no server answer for this week, so the notice is there on the first frame', () => {
    expect(weeklyPauseNotice('current', season, undefined, during)).toEqual(weeklyPauseNotice('current', season, server, during));
  });

  it('takes the server at its word for last week', () => {
    expect(weeklyPauseNotice('last', season, server, during)?.title).toContain('paused');
    const past = weeklyPauseNotice('last', season, server, after);
    expect(past?.title).toBe(`The ${season.name} Arena ran in place of this week`);
    expect(past?.returns).toBeNull();
  });

  it('still explains a season this build has never heard of', () => {
    const unknown = { arena: 'not-in-this-build', name: 'Mystery', displayRange: 'Jan 1 – Jan 14, 2027', resumesAt: '2027-01-15T00:00:00.000Z' };
    const notice = weeklyPauseNotice('last', season, unknown, new Date('2027-01-10T00:00:00.000Z'));
    expect(notice?.title).toBe('Weekly leaderboard paused for the Mystery Arena');
    expect(notice?.body).toContain('Jan 1 to Jan 14, 2027');
    expect(notice?.returns).toBe('The weekly leaderboard returns on Friday, Jan 15.');
  });

  it('spells out the dash in a date range and never says bet', () => {
    for (const a of ARENAS) {
      const live = weeklyPauseNotice('current', a, undefined, new Date(a.start.getTime() + 1000));
      const text = `${live?.title} ${live?.body} ${live?.returns}`;
      expect(text).not.toMatch(/[–—]/);
      expect(text).not.toMatch(/\bbet(s|ting)?\b/i);
    }
  });

  it('describes a season with and without a medal board', () => {
    const plain = ARENAS.find((a) => !a.bounty);
    const medals = ARENAS.find((a) => a.bounty);
    if (plain) expect(arenaPrizeLine(plain)).toBe(`${plain.prizePool} across the top ${plain.prizes.length} teams`);
    if (medals?.bounty) expect(arenaPrizeLine(medals)).toBe(`${medals.bounty.leaderboardPool} across the top ${medals.prizes.length} teams and ${medals.bounty.bounties.length} medals worth ${medals.bounty.bountyPool}`);
  });
});
