// The "How to earn points" sheet quotes the server's numbers. These pin that it
// does, that a bad config cannot make it quote nonsense, and that the wording
// stays the app's.
import { MobileConfig } from '@/api/mobileConfig';
import { DEFAULT_POINTS, chatRule, earnSections, readPoints } from '@/lib/points-rules';

const text = (p = DEFAULT_POINTS) =>
  earnSections(p)
    .flatMap((s) => [s.heading, ...s.rules.flatMap((r) => [r.title, r.body])])
    .join(' ');

describe('readPoints', () => {
  it('is the bundled numbers with no config, no block or an empty one', () => {
    expect(readPoints(undefined)).toEqual(DEFAULT_POINTS);
    expect(readPoints(null)).toEqual(DEFAULT_POINTS);
    expect(readPoints({})).toEqual(DEFAULT_POINTS);
  });

  it('takes the server number for each key it knows and keeps the rest', () => {
    const p = readPoints({ paidProfitMultiplier: 175, freeCap: 60, somethingNew: 9 });
    expect(p.paidProfitMultiplier).toBe(175);
    expect(p.freeCap).toBe(60);
    expect(p.paidHoldBonus).toBe(DEFAULT_POINTS.paidHoldBonus);
    expect('somethingNew' in p).toBe(false);
  });

  it('accepts zero, which is how the web retires a reward', () => {
    expect(readPoints({ chatPoints: 0 }).chatPoints).toBe(0);
  });

  it('keeps the default over anything that is not a usable number', () => {
    const p = readPoints({ paidHoldBonus: '100', paidCap: NaN, majorityCap: -5, freeMultiplier: null, chatDailyCap: Infinity });
    expect(p).toEqual(DEFAULT_POINTS);
  });
});

describe('the config parse', () => {
  it('reads the points block the route sends', () => {
    const config = MobileConfig.parse({ minVersion: '1.0.0', points: { paidHoldBonus: 120 } });
    expect(readPoints(config.points).paidHoldBonus).toBe(120);
  });

  it('survives a points block of the wrong shape, because the kill switch rides in the same response', () => {
    const config = MobileConfig.parse({ killSwitch: true, points: 'soon' });
    expect(config.killSwitch).toBe(true);
    expect(readPoints(config.points)).toEqual(DEFAULT_POINTS);
  });
});

describe('earnSections', () => {
  it('quotes the numbers it is given', () => {
    const t = text(readPoints({ paidHoldBonus: 120, majorityHoldBonus: 120, paidProfitMultiplier: 175, paidProfitCap: 250, paidCap: 370, majorityProfitCap: 90, majorityCap: 210, freeMultiplier: 0.25, freeCap: 60 }));
    expect(t).toContain('+120 just for playing.');
    expect(t).toContain('+175 per $1 of profit.');
    expect(t).toContain('Profit points cap at 250 on Yes/No and 90 on majority.');
    expect(t).toContain('at most 370 or 210 points');
    expect(t).toContain('Earn 0.25 points per token of profit.');
    expect(t).toContain('Capped at 60 points per market.');
  });

  it('names both bonuses when the two paid market types pay differently', () => {
    expect(text(readPoints({ paidHoldBonus: 100, majorityHoldBonus: 150 }))).toContain('+100 (Yes/No) or +150 (majority) just for playing.');
  });

  it('never says bet, and uses no em dash', () => {
    expect(text()).not.toMatch(/\bbet(s|ting)?\b/i);
    expect(text()).not.toMatch(/—/);
  });
});

describe('chatRule', () => {
  it('states the rate and the daily cap', () => {
    expect(chatRule(DEFAULT_POINTS)).toBe('Chat earns 1 point a message, for your first 5 messages each day.');
    expect(chatRule(readPoints({ chatPoints: 2, chatDailyCap: 10 }))).toBe('Chat earns 2 points a message, for your first 10 messages each day.');
  });

  it('is absent while chat pays nothing', () => {
    expect(chatRule(readPoints({ chatPoints: 0 }))).toBeNull();
    expect(chatRule(readPoints({ chatDailyCap: 0 }))).toBeNull();
  });
});
