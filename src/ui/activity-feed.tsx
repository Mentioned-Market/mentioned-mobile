// "Activity" at the foot of Home: the latest picks across every market as
// rows, stepping through on their own like a departures board. The ticker
// above slides the same feed past as chips; this is the readable version.
//
// A window of `VISIBLE` rows steps up through the newest `POOL` trades, one
// row at a time with a pause on each, then wraps back to the newest. The
// first rows are drawn a second time below the last so the wrap is invisible.
// Each row keeps its real time, so an old trade never passes for a new one,
// and a new trade restarts the board from the top, where it now sits.
//
// A finger on the board holds it still, so a row can be read and tapped.
// With reduce motion on it is a plain list, the same fallback as the ticker.
import { Link, type Href } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import type { TickerItem } from '@/lib/ticker';
import { ago } from '@/lib/time';
import { Card, SectionTitle } from '@/ui/card';
import { colors, fonts, spacing, type } from '@/ui/theme';

/** How many of the newest trades the board steps through. */
const POOL = 10;
/** Rows on screen at once. */
const VISIBLE = 4;
/** Fixed row height, so each step moves exactly one row. */
const ROW = 64;
const HOLD_MS = 2400;
const MOVE_MS = 450;
const EASE = Easing.inOut(Easing.cubic);

const step = (i: number) => withDelay(HOLD_MS, withTiming(-i * ROW, { duration: MOVE_MS, easing: EASE }));

/**
 * The rest of the current pass from step `from`, then every pass after it.
 * Reaching step `n` shows the repeated first rows, identical to step 0, so the
 * jump back to 0 is not seen.
 */
function cycle(n: number, from: number) {
  const rest = [];
  for (let i = from + 1; i <= n; i++) rest.push(step(i));
  const pass = Array.from({ length: n }, (_, k) => step(k + 1));
  return withSequence(...rest, withTiming(0, { duration: 0 }), withRepeat(withSequence(...pass, withTiming(0, { duration: 0 })), -1));
}

export function ActivityFeed({ items, now, focused }: { items: TickerItem[]; now: number; focused: boolean }) {
  const shown = useMemo(() => items.slice(0, POOL), [items]);
  const reduceMotion = useReducedMotion();
  const moving = !reduceMotion && shown.length > VISIBLE;
  const y = useSharedValue(0);
  const newest = shown[0]?.key;

  // Runs only while Home is the tab on screen, and starts again from the top
  // whenever a new trade leads the list.
  useEffect(() => {
    cancelAnimation(y);
    y.set(0);
    if (moving && focused) y.set(cycle(shown.length, 0));
    return () => cancelAnimation(y);
  }, [moving, focused, shown.length, newest, y]);

  const hold = () => cancelAnimation(y);
  const release = () => {
    if (!moving || !focused) return;
    const at = Math.min(shown.length, Math.max(0, Math.round(-y.get() / ROW)));
    y.set(cycle(shown.length, at));
  };

  const board = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  if (shown.length === 0) return null;
  const rows = moving ? [...shown, ...shown.slice(0, VISIBLE)] : shown;

  return (
    <View style={styles.section}>
      <SectionTitle title="Activity" />
      <Card padded={false} style={styles.card}>
        <View style={[styles.window, moving && { height: VISIBLE * ROW }]} onTouchStart={hold} onTouchEnd={release} onTouchCancel={release}>
          <Animated.View style={[styles.board, board]}>
            {rows.map((item, i) => (
              <ActivityRow key={`${i < shown.length ? 'a' : 'b'}:${item.key}`} item={item} now={now} copy={i >= shown.length} />
            ))}
          </Animated.View>
        </View>
      </Card>
    </View>
  );
}

function ActivityRow({ item, now, copy }: { item: TickerItem; now: number; copy: boolean }) {
  // The side is the point of a YES/NO trade; on a majority pick, where there
  // is no side, the word is.
  const tone = item.side === 'YES' ? colors.yes : item.side === 'NO' ? colors.no : colors.gold;
  const when = ago(item.at, now);
  const label = [item.who, item.verb, item.side, item.word, item.amount, item.title, when].filter(Boolean).join(' ');
  // The repeated rows exist only to make the wrap seamless; screen readers
  // should meet each trade once.
  const a11y = copy ? ({ importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const) : {};

  const body = (
    <>
      <View style={styles.avatar}>
        <Text style={styles.initial}>{item.who.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.line} numberOfLines={1}>
          <Text style={styles.who}>{item.who}</Text> {item.verb}
          {item.side ? <Text style={[styles.strong, { color: tone }]}> {item.side}</Text> : null}
          {item.word ? (
            <>
              {item.side ? ' on ' : ' '}
              <Text style={[styles.strong, !item.side && { color: tone }]}>{item.word}</Text>
            </>
          ) : null}
        </Text>
        {item.title ? (
          <Text style={type.muted} numberOfLines={1}>
            {item.title}
          </Text>
        ) : null}
      </View>
      {/* The time sits under the amount, not after the title, where a long
          title would truncate it away. */}
      <View style={styles.right}>
        {item.amount ? <Text style={[styles.amount, { color: tone }]}>{item.amount}</Text> : null}
        {when ? <Text style={styles.when}>{when}</Text> : null}
      </View>
    </>
  );

  if (!item.href) {
    return (
      <View style={styles.row} accessible={!copy} accessibilityLabel={label} {...a11y}>
        {body}
      </View>
    );
  }
  return (
    <Link href={item.href as Href} asChild>
      <Pressable style={styles.row} accessibilityRole="button" accessibilityLabel={label} {...a11y}>
        {body}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { paddingHorizontal: spacing.md },
  window: { overflow: 'hidden' },
  // Every row draws a hairline above itself; lifting the board by one hides
  // the line above whichever row is on top.
  board: { marginTop: -StyleSheet.hairlineWidth },
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  text: { flex: 1, gap: 2 },
  line: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  who: { fontFamily: fonts.semibold, color: colors.text },
  strong: { fontFamily: fonts.semibold, color: colors.text },
  right: { alignItems: 'flex-end', gap: 2 },
  amount: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'] },
  when: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textMuted, fontVariant: ['tabular-nums'] },
});
