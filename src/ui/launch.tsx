// The launch animation: what plays between the native splash and the first
// screen.
//
// It starts as an exact copy of the splash (the mark, 140 wide, centred on
// black) so the handoff is invisible. Then the mark speaks: it dips and springs
// back, three gold rings ripple out from it like a voice carrying, and the word
// "Mentioned" arrives under it a letter at a time. The whole thing then pushes
// forward and clears to reveal Home. About 1.5 seconds; the app is already
// mounted underneath and loading, so it costs nothing but the look. Reduced
// motion skips all of it and only fades.
//
// The mark is a speech bubble, and the rings are the one idea here: something
// being said. The version before this drew a single gold arc around the mark,
// which was tidy and read as a loading ring.
//
// It deliberately waits for the app to be ready before it mounts. An earlier
// version started the moment JavaScript ran and looped until ready, which on
// a dev client meant several seconds of a ring going round: a spinner by
// another name. One pass after the wait reads as a flourish; a long one reads
// as loading.
import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, fonts } from '@/ui/theme';

/** Matches `imageWidth` in the expo-splash-screen plugin config. */
const MARK = 140;
/** A ring at rest; it grows from about half this to more than twice it. */
const RING = 150;
const STAGE = 220;

const RINGS = 3;
/** Each ring's share of the ripple's run, and how far apart they start. */
const RING_SPAN = 0.72;
const RING_STAGGER = (1 - RING_SPAN) / (RINGS - 1);

const WORD = 'Mentioned'.split('');
/** Each letter's share of the word's run; the rest is the stagger between them. */
const LETTER_SPAN = 0.5;
const LETTER_STAGGER = (1 - LETTER_SPAN) / (WORD.length - 1);

const clamp01 = (n: number) => {
  'worklet';
  return n < 0 ? 0 : n > 1 ? 1 : n;
};

/** One ring of the ripple: grows from the mark and thins to nothing. */
function Ring({ ripple, index }: { ripple: SharedValue<number>; index: number }) {
  const style = useAnimatedStyle(() => {
    const p = clamp01((ripple.get() - index * RING_STAGGER) / RING_SPAN);
    return {
      opacity: interpolate(p, [0, 0.12, 1], [0, 0.95, 0]),
      transform: [{ scale: interpolate(p, [0, 1], [0.55, 2.5]) }],
    };
  });
  return <Animated.View style={[styles.ring, style]} />;
}

/** One letter of the word: rises into place as its turn comes. */
function Letter({ word, index, char }: { word: SharedValue<number>; index: number; char: string }) {
  const style = useAnimatedStyle(() => {
    const p = clamp01((word.get() - index * LETTER_STAGGER) / LETTER_SPAN);
    // Ease out by hand: the shared value runs linearly so the stagger stays even.
    const eased = 1 - (1 - p) * (1 - p) * (1 - p);
    return { opacity: eased, transform: [{ translateY: (1 - eased) * 18 }] };
  });
  return <Animated.Text style={[styles.letter, style]}>{char}</Animated.Text>;
}

type Props = {
  /** Called once the overlay has faded out and can be unmounted. */
  onDone: () => void;
  /** Called on the first laid-out frame, when the native splash can go. */
  onReady: () => void;
};

export function LaunchOverlay({ onDone, onReady }: Props) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  // 0 = no rings yet, 1 = the last ring has faded.
  const ripple = useSharedValue(0);
  // 0 = no letters, 1 = the whole word in place.
  const word = useSharedValue(0);
  // 1 = covering the app, 0 = gone.
  const veil = useSharedValue(1);

  useEffect(() => {
    const finish = () => onDone();
    if (reduceMotion) {
      word.set(withTiming(1, { duration: 250 }));
      veil.set(withDelay(700, withTiming(0, { duration: 250 }, (done) => done && runOnJS(finish)())));
      return;
    }
    // The dip and the spring back are the moment it speaks; the rings leave on the rebound.
    scale.set(withDelay(80, withSequence(withTiming(0.9, { duration: 130, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 9, stiffness: 190, mass: 0.9 }))));
    ripple.set(withDelay(190, withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad) })));
    word.set(withDelay(420, withTiming(1, { duration: 620, easing: Easing.linear })));
    veil.set(withDelay(1210, withTiming(0, { duration: 300, easing: Easing.in(Easing.cubic) }, (done) => done && runOnJS(finish)())));
  }, [reduceMotion, scale, ripple, word, veil, onDone]);

  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.get() }));
  // The exit: the lockup comes toward you as the black clears, so Home is
  // arrived at rather than uncovered.
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + (1 - veil.get()) * 0.22 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.veil, veilStyle]} onLayout={onReady} pointerEvents="auto" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.content, contentStyle]}>
        <View style={styles.stage}>
          {reduceMotion ? null : Array.from({ length: RINGS }, (_, i) => <Ring key={i} ripple={ripple} index={i} />)}
          <Animated.View style={markStyle}>
            <Image source={require('@/assets/images/splash-icon.png')} style={{ width: MARK, height: MARK }} resizeMode="contain" />
          </Animated.View>
        </View>
        <View style={styles.word}>
          {WORD.map((char, i) => (
            <Letter key={i} word={word} index={i} char={char} />
          ))}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: { backgroundColor: colors.bg, zIndex: 10, elevation: 10 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stage: { width: STAGE, height: STAGE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, borderWidth: 3, borderColor: colors.gold },
  // Out of the flow, so the mark stays exactly where the splash drew it.
  word: { position: 'absolute', top: '50%', marginTop: STAGE / 2 + 6, flexDirection: 'row' },
  letter: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 36, color: colors.text, letterSpacing: -0.3 },
});
