// Ranked list for majority boards (paid and free). Tap to select when the
// board is open; your picks and settled outcomes are highlighted.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { pct } from '@/lib/format';
import { Pill } from '@/ui/pill';
import { colors, fonts, spacing, type } from '@/ui/theme';

export type BoardWord = {
  key: string;
  label: string;
  /** Pool share 0..1 */
  share: number;
  countLabel: string;
  outcome: 'winner' | 'loser' | null;
  yours: boolean;
  /** Shown in place of countLabel while selected, e.g. "Wins $2.40 if said most". */
  winLabel?: string;
};

type Props = { words: BoardWord[]; selected: Set<string>; onToggle?: (key: string) => void; selectable: boolean };

export function WordBoard({ words, selected, onToggle, selectable }: Props) {
  return (
    <View style={styles.list}>
      {words.map((w, i) => {
        const isSelected = selected.has(w.key);
        return (
          <Pressable
            key={w.key}
            disabled={!selectable}
            onPress={() => onToggle?.(w.key)}
            accessibilityRole={selectable ? 'button' : undefined}
            accessibilityState={{ selected: isSelected }}
            style={({ pressed }) => [styles.row, isSelected && styles.rowSelected, w.outcome === 'winner' && styles.rowWinner, pressed && selectable && { opacity: 0.85 }]}>
            <View style={[styles.bar, { width: `${Math.max(2, Math.round(w.share * 100))}%` }, w.outcome === 'winner' && { backgroundColor: 'rgba(61,220,132,0.14)' }]} />
            <Text style={styles.rank}>{i + 1}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.label} numberOfLines={1}>
                  {w.label}
                </Text>
                {w.yours ? <Pill label="YOURS" tone="gold" /> : null}
                {w.outcome === 'winner' ? <Pill label="WON" tone="green" /> : null}
              </View>
              <Text style={[type.muted, isSelected && w.winLabel ? { color: colors.yes } : null]}>{isSelected && w.winLabel ? w.winLabel : w.countLabel}</Text>
            </View>
            <Text style={styles.share}>{pct(w.share)}</Text>
            {selectable ? <View style={[styles.check, isSelected && styles.checkOn]}>{isSelected ? <Text style={styles.checkMark}>✓</Text> : null}</View> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowSelected: { borderColor: colors.gold },
  rowWinner: { borderColor: 'rgba(61,220,132,0.5)' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(242,183,31,0.10)' },
  rank: { fontFamily: fonts.bold, fontSize: 14, color: colors.textMuted, width: 22, fontVariant: ['tabular-nums'] },
  label: { ...type.body, fontFamily: fonts.semibold, flexShrink: 1 },
  share: { ...type.money },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkMark: { color: colors.bg, fontFamily: fonts.bold, fontSize: 14, lineHeight: 16 },
});
