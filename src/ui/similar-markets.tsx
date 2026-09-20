// "More markets" at the bottom of a market screen: somewhere to go next
// rather than a dead end at the end of a board.
import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useFreeList, useIsScreenFocused, usePaidMajorityList, usePaidMarketsList } from '@/api/queries';
import { tokens as fmtTokens, usd } from '@/lib/format';
import { closesIn } from '@/lib/time';
import { useNow } from '@/lib/use-now';
import { mergeMarkets, type MarketSummary } from '@/markets/merge';
import { similarMarkets } from '@/markets/similar';
import { Card, SectionTitle, rowStyle } from '@/ui/card';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

export function SimilarMarkets({ currentKey }: { currentKey: string }) {
  const focused = useIsScreenFocused();
  const now = useNow(30_000);
  const paidMajority = usePaidMajorityList(focused);
  const paidYesNo = usePaidMarketsList(focused);
  const free = useFreeList(focused);

  const markets = useMemo(
    () => similarMarkets(mergeMarkets(paidMajority.data ?? [], paidYesNo.data ?? [], free.data ?? [], now), currentKey),
    [paidMajority.data, paidYesNo.data, free.data, now, currentKey],
  );

  if (markets.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionTitle title="More markets" />
      <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
        {markets.map((m, i) => (
          <Row key={`${m.kind}:${m.id}`} market={m} now={now} first={i === 0} />
        ))}
      </Card>
    </View>
  );
}

function Row({ market, now, first }: { market: MarketSummary; now: number; first: boolean }) {
  const [failed, setFailed] = useState(false);
  const closes = closesIn(market.lockAt, now);
  const pool = market.pool.kind === 'usdc' ? (market.pool.usd > 0 ? `${usd(market.pool.usd)} pool` : 'USDC') : `${fmtTokens(market.pool.tokens)} tokens`;
  return (
    <Link href={market.href as Href} asChild>
      <Pressable style={rowStyle(first)} accessibilityRole="button" accessibilityLabel={market.title}>
        <View style={styles.thumb}>
          {market.cover && !failed ? (
            <Image source={{ uri: market.cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} onError={() => setFailed(true)} />
          ) : (
            <Text style={{ fontSize: 18 }}>🎯</Text>
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} numberOfLines={2}>
            {market.title}
          </Text>
          <Text style={type.muted} numberOfLines={1}>
            {closes ? <Text style={styles.closes}>{closes}</Text> : null}
            {closes ? ' · ' : ''}
            {pool}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  thumb: { width: 44, height: 44, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text },
  closes: { fontFamily: fonts.semibold, color: colors.gold, fontVariant: ['tabular-nums'] },
});
