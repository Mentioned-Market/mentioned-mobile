// Ranked list for majority boards (paid and free). Tap to select when the
// board is open; your picks and settled outcomes are marked. Each word shows
// its share of the pool, which is the chance the crowd gives it.
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { pct } from '@/lib/format';
import { LiveNumber } from '@/ui/live-number';
import { Pill } from '@/ui/pill';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

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
  /**
   * Cannot be picked even though the board is open. Used for words the wallet
   * already holds: one pick per word per account, as on the website.
   */
  locked?: boolean;
};

type Props = { words: BoardWord[]; selected: Set<string>; onToggle?: (key: string) => void; selectable: boolean };

export function WordBoard({ words, selected, onToggle, selectable }: Props) {
  return (
    <View style={styles.card}>
      {words.map((w, i) => {
        const isSelected = selected.has(w.key);
        const canPick = selectable && !w.locked;
        return (
          <Pressable
            key={w.key}
            disabled={!canPick}
            onPress={() => onToggle?.(w.key)}
            accessibilityRole={canPick ? 'button' : undefined}
            accessibilityState={{ selected: isSelected }}
            style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && canPick && { opacity: 0.7 }]}
          >
            <View style={[styles.bar, { width: `${Math.max(1, Math.round(w.share * 100))}%` }, w.outcome === 'winner' && { backgroundColor: colors.yes }]} />
            <Text style={styles.rank}>{i + 1}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.label} numberOfLines={1}>
                  {w.label}
                </Text>
                {w.yours ? <Pill label="YOURS" tone="gold" /> : null}
                {w.outcome === 'winner' ? <Pill label="WON" tone="green" /> : null}
              </View>
              <Text style={[type.muted, { fontSize: 13, lineHeight: 18 }, isSelected && w.winLabel ? { color: colors.yes } : null]} numberOfLines={1}>
                {isSelected && w.winLabel ? w.winLabel : w.countLabel}
              </Text>
            </View>
            <LiveNumber value={w.share} format={pct} style={StyleSheet.flatten([styles.share, w.outcome === 'winner' && { color: colors.yes }])} />
            {canPick ? (
              <View style={[styles.check, isSelected && styles.checkOn]}>{isSelected ? <Ionicons name="checkmark" size={16} color={colors.bg} /> : null}</View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, minHeight: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  bar: { position: 'absolute', left: 0, bottom: 0, height: 3, borderRadius: 2, backgroundColor: colors.goldDim },
  rank: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textMuted, width: 20, fontVariant: ['tabular-nums'] },
  label: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.text, flexShrink: 1 },
  share: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, fontVariant: ['tabular-nums'] },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.gold, borderColor: colors.gold },
});
