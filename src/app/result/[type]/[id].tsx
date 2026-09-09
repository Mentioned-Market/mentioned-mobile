// Result screen for every market family (SPEC v1 step 2). `type` is one of
// majority | paid | free | free-majority. Public routes only.
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  useFreeMarket,
  useFreeResults,
  useIsScreenFocused,
  usePaidMajorityMarket,
  usePaidMajorityMetadata,
  usePaidMajorityResults,
  usePaidMarket,
  usePaidMarketChart,
  usePaidMarketMetadata,
  usePaidMarketTrades,
} from '@/api/queries';
import { deserializeMarketAccount, impliedYesPrice } from '@/chain/amm';
import { deserializeMajorityMarket, WordOutcome } from '@/chain/majority';
import { base64ToBytes } from '@/lib/bytes';
import { cents, shortAddress, tokens, usd, usdc } from '@/lib/format';
import { toMs, useNow } from '@/lib/time';
import { useWallet } from '@/store/wallet';
import { MarketHeader } from '@/ui/market-header';
import { Pill } from '@/ui/pill';
import { Screen } from '@/ui/screen';
import { CardSkeleton, EmptyState, ErrorState } from '@/ui/states';
import { colors, fonts, spacing, type } from '@/ui/theme';

type ResultType = 'majority' | 'paid' | 'free' | 'free-majority';

const profileHref = (username: string | null, wallet: string) => (username ? `/u/${encodeURIComponent(username)}` : `/positions?wallet=${wallet}`) as Href;

export default function ResultScreen() {
  const { type: t, id } = useLocalSearchParams<{ type: string; id: string }>();
  const kind = (['majority', 'paid', 'free', 'free-majority'].includes(t) ? t : 'free') as ResultType;
  if (kind === 'majority') return <PaidMajorityResult id={id} />;
  if (kind === 'paid') return <PaidYesNoResult id={id} />;
  return <FreeResult id={Number(id)} majority={kind === 'free-majority'} />;
}

function Loading() {
  return (
    <Screen title="" back backLabel="Back">
      <CardSkeleton />
    </Screen>
  );
}

function PaidMajorityResult({ id }: { id: string }) {
  const focused = useIsScreenFocused();
  const now = useNow(60_000);
  const viewed = useWallet((s) => s.viewedAddress);
  const market = usePaidMajorityMarket(id, focused);
  const meta = usePaidMajorityMetadata();
  const results = usePaidMajorityResults(id);
  const acct = useMemo(() => (market.data ? deserializeMajorityMarket(base64ToBytes(market.data.account)) : null), [market.data]);
  if (market.isPending || results.isPending) return <Loading />;
  if (market.isError || !market.data || !acct) {
    return (
      <Screen title="Result" back>
        <ErrorState error={market.error ?? new Error('Could not decode the market')} onRetry={() => market.refetch()} />
      </Screen>
    );
  }
  const info = meta.data?.find((m) => m.market_id === id);
  const winners = market.data.board.filter((w) => w.outcome === WordOutcome.Winner);
  const resolved = results.data?.resolved ?? acct.status === 1;
  return (
    <Screen title="" back>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MarketHeader
          title={info?.title ?? `Market ${id}`}
          cover={info?.cover_image_url ?? null}
          status={acct.status === 2 ? 'cancelled' : resolved ? 'resolved' : 'pending'}
          paid
          majority
          lockAt={Number(acct.lockTs) * 1000}
          eventAt={info?.event_start_time ? Date.parse(info.event_start_time) : null}
          traderCount={market.data.traderCount}
          now={now}
        />
        <View style={styles.winnerCard}>
          <Text style={type.muted}>
            {acct.status === 2 ? 'Cancelled, stakes refundable' : resolved ? (winners.length > 1 ? 'Winning words' : 'Winning word') : 'Awaiting resolution'}
          </Text>
          {winners.length > 0 ? (
            <Text style={styles.winner}>{winners.map((w) => w.word).join(' · ')}</Text>
          ) : (
            <Text style={styles.winner}>{acct.status === 2 ? '–' : 'Pending'}</Text>
          )}
          <View style={styles.stats}>
            <Stat label="Pool" value={usdc(acct.totalUnits * acct.unitPrice)} />
            <Stat label="Paid out" value={usdc(acct.distributable)} />
            <Stat label="Units" value={market.data.totalUnits} />
          </View>
        </View>
        <Text style={type.heading}>Board</Text>
        {market.data.board.map((w) => (
          <View key={w.wordHash} style={styles.row}>
            <Text style={[type.body, { flex: 1, fontFamily: fonts.semibold }]}>{w.word}</Text>
            <Text style={type.muted}>{w.units} units</Text>
            {w.outcome === WordOutcome.Winner ? <Pill label="WON" tone="green" /> : resolved ? <Pill label="LOST" tone="neutral" /> : null}
          </View>
        ))}
        <Text style={type.heading}>Payouts</Text>
        {results.isError ? (
          <ErrorState error={results.error} onRetry={() => results.refetch()} title="Could not load payouts" />
        ) : results.data && results.data.leaderboard.length > 0 ? (
          results.data.leaderboard.map((r, i) => (
            <Link key={r.wallet} href={profileHref(r.username, r.wallet)} asChild>
              <Pressable style={StyleSheet.flatten([styles.row, viewed === r.wallet && styles.rowYou])} accessibilityRole="button">
                <Text style={styles.rank}>{i + 1}</Text>
                <Text style={{ fontSize: 18 }}>{r.pfpEmoji ?? '🙂'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontFamily: fonts.semibold }]} numberOfLines={1}>
                    {r.username ?? shortAddress(r.wallet)}
                  </Text>
                  <Text style={type.muted}>
                    {usd(r.stakeUsdc)} staked · {r.points} pts
                  </Text>
                </View>
                <Text style={[type.money, { color: r.profitUsdc > 0 ? colors.yes : r.profitUsdc < 0 ? colors.no : colors.textMuted }]}>
                  {r.profitUsdc >= 0 ? '+' : ''}
                  {usd(r.profitUsdc)}
                </Text>
              </Pressable>
            </Link>
          ))
        ) : (
          <EmptyState title="No payouts yet" body="Payouts appear once the market resolves." />
        )}
      </ScrollView>
    </Screen>
  );
}

