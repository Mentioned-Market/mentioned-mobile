import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, fonts } from '@/ui/theme';

export type PillTone = 'gold' | 'goldDark' | 'green' | 'red' | 'orange' | 'neutral' | 'dark';

const TONES: Record<PillTone, { bg: string; fg: string }> = {
  gold: { bg: 'rgba(242,183,31,0.16)', fg: colors.gold },
  // For text over cover images: solid dark ground so the gold stays legible.
  goldDark: { bg: 'rgba(0,0,0,0.78)', fg: colors.gold },
  green: { bg: 'rgba(61,220,132,0.16)', fg: colors.yes },
  red: { bg: 'rgba(255,92,92,0.16)', fg: colors.no },
  orange: { bg: 'rgba(255,149,0,0.16)', fg: '#FF9F0A' },
  neutral: { bg: 'rgba(255,255,255,0.08)', fg: colors.textMuted },
  dark: { bg: 'rgba(0,0,0,0.78)', fg: colors.text },
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
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
});
