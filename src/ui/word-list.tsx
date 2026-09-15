// The words of a YES/NO market, one row each: the word and the chance it
// happens. Tapping a row opens the trade sheet, where the side is chosen; the
// NO price is not printed, it is a hundred minus what is.
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
  /** Held shares by word key, e.g. "2.00 YES", for a small line under the word. */
  held?: Record<string, string>;
};

export function WordList({ words, onPick, open, held }: Props) {
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
          accessibilityLabel={`${w.label}, ${pct(w.yesPrice)} chance`}
          style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && open && { opacity: 0.7 }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.label} numberOfLines={2}>
              {w.label}
            </Text>
            {held?.[w.key] ? <Text style={[type.muted, { color: colors.gold }]}>You hold {held[w.key]}</Text> : null}
          </View>
          {w.outcome !== null ? (
            <Pill label={w.outcome ? 'YES' : 'NO'} tone={w.outcome ? 'green' : 'red'} />
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
});
