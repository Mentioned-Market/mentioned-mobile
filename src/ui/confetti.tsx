// A single burst of confetti in the brand's colours, for a win. Pieces shoot
// up and out from behind the centre of the screen, then fall under gravity
// with a spin, once, and are gone. Drawn with plain views on the UI thread;
// nothing to load. Off under reduce motion.
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { colors } from '@/ui/theme';

const PIECES = 48;
const PALETTE = [colors.gold, colors.yes, colors.text, colors.gold, '#FFD86B'];

type Piece = { vx: number; lift: number; spin: number; delay: number; duration: number; w: number; h: number; color: string };

/** Deterministic per index, so a re-render does not reshuffle the burst. */
function piece(i: number, width: number): Piece {
  const r = (n: number) => {
    const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    // Sideways travel over the whole flight, either way, up to most of the screen.
    vx: (r(1) - 0.5) * width * 1.3,
    // How hard it is thrown upward; see `Bit` for the path.
    lift: 900 + r(2) * 900,
    spin: (r(3) - 0.5) * 1080,
    delay: r(4) * 120,
    duration: 1900 + r(5) * 900,
    w: 6 + r(6) * 6,
    h: 10 + r(7) * 8,
    color: PALETTE[i % PALETTE.length],
  };
}

export function Confetti() {
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(() => Array.from({ length: PIECES }, (_, i) => piece(i, width)), [width]);
  if (reduceMotion) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Bit key={i} p={p} originX={width / 2} originY={height * 0.42} endY={height + 40} />
      ))}
    </View>
  );
}

/**
 * A thrown piece: y(t) = y0 - lift·t + (endY - y0 + lift)·t², the parabola that
 * leaves the origin going up at `lift` and lands at `endY` when t reaches 1.
 * Time runs linearly; the curve itself is the gravity.
 */
function Bit({ p, originX, originY, endY }: { p: Piece; originX: number; originY: number; endY: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(p.delay, withTiming(1, { duration: p.duration, easing: Easing.linear })));
  }, [t, p.delay, p.duration]);
  const style = useAnimatedStyle(() => {
    const k = t.get();
    const y = originY - p.lift * k + (endY - originY + p.lift) * k * k;
    return {
      opacity: k === 0 ? 0 : 1 - Math.max(0, k - 0.85) * 6,
      transform: [{ translateX: originX + p.vx * k }, { translateY: y }, { rotate: `${p.spin * k}deg` }],
    };
  });
  return <Animated.View style={[styles.bit, { width: p.w, height: p.h, backgroundColor: p.color }, style]} />;
}

const styles = StyleSheet.create({
  bit: { position: 'absolute', left: 0, top: 0, borderRadius: 2 },
});
