// Turning a website path from a notification into an app route. The rule that
// matters: anything unrecognised opens nothing, because opening the wrong
// market is worse than opening none.
import { notificationTarget } from '@/notifications/link';

describe('notificationTarget', () => {
  it('maps a paid YES/NO market', () => {
    expect(notificationTarget('/market/1789117404157')).toEqual({ kind: 'route', href: '/paid/1789117404157' });
  });

  it('maps a paid majority market', () => {
    expect(notificationTarget('/paidmajority/1789117562931')).toEqual({ kind: 'route', href: '/majority/1789117562931' });
  });

  it('holds a free market back for slug resolution', () => {
    expect(notificationTarget('/free/vikings-packers')).toEqual({ kind: 'free-slug', slug: 'vikings-packers' });
  });

  it('takes a free market that is already an id straight to the screen', () => {
    expect(notificationTarget('/free/12')).toEqual({ kind: 'route', href: '/free/12' });
  });

  it('maps a public profile', () => {
    expect(notificationTarget('/u/taylor_seeker')).toEqual({ kind: 'route', href: '/u/taylor_seeker' });
  });

  it('accepts our own absolute links', () => {
    expect(notificationTarget('https://www.mentioned.market/market/123')).toEqual({ kind: 'route', href: '/paid/123' });
  });

  it('refuses a link to anywhere else', () => {
    expect(notificationTarget('https://evil.example/market/123')).toBeNull();
  });

  it('ignores a query string and a trailing slash', () => {
    expect(notificationTarget('/market/123/?ref=abc')).toEqual({ kind: 'route', href: '/paid/123' });
  });

  it('opens nothing for a path it does not know', () => {
    expect(notificationTarget('/leaderboard')).toBeNull();
    expect(notificationTarget('/market/not-a-number')).toBeNull();
    expect(notificationTarget(null)).toBeNull();
    expect(notificationTarget('')).toBeNull();
  });
});
