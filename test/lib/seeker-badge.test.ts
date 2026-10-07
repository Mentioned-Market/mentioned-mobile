// What the app remembers about who owns a Seeker, for the mark beside a name.
import { BADGE_BATCH_MAX, BADGE_RECHECK_MS, needsBadgeCheck, recordBadgeFailure, recordBadges, takeBadgeBatch } from '@/lib/seeker-badge';

const NOW = 1_791_000_000_000;

describe('needsBadgeCheck', () => {
  it('asks about a wallet it has never seen', () => {
    expect(needsBadgeCheck({}, 'a', NOW)).toBe(true);
  });

  it('never asks again about a verified one', () => {
    const memory = recordBadges({}, ['a'], ['a'], NOW);
    expect(needsBadgeCheck(memory, 'a', NOW + 100 * BADGE_RECHECK_MS)).toBe(false);
  });

  it('asks again about a "no" only after the wait, since a Seeker can be linked at any time', () => {
    const memory = recordBadges({}, ['a'], [], NOW);
    expect(needsBadgeCheck(memory, 'a', NOW + BADGE_RECHECK_MS - 1)).toBe(false);
    expect(needsBadgeCheck(memory, 'a', NOW + BADGE_RECHECK_MS)).toBe(true);
  });
});

describe('takeBadgeBatch', () => {
  it('asks about each wallet once', () => {
    expect(takeBadgeBatch(['a', 'b', 'a', 'c', 'b'])).toEqual({ batch: ['a', 'b', 'c'], rest: [] });
  });

  it('leaves what is over the route\'s limit for the next request', () => {
    const many = Array.from({ length: BADGE_BATCH_MAX + 3 }, (_, i) => `w${i}`);
    const { batch, rest } = takeBadgeBatch(many);
    expect(batch).toHaveLength(BADGE_BATCH_MAX);
    expect(rest).toEqual(['w200', 'w201', 'w202']);
  });
});

describe('recordBadges', () => {
  it('knows every wallet it asked about, yes or no', () => {
    const memory = recordBadges({}, ['a', 'b'], ['b'], NOW);
    expect(memory.a).toEqual({ verified: false, at: NOW });
    expect(memory.b).toEqual({ verified: true, at: NOW });
  });

  it('ignores a wallet in the answer that was not asked about', () => {
    expect(recordBadges({}, ['a'], ['a', 'stranger'], NOW).stranger).toBeUndefined();
  });

  it('never takes a mark away', () => {
    const yes = recordBadges({}, ['a'], ['a'], NOW);
    expect(recordBadges(yes, ['a'], [], NOW + 1).a.verified).toBe(true);
    expect(recordBadgeFailure(yes, ['a'], NOW + 1).a.verified).toBe(true);
  });
});

describe('recordBadgeFailure', () => {
  it('shows no mark, and asks again in a minute, not on the next render', () => {
    const memory = recordBadgeFailure({}, ['a'], NOW);
    expect(memory.a.verified).toBe(false);
    expect(needsBadgeCheck(memory, 'a', NOW + 1000)).toBe(false);
    expect(needsBadgeCheck(memory, 'a', NOW + 60_000)).toBe(true);
  });
});
