// The launch animation: what plays between the native splash and the first
// screen.
//
// It starts as an exact copy of the splash (the mark, 140 wide, centred on
// black) so the handoff is invisible, then a gold arc sweeps once around the
// mark, the word "Mentioned" rises in under it, and the whole thing lifts away
// to reveal Home. About 1.3 seconds; the app is already mounted underneath and
// loading, so it costs nothing but the look. Reduced motion skips the sweep and
// only fades.
//
// It deliberately waits for the app to be ready before it mounts. An earlier
// version started the moment JavaScript ran and looped until ready, which on
// a dev client meant several seconds of a ring going round: a spinner by
// another name. One sweep after the wait reads as a flourish; a long one reads
// as loading.
import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors, fonts } from '@/ui/theme';

/** Matches `imageWidth` in the expo-splash-screen plugin config. */
const MARK = 140;
const RING = 208;
const STROKE = 3;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  /** Called once the overlay has faded out and can be unmounted. */
  onDone: () => void;
  /** Called on the first laid-out frame, when the native splash can go. */
  onReady: () => void;
};

export function LaunchOverlay({ onDone, onReady }: Props) {
  const reduceMotion = useReducedMotion();
  // 0 = nothing drawn, 1 = the whole ring.
  const sweep = useSharedValue(0);
  const ringFade = useSharedValue(1);
  const scale = useSharedValue(1);
  const word = useSharedValue(0);
  const veil = useSharedValue(1);

  useEffect(() => {
    const finish = () => onDone();
    if (reduceMotion) {
      word.set(withTiming(1, { duration: 250 }));
      veil.set(withDelay(700, withTiming(0, { duration: 250 }, (done) => done && runOnJS(finish)())));
      return;
    }
    sweep.set(withDelay(120, withTiming(1, { duration: 650, easing: Easing.inOut(Easing.cubic) })));
    ringFade.set(withDelay(800, withTiming(0, { duration: 250 })));
    scale.set(withSequence(withDelay(120, withTiming(1.06, { duration: 330, easing: Easing.out(Easing.quad) })), withTiming(1, { duration: 330, easing: Easing.inOut(Easing.quad) })));
    word.set(withDelay(420, withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) })));
    veil.set(withDelay(1150, withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }, (done) => done && runOnJS(finish)())));
  }, [reduceMotion, sweep, ringFade, scale, word, veil, onDone]);

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: CIRCUMFERENCE * (1 - sweep.get()) }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ringFade.get() }));
  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.get(), transform: [{ translateY: (1 - word.get()) * 14 }] }));
  // The lift: fade, and a touch of scale so it reads as leaving rather than dimming.
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.get(), transform: [{ scale: 1 + (1 - veil.get()) * 0.04 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.veil, veilStyle]} onLayout={onReady} pointerEvents="auto" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.stage}>
        <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
          <Svg width={RING} height={RING}>
            <AnimatedCircle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              stroke={colors.gold}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              animatedProps={arcProps}
              // Start the sweep at twelve o'clock rather than three.
              rotation={-90}
              origin={`${RING / 2}, ${RING / 2}`}
            />
          </Svg>
        </Animated.View>
        <Animated.View style={markStyle}>
          <Image source={require('@/assets/images/splash-icon.png')} style={{ width: MARK, height: MARK }} resizeMode="contain" />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.word, wordStyle]}>Mentioned</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 10, elevation: 10 },
  stage: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  word: { position: 'absolute', top: '50%', marginTop: RING / 2 + 18, fontFamily: fonts.bold, fontSize: 26, lineHeight: 34, color: colors.text, letterSpacing: -0.3 },
});