function PaidYesNoResult({ id }: { id: string }) {
  const focused = useIsScreenFocused();
  const now = useNow(60_000);
  const market = usePaidMarket(id, focused);
  const meta = usePaidMarketMetadata(id);
  const chart = usePaidMarketChart(id, focused);
  const trades = usePaidMarketTrades(id, focused);
  const acct = useMemo(() => (market.data ? deserializeMarketAccount(base64ToBytes(market.data.account)) : null), [market.data]);
  if (market.isPending) return <Loading />;
  if (market.isError || !acct) {
    return (
      <Screen title="Result" back>
        <ErrorState error={market.error ?? new Error('Could not decode the market')} onRetry={() => market.refetch()} />
      </Screen>
    );
  }
  const resolved = acct.status === 2 || acct.words.every((w) => w.outcome !== null);
  return (
    <Screen title="" back>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MarketHeader
          title={meta.data?.title ?? `Market ${id}`}
          cover={meta.data?.cover_image_url ?? null}
          status={resolved ? 'resolved' : 'pending'}
          paid
          majority={false}
          lockAt={Number(acct.locksAt) * 1000}
          eventAt={meta.data?.event_start_time ? Date.parse(meta.data.event_start_time) : null}
          traderCount={null}
          now={now}
        />
        <View style={styles.stats}>
          <Stat label="Volume" value={chart.data ? usd(chart.data.totalVolume / 1e6) : '–'} />
          <Stat label="Trades" value={trades.data ? String(trades.data.length) : '–'} />
          <Stat label="Words" value={String(acct.numWords)} />
        </View>
        <Text style={type.heading}>Outcomes</Text>
        {acct.words.map((w) => (
          <View key={w.wordIndex} style={styles.row}>
            <Text style={[type.body, { flex: 1, fontFamily: fonts.semibold }]}>{w.label}</Text>
            <Text style={type.muted}>closed at {cents(impliedYesPrice(w, acct.liquidityParamB))}</Text>
            {w.outcome === null ? <Pill label="PENDING" tone="orange" /> : <Pill label={w.outcome ? 'YES' : 'NO'} tone={w.outcome ? 'green' : 'red'} />}
          </View>
        ))}
        <Text style={type.muted}>YES shares on a word said pay $1 each. Redeem arrives with trading.</Text>
      </ScrollView>
    </Screen>
  );
}

