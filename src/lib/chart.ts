// The rules behind the price chart, kept out of the component so they can be
// tested. They mirror the website's chart (components/EventPriceChart.tsx, as
// restyled in September 2026), which draws with lightweight-charts, a browser
// library. The app draws the same thing with react-native-svg
// (src/ui/line-chart.tsx), so this is a port of the behaviour, not the file.
//
// Times are in seconds and prices are 0..1 throughout.

export type PricePoint = { t: number; p: number };
export type PriceSeries = { key: string; label: string; points: PricePoint[] };

/** Price changes ease in over this share of the chart's span. */
export const EASE_FRACTION = 0.02;
/** Straight segments drawing each eased change. */
export const EASE_STEPS = 8;
/** Headroom above and below the lines, as a price (15 percentage points). */
export const Y_PADDING = 0.15;

const COLORS = ['#34D399', '#F87171', '#60A5FA', '#FBBF24', '#A78BFA', '#FB923C', '#2DD4BF', '#F472B6', '#818CF8', '#4ADE80'];

/** The website's palette, then hues spread by the golden angle for more words. */
export function colorForIndex(idx: number): string {
  if (idx < COLORS.length) return COLORS[idx];
  const h = (idx * 137.508) % 360;
  const s = 0.7;
  const l = 0.65;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Every word's line, ready to draw.
 *
 * - A word with no trades yet still gets a line, at the opening price from an
 *   hour ago, so every word is on the chart from the start.
 * - Every line starts at the chart's earliest point at the opening price, so
 *   hiding one line never moves where the others begin.
 * - A live market's lines end at the current price now, so the chart reaches
 *   the present instead of stopping at the last trade.
 * - Points are sorted and a repeated time keeps its latest price.
 */
export function prepareSeries(
  input: { key: string; label: string; history: PricePoint[] }[],
  opts: { initial: number; now: number; current?: Record<string, number>; live: boolean },
): PriceSeries[] {
  const seeded = input.map((s) => ({ ...s, history: s.history.length > 0 ? s.history : [{ t: opts.now - 3600, p: opts.initial }] }));
  const start = Math.min(...seeded.flatMap((s) => s.history.map((h) => h.t)));
  return seeded.map((s) => {
    const points = [...s.history];
    if (!points.some((h) => h.t <= start)) points.unshift({ t: start, p: opts.initial });
    const current = opts.current?.[s.key];
    if (opts.live && current !== undefined) points.push({ t: Math.max(opts.now, ...points.map((h) => h.t)), p: current });
    points.sort((a, b) => a.t - b.t);
    const deduped: PricePoint[] = [];
    for (const pt of points) {
      if (deduped.length > 0 && deduped[deduped.length - 1].t === pt.t) deduped[deduped.length - 1] = pt;
      else deduped.push(pt);
    }
    return { key: s.key, label: s.label, points: deduped };
  });
}

/**
 * Prices only move on trades, so a line holds flat until just before the next
 * trade and eases into the new price along a smoothstep, drawn as short
 * straight segments. Never more than half the gap to the previous trade.
 */
export function easeSteps(points: PricePoint[], easeSecs: number): PricePoint[] {
  const out: PricePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const prev = points[i - 1];
    if (prev && cur.p !== prev.p) {
      const w = Math.floor(Math.min(easeSecs, (cur.t - prev.t) / 2));
      const steps = Math.min(EASE_STEPS, w);
      for (let k = 0; k < steps; k++) {
        const f = k / steps;
        const ease = f * f * (3 - 2 * f);
        out.push({ t: cur.t - w + Math.round((w * k) / steps), p: prev.p + (cur.p - prev.p) * ease });
      }
    }
    out.push(cur);
  }
  return out;
}

/** The price a line shows at time `t`, interpolated as it is drawn. Null before it starts. */
export function valueAt(points: PricePoint[], t: number): number | null {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found === -1) return null;
  const a = points[found];
  const b = points[found + 1];
  if (!b || a.t === t) return a.p;
  return a.p + (b.p - a.p) * ((t - a.t) / (b.t - a.t));
}

/** The price range to draw: the lines' own range with headroom, inside 0..1. */
export function yDomain(series: PriceSeries[]): [number, number] {
  const all = series.flatMap((s) => s.points.map((pt) => pt.p));
  if (all.length === 0) return [0, 1];
  const lo = Math.max(0, Math.min(...all) - Y_PADDING);
  const hi = Math.min(1, Math.max(...all) + Y_PADDING);
  return hi > lo ? [lo, hi] : [Math.max(0, lo - 0.05), Math.min(1, hi + 0.05)];
}

export const LABEL_H = 22;
export const LABEL_MIN_H = 15;
export const LABEL_GAP = 3;

/**
 * Push scrub labels apart so none overlap, each as close to its line as it can
 * be and all inside the pane. `ys` must be sorted ascending. Returns where
 * each label's centre goes, and the label height used: smaller when there are
 * too many lines to stack at full size.
 */
export function layoutLabels(ys: number[], paneHeight: number): { labelYs: number[]; labelH: number } {
  const fit = ys.length > 1 ? (paneHeight - LABEL_H) / (ys.length - 1) : Infinity;
  const step = Math.max(LABEL_MIN_H + 1, Math.min(LABEL_H + LABEL_GAP, fit));
  const labelH = Math.min(LABEL_H, step - 1);
  const min = labelH / 2;
  const max = paneHeight - labelH / 2;
  const out = [...ys];
  for (let i = 0; i < out.length; i++) {
    const prev = i > 0 ? out[i - 1] + step : min;
    out[i] = Math.max(ys[i], prev);
  }
  for (let i = out.length - 1; i >= 0; i--) {
    const next = i < out.length - 1 ? out[i + 1] - step : max;
    out[i] = Math.min(out[i], next);
  }
  return { labelYs: out, labelH };
}
