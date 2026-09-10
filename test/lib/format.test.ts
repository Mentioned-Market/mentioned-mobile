// Money and number formatting. Every one of these appears on screen next to a
// real balance, so the rounding rules are worth pinning.
import { cents, compact, pct, shares, shortAddress, tokens, usd, usdc } from '@/lib/format';

describe('usdc', () => {
  it('reads base units as dollars', () => {
    expect(usdc(1_000_000n)).toBe('$1.00');
    expect(usdc('12000000')).toBe('$12.00');
    expect(usdc(0)).toBe('$0.00');
  });

  it('drops the cents above a hundred dollars', () => {
    expect(usdc(101_363_116n)).toBe('$101');
  });

  it('honours an explicit decimal count', () => {
    expect(usdc(1_234_567n, { dp: 4 })).toBe('$1.2346');
  });
});

describe('usd', () => {
  it('keeps cents on small amounts and drops them on large', () => {
    expect(usd(1.5)).toBe('$1.50');
    expect(usd(0)).toBe('$0.00');
    expect(usd(1234.56)).toBe('$1,235');
  });

  it('marks a negative amount', () => {
    expect(usd(-2.5)).toBe('$-2.50');
  });
});

describe('pct and cents', () => {
  it('renders a probability as a percentage', () => {
    expect(pct(0.4601)).toBe('46%');
    expect(pct(0.4601, 1)).toBe('46.0%');
    expect(pct(1)).toBe('100%');
  });

  it('renders a probability as a cent price', () => {
    expect(cents(0.46)).toBe('46c');
    expect(cents(0.005)).toBe('1c');
    expect(cents(1)).toBe('100c');
  });
});

describe('tokens and compact', () => {
  it('renders play tokens as whole numbers', () => {
    expect(tokens(150)).toBe('150');
    expect(tokens(1650.4)).toBe('1,650');
  });

  it('abbreviates large counts', () => {
    expect(compact(999)).toBe('999');
    expect(compact(1500)).toBe('1.5k');
    expect(compact(15_000)).toBe('15k');
    expect(compact(2_400_000)).toBe('2.4m');
  });
});

describe('shares', () => {
  it('reads six-decimal base units', () => {
    expect(shares(2_000_000n)).toBe('2');
    expect(shares('1998348')).toBe('2');
    expect(shares(500_000n)).toBe('0.5');
  });

  it('drops decimals on large holdings', () => {
    expect(shares(2_075_819_000n)).toBe('2,076');
  });
});

describe('shortAddress', () => {
  it('elides the middle of a base58 address', () => {
    expect(shortAddress('49GT1N8mRLp4Q9JYJDRR3YopGtfHFGTrwg6cmbm3u2fY')).toBe('49GT…u2fY');
  });

  it('leaves short strings alone', () => {
    expect(shortAddress('abc')).toBe('abc');
  });
});
