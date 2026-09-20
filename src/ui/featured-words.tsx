// "Trending words": what the rest of the app is trading right now, as a rail
// of cards that open the market the word belongs to.
//
// The same feed the website's sidebar uses. Words whose market this build
// cannot open are dropped rather than shown dead, which is why the list can
// come back shorter than the feed.
import { Link, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useIsScreenFocused, usePaidMajorityMetadata, useTrendingWords } from '@/api/queries';
import { compact } from '@/lib/format';
import { trendingLinks } from '@/lib/trending';
import { Card, SectionTitle } from '@/ui/card';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

const CARD_WIDTH = 190;

export function FeaturedWords({ title = 'Trending words' }: { title?: string }) {
  const focused = useIsScreenFocused();
  const words = useTrendingWords(focused);
  // Majority words name their market by slug; the metadata route is what
  // turns that into an id the app can open. It is prefetched at launch.
  const meta = usePaidMajorityMetadata();

  const links = useMemo(() => {
    const bySlug = new Map((meta.data ?? []).map((m) => [m.slug, m.market_id]));
    return trendingLinks(words.data ?? [], bySlug);
  }, [words.data, meta.data]);

  if (links.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionTitle title={title} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.rail} decelerationRate="fast" snapToInterval={CARD_WIDTH + spacing.sm} snapToAlignment="start">
        {links.map(({ word, href }) => (
          <Link key={word.id} href={href as Href} asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={`${word.word}, ${word.market_title}`} style={styles.card}>
              <View style={styles.head}>
                <Text style={styles.word} numberOfLines={1}>
                  {word.word}
                </Text>
                {word.live ? <View style={styles.live} /> : null}
              </View>
              <Text style={type.muted} numberOfLines={2}>
                {word.market_title}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.meta}>
                {compact(word.trade_count)} {word.trade_count === 1 ? 'trade' : 'trades'} · {compact(word.trader_count)} {word.trader_count === 1 ? 'trader' : 'traders'}
              </Text>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </View>
  );
}

/** The same rail inside a screen that already pads its own gutter. */
export function FeaturedWordsCard() {
  return (
    <Card padded={false} style={{ paddingVertical: spacing.md }}>
      <FeaturedWords />
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  // Bleeds to the screen edges; the cards start at the page gutter.
  bleed: { marginHorizontal: -spacing.md },
  rail: { paddingHorizontal: spacing.md, gap: spacing.sm },
  card: { width: CARD_WIDTH, minHeight: 120, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.surface, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  word: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, color: colors.text, flexShrink: 1 },
  live: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.yes },
  meta: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.textMuted, fontVariant: ['tabular-nums'] },
});
