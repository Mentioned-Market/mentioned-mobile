// Swipe to confirm. The knob is dragged along the track; past four fifths of
// the way it commits, snaps to the end and fires `onConfirm`. Anything short
// of that springs back. A trade is money, and a swipe cannot be done by a
// thumb resting on the screen the way a tap can.
//
// Screen readers cannot swipe, so the control also exposes "activate" as an
// accessibility action, which confirms the same way.
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { colors, fonts, radius, spacing, type } from '@/ui/theme';

const HEIGHT = 64;
const PAD = 4;
const KNOB = HEIGHT - PAD * 2;
/** How far along the track, as a fraction, a release counts as a confirm. */
const COMMIT = 0.8;

type Props = {
  label: string;
  onConfirm: () => void;
  tone?: 'yes' | 'no' | 'gold';
  disabled?: boolean;
  /** Small line under the track, e.g. an input error or "Sign in to trade". */
  note?: string | null;
  style?: StyleProp<ViewStyle>;
};

const TONE = {
  yes: { fill: colors.yes, ground: colors.yesTint, edge: 'rgba(61,220,132,0.45)' },
  no: { fill: colors.no, ground: colors.noTint, edge: 'rgba(255,92,92,0.45)' },
  gold: { fill: colors.gold, ground: colors.goldTint, edge: 'rgba(242,183,31,0.45)' },
} as const;

export function SwipeButton({ label, onConfirm, tone = 'yes', disabled = false, note, style }: Props) {
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const travel = useSharedValue(0);
  const armed = useSharedValue(false);
  const t = TONE[tone];

  useEffect(() => {
    travel.set(Math.max(0, width - KNOB - PAD * 2));
  }, [width, travel]);

  const confirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm();
    // If the parent keeps this control on screen (an input error, say), the
    // knob comes home rather than sitting at the far end looking done.
    x.set(withDelay(500, withSpring(0)));
  };
  const tick = () => Haptics.selectionAsync();

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX(6)
    .failOffsetY([-16, 16])
    .onUpdate((e) => {
      const max = travel.get();
      const next = Math.min(max, Math.max(0, e.translationX));
      x.set(next);
      const over = max > 0 && next >= max * COMMIT;
      if (over !== armed.get()) {
        armed.set(over);
        if (over) runOnJS(tick)();
      }
    })
    .onEnd(() => {
      const max = travel.get();
      armed.set(false);
      if (max > 0 && x.get() >= max * COMMIT) {
        x.set(
          withTiming(max, { duration: 120 }, (finished) => {
            if (finished) runOnJS(confirm)();
          }),
        );
        return;
      }
      x.set(withSpring(0, { damping: 20, stiffness: 220 }));
    });

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [0, Math.max(1, travel.get() * 0.5)], [1, 0], Extrapolation.CLAMP),
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: x.get() + KNOB + PAD * 2 }));

  return (
    <View style={style}>
      <GestureDetector gesture={pan}>
        <Animated.View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={[styles.track, { backgroundColor: t.ground, borderColor: t.edge }, disabled && styles.disabled]}
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          accessibilityActions={[{ name: 'activate', label: 'Confirm' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'activate' && !disabled) confirm();
          }}
        >
          <Animated.View style={[styles.fill, { backgroundColor: t.ground }, fillStyle]} />
          <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
            {label}
          </Animated.Text>
          <Animated.View style={[styles.knob, { backgroundColor: t.fill }, knobStyle]}>
            <Ionicons name="arrow-forward" size={26} color={colors.bg} />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      {note ? <Text style={[type.muted, styles.note]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: HEIGHT, borderRadius: radius.control, borderWidth: 1.5, justifyContent: 'center', overflow: 'hidden' },
  disabled: { opacity: 0.4 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.control },
  label: { position: 'absolute', left: KNOB + PAD * 2, right: spacing.md, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 17, color: colors.text },
  knob: { position: 'absolute', left: PAD, width: KNOB, height: KNOB, borderRadius: KNOB / 2, alignItems: 'center', justifyContent: 'center' },
  note: { textAlign: 'center', marginTop: spacing.sm },
});
