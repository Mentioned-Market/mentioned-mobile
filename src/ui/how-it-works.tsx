// Home's first card for someone who is not signed in: what Mentioned is, in
// three lines, and the two ways in: sign in, or try the free market closing
// soonest. The intro explains it once on first launch; this is for every visit
// after that until they sign in, when it goes and their own picks take its
// place.
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
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

/** `tryHref` is a free market to open, the soonest to close, or Markets when none is open. */
export function HowItWorks({ tryHref }: { tryHref: string }) {
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
      <View style={styles.buttons}>
        {/* router.push, not Link asChild: a Button inside a Link does not fire. */}
        <Button label="Sign in" onPress={() => router.push('/sign-in')} style={{ flex: 1 }} />
        <Button label="Try it free" tone="neutral" onPress={() => router.push(tryHref as Href)} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: colors.text },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 2 },
  icon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' },
  stepText: { ...type.body, flex: 1, fontSize: 15, lineHeight: 21, color: colors.text, paddingTop: 3 },
  buttons: { flexDirection: 'row', gap: spacing.sm },
});
