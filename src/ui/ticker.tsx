// The trade ticker: recent trades across the app scrolling by in one line,
// the way the website's does. The strip is drawn twice end to end and slid
// left by its own width on a loop, so it never runs out. Tapping a trade
// opens its market. With reduced motion it is a strip that can be scrolled.
import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import type { TickerItem } from '@/lib/ticker';
import { colors, fonts, radius } from '@/ui/theme';

/** Pixels per second the strip moves. */
const SPEED = 55;

export function Ticker({ items }: { items: TickerItem[] }) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || width === 0) return;
    x.set(0);
    x.set(withRepeat(withTiming(-width, { duration: (width / SPEED) * 1000, easing: Easing.linear }), -1, false));
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

  return (
    <View style={styles.wrap}>
      {reduceMotion ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {strip(false)}
        </ScrollView>
      ) : (
        <View style={styles.window}>
          <Animated.View style={[styles.track, style]}>
            {strip(true)}
            {strip(false)}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

function Item({ item }: { item: TickerItem }) {
  const body = (
    <View style={styles.item}>
      <Text style={styles.emoji}>{item.emoji}</Text>
      <Text style={styles.text} numberOfLines={1}>
        <Text style={styles.who}>{item.who}</Text> {item.text}
      </Text>
      <Ionicons name={item.up ? 'arrow-up' : 'arrow-down'} size={14} color={item.up ? colors.yes : colors.no} />
    </View>
  );
  if (!item.href) return body;
  return (
    <Link href={item.href as Href} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.who} ${item.text}`} style={styles.link}>
        {body}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 56, borderRadius: radius.control, backgroundColor: colors.surface, overflow: 'hidden', justifyContent: 'center' },
  window: { flex: 1, overflow: 'hidden', justifyContent: 'center' },
  track: { flexDirection: 'row' },
  strip: { flexDirection: 'row' },
  link: { borderRadius: radius.control },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 56 },
  emoji: { fontSize: 18 },
  text: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.textMuted },
  who: { fontFamily: fonts.semibold, color: colors.text },
});
