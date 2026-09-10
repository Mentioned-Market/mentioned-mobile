// Shared YES/NO trade sheet for paid (USDC) and free (play tokens) markets.
// Side pair, amount with pad and presets, and a quote block led by the headline
// number the website leads with. The parent computes the quote.
//
// Everything here is sized to fit one screen alongside the sheet's header and
// its pinned action, because a buy screen you have to scroll to buy from is a
// buy screen that hides its own purpose. The action itself is NOT rendered
// here: it belongs in the sheet's footer, outside the scrolling body.
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cents } from '@/lib/format';
import { NumberPad } from '@/ui/number-pad';
import { colors, fonts, spacing, type } from '@/ui/theme';

export type SheetWord = {
  key: string;
  label: string;
  yesPrice: number;
  noPrice: number;
  outcome: boolean | null;
};
export type Side = 'YES' | 'NO';
export type TradeMode = 'buy' | 'sell';
export type QuoteLine = { label: string; value: string; strong?: boolean };
export type Preset = { label: string; value: string };

type Props = {
  word: SheetWord;
  mode: TradeMode;
  onMode: (m: TradeMode) => void;
  canSell: boolean;
  side: Side;
  onSide: (s: Side) => void;
  amount: string;
  onAmount: (v: string) => void;
  /** Shown before or after the amount: "$" prefixes, anything else suffixes. */
  unit: string;
  maxDecimals: number;
  presets: Preset[];
  /** Big number at the top of the quote block. */
  headline: { label: string; value: string };
  lines: QuoteLine[];
  balanceLine?: string;
  /** Held shares per side for the selected word, shown in Sell mode. */
  holdings?: { yes: string; no: string } | null;
  warning?: string | null;
  /** When false the sheet shows prices only: no pad, no quote. */
  open?: boolean;
};

export function TradeSheet(p: Props) {
  const word = p.word;
  const tap = () => Haptics.selectionAsync();
  return (
    <View style={styles.wrap}>
      {word ? (
        <>
          {p.canSell && p.open !== false ? (
            <View style={styles.segment}>
              {(['buy', 'sell'] as const).map((m) => {
                const active = p.mode === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      tap();
                      p.onMode(m);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.segmentItem, active && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentLabel, active && { color: colors.text }]}>{m === 'buy' ? 'Buy' : 'Sell'}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.sides}>
            {(['YES', 'NO'] as const).map((s) => {
              const active = p.side === s;
              const price = s === 'YES' ? word.yesPrice : word.noPrice;
              const tone = s === 'YES' ? colors.yes : colors.no;
              const held = p.holdings ? (s === 'YES' ? p.holdings.yes : p.holdings.no) : null;
              return (
                <Pressable
                  key={s}
                  onPress={() => {
                    tap();
                    p.onSide(s);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.side,
                    active && {
                      borderColor: tone,
                      backgroundColor: `${tone}1F`,
                    },
                  ]}
                >
                  <Text style={[styles.sideLabel, { color: tone }]}>{s}</Text>
                  <Text style={styles.sidePrice}>{cents(price)}</Text>
                  {held !== null && p.mode === 'sell' ? <Text style={styles.sideHeld}>hold {held}</Text> : null}
                </Pressable>
              );
            })}
          </View>

          {p.open === false ? null : (
            <>
              <View style={styles.amountBlock}>
                <View style={styles.amountRow}>
                  {p.unit === '$' ? <Text style={styles.amountUnit}>$</Text> : null}
                  <Text style={[styles.amount, !p.amount && { color: colors.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
                    {p.amount || '0'}
                  </Text>
                  {p.unit !== '$' ? <Text style={styles.amountUnit}>{p.unit}</Text> : null}
                </View>
                {p.balanceLine ? <Text style={[type.muted, { textAlign: 'center' }]}>{p.balanceLine}</Text> : null}
                <View style={styles.presets}>
                  {p.presets.map((pr) => (
                    <Pressable
                      key={pr.label}
                      onPress={() => {
                        tap();
                        p.onAmount(pr.value);
                      }}
                      style={styles.preset}
                      accessibilityRole="button"
                    >
                      <Text style={styles.presetLabel}>{pr.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <NumberPad value={p.amount} onChange={p.onAmount} maxDecimals={p.maxDecimals} />

              <View style={styles.quote}>
                <View style={styles.headline}>
                  <Text style={type.muted}>{p.headline.label}</Text>
                  <Text style={styles.headlineValue} numberOfLines={1} adjustsFontSizeToFit>
                    {p.headline.value}
                  </Text>
                </View>
                {p.lines.map((q) => (
                  <View key={q.label} style={styles.quoteRow}>
                    <Text style={type.muted}>{q.label}</Text>
                    <Text style={[type.money, { fontSize: 14 }, q.strong && { color: colors.gold }]}>{q.value}</Text>
                  </View>
                ))}
                {p.warning ? <Text style={[type.muted, { color: colors.no, marginTop: spacing.xs }]}>{p.warning}</Text> : null}
              </View>
            </>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 220,
  },
  chipLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text,
    flexShrink: 1,
  },
  chipPrice: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentItem: {
    flex: 1,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: colors.surfaceRaised },
  segmentLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.textMuted,
  },
  sides: { flexDirection: 'row', gap: spacing.sm },
  side: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
  },
  sideLabel: { fontFamily: fonts.bold, fontSize: 15, letterSpacing: 0.5 },
  sidePrice: { ...type.money, fontSize: 19 },
  sideHeld: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  amountBlock: { gap: 6 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
    minHeight: 46,
  },
  amount: {
    fontFamily: fonts.bold,
    fontSize: 38,
    lineHeight: 46,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    maxWidth: '80%',
  },
  amountUnit: {
    fontFamily: fonts.semibold,
    fontSize: 22,
    color: colors.textMuted,
  },
  presets: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  preset: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 60,
    alignItems: 'center',
  },
  presetLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  quote: {
    padding: spacing.sm + 4,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: 2,
  },
  headlineValue: {
    fontFamily: fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
