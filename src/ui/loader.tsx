// The loading mark: the Mentioned logo breathing inside a turning gold arc,
// the same figure the trade sheet shows while a trade is in flight, at a
// smaller size. Every list and card that is still fetching shows this rather
// than grey bars, so a wait looks like the app rather than like a wireframe.
import { useEffect } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors, radius, spacing, type } from '@/ui/theme';

const STROKE = 3;
/** How much of the ring the arc covers. */
const ARC = 0.28;

type Props = {
  size?: number;
  /** A line under the mark, e.g. "Loading markets". */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function Loader({ size = 64, label, style }: Props) {
  const reduceMotion = useReducedMotion();
  const spin = useSharedValue(0);
  const breathe = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    spin.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1));
    breathe.set(withRepeat(withSequence(withTiming(1.07, { duration: 700 }), withTiming(1, { duration: 700 })), -1));
    return () => {
      cancelAnimation(spin);
      cancelAnimation(breathe);
    };
  }, [reduceMotion, spin, breathe]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get() * 360}deg` }] }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: breathe.get() }] }));

  const r = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const logo = Math.round(size * 0.46);

  return (
    <View style={[styles.wrap, style]} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
          <Svg width={size} height={size}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceRaised} strokeWidth={STROKE} fill="none" />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={colors.gold}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${circumference * ARC} ${circumference}`}
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          </Svg>
        </Animated.View>
        <Animated.View style={logoStyle}>
          <Image source={require('@/assets/images/logo-mark.png')} style={{ width: logo, height: logo }} resizeMode="contain" />
        </Animated.View>
      </View>
      {label ? <Text style={type.muted}>{label}</Text> : null}
    </View>
  );
}

/** A loader filling a card-sized block, for where a list or a card is still on its way. */
export function LoadingBlock({ height = 180, label }: { height?: number; label?: string }) {
  return (
    <View style={[styles.block, { minHeight: height }]}>
      <Loader label={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  block: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.card, backgroundColor: colors.surface, padding: spacing.lg },
});
