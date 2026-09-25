// Multi-word price chart on react-native-svg, drawn the way the website's
// chart is (components/EventPriceChart.tsx): every word's line visible, held
// flat between trades and eased into each new price, a padded range, a
// gradient under the line when only one is showing, and a finger dragged
// across it reading every line at once. The rules are in src/lib/chart.ts;
// this only draws.
//
// Values are shown through `format`, so a paid (AMM) market can show what a
// Yes pays and a free market its chance, from the same prices.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { colorForIndex, EASE_FRACTION, easeSteps, hexToRgba, layoutLabels, valueAt, yDomain, type PriceSeries } from '@/lib/chart';
import { colors, fonts, spacing } from '@/ui/theme';

type Props = {
  /** Prepared by `prepareSeries`: every line starts together and a live one ends now. */
  series: PriceSeries[];
  /** Drawn thicker, e.g. the word whose trade sheet is open. */
  selectedKey?: string | null;
  /** A price (0..1) as text, for the scrub labels and the legend. */
  format: (p: number) => string;
  height?: number;
};

const PAD = { l: 4, r: 4, t: 12, b: 12 };
/** Past this far from the right edge, scrub labels sit left of the finger. */
const LABEL_MAX_W = 150;
const GRID_LINES = 4;

export function LineChart({ series, selectedKey = null, format, height = 240 }: Props) {
  const [width, setWidth] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [scrubX, setScrubX] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const drawable = series.filter((s) => s.points.length > 0);
  if (drawable.length === 0 || drawable.every((s) => s.points.length < 2)) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Not enough trades for a chart yet</Text>
      </View>
    );
  }

  const colorOf = new Map(series.map((s, i) => [s.key, colorForIndex(i)]));
  const visible = drawable.filter((s) => !hidden.has(s.key));
  const times = drawable.flatMap((s) => s.points.map((p) => p.t));
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const easeSecs = (maxT - minT) * EASE_FRACTION;
  const lines = visible.map((s) => ({ ...s, drawn: easeSteps(s.points, easeSecs) }));
  const [lo, hi] = yDomain(visible);

  const w = Math.max(0, width - PAD.l - PAD.r);
  const h = height - PAD.t - PAD.b;
  const sx = (t: number) => PAD.l + (maxT === minT ? w : ((t - minT) / (maxT - minT)) * w);
  const sy = (p: number) => PAD.t + (1 - (p - lo) / (hi - lo)) * h;
  const tAt = (x: number) => minT + ((Math.min(Math.max(x, PAD.l), PAD.l + w) - PAD.l) / (w || 1)) * (maxT - minT);

  const path = (pts: { t: number; p: number }[]) => pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${sx(p.t).toFixed(1)} ${sy(p.p).toFixed(1)}`).join(' ');
  const single = lines.length === 1 ? lines[0] : null;

  // The finger's reading: each visible line's value where it is, dots on the
  // lines and labels pushed apart so none overlap.
  const scrub =
    scrubX === null || width === 0
      ? null
      : (() => {
          const t = tAt(scrubX);
          const x = sx(t);
          const hits = lines
            .map((l) => ({ key: l.key, label: l.label, color: colorOf.get(l.key) ?? colors.gold, value: valueAt(l.drawn, t) }))
            .filter((r): r is typeof r & { value: number } => r.value !== null)
            .map((r) => ({ ...r, y: sy(r.value) }))
            .sort((a, b) => a.y - b.y);
          const { labelYs, labelH } = layoutLabels(
            hits.map((r) => r.y),
            height,
          );
          return { x, hits, labelYs, labelH, left: x > width - LABEL_MAX_W };
        })();

  const onTouch = (e: GestureResponderEvent) => setScrubX(e.nativeEvent.locationX);

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      // At least one line always stays on.
      else if (drawable.length - next.size > 1) next.add(key);
      return next;
    });

  return (
    <View>
      <View
        onLayout={onLayout}
        style={{ height }}
        // Once a finger is on the chart it keeps the touch, so a sideways drag
        // reads prices instead of scrolling the page.
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
        onResponderRelease={() => setScrubX(null)}
        onResponderTerminate={() => setScrubX(null)}
        accessibilityLabel={`Price chart. ${visible.map((s) => `${s.label} ${format(s.points[s.points.length - 1].p)}`).join(', ')}`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {single ? (
              <Defs>
                <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={hexToRgba(colorOf.get(single.key) ?? colors.gold, 0.28)} />
                  <Stop offset="1" stopColor={hexToRgba(colorOf.get(single.key) ?? colors.gold, 0)} />
                </LinearGradient>
              </Defs>
            ) : null}
            {Array.from({ length: GRID_LINES }, (_, i) => PAD.t + (h * (i + 0.5)) / GRID_LINES).map((y) => (
              <Line key={y} x1={PAD.l} x2={width - PAD.r} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="2 4" />
            ))}
            {single ? (
              <Path
                d={`${path(single.drawn)} L${sx(single.drawn[single.drawn.length - 1].t).toFixed(1)} ${PAD.t + h} L${sx(single.drawn[0].t).toFixed(1)} ${PAD.t + h} Z`}
                fill="url(#area)"
              />
            ) : null}
            {lines.map((l) => (
              <Path
                key={l.key}
                d={path(l.drawn)}
                stroke={colorOf.get(l.key)}
                strokeWidth={l.key === selectedKey ? 3 : 2}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {scrub ? (
              <>
                <Line x1={scrub.x} x2={scrub.x} y1={0} y2={height} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
                {scrub.hits.map((r) => (
                  <Circle key={r.key} cx={scrub.x} cy={r.y} r={5} fill={r.color} stroke="#000" strokeWidth={2} />
                ))}
              </>
            ) : null}
          </Svg>
        ) : null}
        {scrub
          ? scrub.hits.map((r, i) => (
              <View
                key={r.key}
                pointerEvents="none"
                style={[
                  styles.label,
                  { top: scrub.labelYs[i] - scrub.labelH / 2, height: scrub.labelH, backgroundColor: r.color },
                  scrub.left ? { right: width - scrub.x + 10 } : { left: scrub.x + 10 },
                ]}
              >
                <Text style={[styles.labelText, scrub.labelH < 20 && { fontSize: 10 }]} numberOfLines={1}>
                  {r.label} {format(r.value)}
                </Text>
              </View>
            ))
          : null}
      </View>

      <View style={styles.legend}>
        {drawable.map((s) => {
          const off = hidden.has(s.key);
          return (
            <Pressable
              key={s.key}
              onPress={() => toggle(s.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: !off }}
              accessibilityLabel={`${off ? 'Show' : 'Hide'} ${s.label}`}
              hitSlop={4}
              style={[styles.legendItem, off && { opacity: 0.4 }]}
            >
              <View style={[styles.swatch, { backgroundColor: colorOf.get(s.key) }]} />
              <Text style={styles.legendLabel} numberOfLines={1}>
                {s.label}
              </Text>
              <Text style={styles.legendValue}>{format(s.points[s.points.length - 1].p)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.surface },
  emptyText: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted },
  label: { position: 'absolute', maxWidth: LABEL_MAX_W, borderRadius: 6, paddingHorizontal: 6, justifyContent: 'center' },
  labelText: { fontFamily: fonts.semibold, fontSize: 12, color: '#000', fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.sm, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.text, maxWidth: 140 },
  legendValue: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'] },
});
