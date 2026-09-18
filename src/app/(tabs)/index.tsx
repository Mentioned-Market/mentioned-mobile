// Home. The first screen after the intro, and the one people land on many times
// a day, so it answers three questions in order and stops: who is winning this
// week, what closes next, what just settled. An open Arena season leads.
//
// Each answer has its own shape (docs/DESIGN.md): the week is a podium on a
// gold card, what closes next is a rail of cover images, what settled is a
// grid of tiles. Three lists of rows said the same things and looked like a
// spreadsheet.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFreeList, useIsScreenFocused, useLeaderboard, usePaidMajorityList, usePaidMarketsList, usePrizePool, useRecentTrades } from '@/api/queries';
import type { LeaderboardEntry } from '@/api/user';
import { CURRENT_ARENA, arenaStatus } from '@/arena/arenas';
import { FLAVOR } from '@/config';
import { shortAddress, tokens as fmtTokens, usd } from '@/lib/format';
import { closesIn, countdown } from '@/lib/time';
import { formatCountdown, leaderboardPool, seasonCountdown } from '@/lib/arena-view';
import { tickerItems } from '@/lib/ticker';
import { useNow } from '@/lib/use-now';
import { mergeMarkets, type MarketKind, type MarketSummary } from '@/markets/merge';
import { useActiveWallet } from '@/store/active-wallet';
import { Card, SectionTitle } from '@/ui/card';
import { NotificationBell } from '@/ui/notification-bell';
import { Pill } from '@/ui/pill';
import { ErrorState, RowsSkeleton } from '@/ui/states';
import { Ticker } from '@/ui/ticker';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';
import { Wordmark } from '@/ui/wordmark';

const MEDALS = ['🥇', '🥈', '🥉'];

const RESULT_SEGMENT: Record<MarketKind, string> = {
  'paid-majority': 'majority',
  'paid-yesno': 'paid',
  'free-yesno': 'free',
  'free-majority': 'free-majority',
};

const CLOSING_SHOWN = 6;
const RESOLVED_SHOWN = 4;

const playerHref = (e: LeaderboardEntry) => (e.username ? `/u/${encodeURIComponent(e.username)}` : `/positions?wallet=${e.wallet}`) as Href;

