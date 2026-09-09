import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, spacing, type } from '@/ui/theme';

type Props = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  /** Small line under the label, e.g. "Trading arrives soon". */
  note?: string;
  tone?: 'gold' | 'yes' | 'no' | 'neutral';
  style?: ViewStyle;
};

const BG = { gold: colors.gold, yes: colors.yes, no: colors.no, neutral: colors.surfaceRaised } as const;

export function Button({ label, onPress, disabled = false, note, tone = 'gold', style }: Props) {
  const fg = tone === 'neutral' ? colors.text : colors.bg;
  return (
    <View style={style}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        style={({ pressed }) => [styles.button, { backgroundColor: BG[tone] }, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
        <Text style={[styles.label, { color: fg }]}>{label}</Text>
      </Pressable>
      {note ? <Text style={[type.muted, styles.note]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  label: { ...type.heading, fontSize: 17 },
  note: { textAlign: 'center', marginTop: spacing.sm },
});
