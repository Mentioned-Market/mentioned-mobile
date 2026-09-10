// Display status decides the pill on every free market card and screen.
import { getDisplayStatus, getDisplayStatusLabel, isMarketOpen, isValidStatusTransition } from '@/free/marketUtils';

const future = new Date(Date.now() + 3_600_000).toISOString();
const past = new Date(Date.now() - 3_600_000).toISOString();

describe('getDisplayStatus', () => {
  it('is open before the lock passes', () => {
    expect(getDisplayStatus({ status: 'open', lock_time: future })).toBe('open');
  });

  it('is pending once the lock passes', () => {
    expect(getDisplayStatus({ status: 'open', lock_time: past })).toBe('pending_resolution');
  });

  it('treats a locked market as pending', () => {
    expect(getDisplayStatus({ status: 'locked', lock_time: future })).toBe('pending_resolution');
  });

  it('keeps resolved terminal even before the lock', () => {
    // Continuous markets can resolve early; they must not read as "closed".
    expect(getDisplayStatus({ status: 'resolved', lock_time: future })).toBe('resolved');
  });

  it('surfaces cancelled', () => {
    expect(getDisplayStatus({ status: 'cancelled', lock_time: past })).toBe('cancelled');
  });

  it('falls back to the event start for majority markets with no lock', () => {
    expect(getDisplayStatus({ status: 'open', lock_time: null, market_type: 'majority', event_start_time: past })).toBe('pending_resolution');
    expect(getDisplayStatus({ status: 'open', lock_time: null, market_type: 'majority', event_start_time: future })).toBe('open');
    // No close set at all stays open rather than reading as pending.
    expect(getDisplayStatus({ status: 'open', lock_time: null, market_type: 'majority', event_start_time: null })).toBe('open');
  });

  it('treats a non-majority market with no lock as pending', () => {
    expect(getDisplayStatus({ status: 'open', lock_time: null })).toBe('pending_resolution');
  });
});

describe('labels and transitions', () => {
  it('labels every display status', () => {
    expect(getDisplayStatusLabel('pending_resolution')).toBe('Pending Resolution');
    expect(getDisplayStatusLabel('open')).toBe('Open');
    expect(getDisplayStatusLabel('cancelled')).toBe('Cancelled');
  });

  it('allows only the real lifecycle moves', () => {
    expect(isValidStatusTransition('draft', 'open')).toBe(true);
    expect(isValidStatusTransition('open', 'locked')).toBe(true);
    expect(isValidStatusTransition('locked', 'resolved')).toBe(true);
    expect(isValidStatusTransition('resolved', 'open')).toBe(false);
    expect(isValidStatusTransition('nonsense', 'open')).toBe(false);
  });

  it('closes a market once its lock passes', () => {
    expect(isMarketOpen({ status: 'open', lock_time: future })).toBe(true);
    expect(isMarketOpen({ status: 'open', lock_time: past })).toBe(false);
    expect(isMarketOpen({ status: 'locked', lock_time: future })).toBe(false);
  });
});
