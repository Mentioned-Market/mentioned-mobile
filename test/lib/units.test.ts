// Exact amount conversion. The failure this prevents is dust: a float round
// trip that sells 975,522 of 975,523 base units and leaves one behind.
import { fromBaseUnits, fromBaseUnitsFloor2, toBaseUnits } from '@/lib/units';

describe('toBaseUnits', () => {
  it.each([
    ['1', 1_000_000n],
    ['12.5', 12_500_000n],
    ['0.975523', 975_523n],
    ['.5', 500_000n],
    ['3.', 3_000_000n],
    ['', 0n],
    ['abc', 0n],
  ])('parses %p', (text, expected) => {
    expect(toBaseUnits(text)).toBe(expected);
  });

  it('truncates past six decimals instead of rounding up', () => {
    expect(toBaseUnits('0.9999999')).toBe(999_999n);
  });

  it('is exact where floating point is not', () => {
    // The float route loses a unit on both of these: 1.005 becomes 1,004,999
    // and 1.000001 becomes 1,000,000.
    expect(BigInt(Math.floor(Number('1.005') * 1e6))).toBe(1_004_999n);
    expect(toBaseUnits('1.005')).toBe(1_005_000n);
    expect(BigInt(Math.floor(Number('1.000001') * 1e6))).toBe(1_000_000n);
    expect(toBaseUnits('1.000001')).toBe(1_000_001n);
  });
});

describe('fromBaseUnits', () => {
  it.each([
    [975_523n, '0.975523'],
    [1_000_000n, '1'],
    [1_500_000n, '1.5'],
    [0n, '0'],
    [300_000_000n, '300'],
  ])('formats %p', (units, expected) => {
    expect(fromBaseUnits(units)).toBe(expected);
  });

  it('round trips exactly', () => {
    for (const units of [1n, 975_523n, 123_456_789n]) expect(toBaseUnits(fromBaseUnits(units))).toBe(units);
  });
});

describe('fromBaseUnitsFloor2', () => {
  it('rounds down to the cent, never up', () => {
    expect(fromBaseUnitsFloor2(975_523n)).toBe('0.97');
    expect(fromBaseUnitsFloor2(1_999_999n)).toBe('1.99');
  });
});
