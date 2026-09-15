// A small rounded fact: "65% chance", "$3.03 available", "Closes in 2h".
// The strong part is white, the rest grey, so a row of chips reads as figures
// with captions rather than as a sentence.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius } from '@/ui/theme';

type Props = {
  value: string;
  caption?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'neutral' | 'yes' | 'no' | 'gold';
  style?: StyleProp<ViewStyle>;
};

const TONE = { neutral: colors.text, yes: colors.yes, no: colors.no, gold: colors.gold } as const;

export function Chip({ value, caption, icon, tone = 'neutral', style }: Props) {
  return (
    <View style={[styles.chip, style]}>
      {icon ? <Ionicons name={icon} size={14} color={TONE[tone]} /> : null}
      <Text style={styles.text} numberOfLines={1}>
        <Text style={[styles.value, { color: TONE[tone] }]}>{value}</Text>
        {caption ? ` ${caption}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
  },
  text: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  value: { fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] },
});
