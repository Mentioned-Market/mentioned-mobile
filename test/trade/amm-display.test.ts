// A paid YES/NO market shows multipliers and dollars only. The figures that
// matter most are the ones that are promises about money: the payout, which
// must be net of the rake, and the fee, which must never read as a bug.
import { buyPreview, feeLine, payoutFor, payoutText, sellPreview, sellShares, sideQuote } from '@/trade/amm-display';

const NONE = { feeBps: 0, rakeBps: 0 };

describe('sideQuote', () => {
  it('is what $1 pays: 1 / price', () => {
    expect(sideQuote(0.5, 'YES', NONE)).toBe('2x');
    expect(sideQuote(0.25, 'YES', NONE)).toBe('4x');
  });

  it('prices NO off the other side', () => {
    expect(sideQuote(0.75, 'NO', NONE)).toBe('4x');
  });

  it('is net of the fee and the rake, so it only ever goes down', () => {
    expect(sideQuote(0.5, 'YES', { feeBps: 100, rakeBps: 0 })).toBe('1.98x');
    expect(sideQuote(0.5, 'YES', { feeBps: 0, rakeBps: 500 })).toBe('1.90x');
  });

  it('shows nothing for a resolved word, which shows its outcome instead', () => {
    expect(sideQuote(0.5, 'YES', NONE, true)).toBe('');
    expect(sideQuote(0.5, 'NO', NONE, false)).toBe('');
  });
});

describe('payoutFor', () => {
  it('pays a dollar a share with no rake', () => {
    expect(payoutFor(2_500_000n, 0)).toBe(2_500_000n);
  });

  it('takes the rake off, floored the way redeem does', () => {
    expect(payoutFor(1_000_000n, 1)).toBe(999_900n);
    expect(payoutFor(1_000_000n, 500)).toBe(950_000n);
  });

  it('is zero for nothing held', () => {
    expect(payoutFor(0n, 500)).toBe(0n);
  });
});

describe('feeLine', () => {
  it('says there is no fee rather than "$0.00"', () => {
    expect(feeLine(0n, NONE)).toBe('No trading fee');
  });

  it('names the fee and its rate', () => {
    expect(feeLine(5_000n, { feeBps: 50, rakeBps: 0 })).toBe('Fee $0.01 (0.5%)');
  });

  it('adds the rake on winnings when the market has one', () => {
    expect(feeLine(0n, { feeBps: 0, rakeBps: 1 })).toBe('No trading fee · 0.01% on winnings');
    expect(feeLine(5_000n, { feeBps: 50, rakeBps: 250 })).toBe('Fee $0.01 (0.5%) · 2.5% on winnings');
  });
});

describe('buyPreview', () => {
  it('quotes the payout and the multiplier for this stake', () => {
    // $1 buys 1.38 shares: pays $1.38, so 1.38x.
    const p = buyPreview(1_380_000n, 1_000_000n, 0n, NONE);
    expect(p.payout).toBe(1_380_000n);
    expect(p.multiplier).toBe('1.38x');
    expect(p.fee).toBe('No trading fee');
  });

  it('counts the fee in what was paid', () => {
    expect(buyPreview(2_000_000n, 1_000_000n, 10_000n, { feeBps: 100, rakeBps: 0 }).multiplier).toBe('1.98x');
  });

  it('nets the rake out of the payout, unlike the web preview', () => {
    const p = buyPreview(2_000_000n, 1_000_000n, 0n, { feeBps: 0, rakeBps: 500 });
    expect(p.payout).toBe(1_900_000n);
    expect(p.multiplier).toBe('1.90x');
  });

  it('shows no multiplier for nothing bought', () => {
    expect(buyPreview(0n, 0n, 0n, NONE).multiplier).toBe('');
  });
});

describe('sellShares', () => {
  it('sells a percent of the position', () => {
    expect(sellShares(8_000_000n, '25')).toBe(2_000_000n);
  });

  it('sells everything at 100, and caps anything above it', () => {
    expect(sellShares(1_234_567n, '100')).toBe(1_234_567n);
    expect(sellShares(1_234_567n, '150')).toBe(1_234_567n);
  });

  it('snaps to the whole position rather than leave unsellable dust', () => {
    expect(sellShares(500_000n, '99')).toBe(500_000n);
  });

  it('sells nothing for an empty or bad input', () => {
    expect(sellShares(1_000_000n, '')).toBe(0n);
    expect(sellShares(1_000_000n, 'x')).toBe(0n);
    expect(sellShares(0n, '50')).toBe(0n);
  });
});

describe('sellPreview', () => {
  it('says what comes back now and what stays riding', () => {
    const p = sellPreview(4_000_000n, 1_000_000n, 600_000n, 0n, NONE);
    expect(p.receive).toBe(600_000n);
    expect(p.keeps).toBe(3_000_000n);
  });

  it('keeps nothing riding after selling it all', () => {
    expect(sellPreview(4_000_000n, 4_000_000n, 2_400_000n, 0n, NONE).keeps).toBe(0n);
  });

  it('nets the rake out of what stays riding', () => {
    expect(sellPreview(2_000_000n, 1_000_000n, 500_000n, 0n, { feeBps: 0, rakeBps: 500 }).keeps).toBe(950_000n);
  });
});

describe('payoutText', () => {
  it('rounds down to the cent, never up', () => {
    expect(payoutText(2_175_000n)).toBe('$2.17');
    expect(payoutText(2_179_999n)).toBe('$2.17');
  });

  it('shows whole cents as they are', () => {
    expect(payoutText(2_180_000n)).toBe('$2.18');
  });

  it('shows nothing as $0.00', () => {
    expect(payoutText(0n)).toBe('$0.00');
  });
});
