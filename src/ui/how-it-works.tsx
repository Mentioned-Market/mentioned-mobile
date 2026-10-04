// Home's first card for someone who is not signed in: what Mentioned is, in
// three lines, and the one way in: sign in. The intro explains it once on first
// launch; this is for every visit after that until they sign in, when it goes
// and their own picks take its place.
//
// There used to be a second button, "Try it free", that opened a free market.
// A free market cannot be entered without an account either, so it led to a
// screen that asked for a sign-in anyway. One button now says both things.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { colors, fonts, spacing, type } from '@/ui/theme';

type Step = { icon: keyof typeof Ionicons.glyphMap; text: string };

const STEPS: Step[] = [
  { icon: 'calendar-outline', text: 'Each market is about something coming up: a match, a stream, an X\u00A0post, an album release.' },
  { icon: 'checkmark-done', text: 'Pick the words you think get said. Yes or no on each word, or the one said most.' },
  { icon: 'trophy-outline', text: 'Free markets earn points toward a weekly prize pool. Paid markets pay out in USDC.' },
];

export function HowItWorks() {
  return (
    <Card style={styles.card}>
      <View style={{ gap: 4 }}>
        <Text style={styles.title}>Call what gets said</Text>
        <Text style={type.muted}>New to Mentioned?</Text>
      </View>
      <View style={{ gap: spacing.sm + 2 }}>
        {STEPS.map((s) => (
          <View key={s.icon} style={styles.step}>
            <View style={styles.icon}>
              <Ionicons name={s.icon} size={16} color={colors.gold} />
            </View>
            <Text style={styles.stepText}>{s.text}</Text>
          </View>
        ))}
      </View>
      {/* router.push, not Link asChild: a Button inside a Link does not fire. */}
      <Button label="Sign in and try it free" onPress={() => router.push('/sign-in')} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: colors.text },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 2 },
  icon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' },
  stepText: { ...type.body, flex: 1, fontSize: 15, lineHeight: 21, color: colors.text, paddingTop: 3 },
});
