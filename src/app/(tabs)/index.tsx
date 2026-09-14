// Home. The first screen after the intro, and the one people land on many times
// a day, so it answers four questions in order and stops: what am I worth, what
// is the pot, what closes next, who is winning, what just settled.
//
// Everything is one row shape inside one card shape. The previous version gave
// each section its own treatment (a wide card rail here, bare rows there) and
// the page read as clutter rather than as a list of answers.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  useUsdcBalance,
} from '@/api/queries';
import { CURRENT_ARENA, arenaStatus } from '@/arena/arenas';
import { FLAVOR } from '@/config';
import { compact as compactNumber, shortAddress, tokens as fmtTokens, usd } from '@/lib/format';
import { closesIn, countdown } from '@/lib/time';
import { useNow } from '@/lib/use-now';
import { mergeMarkets, type MarketKind, type MarketSummary } from '@/markets/merge';
import { fromFree, fromPaidMajority, fromPaidYesNo, groupPositions } from '@/markets/positions';
import { useActiveWallet } from '@/store/active-wallet';
import { Pill } from '@/ui/pill';
import { NotificationBell } from '@/ui/notification-bell';
import { SignInCard } from '@/ui/sign-in-card';
import { Wordmark } from '@/ui/wordmark';
import { ErrorState, Skeleton } from '@/ui/states';
import { colors, fonts, spacing } from '@/ui/theme';

const MEDALS = ['🥇', '🥈', '🥉'];

const RESULT_SEGMENT: Record<MarketKind, string> = {
  'paid-majority': 'majority',
  'paid-yesno': 'paid',
  'free-yesno': 'free',
  'free-majority': 'free-majority',
};

// Three of each. Home is a doorway, not a directory: the "See all" link is the
// answer to wanting more, and a longer list here is what made it feel crowded.
const PER_SECTION = 3;