function FreeResult({ id, majority }: { id: number; majority: boolean }) {
  const focused = useIsScreenFocused();
  const now = useNow(60_000);
  const viewed = useWallet((s) => s.viewedAddress);
  const market = useFreeMarket(id, focused);
  const results = useFreeResults(id);
  if (market.isPending || results.isPending) return <Loading />;
  if (market.isError || !market.data) {
    return (
      <Screen title="Result" back>
        <ErrorState error={market.error} onRetry={() => market.refetch()} />
      </Screen>
    );
  }
  const m = market.data.market;
  const winners = market.data.words.filter((w) => w.resolved_outcome === true);
  const resolved = m.status === 'resolved' || market.data.words.every((w) => w.resolved_outcome !== null);
  return (
    <Screen title="" back>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MarketHeader
          title={m.title}
          cover={m.cover_image_url}
          status={m.status === 'cancelled' ? 'cancelled' : resolved ? 'resolved' : 'pending'}
          paid={false}
          majority={majority}
          lockAt={toMs(m.lock_time)}
          eventAt={toMs(m.event_start_time)}
          traderCount={market.data.traderCount}
          now={now}
        />
        {majority ? (
          <View style={styles.winnerCard}>
            <Text style={type.muted}>{resolved ? (winners.length > 1 ? 'Winning words' : 'Winning word') : 'Awaiting resolution'}</Text>
            <Text style={styles.winner}>{winners.length > 0 ? winners.map((w) => w.word).join(' · ') : 'Pending'}</Text>
          </View>
        ) : null}
        <Text style={type.heading}>{majority ? 'Board' : 'Outcomes'}</Text>
        {market.data.words.map((w) => (
          <View key={w.id} style={styles.row}>
            <Text style={[type.body, { flex: 1, fontFamily: fonts.semibold }]}>{w.word}</Text>
            <Text style={type.muted}>{majority ? `said ${w.mention_count}×` : `closed at ${cents(w.yes_price)}`}</Text>
            {w.resolved_outcome === null ? (
              <Pill label="PENDING" tone="orange" />
            ) : majority ? (
              w.resolved_outcome ? (
                <Pill label="WON" tone="green" />
              ) : (
                <Pill label="LOST" tone="neutral" />
              )
            ) : (
              <Pill label={w.resolved_outcome ? 'YES' : 'NO'} tone={w.resolved_outcome ? 'green' : 'red'} />
            )}
          </View>
        ))}
        <Text style={type.heading}>Leaderboard</Text>
        {results.isError ? (
          <ErrorState error={results.error} onRetry={() => results.refetch()} title="Could not load the leaderboard" />
        ) : results.data && results.data.leaderboard.length > 0 ? (
          results.data.leaderboard.map((r, i) => (
            <Link key={r.wallet} href={profileHref(r.username, r.wallet)} asChild>
              <Pressable style={StyleSheet.flatten([styles.row, viewed === r.wallet && styles.rowYou])} accessibilityRole="button">
                <Text style={styles.rank}>{i + 1}</Text>
                <Text style={{ fontSize: 18 }}>{r.pfp_emoji ?? '🙂'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontFamily: fonts.semibold }]} numberOfLines={1}>
                    {r.username ?? shortAddress(r.wallet)}
                  </Text>
                  <Text style={type.muted} numberOfLines={1}>
                    {r.words.map((w) => w.word).join(', ')} · {r.points_earned} pts
                  </Text>
                </View>
                <Text style={[type.money, { color: r.net_tokens > 0 ? colors.yes : r.net_tokens < 0 ? colors.no : colors.textMuted }]}>
                  {r.net_tokens >= 0 ? '+' : ''}
                  {tokens(r.net_tokens)}
                </Text>
              </Pressable>
            </Link>
          ))
        ) : (
          <EmptyState title="No results yet" body="The leaderboard appears once the market resolves." />
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={type.muted}>{label}</Text>
      <Text style={type.money}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, paddingBottom: spacing.xl },
  winnerCard: {
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(242,183,31,0.45)',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  winner: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, color: colors.gold },
  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  stat: { flex: 1, padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surfaceRaised, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowYou: { borderColor: colors.gold },
  rank: { width: 24, fontFamily: fonts.bold, fontSize: 14, color: colors.textMuted, fontVariant: ['tabular-nums'] },
});
