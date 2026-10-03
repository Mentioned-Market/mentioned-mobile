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
  usePaidMajorityUserPositions,
  usePaidMajorityResults,
  usePaidMarket,
  usePaidMarketChart,
  usePaidMarketMetadata,
  usePaidMarketTrades,
} from '@/api/queries';
import { deserializeMarketAccount, impliedYesPrice } from '@/chain/amm';
import { deserializeMajorityMarket, WordOutcome } from '@/chain/majority';
import { base64ToBytes } from '@/lib/bytes';
import { sideQuote } from '@/trade/amm-display';
import { pct, shortAddress, tokens, usd, usdc } from '@/lib/format';
import { toMs } from '@/lib/time';
import { useNow } from '@/lib/use-now';
import { useActiveWallet } from '@/store/active-wallet';
import { useSession } from '@/store/session';
import { Card, SectionTitle, Stat, rowStyle } from '@/ui/card';
import { ClaimCard, useClaimFlow, type ClaimTarget } from '@/ui/claim-card';
import { ResultShare } from '@/ui/result-share';
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
    <Screen back>
      <CardSkeleton />
    </Screen>
  );
}

function PaidMajorityResult({ id }: { id: string }) {
  const focused = useIsScreenFocused();
  const now = useNow(60_000);
  const viewed = useActiveWallet();
  const market = usePaidMajorityMarket(id, focused);
  const meta = usePaidMajorityMetadata();
  const results = usePaidMajorityResults(id);
  const acct = useMemo(() => (market.data?.account ? deserializeMajorityMarket(base64ToBytes(market.data.account)) : null), [market.data]);
  const wallet = useSession((s) => s.wallet);
  const claimFlow = useClaimFlow(wallet);
  const mine = usePaidMajorityUserPositions(wallet, focused);
  const claimable = (mine.data ?? []).filter((p) => p.marketId === id && p.claimableUsdc > 0);
  if (market.isPending || results.isPending) return <Loading />;
  if (market.isError || !market.data || !acct) {
    return (
      <Screen back>
        <ErrorState error={market.error ?? new Error('Could not decode the market')} onRetry={() => market.refetch()} />
      </Screen>
    );
  }
  const info = meta.data?.find((m) => m.market_id === id);
  const winners = market.data.board.filter((w) => w.outcome === WordOutcome.Winner);
  const resolved = results.data?.resolved ?? acct.status === 1;
  return (
    <Screen back>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MarketHeader
          title={info?.title ?? `Market ${id}`}
          cover={info?.cover_image_url ?? null}
          status={acct.status === 2 ? 'cancelled' : resolved ? 'resolved' : 'pending'}
          lockAt={Number(acct.lockTs) * 1000}
          eventAt={info?.event_start_time ? Date.parse(info.event_start_time) : null}
          now={now}
        />
        <Card style={styles.winnerCard}>
          <Text style={type.label}>
            {acct.status === 2 ? 'Cancelled, stakes refundable' : resolved ? (winners.length > 1 ? 'Winning words' : 'Winning word') : 'Awaiting resolution'}
          </Text>
          {winners.length > 0 ? (
            <Text style={styles.winner}>{winners.map((w) => w.word ?? 'Word not shown yet').join(' · ')}</Text>
          ) : (
            <Text style={styles.winner}>{acct.status === 2 ? '–' : 'Pending'}</Text>
          )}
          <View style={styles.stats}>
            <Stat label="Pool" value={usdc(acct.totalUnits * acct.unitPrice)} />
            <Stat label="Paid out" value={usdc(acct.distributable)} align="center" />
            <Stat label="Units" value={String(market.data.totalUnits)} align="right" />
          </View>
        </Card>
        {wallet && claimable.length > 0 ? (
          <ClaimCard
            wallet={wallet}
            flow={claimFlow}
            target={{
              kind: 'majority',
              marketId: id,
              title: info?.title ?? `Market ${id}`,
              words: claimable.map((p) => p.word),
              dollars: claimable.reduce((sum, p) => sum + p.claimableUsdc, 0),
            }}
          />
        ) : null}
        <ResultShare family="paid-majority" marketId={id} title={info?.title ?? `Market ${id}`} />
        <View style={styles.section}>
          <SectionTitle title="Board" />
          <Card padded={false} style={styles.listCard}>
            {market.data.board.map((w, i) => (
              <View key={w.wordHash} style={rowStyle(i === 0)}>
                <Text style={styles.word} numberOfLines={1}>
                  {w.word ?? 'Word not shown yet'}
                </Text>
                <Text style={type.muted}>{w.units} {Number(w.units) === 1 ? 'pick' : 'picks'}</Text>
                {w.outcome === WordOutcome.Winner ? <Pill label="WON" tone="green" /> : resolved ? <Pill label="LOST" tone="neutral" /> : null}
              </View>
            ))}
          </Card>
        </View>
        <View style={styles.section}>
          <SectionTitle title="Payouts" />
          {results.isError ? (
            <ErrorState error={results.error} onRetry={() => results.refetch()} title="Could not load payouts" />
          ) : results.data && results.data.leaderboard.length > 0 ? (
            <Card padded={false} style={styles.listCard}>
              {results.data.leaderboard.map((r, i) => (
                <Link key={r.wallet} href={profileHref(r.username, r.wallet)} asChild>
                  <Pressable style={rowStyle(i === 0)} accessibilityRole="button">
                    <Text style={styles.rank}>{i + 1}</Text>
                    <Text style={{ fontSize: 18 }}>{r.pfpEmoji ?? '🙂'}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameLine}>
                        <Text style={styles.name} numberOfLines={1}>
                          {r.username ?? shortAddress(r.wallet)}
                        </Text>
                        {viewed === r.wallet ? <Pill label="YOU" tone="gold" /> : null}
                      </View>
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
              ))}
            </Card>
          ) : (
            <EmptyState title="No payouts yet" body="Payouts appear once the market resolves." />
          )}
        </View>
      </ScrollView>
      {claimFlow.sheet}
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
  const wallet = useSession((s) => s.wallet);
  const claimFlow = useClaimFlow(wallet);
  if (market.isPending) return <Loading />;
  if (market.isError || !acct) {
    return (
      <Screen back>
        <ErrorState error={market.error ?? new Error('Could not decode the market')} onRetry={() => market.refetch()} />
      </Screen>
    );
  }
  const resolved = acct.status === 2 || acct.words.every((w) => w.outcome !== null);
  return (
    <Screen back>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MarketHeader
          title={meta.data?.title ?? `Market ${id}`}
          cover={meta.data?.cover_image_url ?? null}
          status={resolved ? 'resolved' : 'pending'}
          lockAt={Number(acct.locksAt) * 1000}
          eventAt={meta.data?.event_start_time ? Date.parse(meta.data.event_start_time) : null}
          now={now}
        />
        <Card>
          <View style={styles.stats}>
            <Stat label="Volume" value={chart.data ? usd(chart.data.totalVolume / 1e6) : '–'} />
            <Stat label="Trades" value={trades.data ? String(trades.data.length) : '–'} align="center" />
            <Stat label="Words" value={String(acct.numWords)} align="right" />
          </View>
        </Card>
        {wallet ? <ClaimCard wallet={wallet} flow={claimFlow} target={{ kind: 'amm', marketId: id, title: meta.data?.title ?? `Market ${id}` } satisfies ClaimTarget} /> : null}
        <ResultShare family="paid-markets" marketId={id} title={meta.data?.title ?? `Market ${id}`} />
        <View style={styles.section}>
          <SectionTitle title="Outcomes" />
          <Card padded={false} style={styles.listCard}>
            {acct.words.map((w, i) => (
              <View key={w.wordIndex} style={rowStyle(i === 0)}>
                <Text style={styles.word} numberOfLines={1}>
                  {w.label}
                </Text>
                <Text style={type.muted}>closed at Yes {sideQuote(impliedYesPrice(w, acct.liquidityParamB), 'YES', { feeBps: acct.tradeFeeBps, rakeBps: acct.redeemRakeBps })}</Text>
                {w.outcome === null ? <Pill label="PENDING" tone="orange" /> : <Pill label={w.outcome ? 'YES' : 'NO'} tone={w.outcome ? 'green' : 'red'} />}
              </View>
            ))}
          </Card>
          <Text style={type.muted}>YES shares on a word said pay $1 each, and NO shares on a word not said.</Text>
        </View>
      </ScrollView>
      {claimFlow.sheet}
    </Screen>
  );
}

