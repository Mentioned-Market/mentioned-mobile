// In-app amount pad. Avoids the system keyboard so the quote stays visible.
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/ui/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

type Props = { value: string; onChange: (v: string) => void; maxDecimals?: number; maxLength?: number };

export function NumberPad({ value, onChange, maxDecimals = 2, maxLength = 9 }: Props) {
  const press = (k: (typeof KEYS)[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (k === '⌫') {
      onChange(value.length <= 1 ? '' : value.slice(0, -1));
      return;
    }
    if (k === '.') {
      if (maxDecimals === 0 || value.includes('.')) return;
      onChange(value === '' ? '0.' : `${value}.`);
      return;
    }
    if (value.length >= maxLength) return;
    const [, frac = ''] = value.split('.');
    if (value.includes('.') && frac.length >= maxDecimals) return;
    if (value === '0') {
      onChange(k);
      return;
    }
    onChange(value + k);
  };
  return (
    <View style={styles.grid} accessibilityRole="keyboardkey">
      {KEYS.map((k) => (
        <Pressable
          key={k}
          onPress={() => press(k)}
          onLongPress={k === '⌫' ? () => onChange('') : undefined}
          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
          accessibilityRole="button"
          accessibilityLabel={k === '⌫' ? 'Delete' : k}>
          <Text style={[styles.keyLabel, k === '⌫' && { fontSize: 20 }]}>{k}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  key: { width: '31.5%', height: 52, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  keyPressed: { backgroundColor: colors.surfaceRaised },
  keyLabel: { fontFamily: fonts.semibold, fontSize: 22, color: colors.text, fontVariant: ['tabular-nums'] },
});
