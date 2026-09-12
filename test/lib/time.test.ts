// Lock times arrive as unix seconds from the paid routes and as ISO strings
// from the free ones. Everything downstream assumes milliseconds.
import { ago, closesIn, countdown, eventDate, toMs } from '@/lib/time';

const NOW = Date.parse('2026-09-10T12:00:00Z');

describe('toMs', () => {
  it('reads unix seconds as a string', () => {
    expect(toMs('1788890400')).toBe(1788890400000);
  });

  it('reads unix seconds as a number', () => {
    expect(toMs(1788890400)).toBe(1788890400000);
  });

  it('passes milliseconds through', () => {
    expect(toMs(1788890400000)).toBe(1788890400000);
  });

  it('reads an ISO string', () => {
    expect(toMs('2026-09-10T12:00:00.000Z')).toBe(NOW);
  });

  it('returns null for nothing', () => {
    expect(toMs(null)).toBeNull();
    expect(toMs(undefined)).toBeNull();
    expect(toMs('')).toBeNull();
    expect(toMs('not a date')).toBeNull();
  });
});

describe('closesIn', () => {
  it('counts days and hours out', () => {
    expect(closesIn(NOW + 2 * 86_400_000 + 4 * 3_600_000, NOW)).toBe('Closes 2d 4h');
  });

  it('counts hours and minutes inside a day', () => {
    expect(closesIn(NOW + 3 * 3_600_000 + 12 * 60_000, NOW)).toBe('Closes 3h 12m');
  });

  it('counts minutes in the last hour', () => {
    expect(closesIn(NOW + 8 * 60_000, NOW)).toBe('Closes 8m');
  });

  it('never says zero minutes', () => {
    expect(closesIn(NOW + 5_000, NOW)).toBe('Closes 1m');
  });

  it('goes quiet once the lock has passed', () => {
    expect(closesIn(NOW - 1, NOW)).toBeNull();
    expect(closesIn(null, NOW)).toBeNull();
  });
});

describe('countdown', () => {
  it('shows the two largest units', () => {
    expect(countdown(NOW + 2 * 86_400_000 + 4 * 3_600_000, NOW)).toBe('2d 4h');
    expect(countdown(NOW + 3 * 3_600_000 + 12 * 60_000, NOW)).toBe('3h 12m');
    expect(countdown(NOW + 8 * 60_000 + 30_000, NOW)).toBe('8m 30s');
    expect(countdown(NOW + 5_000, NOW)).toBe('5s');
  });

  it('bottoms out at zero rather than going negative', () => {
    expect(countdown(NOW - 100_000, NOW)).toBe('0s');
  });

  it('is empty with no target', () => {
    expect(countdown(null, NOW)).toBe('');
  });
});

describe('eventDate', () => {
  it('formats a timestamp', () => {
    expect(eventDate(NOW)).toContain('Sep');
  });

  it('is null with no timestamp', () => {
    expect(eventDate(null)).toBeNull();
  });
});

describe('ago', () => {
  const now = Date.parse('2026-09-12T12:00:00Z');
  const at = (iso: string) => ago(Date.parse(iso), now);

  it('calls the last minute just now', () => {
    expect(at('2026-09-12T11:59:40Z')).toBe('just now');
  });

  it('counts minutes, then hours, then days', () => {
    expect(at('2026-09-12T11:30:00Z')).toBe('30m');
    expect(at('2026-09-12T09:00:00Z')).toBe('3h');
    expect(at('2026-09-10T12:00:00Z')).toBe('2d');
  });

  it('gives a date once a week has passed', () => {
    // Past a week the gap stops being the useful part; the day itself is.
    expect(at('2026-08-30T12:00:00Z')).toMatch(/Aug/);
  });

  it('never counts into the future', () => {
    expect(at('2026-09-12T12:05:00Z')).toBe('just now');
  });

  it('says nothing for a missing time', () => {
    expect(ago(null, now)).toBe('');
  });
});
