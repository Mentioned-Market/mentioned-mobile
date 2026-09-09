// Small multi-series line chart on react-native-svg. Y is a probability 0..1.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { colors, fonts, spacing } from '@/ui/theme';

export type ChartSeries = { key: string; label: string; points: { x: number; y: number }[]; highlight?: boolean };

const PALETTE = ['#F2B71F', '#3DDC84', '#5AC8FA', '#BF5AF2', '#FF7A59', '#FF5C5C', '#64D2FF', '#F5F2EA'];

export function LineChart({ series, height = 180, onSelect }: { series: ChartSeries[]; height?: number; onSelect?: (key: string) => void }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const all = series.flatMap((s) => s.points);
  if (all.length < 2) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Not enough trades for a chart yet</Text>
      </View>
    );
  }
  const xs = all.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const padL = 30;
  const padR = 8;
  const padT = 8;
  const padB = 8;
  const w = Math.max(0, width - padL - padR);
  const h = height - padT - padB;
  const sx = (x: number) => padL + (maxX === minX ? w / 2 : ((x - minX) / (maxX - minX)) * w);
  const sy = (y: number) => padT + (1 - Math.min(1, Math.max(0, y))) * h;

  return (
    <View onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <Line key={g} x1={padL} x2={width - padR} y1={sy(g)} y2={sy(g)} stroke={colors.border} strokeWidth={1} />
          ))}
          {[0, 0.5, 1].map((g) => (
            <SvgText key={`l${g}`} x={0} y={sy(g) + 4} fill={colors.textMuted} fontSize={11} fontFamily={fonts.medium}>
              {Math.round(g * 100)}%
            </SvgText>
          ))}
          {series.map((s, i) => {
            if (s.points.length === 0) return null;
            const sorted = [...s.points].sort((a, b) => a.x - b.x);
            const d = sorted.map((p, j) => `${j === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
            const color = PALETTE[i % PALETTE.length];
            const dim = series.some((x) => x.highlight) && !s.highlight;
            return <Path key={s.key} d={d} stroke={color} strokeWidth={s.highlight ? 2.5 : 1.5} fill="none" opacity={dim ? 0.3 : 1} strokeLinejoin="round" strokeLinecap="round" />;
          })}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      <View style={styles.legend}>
        {series.map((s, i) => (
          <Pressable key={s.key} onPress={onSelect ? () => onSelect(s.key) : undefined} disabled={!onSelect} style={[styles.legendItem, s.highlight && styles.legendActive]} accessibilityRole={onSelect ? 'button' : undefined}>
            <View style={[styles.swatch, { backgroundColor: PALETTE[i % PALETTE.length] }]} />
            <Text style={[styles.legendLabel, s.highlight && { color: colors.text }]} numberOfLines={1}>
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyText: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'transparent' },
  legendActive: { backgroundColor: colors.surface, borderColor: colors.border },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, maxWidth: 120 },
});
