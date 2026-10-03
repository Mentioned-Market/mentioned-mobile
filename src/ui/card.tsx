// The one card shape (docs/DESIGN.md): a dark rounded surface on black with no
// outline. `Row` is a line inside it, with a hairline above every row but the
// first. `Stat` is a caption over a figure, for a row of them across a card.
import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius, spacing, type } from '@/ui/theme';

export function Card({ children, style, padded = true }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; padded?: boolean }>) {
  return <View style={[styles.card, padded && styles.padded, style]}>{children}</View>;
}

type RowProps = PropsWithChildren<{
  first?: boolean;
  onPress?: () => void;
  /** Draws a chevron on the right, for a row that goes somewhere. */
  chevron?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
}>;

export function Row({ children, first = false, onPress, chevron = false, label, style }: RowProps) {
  const inner = (
    <>
      {children}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.row, !first && styles.divider, pressed && { opacity: 0.7 }, style]}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={[styles.row, !first && styles.divider, style]}>{inner}</View>;
}

/** Row styles for a Pressable that must be `<Link asChild>`'s direct child (which needs a flat style). */
export const rowStyle = (first: boolean) => StyleSheet.flatten([styles.row, !first && styles.divider]);

export function Stat({ label, value, tone, align = 'left' }: { label: string; value: string; tone?: 'up' | 'down'; align?: 'left' | 'center' | 'right' }) {
  return (
    <View style={[styles.stat, { alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center' }]}>
      <Text style={type.label}>{label}</Text>
      <Text style={[styles.statValue, tone === 'up' && { color: colors.yes }, tone === 'down' && { color: colors.no }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** A section title above a card, with an optional action on the right. */
export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionText}>{title}</Text>
      {right}
    </View>
  );
}

/** The quiet link on the right of a `SectionTitle`. */
export function SeeAll({ href, label = 'See all' }: { href: Href; label?: string }) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="button" hitSlop={10}>
        <Text style={styles.seeAll}>{label}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' },
  padded: { padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4, minHeight: 56 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stat: { flex: 1, gap: 2 },
  statValue: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: colors.text, fontVariant: ['tabular-nums'] },
  sectionTitle: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  sectionText: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, color: colors.text },
  seeAll: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.textMuted },
});
