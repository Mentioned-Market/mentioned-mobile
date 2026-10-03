// A text link for the quieter of two ways forward ("Continue with email
// instead"): brand gold, the way links read across the app, and 48 tall
// because a link is still a touch target.
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/ui/theme';

export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.gold },
});
