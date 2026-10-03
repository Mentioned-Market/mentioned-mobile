// Home. The first screen after the intro, and the one people land on many times
// a day. Signed out, it opens on what Mentioned is (HowItWorks). Then it
// answers, in order: what you have riding (when signed in), what
// closes next, who is winning this week, what just settled. An open Arena
// season leads, and while it is live the week's prize pool and podium are not
// shown at all: the weekly board is paused then, so its card would advertise a
// $0.00 pool nobody can win. Below that, the latest picks across every market,
// which is the part worth scrolling for.
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
import { shortAddress, usd } from '@/lib/format';
import { countdown } from '@/lib/time';
import { weeklyPaused } from '@/lib/arena-view';
import { tickerItems } from '@/lib/ticker';
import { useCountdown } from '@/lib/use-countdown';
import { useNow } from '@/lib/use-now';
import { usePositionGroups } from '@/lib/use-position-groups';
import { useStandingChange } from '@/lib/use-standing-change';
import { poolLabel } from '@/markets/game';
import { isPaid, mergeMarkets, type MarketKind, type MarketSummary } from '@/markets/merge';
import { useActiveWallet } from '@/store/active-wallet';
import { useSession } from '@/store/session';
import { ActivityFeed } from '@/ui/activity-feed';
import { Card, SeeAll, SectionTitle } from '@/ui/card';
import { HeaderActions } from '@/ui/header-actions';
import { HowItWorks } from '@/ui/how-it-works';
import { Pill } from '@/ui/pill';
import { FeaturedWords } from '@/ui/featured-words';
import { LiveNumber } from '@/ui/live-number';
import { PressableScale } from '@/ui/pressable-scale';
import { SeekerOffer } from '@/ui/seeker-offer';
import { Ticker } from '@/ui/ticker';
import { ErrorState, RowsSkeleton } from '@/ui/states';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';
import { ArenaHero } from '@/ui/arena-hero';
import { Wordmark } from '@/ui/wordmark';
import { WinMoment } from '@/ui/win-moment';
import { YourPicks } from '@/ui/your-picks';

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
  // Signed in, not just looking at a Seeker wallet: the newcomer card stays
  // until there is an account to play from.
  const signedIn = useSession((s) => s.wallet) !== null;

  const paidMajority = usePaidMajorityList(focused);
  const paidYesNo = usePaidMarketsList(focused);
  const free = useFreeList(focused);
  // A season in progress is what Home leads with. Before kickoff the week still
  // runs, so its prize pool and podium sit below the ticker; once the season is
  // live the weekly board is paused and Home does not show it. The pool is not
  // fetched then; the board still is, because points keep accruing through a
  // season and the "points since your last visit" toast is read from it.
  const arenaOpen = arenaStatus(CURRENT_ARENA) !== 'ended';
  const weeklyOff = weeklyPaused(CURRENT_ARENA);
  const pool = usePrizePool(undefined, focused && !weeklyOff);
  const board = useLeaderboard('current', wallet, focused);
  const trades = useRecentTrades(focused);
  // One feed, two views: the ticker slides the latest twenty past, Activity
  // steps through the latest ten as rows (src/ui/activity-feed.tsx).
  const trade = useMemo(() => tickerItems(trades.data ?? []), [trades.data]);
  const ticker = useMemo(() => trade.slice(0, 20), [trade]);
  const positions = usePositionGroups(wallet, focused);
  const { standing, change } = useStandingChange(wallet, board.data, focused);
  const [refreshing, setRefreshing] = useState(false);

  const markets = useMemo(
    () => mergeMarkets(paidMajority.data ?? [], paidYesNo.data ?? [], free.data ?? [], now),
    [paidMajority.data, paidYesNo.data, free.data, now],
  );
  const closingSoon = useMemo(() => markets.filter((m) => m.status === 'open').slice(0, CLOSING_SHOWN), [markets]);
  // Where "Try it free" goes: the free market closing soonest.
  const tryHref = useMemo(() => markets.find((m) => m.status === 'open' && !isPaid(m))?.href ?? '/markets', [markets]);
  const justResolved = useMemo(() => markets.filter((m) => m.status === 'resolved').slice(0, RESOLVED_SHOWN), [markets]);
  const listsFailed = paidMajority.isError && paidYesNo.isError && free.isError;
  // A first load only; a poll that fails must not take the rows off the screen.
  const listsLoading = [paidMajority, paidYesNo, free].every((q) => q.data === undefined) && !listsFailed;

  const refetchAll = () => {
    setRefreshing(true);
    Promise.all([paidMajority.refetch(), paidYesNo.refetch(), free.refetch(), ...(weeklyOff ? [] : [pool.refetch()]), board.refetch(), trades.refetch(), positions.refetch()]).finally(() =>
      setRefreshing(false),
    );
  };

  const weekEnd = pool.data ? Date.parse(pool.data.weekEnd) : null;
  const top = (board.data?.data ?? []).slice(0, 3);

  /** The week's prize pool and its podium; placed above or below by `arenaOpen`, and absent while the week is paused. */
  const weeklyBoard = weeklyOff ? null :
    board.isPending && !board.data && pool.isPending ? (
      <RowsSkeleton />
    ) : board.isError && !board.data ? (
      <ErrorState error={board.error} onRetry={() => board.refetch()} title="Could not load the leaderboard" />
    ) : (
      <Link href="/ranks" asChild>
        <PressableScale style={styles.poolCard} accessibilityRole="button" accessibilityLabel="Prize pool and leaderboard">
          <View style={styles.poolHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.poolLabel}>Prize pool this week</Text>
              {pool.data ? <LiveNumber value={pool.data.poolUsd} format={usd} style={styles.poolAmount} /> : <Text style={styles.poolAmount}>—</Text>}
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
          {standing ? <YourWeek rank={standing.rank} points={standing.points} change={change} /> : null}
        </PressableScale>
      </Link>
    );

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
          <HeaderActions />
        </View>

        {/* Before anything else, what this app is, for someone who does not know yet. */}
        {!signedIn ? <HowItWorks tryHref={tryHref} /> : null}

        {arenaOpen ? <ArenaHero /> : weeklyBoard}

        {/* A Seeker owner's first pick, paid for; only while the stake is on offer. */}
        <SeekerOffer />

        <YourPicks wallet={wallet} groups={positions} markets={markets} now={now} />

        <View style={styles.section}>
          <SectionTitle title="Markets closing soon" right={<SeeAll href="/markets" />} />
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
                <ClosingCard key={`${m.kind}:${m.id}`} market={m} />
              ))}
            </ScrollView>
          )}
        </View>

        {ticker.length > 0 ? <Ticker items={ticker} /> : null}

        {arenaOpen ? weeklyBoard : null}

        {justResolved.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle title="Just resolved" />
            <ResolvedGrid markets={justResolved} />
          </View>
        ) : null}
        <FeaturedWords />

        <ActivityFeed items={trade} now={now} focused={focused} />

        <Link href="/markets" asChild>
          <Pressable style={styles.browse} accessibilityRole="button">
            <Text style={styles.browseText}>Browse all markets</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.gold} />
          </Pressable>
        </Link>
      </ScrollView>
      <WinMoment wallet={wallet} groups={positions} focused={focused} />
    </SafeAreaView>
  );
}

