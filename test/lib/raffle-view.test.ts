// The raffle explainer states the website's rules, with the pool's real share.
import { raffleRules, raffleShare } from '@/lib/raffle-view';

const split = [
  { kind: 'rank', pct: 0.36, usd: 36.33 },
  { kind: 'raffle', pct: 0.1, usd: 10.09 },
];

describe('raffleShare', () => {
  it('finds the raffle row in the split', () => {
    expect(raffleShare(split)).toEqual({ pct: 0.1, usd: 10.09 });
  });

  it('is null when the split has no raffle', () => {
    expect(raffleShare([{ kind: 'rank', pct: 1, usd: 100 }])).toBeNull();
    expect(raffleShare(undefined)).toBeNull();
  });
});

describe('raffleRules', () => {
  const text = (rules: { text: string }[]) => rules.map((r) => r.text).join(' ');

  it('states the prize from the pool, growing while the week is live', () => {
    expect(text(raffleRules({ pct: 0.1, usd: 10.09 }, true))).toContain("10% of the week's prize pool: $10.09 so far");
    expect(text(raffleRules({ pct: 0.1, usd: 10.09 }, false))).not.toContain('so far');
  });

  it('does not invent a share it was not given', () => {
    expect(text(raffleRules(null, true))).not.toMatch(/\d+%/);
  });

  // Tickets are $1 majority words. The card once said points were tickets.
  it('says tickets come from majority words, not points', () => {
    const all = text(raffleRules(null, true));
    expect(all).toContain('$1 word');
    expect(all).not.toMatch(/point[s]? (earned )?(is|are) a ticket/i);
  });

  it('never uses the word bet', () => {
    expect(text(raffleRules({ pct: 0.1, usd: 1 }, true))).not.toMatch(/\bbet(s|ting)?\b/i);
  });
});
