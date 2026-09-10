// The status a market screen shows is derived, not served: a market is open
// until its lock passes, then pending until it resolves.
import { statusFromLock } from '@/ui/market-header';

const NOW = Date.parse('2026-09-10T12:00:00Z');

describe('statusFromLock', () => {
  it('is open before the lock', () => {
    expect(statusFromLock(NOW + 60_000, null, NOW)).toBe('open');
  });

  it('is pending after the lock but before resolution', () => {
    expect(statusFromLock(NOW - 60_000, null, NOW)).toBe('pending');
  });

  it('lets a resolved market override the clock', () => {
    expect(statusFromLock(NOW + 60_000, 'resolved', NOW)).toBe('resolved');
  });

  it('lets a cancelled market override the clock', () => {
    expect(statusFromLock(NOW + 60_000, 'cancelled', NOW)).toBe('cancelled');
  });

  it('treats a market with no lock as open', () => {
    expect(statusFromLock(null, null, NOW)).toBe('open');
  });
});
