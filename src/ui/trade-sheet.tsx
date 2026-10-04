// The YES/NO trade sheet, shared by paid (USDC) and free (play token) markets.
//
// Top to bottom: which side, the amount being typed, what it returns, two or
// three small facts, four presets, the pad. The parent computes every figure;
// this file only lays them out. The action itself is NOT rendered here: it is
// the sheet's footer, pinned under the pad, so it never scrolls away.
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/ui/chip';
import { NumberPad } from '@/ui/number-pad';
import { Segmented } from '@/ui/segmented';
import { SidePicker } from '@/ui/side-picker';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

export type SheetWord = {
  key: string;
  label: string;
  yesPrice: number;
  noPrice: number;
  outcome: boolean | null;
};
export type Side = 'YES' | 'NO';
export type TradeMode = 'buy' | 'sell';
export type Preset = { label: string; value: string };
export type SheetChip = { value: string; caption?: string; tone?: 'neutral' | 'yes' | 'no' | 'gold' };

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
  /** The line under the amount: what the trade gives back, e.g. "$3.07" "Potential return". */
  headline: { label: string; value: string };
  /** Small facts beside each other: the chance, the balance, what is held. */
  chips: SheetChip[];
  /** One muted line of the working, e.g. "Avg 62% · Fee $0.02 · Total $2.02". */
  detail?: string | null;
  warning?: string | null;
  /** When false the sheet shows the sides only: no pad, no quote. */
  open?: boolean;
};

export function TradeSheet(p: Props) {
  const verb = p.mode === 'sell' ? 'Sell' : 'Predict';
  // Three groups spread through the sheet's height: which side at the top,
  // the amount and what it returns in the middle, the quick amounts and the
  // pad at the bottom by the swipe control. Packed from the top instead, they
  // left an empty band above the action on a tall screen.
  return (
    <View style={styles.wrap}>
      <View style={styles.group}>
        <SidePicker value={p.side} onChange={p.onSide} verb={verb} />

        {p.open !== false && p.canSell ? (
          <Segmented
            size="sm"
            stretch={false}
            style={{ alignSelf: 'center' }}
            options={[
              { key: 'buy', label: 'Buy' },
              { key: 'sell', label: 'Sell' },
            ]}
            value={p.mode}
            onChange={p.onMode}
          />
        ) : null}
      </View>

      {p.open === false ? null : (
        <>
          <View style={[styles.group, styles.middle]}>
            <View style={styles.amountBlock}>
              <View style={styles.amountRow}>
                {p.unit === '$' ? <Text style={styles.amountUnit}>$</Text> : null}
                <Text style={[styles.amount, !p.amount && { color: colors.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
                  {p.amount || '0'}
                </Text>
                {p.unit !== '$' ? <Text style={styles.amountSuffix}>{p.unit}</Text> : null}
              </View>
              <Text style={styles.headline} numberOfLines={1}>
                <Text style={styles.headlineValue}>{p.headline.value}</Text> {p.headline.label}
              </Text>
              {p.detail ? (
                <Text style={styles.detail} numberOfLines={1}>
                  {p.detail}
                </Text>
              ) : null}
            </View>

            {p.chips.length > 0 ? (
              <View style={styles.chips}>
                {p.chips.map((c) => (
                  <Chip key={`${c.value}${c.caption ?? ''}`} value={c.value} caption={c.caption} tone={c.tone} />
                ))}
              </View>
            ) : null}

            {p.warning ? <Text style={styles.warning}>{p.warning}</Text> : null}
          </View>

          <View style={styles.group}>
            <PresetRow presets={p.presets} onPick={p.onAmount} />

            <NumberPad value={p.amount} onChange={p.onAmount} maxDecimals={p.maxDecimals} />
          </View>
        </>
      )}
    </View>
  );
}

/** The top of a full-screen trade sheet: the market's cover, the word, the market. */
export function TradeSheetHeader({ cover, word, market }: { cover: string | null; word: string; market: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.thumb}>
        {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={{ fontSize: 20 }}>🎯</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.muted} numberOfLines={1}>
          {market}
        </Text>
        <Text style={styles.headerWord} numberOfLines={1}>
          {word}
        </Text>
      </View>
    </View>
  );
}

/** The row of quick amounts under the chips. */
export function PresetRow({ presets, onPick }: { presets: Preset[]; onPick: (value: string) => void }) {
  return (
    <View style={styles.presets}>
      {presets.map((pr) => (
        <PresetChip key={pr.label} label={pr.label} onPress={() => onPick(pr.value)} />
      ))}
    </View>
  );
}

function PresetChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      style={({ pressed }) => [styles.presetChip, pressed && { backgroundColor: colors.surfaceRaised }]}
    >
      <Text style={styles.presetLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'space-between', gap: spacing.lg },
  group: { gap: spacing.md },
  // The amount and what it returns take all the room between the side picker
  // and the pad, centred in it, so neither end of the screen is left empty.
  middle: { flexGrow: 1, justifyContent: 'center' },
  header: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.thumb,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerWord: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, color: colors.text },
  amountBlock: { alignItems: 'center', gap: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4, minHeight: 84 },
  amount: { ...type.display, fontSize: 76, lineHeight: 84, letterSpacing: -2, maxWidth: '80%' },
  amountUnit: { fontFamily: fonts.bold, fontSize: 52, color: colors.text },
  amountSuffix: { fontFamily: fonts.semibold, fontSize: 26, color: colors.textMuted },
  headline: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, color: colors.text },
  headlineValue: { color: colors.yes, fontVariant: ['tabular-nums'] },
  detail: { ...type.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  warning: { ...type.muted, color: colors.no, textAlign: 'center' },
  presets: { flexDirection: 'row', gap: spacing.sm },
  presetChip: { flex: 1, height: 44, borderRadius: 999, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  presetLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
});