export default function HomeScreen() {
  const focused = useIsScreenFocused();
  const now = useNow(30_000);
  const wallet = useActiveWallet();

  const paidMajority = usePaidMajorityList(focused);
  const paidYesNo = usePaidMarketsList(focused);
  const free = useFreeList(focused);
  const pool = usePrizePool(undefined, focused);
  const board = useLeaderboard('current', wallet, focused);
  const pm = usePaidMajorityUserPositions(wallet, focused);
  const pa = usePaidMarketUserPositions(wallet, focused);
  const fr = useFreeUserActivity(wallet, focused);
  const balance = useUsdcBalance(wallet, focused);
  const [refreshing, setRefreshing] = useState(false);

  const markets = useMemo(
    () => mergeMarkets(paidMajority.data ?? [], paidYesNo.data ?? [], free.data ?? [], now),
    [paidMajority.data, paidYesNo.data, free.data, now],
  );
  const closingSoon = useMemo(() => markets.filter((m) => m.status === 'open').slice(0, PER_SECTION), [markets]);
  const justResolved = useMemo(() => markets.filter((m) => m.status === 'resolved').slice(0, PER_SECTION), [markets]);
  const listsLoading = paidMajority.isPending || paidYesNo.isPending || free.isPending;
  const listsFailed = paidMajority.isError && paidYesNo.isError && free.isError;

  const positions = useMemo(() => {
    const rows = [
      ...(pm.data ?? []).map(fromPaidMajority),
      ...(pa.data ?? []).map(fromPaidYesNo),
      ...(fr.data ? fromFree(fr.data) : []),
    ];
    return groupPositions(rows).summary;
  }, [pm.data, pa.data, fr.data]);

  const refetchAll = () => {
    setRefreshing(true);
    Promise.all([
      paidMajority.refetch(),
      paidYesNo.refetch(),
      free.refetch(),
      pool.refetch(),
      board.refetch(),
      balance.refetch(),
    ]).finally(() => setRefreshing(false));
  };

  const weekEnd = pool.data ? Date.parse(pool.data.weekEnd) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.gold} />}
      >
        <View style={styles.brand}>
          <Wordmark />
          {FLAVOR !== 'production' ? <Pill label={FLAVOR.toUpperCase()} tone="orange" /> : null}
          <View style={{ flex: 1 }} />
          <NotificationBell focused={focused} />
        </View>

        {wallet ? (
          <PortfolioCard
            wallet={wallet}
            cash={balance.data}
            cashFailed={balance.isError}
            cashPending={balance.isPending}
            stakedUsd={positions.stakedUsd}
            claimableUsd={positions.claimableUsd}
            tokensIn={positions.tokensIn}
          />
        ) : (
          <SignInCard />
        )}

        {pool.isPending ? (
          <Skeleton height={64} radius={14} />
        ) : pool.data ? (
          <Link href="/ranks" asChild>
            <Pressable style={styles.poolStrip} accessibilityRole="button" accessibilityLabel="Prize pool this week">
              <Ionicons name="trophy" size={18} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.poolAmount}>{usd(pool.data.poolUsd)} prize pool</Text>
                <Text style={styles.meta}>{weekEnd ? `Ends in ${countdown(weekEnd, now)}` : 'This week'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.gold} />
            </Pressable>
          </Link>
        ) : null}

        {arenaStatus(CURRENT_ARENA) !== 'ended' ? (
          <Link href="/arena" asChild>
            <Pressable style={styles.poolStrip} accessibilityRole="link" accessibilityLabel={`${CURRENT_ARENA.name} Arena`}>
              <Text style={{ fontSize: 18 }}>{CURRENT_ARENA.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.poolAmount}>{CURRENT_ARENA.name} Arena</Text>
                <Text style={styles.meta}>
                  Top {CURRENT_ARENA.prizes.length} teams share {CURRENT_ARENA.prizePool}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.gold} />
            </Pressable>
          </Link>
        ) : null}

        <Section title="Closing soon" href="/markets">
          {listsLoading ? (
            <RowsSkeleton />
          ) : listsFailed ? (
            <ErrorState error={paidMajority.error} onRetry={refetchAll} title="Could not load markets" />
          ) : closingSoon.length === 0 ? (
            <Text style={[styles.meta, styles.emptyLine]}>Nothing open right now.</Text>
          ) : (
            <View style={styles.card}>
              {closingSoon.map((m, i) => (
                <MarketRow key={`${m.kind}:${m.id}`} market={m} now={now} first={i === 0} />
              ))}
            </View>
          )}
        </Section>

        <Section title="Top this week" href="/ranks">
          {board.isPending ? (
            <RowsSkeleton />
          ) : board.data && board.data.data.length > 0 ? (
            <View style={styles.card}>
              {board.data.data.slice(0, PER_SECTION).map((e, i) => (
                <Link
                  key={e.wallet}
                  href={(e.username ? `/u/${encodeURIComponent(e.username)}` : `/positions?wallet=${e.wallet}`) as Href}
                  asChild
                >
                  <Pressable style={StyleSheet.flatten([styles.row, i > 0 && styles.rowDivider])} accessibilityRole="button">
                    <Text style={styles.medal}>{MEDALS[i]}</Text>
                    <Text style={styles.avatar}>{e.pfpEmoji ?? '🙂'}</Text>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {e.username ?? shortAddress(e.wallet)}
                    </Text>
                    <Text style={styles.rowValue}>{e.weeklyPoints.toLocaleString()}</Text>
                  </Pressable>
                </Link>
              ))}
            </View>
          ) : null}
        </Section>

        {justResolved.length > 0 ? (
          <Section title="Just resolved" href="/markets">
            <View style={styles.card}>
              {justResolved.map((m, i) => (
                <ResolvedRow key={`${m.kind}:${m.id}`} market={m} first={i === 0} />
              ))}
            </View>
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Portfolio ───────────────────────────────────────────────────────────────

/**
 * What the wallet is worth, as one number plus the three parts that make it.
 *
 * Cash comes from the chain and the two stakes come from the API, so they can
 * fail apart. When the chain read fails, cash reads "—" and the total silently
 * omits it rather than showing a confident wrong number.
 */
function PortfolioCard({
  wallet,
  cash,
  cashFailed,
  cashPending,
  stakedUsd,
  claimableUsd,
  tokensIn,
}: {
  wallet: string;
  cash: number | undefined;
  cashFailed: boolean;
  cashPending: boolean;
  stakedUsd: number;
  claimableUsd: number;
  tokensIn: number;
}) {
  const total = (cash ?? 0) + stakedUsd + claimableUsd;

  return (
    <Link href="/positions" asChild>
      <Pressable style={styles.portfolio} accessibilityRole="button" accessibilityLabel="Your portfolio">
        <View style={styles.portfolioHead}>
          <Text style={styles.meta}>Your portfolio</Text>
          <Text style={styles.meta}>{shortAddress(wallet)}</Text>
        </View>

        {cashPending ? (
          <Skeleton height={40} width="60%" radius={8} />
        ) : (
          <Text style={styles.portfolioTotal}>{usd(total)}</Text>
        )}

        <View style={styles.statRow}>
          <Stat label="Cash" value={cashFailed ? '—' : usd(cash ?? 0)} />
          <Stat label="At stake" value={usd(stakedUsd)} />
          <Stat label="To claim" value={usd(claimableUsd)} tone={claimableUsd > 0 ? 'up' : undefined} />
        </View>

        {tokensIn > 0 ? <Text style={styles.meta}>{fmtTokens(tokensIn)} play tokens in free markets</Text> : null}
      </Pressable>
    </Link>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone === 'up' && { color: colors.yes }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ── Rows ────────────────────────────────────────────────────────────────────

function MarketRow({ market, now, first }: { market: MarketSummary; now: number; first: boolean }) {
  const closes = closesIn(market.lockAt, now);
  const pool =
    market.pool.kind === 'usdc'
      ? market.pool.usd > 0
        ? `${usd(market.pool.usd)} pool`
        : 'USDC'
      : `${fmtTokens(market.pool.tokens)} tokens`;

  return (
    <Link href={market.href as Href} asChild>
      <Pressable
        style={StyleSheet.flatten([styles.row, first ? null : styles.rowDivider])}
        accessibilityRole="button"
        accessibilityLabel={market.title}
      >
        <Thumb uri={market.cover} />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {market.title}
          </Text>
          {/* The countdown sits on the meta line rather than in its own column:
              as a column it stole enough width to truncate most titles mid-word. */}
          <Text style={styles.meta} numberOfLines={1}>
            {closes ? <Text style={styles.countdown}>{closes}</Text> : null}
            {closes ? ' · ' : ''}
            {pool} · {compactNumber(market.traderCount)} traders
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

function ResolvedRow({ market, first }: { market: MarketSummary; first: boolean }) {
  // The two market families label a win differently: majority markets mark the
  // winning word 'winner', yes/no markets mark each word 'yes' or 'no'. Looking
  // only for 'winner' left every settled yes/no market reading a bare
  // "Resolved", which is the least interesting thing we know about it.
  const winner = market.words.find((w) => w.outcome === 'winner') ?? market.words.find((w) => w.outcome === 'yes');
  const settledWords = market.words.some((w) => w.outcome !== null);
  const href = `/result/${RESULT_SEGMENT[market.kind]}/${market.id}` as Href;

  return (
    <Link href={href} asChild>
      <Pressable
        style={StyleSheet.flatten([styles.row, first ? null : styles.rowDivider])}
        accessibilityRole="button"
        accessibilityLabel={market.title}
      >
        <Thumb uri={market.cover} />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {market.title}
          </Text>
          {winner ? (
            <Pill label={`Won: ${winner.label}`} tone="green" />
          ) : settledWords ? (
            <Text style={styles.meta}>No word hit</Text>
          ) : (
            <Text style={styles.meta}>Resolved</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    </Link>
  );
}

function Thumb({ uri }: { uri: string | null }) {
  // A cover that 404s or times out otherwise leaves a blank square, which reads
  // as a broken row rather than as a market without art.
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.thumb}>
      {uri && !failed ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} onError={() => setFailed(true)} />
      ) : (
        <Text style={{ fontSize: 20 }}>🎯</Text>
      )}
    </View>
  );
}

// ── Section chrome ──────────────────────────────────────────────────────────

function Section({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Link href={href as Href} asChild>
          <Pressable accessibilityRole="button" hitSlop={10}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </Link>
      </View>
      {children}
    </View>
  );
}

function RowsSkeleton() {
  return (
    <View style={[styles.card, { gap: spacing.sm }]}>
      <Skeleton height={44} radius={10} />
      <Skeleton height={44} radius={10} />
      <Skeleton height={44} radius={10} />
    </View>
  );
}

// A Pressable used as `<Link asChild>`'s child must be given a FLAT style.
// expo-router clones the child to inject its own props and throws on an array,
// which is why the row styles below go through StyleSheet.flatten.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.xs },

  portfolio: {
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(242,183,31,0.35)',
    gap: spacing.sm,
  },
  portfolioHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  portfolioTotal: { fontFamily: fonts.bold, fontSize: 36, lineHeight: 42, color: colors.text, fontVariant: ['tabular-nums'] },
  statRow: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  stat: { flex: 1, gap: 2 },
  statLabel: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  statValue: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.text, fontVariant: ['tabular-nums'] },

  poolStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: 14,
    backgroundColor: 'rgba(242,183,31,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(242,183,31,0.28)',
  },
  poolAmount: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.gold, fontVariant: ['tabular-nums'] },

  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, color: colors.text },
  seeAll: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.gold },

  card: { borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, paddingVertical: spacing.sm + 4, minHeight: 64 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text },
  // Sits directly in the row rather than in a body column, so it takes the slack.
  rowName: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text, flex: 1 },
  rowValue: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text, fontVariant: ['tabular-nums'] },
  meta: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  emptyLine: { paddingVertical: spacing.sm },
  countdown: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gold, fontVariant: ['tabular-nums'] },

  thumb: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  medal: { fontSize: 18, width: 26 },
  avatar: { fontSize: 18 },
});