// ── Your week ───────────────────────────────────────────────────────────────

/** The player's own line under the podium, with what moved since they last looked. */
function YourWeek({ rank, points, change }: { rank: number | null; points: number; change: { points: number; places: number } | null }) {
  const places = change?.places ?? 0;
  return (
    <View style={styles.week}>
      <Text style={styles.weekText}>
        {rank !== null ? `You're #${rank} this week` : 'Your week'} · {points.toLocaleString()} pts
      </Text>
      {places !== 0 ? (
        <View style={[styles.move, places < 0 && styles.moveDown]}>
          <Ionicons name={places > 0 ? 'caret-up' : 'caret-down'} size={12} color={places > 0 ? colors.yes : colors.no} />
          <Text style={[styles.moveText, places < 0 && { color: colors.no }]}>{Math.abs(places)}</Text>
        </View>
      ) : null}
      {change && change.points > 0 ? <Text style={styles.gained}>+{change.points.toLocaleString()}</Text> : null}
    </View>
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

function ClosingCard({ market }: { market: MarketSummary }) {
  const [failed, setFailed] = useState(false);
  // Ticks by the second, in gold, in the market's last hour.
  const { text: closes, urgent } = useCountdown(market.lockAt);
  const pool = poolLabel(market.pool);
  const hasCover = !!market.cover && !failed;
  return (
    <Link href={market.href as Href} asChild>
      <PressableScale style={styles.railCard} accessibilityRole="button" accessibilityLabel={market.title}>
        {hasCover ? <Image source={{ uri: market.cover as string }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setFailed(true)} /> : null}
        {/* Two overlays stand in for a gradient: a light wash over the whole
            image and a heavier one behind the text. */}
        {hasCover ? <View style={[StyleSheet.absoluteFill, styles.wash]} /> : null}
        <View style={styles.railTop}>
          {closes ? <Pill label={closes} tone={urgent ? 'gold' : 'dark'} /> : null}
          <Pill label={pool} tone="dark" />
        </View>
        <View style={styles.railBottom}>
          <Text style={styles.railTitle} numberOfLines={3}>
            {market.title}
          </Text>
        </View>
        {!hasCover ? <Text style={styles.railEmoji}>🎯</Text> : null}
      </PressableScale>
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
      <PressableScale style={StyleSheet.flatten([styles.tile, { width }])} accessibilityRole="button" accessibilityLabel={market.title}>
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
      </PressableScale>
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
  browse: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md },
  browseText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.gold },
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
  week: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(242,183,31,0.3)' },
  weekText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.text, fontVariant: ['tabular-nums'] },
  move: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, height: 24, borderRadius: radius.control, backgroundColor: colors.yesTint },
  moveDown: { backgroundColor: colors.noTint },
  moveText: { fontFamily: fonts.bold, fontSize: 13, color: colors.yes, fontVariant: ['tabular-nums'] },
  gained: { fontFamily: fonts.bold, fontSize: 14, color: colors.gold, fontVariant: ['tabular-nums'] },
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
  // Wraps: the countdown and "Free · 300 play tokens" together are wider than a card.
  railTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
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
