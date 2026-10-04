// Which side a trade is on: two tiles, Yes and No. The chosen one fills with
// its side's tint and takes its colour; the other sits back in grey. They are
// the same rounded rectangles as the Yes and No buttons on the market's word
// list (src/ui/word-list.tsx), so the choice made there looks the same here.
//
// Not a Segmented: that is one pill with a sliding choice, which suits a
// filter. A side is the main decision on the sheet and reads better as two
// separate things to press.
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/ui/theme';
import type { Side } from '@/ui/trade-sheet';

const SIDES: { key: Side; name: string; fg: string; bg: string }[] = [
  { key: 'YES', name: 'Yes', fg: colors.yes, bg: colors.yesTint },
  { key: 'NO', name: 'No', fg: colors.no, bg: colors.noTint },
];

export function SidePicker({ value, onChange, verb }: { value: Side; onChange: (s: Side) => void; verb: string }) {
  return (
    <View style={styles.row}>
      {SIDES.map((s) => {
        const active = s.key === value;
        return (
          <Pressable
            key={s.key}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync();
              onChange(s.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.tile, active && { backgroundColor: s.bg }, pressed && !active && { opacity: 0.7 }]}
          >
            <Text style={[styles.label, active && { color: s.fg }]} numberOfLines={1}>
              {verb} {s.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignSelf: 'stretch', gap: spacing.sm },
  tile: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  label: { fontFamily: fonts.semibold, fontSize: 16, color: colors.textMuted },
});
