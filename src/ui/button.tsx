import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius, spacing, type } from '@/ui/theme';

type Props = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  /** Small line under the label, e.g. "Sign in to trade". */
  note?: string;
  tone?: 'gold' | 'yes' | 'no' | 'neutral';
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
};

const BG = { gold: colors.gold, yes: colors.yes, no: colors.no, neutral: colors.surfaceRaised } as const;

/** A full pill. Gold for the thing the screen is for, neutral for everything beside it. */
export function Button({ label, onPress, disabled = false, note, tone = 'gold', size = 'md', style }: Props) {
  const fg = tone === 'neutral' ? colors.text : colors.bg;
  return (
    <View style={style}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        style={({ pressed }) => [styles.button, size === 'sm' && styles.small, { backgroundColor: BG[tone] }, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
      >
        <Text style={[styles.label, size === 'sm' && styles.labelSmall, { color: fg }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      {note ? <Text style={[type.muted, styles.note]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { height: 56, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  small: { height: 40, paddingHorizontal: spacing.md },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
  label: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22 },
  labelSmall: { fontSize: 15, lineHeight: 20 },
  note: { textAlign: 'center', marginTop: spacing.sm },
});
