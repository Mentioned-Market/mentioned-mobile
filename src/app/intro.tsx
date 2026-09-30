// First-launch intro: three slides, each a screenshot of the app in a phone
// frame with a line about it, then sign in or browse. Shown once
// (prefs.introSeen); Me on a non-production build and the dev screen replay it.
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePrefs } from '@/store/prefs';
import { Button } from '@/ui/button';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';
import { Wordmark } from '@/ui/wordmark';

const SLIDES = [
  {
    title: 'Pick what gets said',
    body: 'Each market is about something coming up: a match, an X\u00A0post, an album release. Call Yes or No on each word, or pick the one that gets said the most.',
    image: require('@/assets/images/intro/market.png'),
  },
  {
    title: 'Free to play, or for real',
    body: 'Free markets use play tokens and earn points toward a weekly prize pool. Paid markets settle in USDC on Solana.',
    image: require('@/assets/images/intro/trade.png'),
  },
  {
    title: 'Made for the Seeker',
    body: 'Sign in with Google, X or an email code and get a wallet with no seed phrase. Fund it straight from your Seeker wallet.',
    image: require('@/assets/images/intro/wallet.png'),
  },
];

/**
 * The frame is taller than it is wide by less than the screenshot is, so it
 * shows the top three quarters of the shot: the part with the market, the
 * amount or the wallet on it, and not the tab bar.
 */
const FRAME_RATIO = 1200 / 1900;
/** Two pill buttons, the gap between them and the dots: what the last slide needs. */
const BOTTOM_HEIGHT = 56 * 2 + spacing.sm + 8 + spacing.lg * 2 + spacing.lg;

export default function IntroScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const setIntroSeen = usePrefs((s) => s.setIntroSeen);
  const [index, setIndex] = useState(0);
  const scroll = useRef<ScrollView>(null);

  // The frame takes what the text and the buttons leave, capped so the title
  // and body never have to fight for the bottom of a short screen. The bottom
  // block is the same height on every slide, so the slide never shrinks when
  // the last one shows two buttons.
  const frameHeight = Math.min(height * 0.44, 400);
  const frameWidth = Math.min(width - spacing.lg * 2, frameHeight * FRAME_RATIO);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };
  const go = (i: number) => {
    Haptics.selectionAsync();
    scroll.current?.scrollTo({ x: i * width, animated: true });
    setIndex(i);
  };
  const finish = (to: '/' | '/markets' | '/sign-in') => {
    setIntroSeen(true);
    router.replace(to);
  };
  const last = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <Wordmark />
        {!last ? (
          <Pressable onPress={() => finish('/')} hitSlop={12} accessibilityRole="button">
            <Text style={type.muted}>Skip</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={{ flexGrow: 1 }}>
        {SLIDES.map((s) => (
          <View key={s.title} style={[styles.slide, { width }]}>
            <View style={[styles.frame, { width: frameWidth, height: frameHeight }]}>
              <Image source={s.image} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" accessibilityIgnoresInvertColors />
              {/* Fades the bottom of the shot into the ground, so the crop
                  reads as a glimpse rather than a cut. */}
              <View style={styles.fade} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={[styles.bottom, { height: BOTTOM_HEIGHT }]}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        {last ? (
          <View style={{ gap: spacing.sm }}>
            <Button label="Sign in" onPress={() => finish('/sign-in')} />
            <Button label="Browse markets" tone="neutral" onPress={() => finish('/markets')} />
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Button label="Next" onPress={() => go(index + 1)} />
            <View style={{ height: 56 }} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.md, height: 56 },
  slide: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, alignItems: 'center', gap: spacing.lg },
  frame: { borderRadius: radius.card + 4, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 6, borderColor: colors.surfaceRaised },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 80, backgroundColor: 'rgba(21,21,21,0.55)' },
  copy: { alignSelf: 'stretch', gap: spacing.sm },
  // Line height at 1.3 times the size: tighter clipped the descenders on Fabric.
  title: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 40, color: colors.text, letterSpacing: -0.5 },
  body: { ...type.body, fontSize: 16, lineHeight: 24, color: colors.textMuted },
  bottom: { padding: spacing.lg, gap: spacing.lg, justifyContent: 'flex-start' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised },
  dotActive: { width: 24, backgroundColor: colors.gold },
});
