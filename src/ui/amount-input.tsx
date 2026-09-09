import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, spacing, type } from '@/ui/theme';

type Props = {
  value: string;
  onChange: (v: string) => void;
  unit: string; // "$" or "tokens"
  presets: number[];
  max?: number;
};

export function AmountInput({ value, onChange, unit, presets, max }: Props) {
  const prefix = unit === '$';
  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        {prefix ? <Text style={styles.unit}>$</Text> : null}
        <TextInput
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          accessibilityLabel={`Amount in ${prefix ? 'dollars' : unit}`}
        />
        {!prefix ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      <View style={styles.presets}>
        {presets.map((p) => (
          <Pressable key={p} onPress={() => onChange(String(p))} style={styles.preset} accessibilityRole="button">
            <Text style={styles.presetLabel}>
              {prefix ? '$' : ''}
              {p}
            </Text>
          </Pressable>
        ))}
        {max !== undefined ? (
          <Pressable onPress={() => onChange(String(Math.floor(max * 100) / 100))} style={styles.preset} accessibilityRole="button">
            <Text style={styles.presetLabel}>Max</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 56,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unit: { ...type.heading, color: colors.textMuted },
  input: { flex: 1, fontFamily: fonts.semibold, fontSize: 22, color: colors.text, fontVariant: ['tabular-nums'], paddingVertical: 0 },
  presets: { flexDirection: 'row', gap: spacing.sm },
  preset: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  presetLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
});
