// What the trade sheet shows while a trade is on its way to the chain, and the
// moment it lands.
//
// The logo sits inside a ring. While working, the ring is a gold arc that turns
// and the logo breathes, so the screen is visibly alive for the few seconds a
// confirmation takes. On success the arc closes into a full circle, a check
// badge springs in and a handful of gold sparks burst outward. Failure turns
// the ring red and gives the logo a short shake.
//
// While working, the words underneath just say "Placing trade". The steps in
// between (price check, signing, confirmation) take a second or two each and
// mean nothing to the person waiting, so they are not shown.
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors, fonts, spacing } from '@/ui/theme';

export type ProgressPhase = 'working' | 'done' | 'failed' | 'pending';

const SIZE = 140;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** How much of the ring the working arc covers. */
const ARC = 0.28;

const LOGO = 64;
const SPARKS = 10;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  phase: ProgressPhase;
  /** When a purchase spans several transactions, which one is running. */
  batch?: { index: number; count: number };
  /** The working line, for something other than a trade, e.g. "Claiming". */
  workingLabel?: string;
  /** Headline once the trade has resolved, e.g. "You bought 1.91 YES". */
  title?: string;
  detail?: string;
  /**
   * Height to hold, usually the height of the form this replaces. Without it
   * the sheet collapses from a tall trade form to a short card the instant the
   * trade starts, which reads as something going wrong.
   */
  minHeight?: number;
};

export function TradeProgress({ phase, batch, workingLabel = 'Placing trade', title, detail, minHeight }: Props) {
  const reduceMotion = useReducedMotion();

  const spin = useSharedValue(0);
  const breathe = useSharedValue(1);
  // 1 = the working arc, 0 = a closed ring.
  const dash = useSharedValue(1);
  const badge = useSharedValue(0);
  const burst = useSharedValue(0);
  const shake = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(spin);
    cancelAnimation(breathe);

    if (phase === 'working' || phase === 'pending') {
      dash.set(1);
      badge.set(0);
      burst.set(0);
      if (reduceMotion) return;
      spin.set(0);
      spin.set(withRepeat(withTiming(1, { duration: phase === 'pending' ? 2600 : 1100, easing: Easing.linear }), -1));
      breathe.set(withRepeat(withSequence(withTiming(1.07, { duration: 700 }), withTiming(1, { duration: 700 })), -1));
      return;
    }

    breathe.set(withTiming(1, { duration: 200 }));

    if (phase === 'done') {
      // Close the ring, then land the badge and the sparks together.
      dash.set(withTiming(0, { duration: reduceMotion ? 0 : 420, easing: Easing.out(Easing.cubic) }));
      badge.set(withDelay(reduceMotion ? 0 : 280, withSpring(1, { damping: 11, stiffness: 180 })));
      if (!reduceMotion) {
        burst.set(0);
        burst.set(withDelay(300, withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) })));
      }
      return;
    }

    // failed
    dash.set(withTiming(0, { duration: reduceMotion ? 0 : 300 }));
    if (!reduceMotion) {
      shake.set(
        withSequence(
          withTiming(-8, { duration: 60 }),
          withTiming(8, { duration: 60 }),
          withTiming(-5, { duration: 60 }),
          withTiming(5, { duration: 60 }),
          withTiming(0, { duration: 60 }),
        ),
      );
    }
  }, [phase, reduceMotion, spin, breathe, dash, badge, burst, shake]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get() * 360}deg` }] }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.get() }, { translateX: shake.get() }],
  }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badge.get(), transform: [{ scale: badge.get() }] }));
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - ARC) * dash.get(),
  }));

  const ringColor = phase === 'failed' ? colors.no : phase === 'pending' ? '#FF9F0A' : colors.gold;

  const heading =
    phase === 'working'
      ? workingLabel
      : (title ?? (phase === 'done' ? 'Done' : phase === 'pending' ? 'Still confirming' : 'That did not go through'));

  return (
    <View style={[styles.wrap, minHeight ? { minHeight } : null]} accessibilityLiveRegion="polite" accessibilityLabel={heading}>
      <View style={styles.stage}>
        <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
          <Svg width={SIZE} height={SIZE}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={colors.border} strokeWidth={STROKE} fill="none" />
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={ringColor}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              animatedProps={arcProps}
              // Start the arc at twelve o'clock rather than three.
              rotation={-90}
              origin={`${SIZE / 2}, ${SIZE / 2}`}
            />
          </Svg>
        </Animated.View>

        {Array.from({ length: SPARKS }, (_, i) => (
          <Spark key={i} index={i} burst={burst} />
        ))}

        <Animated.View style={logoStyle}>
          <Image source={require('@/assets/images/logo-mark.png')} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        <Animated.View style={[styles.badge, badgeStyle]}>
          <Ionicons name="checkmark" size={20} color={colors.bg} />
        </Animated.View>
      </View>

      <Text style={styles.heading}>{heading}</Text>
      {phase !== 'working' && detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {phase === 'working' && batch ? (
        <Text style={styles.detail}>
          Transaction {batch.index + 1} of {batch.count}
        </Text>
      ) : null}
    </View>
  );
}

/** One gold spark, flung outward from the logo when a trade lands. */
function Spark({ index, burst }: { index: number; burst: SharedValue<number> }) {
  const angle = (index / SPARKS) * Math.PI * 2 + (index % 2 ? 0.2 : 0);
  const reach = SIZE / 2 + 14 + (index % 3) * 8;
  const style = useAnimatedStyle(() => {
    const t = burst.get();
    return {
      opacity: t === 0 ? 0 : 1 - t,
      transform: [
        { translateX: Math.cos(angle) * reach * t },
        { translateY: Math.sin(angle) * reach * t },
        { scale: 1 - t * 0.5 },
      ],
    };
  });
  return <Animated.View style={[styles.spark, index % 2 ? styles.sparkSmall : null, style]} />;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  stage: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  logo: { width: LOGO, height: LOGO },
  badge: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.yes,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  spark: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  sparkSmall: { width: 5, height: 5, borderRadius: 3 },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: colors.text, textAlign: 'center' },
  detail: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.lg },
});
