// A small status word: WON, LOST, YOU, CAPTAIN, NEW. Used sparingly; a card
// with more than one of these is a card carrying too much.
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, fonts, radius } from '@/ui/theme';

export type PillTone = 'gold' | 'green' | 'red' | 'orange' | 'neutral' | 'dark';

const TONES: Record<PillTone, { bg: string; fg: string }> = {
  gold: { bg: colors.goldTint, fg: colors.gold },
  green: { bg: colors.yesTint, fg: colors.yes },
  red: { bg: colors.noTint, fg: colors.no },
  orange: { bg: 'rgba(255,149,0,0.16)', fg: '#FF9F0A' },
  neutral: { bg: 'rgba(255,255,255,0.08)', fg: colors.textMuted },
  /** Over an image. */
  dark: { bg: 'rgba(0,0,0,0.7)', fg: colors.text },
};

export function Pill({ label, tone = 'neutral', style }: { label: string; tone?: PillTone; style?: ViewStyle }) {
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.label, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.control, alignSelf: 'flex-start' },
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17, letterSpacing: 0.2 },
});
