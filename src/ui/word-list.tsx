// The words of a YES/NO market, one row each. A free market shows the chance
// the word happens, and tapping the row opens the trade sheet on YES. A paid
// (AMM) market passes `quote` and shows a Yes and a No button with what each
// pays, e.g. "Yes 1.58x", each opening the sheet on its own side: AMM markets
// show multipliers only (src/trade/amm-display.ts).
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { pct } from '@/lib/format';
import { Pill } from '@/ui/pill';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';
import type { SheetWord, Side } from '@/ui/trade-sheet';

type Props = {
  words: SheetWord[];
  onPick: (key: string, side: Side) => void;
  open: boolean;
  /** What each word holds, by key, for a small line under it. */
  held?: Record<string, string>;
  /** The multiplier for a side, e.g. "1.58x". Given, the row shows side buttons instead of the chance. */
  quote?: (word: SheetWord, side: Side) => string;
};

export function WordList({ words, onPick, open, held, quote }: Props) {
  return (
    <View style={styles.card}>
      {words.map((w, i) => (
        <Pressable
          key={w.key}
          disabled={!open}
          onPress={() => {
            Haptics.selectionAsync();
            onPick(w.key, 'YES');
          }}
          accessibilityRole={open ? 'button' : undefined}
          accessibilityLabel={quote ? w.label : `${w.label}, ${pct(w.yesPrice)} chance`}
          style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && open && { opacity: 0.7 }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.label} numberOfLines={2}>
              {w.label}
            </Text>
            {held?.[w.key] ? <Text style={[type.muted, { color: colors.gold }]}>{quote ? held[w.key] : `You hold ${held[w.key]}`}</Text> : null}
          </View>
          {w.outcome !== null ? (
            <Pill label={w.outcome ? 'YES' : 'NO'} tone={w.outcome ? 'green' : 'red'} />
          ) : quote ? (
            <View style={styles.sides}>
              {(['YES', 'NO'] as const).map((side) => (
                <Pressable
                  key={side}
                  disabled={!open}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onPick(w.key, side);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${side === 'YES' ? 'Yes' : 'No'} on ${w.label}, pays ${quote(w, side)}`}
                  style={({ pressed }) => [styles.side, side === 'YES' ? styles.sideYes : styles.sideNo, pressed && open && { opacity: 0.7 }]}
                >
                  <Text style={[styles.sideLabel, { color: side === 'YES' ? colors.yes : colors.no }]}>{side === 'YES' ? 'Yes' : 'No'}</Text>
                  <Text style={styles.sideQuote}>{quote(w, side)}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.pct}>{pct(w.yesPrice)}</Text>
              <Text style={styles.chance}>chance</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 4, minHeight: 64 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.text },
  pct: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 26, color: colors.yes, fontVariant: ['tabular-nums'] },
  chance: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  sides: { flexDirection: 'row', gap: spacing.sm },
  side: { minWidth: 72, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.control, borderWidth: 1, alignItems: 'center' },
  sideYes: { borderColor: colors.yes, backgroundColor: 'rgba(61,220,132,0.08)' },
  sideNo: { borderColor: colors.no, backgroundColor: 'rgba(255,92,92,0.08)' },
  sideLabel: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 16 },
  sideQuote: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 20, color: colors.text, fontVariant: ['tabular-nums'] },
});
