// First-launch intro: three slides, then browse or connect the Seeker wallet.
// Shown once (prefs.introSeen); the dev screen can reset it.
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePrefs } from '@/store/prefs';
import { Button } from '@/ui/button';
import { colors, fonts, spacing, type } from '@/ui/theme';

const SLIDES = [
  {
    title: 'Pick what gets said',
    body: 'Pick the words you think will be spoken during a match, a launch, an earnings call. If they are said, you win.',
    emoji: '🎙️',
  },
  {
    title: 'Free to play, or for real',
    body: 'Free markets use play tokens and earn points toward a weekly prize pool. Paid markets settle in USDC on Solana.',
    emoji: '🏆',
  },
  {
    title: 'Made for the Seeker',
    body: 'View your positions with the Seed Vault wallet in one tap. Trading, funding and sign-in land in the next update.',
    emoji: '📱',
  },
];

export default function IntroScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const setIntroSeen = usePrefs((s) => s.setIntroSeen);
  const [index, setIndex] = useState(0);
  const scroll = useRef<ScrollView>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };
  const go = (i: number) => {
    Haptics.selectionAsync();
    scroll.current?.scrollTo({ x: i * width, animated: true });
    setIndex(i);
  };
  const finish = (to: '/' | '/you') => {
    setIntroSeen(true);
    router.replace(to);
  };
  const last = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <View style={styles.brand}>
          <Image source={require('@/assets/images/logo-mark.png')} style={{ width: 28, height: 22 }} contentFit="contain" />
          <Text style={styles.wordmark}>Mentioned</Text>
        </View>
        {!last ? (
          <Pressable onPress={() => finish('/')} hitSlop={12} accessibilityRole="button">
            <Text style={type.muted}>Skip</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={{ flexGrow: 1 }}>
        {SLIDES.map((s) => (
          <View key={s.title} style={[styles.slide, { width }]}>
            <View style={styles.hero}>
              <Text style={{ fontSize: 88 }}>{s.emoji}</Text>
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.bottom}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        {last ? (
          <View style={{ gap: spacing.sm }}>
            <Button label="Connect Seeker wallet" onPress={() => finish('/you')} />
            <Button label="Browse markets" tone="neutral" onPress={() => finish('/')} />
          </View>
        ) : (
          <Button label="Next" onPress={() => go(index + 1)} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.md, height: 56 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wordmark: { fontFamily: fonts.bold, fontSize: 20, color: colors.text, letterSpacing: -0.3 },
  slide: { paddingHorizontal: spacing.lg, justifyContent: 'center', gap: spacing.md },
  hero: { height: 220, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  title: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, color: colors.text, letterSpacing: -0.5 },
  body: { ...type.body, fontSize: 17, lineHeight: 26, color: colors.textMuted },
  bottom: { padding: spacing.lg, gap: spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 24, backgroundColor: colors.gold },
});
