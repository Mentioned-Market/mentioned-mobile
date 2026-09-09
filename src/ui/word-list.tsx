// Vertical word list for YES/NO markets: each row is the word with a YES and a
// NO price button. Tapping a side opens the trade sheet for that pick.
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cents } from '@/lib/format';
import { Pill } from '@/ui/pill';
import { colors, fonts, spacing, type } from '@/ui/theme';
import type { SheetWord, Side } from '@/ui/trade-sheet';

type Props = {
  words: SheetWord[];
  onPick: (key: string, side: Side) => void;
  open: boolean;
  /** Held shares by word key, e.g. "2.00 YES", for a small badge. */
  held?: Record<string, string>;
};

export function WordList({ words, onPick, open, held }: Props) {
  return (
    <View style={styles.list}>
      {words.map((w) => (
        <View key={w.key} style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.label} numberOfLines={2}>
              {w.label}
            </Text>
            {held?.[w.key] ? <Text style={[type.muted, { color: colors.gold }]}>You hold {held[w.key]}</Text> : null}
          </View>
          {w.outcome !== null ? (
            <Pill label={w.outcome ? 'YES' : 'NO'} tone={w.outcome ? 'green' : 'red'} />
          ) : (
            (['YES', 'NO'] as const).map((s) => {
              const tone = s === 'YES' ? colors.yes : colors.no;
              return (
                <Pressable
                  key={s}
                  disabled={!open}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onPick(w.key, s);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${s} ${w.label} at ${cents(s === 'YES' ? w.yesPrice : w.noPrice)}`}
                  style={({ pressed }) => [styles.side, { borderColor: `${tone}66`, backgroundColor: `${tone}14` }, pressed && { backgroundColor: `${tone}33` }, !open && { opacity: 0.5 }]}>
                  <Text style={[styles.sideLabel, { color: tone }]}>{s}</Text>
                  <Text style={styles.sidePrice}>{cents(s === 'YES' ? w.yesPrice : w.noPrice)}</Text>
                </Pressable>
              );
            })
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, paddingLeft: spacing.md, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 64 },
  label: { ...type.body, fontFamily: fonts.semibold, fontSize: 16 },
  side: { width: 76, height: 48, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sideLabel: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.5 },
  sidePrice: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
});
