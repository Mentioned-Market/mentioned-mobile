// The chart's rules, matched to the website's chart. What matters most is that
// every word is on the chart, that lines reach the present, and that the line
// drawn and the value read under a finger are the same thing.
import { colorForIndex, easeSteps, EASE_STEPS, hexToRgba, layoutLabels, LABEL_H, prepareSeries, valueAt, yDomain } from '@/lib/chart';

describe('prepareSeries', () => {
  const now = 10_000;

  it('gives an untraded word a line at the opening price', () => {
    const [s] = prepareSeries([{ key: 'a', label: 'A', history: [] }], { initial: 0.5, now, live: false });
    expect(s.points).toEqual([{ t: now - 3600, p: 0.5 }]);
  });

  it('starts every line at the earliest point, at the opening price', () => {
    const out = prepareSeries(
      [
        { key: 'a', label: 'A', history: [{ t: 100, p: 0.6 }] },
        { key: 'b', label: 'B', history: [{ t: 500, p: 0.3 }] },
      ],
      { initial: 0.5, now, live: false },
    );
    expect(out[0].points[0]).toEqual({ t: 100, p: 0.6 });
    expect(out[1].points).toEqual([
      { t: 100, p: 0.5 },
      { t: 500, p: 0.3 },
    ]);
  });

  it('ends a live market at the current price now', () => {
    const [s] = prepareSeries([{ key: 'a', label: 'A', history: [{ t: 100, p: 0.6 }] }], { initial: 0.5, now, current: { a: 0.7 }, live: true });
    expect(s.points[s.points.length - 1]).toEqual({ t: now, p: 0.7 });
  });

  it('does not extend a finished market', () => {
    const [s] = prepareSeries([{ key: 'a', label: 'A', history: [{ t: 100, p: 0.6 }] }], { initial: 0.5, now, current: { a: 0.7 }, live: false });
    expect(s.points).toEqual([{ t: 100, p: 0.6 }]);
  });

  it('sorts, and keeps the latest price at a repeated time', () => {
    const [s] = prepareSeries(
      [
        {
          key: 'a',
          label: 'A',
          history: [
            { t: 200, p: 0.4 },
            { t: 100, p: 0.6 },
            { t: 200, p: 0.45 },
          ],
        },
      ],
      { initial: 0.5, now, live: false },
    );
    expect(s.points).toEqual([
      { t: 100, p: 0.6 },
      { t: 200, p: 0.45 },
    ]);
  });
});

describe('easeSteps', () => {
  it('holds a price flat and eases into the next just before it', () => {
    const out = easeSteps(
      [
        { t: 0, p: 0.2 },
        { t: 100, p: 0.8 },
      ],
      16,
    );
    expect(out[0]).toEqual({ t: 0, p: 0.2 });
    expect(out).toHaveLength(2 + EASE_STEPS);
    // The ease starts where the old price was, at the old price.
    expect(out[1]).toEqual({ t: 84, p: 0.2 });
    expect(out[out.length - 1]).toEqual({ t: 100, p: 0.8 });
    // Strictly moving forward in time, and never past either price.
    for (let i = 1; i < out.length; i++) expect(out[i].t).toBeGreaterThan(out[i - 1].t);
    for (const pt of out) expect(pt.p >= 0.2 && pt.p <= 0.8).toBe(true);
  });

  it('never eases over more than half the gap', () => {
    const out = easeSteps(
      [
        { t: 0, p: 0.2 },
        { t: 10, p: 0.8 },
      ],
      1000,
    );
    expect(out[1].t).toBe(5);
  });

  it('adds nothing when the price did not move', () => {
    const pts = [
      { t: 0, p: 0.5 },
      { t: 100, p: 0.5 },
    ];
    expect(easeSteps(pts, 16)).toEqual(pts);
  });
});

describe('valueAt', () => {
  const pts = [
    { t: 0, p: 0.2 },
    { t: 100, p: 0.6 },
  ];

  it('interpolates along the drawn segment', () => {
    expect(valueAt(pts, 50)).toBeCloseTo(0.4);
  });

  it('reads the exact point', () => {
    expect(valueAt(pts, 100)).toBe(0.6);
  });

  it('holds the last price after the line ends', () => {
    expect(valueAt(pts, 500)).toBe(0.6);
  });

  it('is empty before the line starts', () => {
    expect(valueAt(pts, -1)).toBeNull();
  });
});

describe('yDomain', () => {
  it('pads the lines by fifteen points', () => {
    const [lo, hi] = yDomain([
      {
        key: 'a',
        label: 'A',
        points: [
          { t: 0, p: 0.4 },
          { t: 1, p: 0.6 },
        ],
      },
    ]);
    expect(lo).toBeCloseTo(0.25);
    expect(hi).toBeCloseTo(0.75);
  });

  it('stays inside 0..1', () => {
    expect(
      yDomain([
        {
          key: 'a',
          label: 'A',
          points: [
            { t: 0, p: 0.05 },
            { t: 1, p: 0.95 },
          ],
        },
      ]),
    ).toEqual([0, 1]);
  });

  it('opens a flat line out rather than drawing it on a zero-height range', () => {
    const [lo, hi] = yDomain([{ key: 'a', label: 'A', points: [{ t: 0, p: 0.5 }] }]);
    expect(hi).toBeGreaterThan(lo);
  });
});

describe('layoutLabels', () => {
  it('leaves labels that do not overlap where they are', () => {
    expect(layoutLabels([50, 150], 280).labelYs).toEqual([50, 150]);
  });

  it('pushes overlapping labels apart', () => {
    const { labelYs } = layoutLabels([100, 101], 280);
    expect(labelYs[1] - labelYs[0]).toBeGreaterThanOrEqual(LABEL_H);
  });

  it('keeps every label inside the pane', () => {
    const { labelYs, labelH } = layoutLabels([0, 1, 2, 279], 280);
    for (const y of labelYs) {
      expect(y).toBeGreaterThanOrEqual(labelH / 2);
      expect(y).toBeLessThanOrEqual(280 - labelH / 2);
    }
  });

  it('shrinks labels when there are too many to stack at full size', () => {
    expect(layoutLabels(new Array(20).fill(100), 280).labelH).toBeLessThan(LABEL_H);
  });
});

describe('colours', () => {
  it('uses the website palette first', () => {
    expect(colorForIndex(0)).toBe('#34D399');
  });

  it('still makes a valid colour past the palette', () => {
    expect(colorForIndex(15)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('makes a translucent version', () => {
    expect(hexToRgba('#34D399', 0.28)).toBe('rgba(52,211,153,0.28)');
  });
});
