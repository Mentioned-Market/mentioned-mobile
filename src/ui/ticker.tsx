// The trade ticker: what the rest of the app is doing, sliding past.
//
// Each trade is a chip rather than a run of text, because a sentence moving
// sideways cannot be read in the half second it is on screen: the eye wants a
// name, a side and an amount in fixed places. The side carries the colour, the
// app's convention everywhere else, and it tints the chip's ground and its
// hairline so a glance sorts yes from no before any of it is read. Which
// market family a trade belongs to is in the money unit, dollars against
// tokens, as everywhere else in the app.
//
// It stops while a finger is down. A moving target is a poor thing to tap, and
// stopping also lets someone read the market a trade belongs to before
// deciding to open it.
import { Link, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import type { TickerItem } from '@/lib/ticker';
import { colors, fonts, radius, spacing } from '@/ui/theme';

/** Pixels per second. Slow enough to read a name at arm's length. */
const SPEED = 42;

export function Ticker({ items }: { items: TickerItem[] }) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || width === 0) return;
    x.set(0);
    x.set(loop(width, 0));
    return () => cancelAnimation(x);
  }, [width, reduceMotion, x, items]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  if (items.length === 0) return null;

  const strip = (measure: boolean) => (
    <View style={styles.strip} onLayout={measure ? (e) => setWidth(e.nativeEvent.layout.width) : undefined}>
      {items.map((it) => (
        <Item key={`${measure ? 'a' : 'b'}:${it.key}`} item={it} />
      ))}
    </View>
  );

  if (reduceMotion) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.rail}>
        {strip(false)}
      </ScrollView>
    );
  }

  return (
    <View
      style={styles.bleed}
      // Touch handlers rather than a gesture: the chips inside are links, and
      // a pan would fight them for the responder.
      onTouchStart={() => cancelAnimation(x)}
      onTouchEnd={() => x.set(loop(width, x.get()))}
      onTouchCancel={() => x.set(loop(width, x.get()))}
    >
      <View style={styles.window}>
        <Animated.View style={[styles.track, style]}>
          {strip(true)}
          {strip(false)}
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * Finish the pass that was in progress, then run it again for ever. Two
 * copies of the strip sit end to end, so jumping back to zero at the end of a
 * pass is invisible.
 */
function loop(width: number, from: number) {
  const full = (width / SPEED) * 1000;
  const remaining = Math.max(0, ((width + from) / SPEED) * 1000);
  return withSequence(
    withTiming(-width, { duration: remaining, easing: Easing.linear }),
    withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(-width, { duration: full, easing: Easing.linear })), -1),
  );
}

function Item({ item }: { item: TickerItem }) {
  const tone = item.side === 'YES' ? colors.yes : item.side === 'NO' ? colors.no : colors.gold;
  // One line, so a chip is short enough for two or three to be on screen at
  // once and each can be read whole. The side is the point of a YES/NO trade;
  // on a majority pick, where there is no side, the word is.
  const detail = item.side ?? item.word ?? '';
  const body = (
    <View style={[styles.chip, { backgroundColor: tint(tone, 0.1), borderColor: tint(tone, 0.34) }]}>
      <Text style={styles.who} numberOfLines={1}>
        {item.who}
      </Text>
      <Text style={styles.verb} numberOfLines={1}>
        {item.verb}
      </Text>
      {detail ? (
        <Text style={[styles.detail, { color: tone }]} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      {item.amount ? <Text style={[styles.amount, { color: tone }]}>{item.amount}</Text> : null}
    </View>
  );
  if (!item.href) return body;
  return (
    <Link href={item.href as Href} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.who} ${item.verb} ${detail} ${item.amount}`}>
        {body}
      </Pressable>
    </Link>
  );
}

/** The side's colour at low strength, for a chip's ground and its hairline. */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  // Bleeds to the screen edges; the first chip starts at the page gutter.
  bleed: { marginHorizontal: -spacing.md },
  window: { overflow: 'hidden' },
  rail: { paddingHorizontal: spacing.md },
  track: { flexDirection: 'row' },
  strip: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  who: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18, color: colors.text, maxWidth: 130 },
  verb: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 17, color: colors.textMuted },
  detail: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 17, maxWidth: 110 },
  amount: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18, marginLeft: 2, fontVariant: ['tabular-nums'] },
});
