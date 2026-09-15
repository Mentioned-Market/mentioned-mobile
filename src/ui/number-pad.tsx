// In-app amount pad. Avoids the system keyboard so the quote and the action
// stay visible; a system keyboard would cover both.
//
// Bare digits on the black ground, no key outlines: the pad is the largest
// thing on the trade sheet and a grid of boxes made it the loudest too.
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/ui/theme';

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
      {KEYS.map((k) => {
        const dim = k === '.' && maxDecimals === 0;
        return (
          <Pressable
            key={k}
            onPress={() => press(k)}
            onLongPress={k === '⌫' ? () => onChange('') : undefined}
            disabled={dim}
            style={({ pressed }) => [styles.key, pressed && styles.keyPressed, dim && { opacity: 0.25 }]}
            accessibilityRole="button"
            accessibilityLabel={k === '⌫' ? 'Delete' : k}
          >
            {k === '⌫' ? <Ionicons name="backspace" size={26} color={colors.text} /> : <Text style={styles.keyLabel}>{k}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  key: { width: '33.333%', height: 58, borderRadius: radius.key, alignItems: 'center', justifyContent: 'center' },
  keyPressed: { backgroundColor: colors.surface },
  keyLabel: { fontFamily: fonts.semibold, fontSize: 28, color: colors.text, fontVariant: ['tabular-nums'] },
});
