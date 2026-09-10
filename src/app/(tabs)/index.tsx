// Home (SPEC v2). The first thing a user sees after the intro: prize pool,
// markets closing soon, their positions or the connect card, the top of the
// leaderboard, and what just resolved.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMemo, useState } from 'react';

import {
  useFreeList,
  useFreeUserActivity,
  useIsScreenFocused,
  useLeaderboard,
  usePaidMajorityList,
  usePaidMajorityUserPositions,
  usePaidMarketsList,
  usePaidMarketUserPositions,
  usePrizePool,
} from '@/api/queries';
import { FLAVOR } from '@/config';
import { shortAddress, usd } from '@/lib/format';
import { countdown, useNow } from '@/lib/time';
import { mergeMarkets } from '@/markets/merge';
import { fromFree, fromPaidMajority, fromPaidYesNo, groupPositions } from '@/markets/positions';
import { useWallet } from '@/store/wallet';
import { SignInCard } from '@/ui/sign-in-card';
import { MarketCard } from '@/ui/market-card';
import { Pill } from '@/ui/pill';
import { ErrorState, Skeleton } from '@/ui/states';
import { colors, fonts, spacing, type } from '@/ui/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function HomeScreen() {
  const focused = useIsScreenFocused();
  const now = useNow(30_000);
  const viewed = useWallet((s) => s.viewedAddress);
  const paidMajority = usePaidMajorityList(focused);
  const paidYesNo = usePaidMarketsList(focused);
  const free = useFreeList(focused);
  const pool = usePrizePool(undefined, focused);
  const board = useLeaderboard('current', viewed, focused);
  const pm = usePaidMajorityUserPositions(viewed, focused);
  const pa = usePaidMarketUserPositions(viewed, focused);
  const fr = useFreeUserActivity(viewed, focused);
  const [refreshing, setRefreshing] = useState(false);

  const markets = useMemo(
    () => mergeMarkets(paidMajority.data ?? [], paidYesNo.data ?? [], free.data ?? [], now),
    [paidMajority.data, paidYesNo.data, free.data, now],
  );
  const closingSoon = markets.filter((m) => m.status === 'open').slice(0, 6);
  const justResolved = markets.filter((m) => m.status === 'resolved').slice(0, 3);
  const listsLoading = paidMajority.isPending || paidYesNo.isPending || free.isPending;
  const listsFailed = paidMajority.isError && paidYesNo.isError && free.isError;

  const positions = useMemo(() => {
    const rows = [...(pm.data ?? []).map(fromPaidMajority), ...(pa.data ?? []).map(fromPaidYesNo), ...(fr.data ? fromFree(fr.data) : [])];
    return groupPositions(rows).summary;
  }, [pm.data, pa.data, fr.data]);

  const refetchAll = () => {
    setRefreshing(true);
    Promise.all([paidMajority.refetch(), paidYesNo.refetch(), free.refetch(), pool.refetch(), board.refetch()]).finally(() => setRefreshing(false));
  };

  const weekEnd = pool.data ? Date.parse(pool.data.weekEnd) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.gold} />}
      >
        <View style={styles.brandRow}>
          <View style={styles.brand}>
            <Image source={require('@/assets/images/logo-mark.png')} style={{ width: 30, height: 24 }} contentFit="contain" />
            <Text style={styles.wordmark}>Mentioned</Text>
            {FLAVOR !== 'production' ? <Pill label={FLAVOR.toUpperCase()} tone="orange" /> : null}
          </View>
          <Link href="/search" asChild>
            <Pressable style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Search">
              <Ionicons name="search" size={20} color={colors.text} />
            </Pressable>
          </Link>
        </View>

        {pool.isPending ? (
          <Skeleton height={96} radius={16} />
        ) : pool.data ? (
          <Link href="/ranks" asChild>
            <Pressable style={styles.poolCard} accessibilityRole="button">
              <View style={{ flex: 1 }}>
                <Text style={type.muted}>Prize pool this week</Text>
                <Text style={styles.poolAmount}>{usd(pool.data.poolUsd)}</Text>
                <Text style={type.muted}>{weekEnd ? `Ends in ${countdown(weekEnd, now)}` : ''} · every point is a raffle ticket</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.gold} />
            </Pressable>
          </Link>
        ) : null}

        <SectionHead title="Closing soon" href="/markets" />
        {listsLoading ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Skeleton height={260} width={260} radius={16} />
            <Skeleton height={260} width={260} radius={16} />
          </View>
        ) : listsFailed ? (
          <ErrorState error={paidMajority.error} onRetry={refetchAll} title="Could not load markets" />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}
            style={{ marginHorizontal: -spacing.md, paddingHorizontal: spacing.md }}
          >
            {closingSoon.map((m) => (
              <MarketCard key={`${m.kind}:${m.id}`} market={m} now={now} compact />
            ))}
          </ScrollView>
        )}

        {viewed ? (
          <Link href="/positions" asChild>
            <Pressable style={styles.card} accessibilityRole="button">
              <View style={styles.cardHead}>
                <Text style={type.heading}>Your positions</Text>
                <Text style={type.muted}>{shortAddress(viewed)}</Text>
              </View>
              <View style={styles.statRow}>
                <Stat label="Open" value={String(positions.open)} />
                <Stat label="At stake" value={usd(positions.stakedUsd)} />
                <Stat label="To claim" value={usd(positions.claimableUsd)} tone={positions.claimableUsd > 0 ? 'up' : undefined} />
              </View>
            </Pressable>
          </Link>
        ) : (
          <SignInCard />
        )}

        <SectionHead title="Top this week" href="/ranks" />
        {board.isPending ? (
          <Skeleton height={140} radius={16} />
        ) : board.data ? (
          <View style={styles.card}>
            {board.data.data.slice(0, 3).map((e, i) => (
              <Link key={e.wallet} href={(e.username ? `/u/${encodeURIComponent(e.username)}` : `/positions?wallet=${e.wallet}`) as Href} asChild>
                <Pressable style={styles.leaderRow} accessibilityRole="button">
                  <Text style={{ fontSize: 18, width: 28 }}>{MEDALS[i]}</Text>
                  <Text style={{ fontSize: 18 }}>{e.pfpEmoji ?? '🙂'}</Text>
                  <Text style={[type.body, { flex: 1, fontFamily: fonts.semibold }]} numberOfLines={1}>
                    {e.username ?? shortAddress(e.wallet)}
                  </Text>
                  <Text style={type.money}>{e.weeklyPoints.toLocaleString()}</Text>
                </Pressable>
              </Link>
            ))}
          </View>
        ) : null}

        {justResolved.length > 0 ? (
          <>
            <SectionHead title="Just resolved" href="/markets" />
            {justResolved.map((m) => (
              <Link
                key={`${m.kind}:${m.id}`}
                href={
                  `/result/${m.kind === 'paid-majority' ? 'majority' : m.kind === 'paid-yesno' ? 'paid' : m.kind === 'free-yesno' ? 'free' : 'free-majority'}/${m.id}` as Href
                }
                asChild
              >
                <Pressable style={styles.resolvedRow} accessibilityRole="button">
                  <View style={styles.thumb}>{m.cover ? <Image source={{ uri: m.cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[type.body, { fontFamily: fonts.semibold }]} numberOfLines={2}>
                      {m.title}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Pill label={m.kind.startsWith('paid') ? 'PAID' : 'FREE'} tone={m.kind.startsWith('paid') ? 'gold' : 'neutral'} />
                      {m.words.find((w) => w.outcome === 'winner') ? (
                        <Pill label={`WON: ${m.words.find((w) => w.outcome === 'winner')?.label}`} tone="green" />
                      ) : null}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              </Link>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHead({ title, href }: { title: string; href: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={type.heading}>{title}</Text>
      <Link href={href as Href} asChild>
        <Pressable accessibilityRole="button" hitSlop={8}>
          <Text style={[type.muted, { color: colors.gold }]}>See all</Text>
        </Pressable>
      </Link>
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={type.muted}>{label}</Text>
      <Text style={[type.money, tone === 'up' && { color: colors.yes }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wordmark: { fontFamily: fonts.bold, fontSize: 24, color: colors.text, letterSpacing: -0.4 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(242,183,31,0.45)',
  },
  poolAmount: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, color: colors.gold, fontVariant: ['tabular-nums'] },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: spacing.xs },
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  leaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  resolvedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
});
