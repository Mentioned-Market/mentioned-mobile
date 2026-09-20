import { medalSeed, medalTier, sealPath } from '@/lib/medal';

describe('medalTier', () => {
  it('matches the website: gold from $65, silver from $50, bronze below', () => {
    expect(medalTier('$80')).toBe('gold');
    expect(medalTier('$70')).toBe('gold');
    expect(medalTier('$65')).toBe('gold');
    expect(medalTier('$60')).toBe('silver');
    expect(medalTier('$50')).toBe('silver');
    expect(medalTier('$45')).toBe('bronze');
  });

  it('reads an amount however it is punctuated', () => {
    expect(medalTier('$1,200')).toBe('gold');
    expect(medalTier('nonsense')).toBe('bronze');
  });
});

describe('sealPath', () => {
  it('draws a closed path in the 100 box', () => {
    const d = sealPath(1.2);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.split('Q')).toHaveLength(29);
  });

  it('is stable for a seed and different between seeds', () => {
    expect(sealPath(1.2)).toBe(sealPath(1.2));
    expect(sealPath(1.2)).not.toBe(sealPath(3.4));
  });
});

describe('medalSeed', () => {
  it('is stable per medal and spreads across medals', () => {
    expect(medalSeed('quick_draw')).toBe(medalSeed('quick_draw'));
    expect(medalSeed('quick_draw')).not.toBe(medalSeed('big_game_hunter'));
  });
});