function FreeResult({ id, majority }: { id: number; majority: boolean }) {
  const focused = useIsScreenFocused();
  const now = useNow(60_000);
  const viewed = useActiveWallet();
  const market = useFreeMarket(id, focused);
  const results = useFreeResults(id);
  if (market.isPending || results.isPending) return <Loading />;
  if (market.isError || !market.data) {
    return (
      <Screen back>
        <ErrorState error={market.error} onRetry={() => market.refetch()} />
      </Screen>
    );
  }
  const m = market.data.market;
  const winners = market.data.words.filter((w) => w.resolved_outcome === true);
  const resolved = m.status === 'resolved' || market.data.words.every((w) => w.resolved_outcome !== null);
  return (
    <Screen back>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MarketHeader
          title={m.title}
          cover={m.cover_image_url}
          status={m.status === 'cancelled' ? 'cancelled' : resolved ? 'resolved' : 'pending'}
          lockAt={toMs(m.lock_time)}
          eventAt={toMs(m.event_start_time)}
          now={now}
        />
        {majority ? (
          <Card style={styles.winnerCard}>
            <Text style={type.label}>{resolved ? (winners.length > 1 ? 'Winning words' : 'Winning word') : 'Awaiting resolution'}</Text>
            <Text style={styles.winner}>{winners.length > 0 ? winners.map((w) => w.word).join(' · ') : 'Pending'}</Text>
          </Card>
        ) : null}
        <View style={styles.section}>
          <SectionTitle title={majority ? 'Board' : 'Outcomes'} />
          <Card padded={false} style={styles.listCard}>
            {market.data.words.map((w, i) => (
              <View key={w.id} style={rowStyle(i === 0)}>
                <Text style={styles.word} numberOfLines={1}>
                  {w.word}
                </Text>
                <Text style={type.muted}>{majority ? `said ${w.mention_count}×` : `closed at ${pct(w.yes_price)} chance`}</Text>
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
          </Card>
        </View>
        <ResultShare family="free" marketId={String(id)} title={m.title} />
        <View style={styles.section}>
          <SectionTitle title="Leaderboard" />
          {results.isError ? (
            <ErrorState error={results.error} onRetry={() => results.refetch()} title="Could not load the leaderboard" />
          ) : results.data && results.data.leaderboard.length > 0 ? (
            <Card padded={false} style={styles.listCard}>
              {results.data.leaderboard.map((r, i) => (
                <Link key={r.wallet} href={profileHref(r.username, r.wallet)} asChild>
                  <Pressable style={rowStyle(i === 0)} accessibilityRole="button">
                    <Text style={styles.rank}>{i + 1}</Text>
                    <Text style={{ fontSize: 18 }}>{r.pfp_emoji ?? '🙂'}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameLine}>
                        <Text style={styles.name} numberOfLines={1}>
                          {r.username ?? shortAddress(r.wallet)}
                        </Text>
                        {viewed === r.wallet ? <Pill label="YOU" tone="gold" /> : null}
                      </View>
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
              ))}
            </Card>
          ) : (
            <EmptyState title="No results yet" body="The leaderboard appears once the market resolves." />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

// Rows that are `<Link asChild>`'s child are given the flat style from rowStyle().
const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  section: { gap: spacing.sm },
  winnerCard: { gap: spacing.xs },
  winner: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, color: colors.gold },
  stats: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm },
  listCard: { paddingHorizontal: spacing.md },
  name: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: colors.text },
  word: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: colors.text },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rank: { width: 24, fontFamily: fonts.bold, fontSize: 14, color: colors.textMuted, fontVariant: ['tabular-nums'] },
});
