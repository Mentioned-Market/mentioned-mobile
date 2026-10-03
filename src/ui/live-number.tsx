// A number that shows it moved: on a change it flashes green for up and red
// for down, then settles back to its colour, and with `format` it counts from
// the old value to the new one. The first render does neither; only a real
// change from a poll or a trade does.
//
// Pass `text` to show a string the caller has already formatted (a payout
// multiplier from src/trade/amm-display.ts, which has its own rounding rules)
// while `value` still decides whether it went up or down. Counting is skipped
// there, since an in-between value would be formatted by the wrong rules.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { colors } from '@/ui/theme';

const COUNT_MS = 450;
const FLASH_MS = 900;

type Props = {
  value: number;
  format?: (n: number) => string;
  text?: string;
  style?: StyleProp<TextStyle>;
};

export function LiveNumber({ value, format, text, style }: Props) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(value);
  const last = useRef(value);
  const flash = useSharedValue(0);
  const base = (StyleSheet.flatten(style)?.color as string | undefined) ?? colors.text;

  useEffect(() => {
    const from = last.current;
    last.current = value;
    if (from === value) return;
    flash.set(withSequence(withTiming(value > from ? 1 : -1, { duration: 0 }), withTiming(0, { duration: FLASH_MS })));
    // Counting runs on animation frames; with reduce motion, or nothing to
    // format, the first frame lands on the new value.
    const count = format && !text && !reduceMotion;
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = count ? Math.min(1, (Date.now() - start) / COUNT_MS) : 1;
      const eased = 1 - (1 - t) ** 3;
      setShown(from + (value - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, format, text, reduceMotion, flash]);

  const tint = useAnimatedStyle(() => ({ color: interpolateColor(flash.get(), [-1, 0, 1], [colors.no, base, colors.yes]) }));

  return <Animated.Text style={[style, tint]}>{text ?? (format ? format(shown) : String(shown))}</Animated.Text>;
}
