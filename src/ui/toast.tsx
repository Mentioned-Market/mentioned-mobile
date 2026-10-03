// Small cards that drop in from the top to mark points and achievements, the
// reward that is not money. One at a time, each for a couple of seconds, with
// a success haptic; more wait their turn.
//
// Only what the server confirmed is ever shown: a share claim's `awarded`, an
// unlock the route returned, or points that have actually landed on the
// weekly board. A trade's ten points arrive later by webhook, so a trade does
// not toast a number it has not been given.
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, fonts, radius, spacing, type } from '@/ui/theme';

export type Toast = { id: number; emoji: string; title: string; body?: string };

const SHOW_MS = 2600;

// A short drop and fade with an ease out: no spring, so nothing overshoots.
const ENTER = FadeInUp.duration(220).easing(Easing.out(Easing.cubic));
const EXIT = FadeOutUp.duration(160);

type ToastState = { queue: Toast[]; next: number; push: (t: Omit<Toast, 'id'>) => void; shift: () => void };

const useToasts = create<ToastState>()((set) => ({
  queue: [],
  next: 1,
  push: (t) => set((s) => ({ queue: [...s.queue, { ...t, id: s.next }], next: s.next + 1 })),
  shift: () => set((s) => ({ queue: s.queue.slice(1) })),
}));

/** Queue a toast from anywhere, including outside React. */
export function showToast(t: Omit<Toast, 'id'>) {
  useToasts.getState().push(t);
}

/** "+50 points" with what they were for. */
export function showPoints(points: number, body: string) {
  if (points > 0) showToast({ emoji: '✨', title: `+${points.toLocaleString()} points`, body });
}

/** One toast per achievement a route reports as newly unlocked. */
export function showAchievements(unlocked: { emoji: string; title: string; points: number }[]) {
  for (const a of unlocked) showToast({ emoji: a.emoji, title: a.title, body: `Achievement unlocked, +${a.points} points` });
}

/** Mounted once, above everything, in the root layout. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const current = useToasts((s) => s.queue[0]);
  const shift = useToasts((s) => s.shift);

  useEffect(() => {
    if (!current) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const id = setTimeout(shift, SHOW_MS);
    return () => clearTimeout(id);
  }, [current, shift]);

  if (!current) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.sm }]}>
      <Animated.View key={current.id} entering={ENTER} exiting={EXIT}>
        <Pressable onPress={shift} style={styles.card} accessibilityRole="alert" accessibilityLabel={[current.title, current.body].filter(Boolean).join(', ')}>
          <Text style={styles.emoji}>{current.emoji}</Text>
          <View style={styles.text}>
            <Text style={styles.title}>{current.title}</Text>
            {current.body ? <Text style={type.muted}>{current.body}</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gold,
    minWidth: 240,
  },
  emoji: { fontSize: 26 },
  text: { gap: 2, flexShrink: 1 },
  title: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, color: colors.gold, fontVariant: ['tabular-nums'] },
});