export default function HomeScreen() {
  const focused = useIsScreenFocused();
  const now = useNow(30_000);
  const wallet = useActiveWallet();

  const paidMajority = usePaidMajorityList(focused);
  const paidYesNo = usePaidMarketsList(focused);
  const free = useFreeList(focused);
  const pool = usePrizePool(undefined, focused);
  const board = useLeaderboard('current', wallet, focused);
  const trades = useRecentTrades(focused);
  const ticker = useMemo(() => tickerItems(trades.data ?? []).slice(0, 20), [trades.data]);
  const [refreshing, setRefreshing] = useState(false);

  const markets = useMemo(
    () => mergeMarkets(paidMajority.data ?? [], paidYesNo.data ?? [], free.data ?? [], now),
    [paidMajority.data, paidYesNo.data, free.data, now],
  );
  const closingSoon = useMemo(() => markets.filter((m) => m.status === 'open').slice(0, CLOSING_SHOWN), [markets]);
  const justResolved = useMemo(() => markets.filter((m) => m.status === 'resolved').slice(0, RESOLVED_SHOWN), [markets]);
  const listsFailed = paidMajority.isError && paidYesNo.isError && free.isError;
  // A first load only; a poll that fails must not take the rows off the screen.
  const listsLoading = [paidMajority, paidYesNo, free].every((q) => q.data === undefined) && !listsFailed;

  const refetchAll = () => {
    setRefreshing(true);
    Promise.all([paidMajority.refetch(), paidYesNo.refetch(), free.refetch(), pool.refetch(), board.refetch(), trades.refetch()]).finally(() => setRefreshing(false));
  };

  const weekEnd = pool.data ? Date.parse(pool.data.weekEnd) : null;
  const top = (board.data?.data ?? []).slice(0, 3);
  const arena = arenaStatus(CURRENT_ARENA);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.gold} />}
      >
        <View style={styles.brand}>
          <Wordmark size={24} />
          {FLAVOR !== 'production' ? <Pill label={FLAVOR.toUpperCase()} tone="orange" /> : null}
          <View style={{ flex: 1 }} />
          <NotificationBell focused={focused} />
        </View>

        {arena !== 'ended' ? (
          <Link href="/arena" asChild>
            <Pressable style={styles.arenaRow} accessibilityRole="link" accessibilityLabel={`${CURRENT_ARENA.name} Arena`}>
              <View style={styles.iconCircle}>
                <Text style={{ fontSize: 22 }}>{CURRENT_ARENA.emoji}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowTitle}>{CURRENT_ARENA.name} Arena</Text>
                <ArenaLine />
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </Link>
        ) : null}

        {board.isPending && !board.data && pool.isPending ? (
          <RowsSkeleton />
        ) : board.isError && !board.data ? (
          <ErrorState error={board.error} onRetry={() => board.refetch()} title="Could not load the leaderboard" />
        ) : (
          <Link href="/ranks" asChild>
            <Pressable style={styles.poolCard} accessibilityRole="button" accessibilityLabel="Prize pool and leaderboard">
              <View style={styles.poolHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.poolLabel}>Prize pool this week</Text>
                  <Text style={styles.poolAmount}>{pool.data ? usd(pool.data.poolUsd) : '—'}</Text>
                </View>
                <View style={styles.poolEnds}>
                  <Ionicons name="time-outline" size={14} color={colors.gold} />
                  <Text style={styles.poolEndsText}>{weekEnd ? `Ends in ${countdown(weekEnd, now)}` : 'This week'}</Text>
                </View>
              </View>
              {top.length === 0 ? (
                <Text style={type.muted}>No points yet this week. Make a pick to get on the board.</Text>
              ) : (
                <Podium top={top} you={wallet} />
              )}
            </Pressable>
          </Link>
        )}

        <View style={styles.section}>
          <SectionTitle title="Closing soon" right={<SeeAll href="/markets" />} />
          {listsLoading ? (
            <RowsSkeleton />
          ) : listsFailed ? (
            <ErrorState error={paidMajority.error} onRetry={refetchAll} title="Could not load markets" />
          ) : closingSoon.length === 0 ? (
            <Card>
              <Text style={type.muted}>Nothing open right now.</Text>
            </Card>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} style={styles.railBleed} decelerationRate="fast" snapToInterval={RAIL_CARD + spacing.sm} snapToAlignment="start">
              {closingSoon.map((m) => (
                <ClosingCard key={`${m.kind}:${m.id}`} market={m} now={now} />
              ))}
            </ScrollView>
          )}
        </View>

        {ticker.length > 0 ? <Ticker items={ticker} /> : null}

        {justResolved.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle title="Just resolved" />
            <ResolvedGrid markets={justResolved} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** "Starts in 9d 02h" or "Ends in 13d 04h", on its own clock so only this line ticks. */
function ArenaLine() {
  const now = useNow(1000);
  const c = seasonCountdown(CURRENT_ARENA, now);
  const pool = `top ${CURRENT_ARENA.prizes.length} share ${leaderboardPool(CURRENT_ARENA)}`;
  return (
    <Text style={type.muted} numberOfLines={1}>
      {c ? <Text style={styles.countdown}>{`${c.label} ${formatCountdown(c.ms)}`}</Text> : 'Live'} · {pool}
    </Text>
  );
}

// ── Podium ──────────────────────────────────────────────────────────────────

/** Second, first, third: the leader in the middle and a step taller. */
function Podium({ top, you }: { top: LeaderboardEntry[]; you: string | null }) {
  const order = [top[1], top[0], top[2]];
  return (
    <View style={styles.podium}>
      {order.map((e, i) => {
        if (!e) return <View key={`empty${i}`} style={styles.podiumSlot} />;
        const rank = i === 1 ? 0 : i === 0 ? 1 : 2;
        const lead = rank === 0;
        return (
          <Link key={e.wallet} href={playerHref(e)} asChild>
            <Pressable style={styles.podiumSlot} accessibilityRole="button" accessibilityLabel={`View ${e.username ?? shortAddress(e.wallet)}`}>
              <View style={[styles.podiumAvatar, lead && styles.podiumAvatarLead, you === e.wallet && styles.podiumYou]}>
                <Text style={{ fontSize: lead ? 30 : 24 }}>{e.pfpEmoji ?? '🙂'}</Text>
                <Text style={styles.podiumMedal}>{MEDALS[rank]}</Text>
              </View>
              <Text style={[styles.podiumName, lead && { color: colors.text }]} numberOfLines={1}>
                {e.username ?? shortAddress(e.wallet)}
              </Text>
              <Text style={styles.podiumPoints}>{e.weeklyPoints.toLocaleString()} pts</Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

// ── Closing soon rail ───────────────────────────────────────────────────────

const RAIL_CARD = 236;

function ClosingCard({ market, now }: { market: MarketSummary; now: number }) {
  const [failed, setFailed] = useState(false);
  const closes = closesIn(market.lockAt, now);
  const pool = market.pool.kind === 'usdc' ? (market.pool.usd > 0 ? `${usd(market.pool.usd)} pool` : 'USDC') : `${fmtTokens(market.pool.tokens)} tokens`;
  const hasCover = !!market.cover && !failed;
  return (
    <Link href={market.href as Href} asChild>
      <Pressable style={styles.railCard} accessibilityRole="button" accessibilityLabel={market.title}>
        {hasCover ? <Image source={{ uri: market.cover as string }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setFailed(true)} /> : null}
        {/* Two overlays stand in for a gradient: a light wash over the whole
            image and a heavier one behind the text. */}
        {hasCover ? <View style={[StyleSheet.absoluteFill, styles.wash]} /> : null}
        <View style={styles.railTop}>
          {closes ? <Pill label={closes} tone="dark" /> : null}
          <Pill label={pool} tone="dark" />
        </View>
        <View style={styles.railBottom}>
          <Text style={styles.railTitle} numberOfLines={3}>
            {market.title}
          </Text>
        </View>
        {!hasCover ? <Text style={styles.railEmoji}>🎯</Text> : null}
      </Pressable>
    </Link>
  );
}

// ── Just resolved grid ──────────────────────────────────────────────────────

function ResolvedGrid({ markets }: { markets: MarketSummary[] }) {
  const { width } = useWindowDimensions();
  const tile = (width - spacing.md * 2 - spacing.sm) / 2;
  return (
    <View style={styles.grid}>
      {markets.map((m) => (
        <ResolvedTile key={`${m.kind}:${m.id}`} market={m} width={tile} />
      ))}
    </View>
  );
}

function ResolvedTile({ market, width }: { market: MarketSummary; width: number }) {
  const [failed, setFailed] = useState(false);
  const href = `/result/${RESULT_SEGMENT[market.kind]}/${market.id}` as Href;
  return (
    <Link href={href} asChild>
      <Pressable style={StyleSheet.flatten([styles.tile, { width }])} accessibilityRole="button" accessibilityLabel={market.title}>
        <View style={styles.tileThumb}>
          {market.cover && !failed ? (
            <Image source={{ uri: market.cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} onError={() => setFailed(true)} />
          ) : (
            <Text style={{ fontSize: 18 }}>🎯</Text>
          )}
        </View>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {market.title}
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.tileMeta}>See result</Text>
      </Pressable>
    </Link>
  );
}

function SeeAll({ href }: { href: string }) {
  return (
    <Link href={href as Href} asChild>
      <Pressable accessibilityRole="button" hitSlop={10}>
        <Text style={styles.seeAll}>See all</Text>
      </Pressable>
    </Link>
  );
}

// A Pressable used as `<Link asChild>`'s child must be given a FLAT style.
// expo-router clones the child to inject its own props and throws on an array.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  section: { gap: spacing.sm },
  seeAll: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text },
  countdown: { fontFamily: fonts.semibold, color: colors.gold, fontVariant: ['tabular-nums'] },

  // Prize pool and podium
  poolCard: { padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.goldTint, gap: spacing.md },
  poolHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  poolLabel: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.gold },
  poolAmount: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 48, color: colors.text, fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  poolEnds: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: radius.control, backgroundColor: 'rgba(0,0,0,0.35)' },
  poolEndsText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  podiumSlot: { flex: 1, alignItems: 'center', gap: 4 },
  podiumAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  podiumAvatarLead: { width: 72, height: 72, borderRadius: 36, marginBottom: 4 },
  podiumYou: { borderWidth: 2, borderColor: colors.gold },
  podiumMedal: { position: 'absolute', right: -4, bottom: -4, fontSize: 18 },
  podiumName: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.textMuted, maxWidth: '100%' },
  podiumPoints: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.gold, fontVariant: ['tabular-nums'] },

  // Arena
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' },
  arenaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.surface },

  // Closing soon rail: bleeds to the screen edges, cards start at the gutter.
  railBleed: { marginHorizontal: -spacing.md },
  rail: { paddingHorizontal: spacing.md, gap: spacing.sm },
  railCard: { width: RAIL_CARD, height: 180, borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden', padding: spacing.sm + 4, justifyContent: 'space-between' },
  wash: { backgroundColor: 'rgba(0,0,0,0.45)' },
  railTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  railBottom: { gap: 4 },
  railTitle: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21, color: colors.text, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  railEmoji: { position: 'absolute', right: spacing.md, top: '38%', fontSize: 40, opacity: 0.35 },

  // Just resolved grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { minHeight: 132, padding: spacing.sm + 4, borderRadius: radius.card, backgroundColor: colors.surface, gap: spacing.sm },
  tileThumb: { width: 40, height: 40, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  tileTitle: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, color: colors.text },
  tileMeta: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.gold },
});
