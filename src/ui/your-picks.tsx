// "Your picks" on Home: winnings waiting to be claimed, then the markets you
// have open positions in, soonest to close first. The reason to open the app
// between events, so it sits right under the season's hero.
//
// Nothing renders when signed out or when there is nothing open or owed: Home
// does not carry an empty state for a section the player has not started.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usd } from '@/lib/format';
import { useCountdown } from '@/lib/use-countdown';
import type { PositionGroups } from '@/lib/use-position-groups';
import { homePicks, type HomePick } from '@/markets/home-picks';
import type { MarketSummary } from '@/markets/merge';
import { Card, SeeAll, SectionTitle, rowStyle } from '@/ui/card';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

export function YourPicks({ wallet, groups, markets, now }: { wallet: string | null; groups: PositionGroups; markets: MarketSummary[]; now: number }) {
  const { picks, total } = useMemo(() => homePicks(groups.open, markets, now), [groups.open, markets, now]);
  const claimable = groups.summary.claimableUsd;

  if (!wallet || (picks.length === 0 && claimable <= 0)) return null;

  return (
    <View style={styles.section}>
      <SectionTitle title="Your picks" right={<SeeAll href="/positions" label={total > picks.length ? `See all ${total}` : 'See all'} />} />
      <Card padded={false} style={styles.card}>
        {claimable > 0 ? (
          <Link href="/positions" asChild>
            <Pressable style={rowStyle(true)} accessibilityRole="button" accessibilityLabel={`${usd(claimable)} to claim`}>
              <View style={[styles.thumb, styles.claimIcon]}>
                <Ionicons name="trophy" size={20} color={colors.gold} />
              </View>
              <View style={styles.text}>
                <Text style={styles.claimTitle}>{usd(claimable)} to claim</Text>
                <Text style={type.muted}>Collect your winnings</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </Link>
        ) : null}
        {picks.map((p, i) => (
          <PickRow key={p.key} pick={p} first={i === 0 && claimable <= 0} />
        ))}
      </Card>
    </View>
  );
}

function PickRow({ pick, first }: { pick: HomePick; first: boolean }) {
  const [failed, setFailed] = useState(false);
  // In its last hour the countdown ticks by the second on this row alone.
  const countdown = useCountdown(pick.closing ? pick.lockAt : null);
  const when = countdown.text ?? pick.when;
  return (
    <Link href={pick.href as Href} asChild>
      <Pressable style={rowStyle(first)} accessibilityRole="button" accessibilityLabel={`${pick.title}, ${pick.value}${when ? `, ${when}` : ''}`}>
        <View style={styles.thumb}>
          {pick.cover && !failed ? (
            <Image source={{ uri: pick.cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} onError={() => setFailed(true)} />
          ) : (
            <Text style={{ fontSize: 18 }}>{pick.paid ? '💵' : '🎟️'}</Text>
          )}
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {pick.title}
          </Text>
          <Text style={type.muted} numberOfLines={1}>
            {pick.value}
            {when ? <Text style={pick.closing ? styles.when : undefined}> · {when}</Text> : null}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { paddingHorizontal: spacing.md },
  thumb: { width: 44, height: 44, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  claimIcon: { backgroundColor: colors.goldTint },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text },
  claimTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.gold, fontVariant: ['tabular-nums'] },
  when: { color: colors.gold, fontVariant: ['tabular-nums'] },
});
