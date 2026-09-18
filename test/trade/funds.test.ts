import { fundsShortfall } from '@/trade/funds';

describe('fundsShortfall', () => {
  it('names USDC for the app and program wordings', () => {
    expect(fundsShortfall('Not enough USDC. These picks cost $3.00 and you have $2.00.')).toBe('USDC');
    expect(fundsShortfall('Not enough USDC.')).toBe('USDC');
    expect(fundsShortfall('Add $3 more to cover this trade')).toBe('USDC');
    expect(fundsShortfall('Not enough in the wallet to cover the amount and the network fee.')).toBe('USDC');
  });
  it('names SOL for fee shortfalls', () => {
    expect(fundsShortfall('You need about 0.004 SOL for network fees. Add SOL to your wallet to trade.')).toBe('SOL');
    expect(fundsShortfall('Not enough SOL for network fees.')).toBe('SOL');
  });
  it('is null for anything else', () => {
    expect(fundsShortfall('Market locked 2 min ago')).toBeNull();
    expect(fundsShortfall(null)).toBeNull();
    expect(fundsShortfall('Enter an amount.')).toBeNull();
  });
});
