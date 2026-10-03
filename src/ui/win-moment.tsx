// The moment a market you won settles: a full-screen "You called it" with
// confetti and a success haptic, the market, what it paid, and the one thing
// to do next (collect, or see the result and share it). Once per win, marked
// when it is dismissed; several at once are shown one after another.
//
// Only while Home is on screen, so it never lands on top of a trade in
// progress, and never for the wins a wallet already had when this phone first
// saw it (see `src/markets/moments.ts`).
import { useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { usd } from '@/lib/format';
import type { PositionGroups } from '@/lib/use-position-groups';
import { pendingWins, rememberWins, winKeys } from '@/markets/moments';
import type { MarketGroup } from '@/markets/positions';
import { useMoments } from '@/store/moments';
import { Button } from '@/ui/button';
import { Confetti } from '@/ui/confetti';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

export function WinMoment({ wallet, groups, focused }: { wallet: string | null; groups: PositionGroups; focused: boolean }) {
  const hydrated = useMoments((s) => s.hydrated);
  const celebrated = useMoments((s) => (wallet ? s.celebrated[wallet] : undefined));
  const setCelebrated = useMoments((s) => s.setCelebrated);
  const ready = !!wallet && hydrated && groups.loaded;

  // First sight of this wallet on this phone: remember what it has already
  // won, quietly.
  useEffect(() => {
    if (ready && wallet && celebrated === undefined) setCelebrated(wallet, rememberWins(groups.finished, undefined, winKeys(groups.finished)));
  }, [ready, wallet, celebrated, groups.finished, setCelebrated]);

  const win = ready ? pendingWins(groups.finished, celebrated)[0] : undefined;
  const visible = !!win && focused;

  useEffect(() => {
    if (visible) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [visible, win?.key]);

  if (!win || !wallet) return null;

  const done = () => setCelebrated(wallet, rememberWins(groups.finished, celebrated, [win.key]));

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={done}>
      <WinCard key={win.key} win={win} onDone={done} />
    </Modal>
  );
}

/** The win screen with a sample market, for the dev screen; never shown in a release build's flow. */
export function WinMomentPreview({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const sample: MarketGroup = {
    key: 'preview',
    kind: 'paid-majority',
    cover: null,
    href: '/positions',
    title: 'What will be said during the Solana Ecosystem Call?',
    finished: true,
    won: true,
    rows: [
      {
        key: 'preview:row',
        marketKey: 'preview',
        kind: 'paid-majority',
        cover: null,
        href: '/positions',
        title: 'Preview',
        line: 'solana ×1',
        value: 'Claim $4.20',
        finished: true,
        won: true,
        cta: null,
        claimableUsd: 4.2,
      },
    ],
    count: '1 position',
    value: '$4.20 to claim',
  };
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {visible ? <WinCard win={sample} onDone={onClose} /> : null}
    </Modal>
  );
}

// The card eases in from slightly small while it fades up: no spring, so it
// arrives without overshooting, and the confetti carries the celebration.
//
// Driven by a shared value, not an `entering` layout animation. Inside a
// status-bar-translucent Modal on Android, a layout animation places the view
// a status bar's height too high and snaps it down when it ends, which read
// as the card dropping ~30dp just after it appeared.
const CARD_IN = { duration: 260, easing: Easing.out(Easing.cubic) } as const;

function WinCard({ win, onDone }: { win: MarketGroup; onDone: () => void }) {
  const router = useRouter();
  const claimable = win.rows.reduce((s, r) => s + (r.claimableUsd ?? 0), 0);
  // Paid winnings wait to be claimed on Positions; free ones are already paid
  // back, so the next step is the result and its share card.
  const next = claimable > 0 ? { label: `Collect ${usd(claimable)}`, href: '/positions' } : { label: 'See the result', href: win.href };
  const go = () => {
    onDone();
    router.push(next.href as Href);
  };

  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(withTiming(1, CARD_IN));
  }, [shown]);
  const enter = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ scale: 0.92 + 0.08 * shown.get() }] }));

  return (
    <View style={styles.backdrop}>
      <Confetti />
      <Animated.View style={[styles.card, enter]} accessibilityViewIsModal>
        <Text style={styles.trophy}>🏆</Text>
        <Text style={styles.headline}>You called it</Text>
        <Text style={[type.muted, styles.center]} numberOfLines={2}>
          {win.title}
        </Text>
        <Text style={styles.value}>{win.value}</Text>
        <View style={styles.actions}>
          <Button label={next.label} onPress={go} />
          <Button label="Nice" tone="neutral" onPress={onDone} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  card: { width: '100%', maxWidth: 400, alignItems: 'center', gap: spacing.sm, padding: spacing.lg, borderRadius: radius.card, backgroundColor: colors.surface },
  trophy: { fontSize: 64, lineHeight: 76 },
  headline: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, color: colors.text, letterSpacing: -0.3 },
  center: { textAlign: 'center' },
  value: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, color: colors.yes, fontVariant: ['tabular-nums'], marginTop: spacing.xs },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
});
