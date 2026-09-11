import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { PaidMajorityUserPosition } from '@/api/paidMajority';
import type { PaidMarketUserPosition } from '@/api/paidMarkets';
import { useFreeUserActivity, useIsScreenFocused, usePaidMajorityUserPositions, usePaidMarketUserPositions } from '@/api/queries';
import { tokens, usd } from '@/lib/format';
import { isPaid } from '@/markets/merge';
import { fromFree, fromPaidMajority, fromPaidYesNo, groupByMarket, groupPositions, type MarketGroup, type PositionRow } from '@/markets/positions';
import { useActiveWallet } from '@/store/active-wallet';
import { useSession } from '@/store/session';
import { ClaimCard, useClaimFlow, type ClaimTarget } from '@/ui/claim-card';
import { SignInCard } from '@/ui/sign-in-card';
import { Pill } from '@/ui/pill';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, Skeleton } from '@/ui/states';
import { colors, fonts, spacing, type } from '@/ui/theme';

export default function PositionsScreen() {
  const focused = useIsScreenFocused();
  const { wallet: walletParam } = useLocalSearchParams<{ wallet?: string }>();
  const own = useActiveWallet();
  // A public profile can open positions for another wallet without touching the store.
  const viewed = walletParam || own;
  const pm = usePaidMajorityUserPositions(viewed, focused);
  const pa = usePaidMarketUserPositions(viewed, focused);
  const fr = useFreeUserActivity(viewed, focused);
  const queries = [pm, pa, fr];

  const groups = useMemo(() => {
    const rows: PositionRow[] = [...(pm.data ?? []).map(fromPaidMajority), ...(pa.data ?? []).map(fromPaidYesNo), ...(fr.data ? fromFree(fr.data) : [])];
    const split = groupPositions(rows);
    return { ...split, openMarkets: groupByMarket(split.open), finishedMarkets: groupByMarket(split.finished) };
  }, [pm.data, pa.data, fr.data]);

  // Claims are for the signed-in wallet only: a viewed wallet cannot sign.
  const session = useSession((s) => s.wallet);
  const claimWallet = !walletParam && session && session === viewed ? session : null;
  const claimFlow = useClaimFlow(claimWallet);
  const claims = useMemo(() => (claimWallet ? claimTargets(pa.data ?? [], pm.data ?? []) : []), [claimWallet, pa.data, pm.data]);

  const loading = !!viewed && queries.some((q) => q.isPending);
  const failed = queries.filter((q) => q.isError);
  const [refreshing, setRefreshing] = useState(false);
  const refetchAll = () => {
    setRefreshing(true);
    Promise.all(queries.map((q) => q.refetch())).finally(() => setRefreshing(false));
  };

  return (
    <Screen
      title="Positions"
      subtitle={
        walletParam ? `Viewing ${walletParam.slice(0, 4)}…${walletParam.slice(-4)}` : viewed ? undefined : 'Sign in, or view a Seeker wallet from the You tab'
      }
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.gold} />}
      >
        {walletParam || viewed ? null : <SignInCard />}
        {!viewed ? null : loading ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={72} radius={12} />
            <Skeleton height={72} radius={12} />
            <Skeleton height={72} radius={12} />
          </View>
        ) : (
          <>
            {failed.length > 0 ? (
              <ErrorState
                error={failed[0].error}
                onRetry={refetchAll}
                title={failed.length === 3 ? 'Could not load positions' : 'Some positions did not load'}
              />
            ) : null}
            {groups.open.length === 0 && groups.finished.length === 0 && failed.length === 0 ? (
              <EmptyState title="No positions yet" body="Picks made with this wallet on mentioned.market show up here." />
            ) : (
              <View style={styles.summary}>
                <Stat label="Open markets" value={String(groups.openMarkets.length)} />
                <Stat label="At stake" value={`${usd(groups.summary.stakedUsd)} · ${tokens(groups.summary.tokensIn)} tk`} />
                <Stat label="To claim" value={usd(groups.summary.claimableUsd)} tone={groups.summary.claimableUsd > 0 ? 'up' : undefined} />
              </View>
            )}
            {claimWallet ? claims.map((c) => <ClaimCard key={`${c.kind}:${c.marketId}`} target={c} wallet={claimWallet} flow={claimFlow} />) : null}
            {groups.openMarkets.length > 0 ? <Section title="Open" groups={groups.openMarkets} /> : null}
            {groups.finishedMarkets.length > 0 ? <Section title="Finished" groups={groups.finishedMarkets} /> : null}
            {fr.data ? <Text style={type.muted}>{fr.data.pointsEarned.toLocaleString()} points earned on free markets</Text> : null}
          </>
        )}
      </ScrollView>
      {claimFlow.sheet}
    </Screen>
  );
}

function Section({ title, groups }: { title: string; groups: MarketGroup[] }) {
  return (
    <Animated.View layout={LAYOUT} style={{ gap: spacing.sm }}>
      <Text style={type.heading}>{title}</Text>
      {groups.map((g) => (
        <MarketCard key={g.key} group={g} />
      ))}
    </Animated.View>
  );
}

// Cards below one that opens or closes glide to their new place rather than
// jumping there.
const LAYOUT = LinearTransition.duration(220);

/**
 * One market: its total on the card, its positions in a drop-down. The first
 * tap opens the drop-down; a position inside it, or "Go to market", opens the
 * market itself.
 */
function MarketCard({ group: g }: { group: MarketGroup }) {
  const [open, setOpen] = useState(false);
  const turn = useSharedValue(0);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 180}deg` }] }));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    turn.set(withTiming(next ? 1 : 0, { duration: 220 }));
  };

  return (
    <Animated.View layout={LAYOUT} style={styles.card}>
      <Pressable
        onPress={toggle}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? 'Hides the positions' : 'Shows the positions'}
      >
        <View style={styles.thumb}>
          {g.cover ? (
            <Image source={{ uri: g.cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Text style={{ fontSize: 16 }}>{isPaid(g) ? '💵' : '🎟️'}</Text>
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[type.body, { flexShrink: 1 }]} numberOfLines={1}>
              {g.title}
            </Text>
            {g.won === true ? (
              <Pill label="WON" tone="green" />
            ) : g.won === false ? (
              <Pill label="LOST" tone="red" />
            ) : (
              <Pill label={isPaid(g) ? 'PAID' : 'FREE'} tone={isPaid(g) ? 'gold' : 'neutral'} />
            )}
          </View>
          <Text style={type.muted}>{g.count}</Text>
          <Text style={[type.money, { fontSize: 14 }]}>{g.value}</Text>
        </View>
        <Animated.View style={chevron}>
          <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
        </Animated.View>
      </Pressable>

      {open ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={styles.drop}>
          {g.rows.map((r) => (
            <Link key={r.key} href={r.href as Href} asChild>
              <Pressable style={styles.position} accessibilityRole="link">
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.body, { fontFamily: fonts.medium }]} numberOfLines={1}>
                    {r.line}
                  </Text>
                  <Text style={type.muted}>{r.value}</Text>
                </View>
                {g.finished && r.won !== null ? <Pill label={r.won ? 'WON' : 'LOST'} tone={r.won ? 'green' : 'red'} /> : null}
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            </Link>
          ))}
          <Link href={g.href as Href} asChild>
            <Pressable style={styles.goto} accessibilityRole="link">
              <Text style={styles.gotoText}>Go to market</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.gold} />
            </Pressable>
          </Link>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/**
 * One claim per market. Paid YES/NO markets are offered whenever they have
 * resolved, and the card itself decides from the chain whether there is
 * anything to collect; majority markets only when the route says a word won.
 */
function claimTargets(paid: PaidMarketUserPosition[], majority: PaidMajorityUserPosition[]): ClaimTarget[] {
  const out: ClaimTarget[] = [];
  const seen = new Set<string>();
  for (const p of paid) {
    if (p.marketStatus !== 2 || seen.has(p.marketId)) continue;
    seen.add(p.marketId);
    out.push({ kind: 'amm', marketId: p.marketId, title: p.marketTitle });
  }
  const byMarket = new Map<string, { title: string; words: string[]; dollars: number }>();
  for (const p of majority) {
    if (p.claimableUsdc <= 0) continue;
    const m = byMarket.get(p.marketId) ?? { title: p.title, words: [], dollars: 0 };
    m.words.push(p.word);
    m.dollars += p.claimableUsdc;
    byMarket.set(p.marketId, m);
  }
  for (const [marketId, m] of byMarket) out.push({ kind: 'majority', marketId, ...m });
  return out;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' }) {
  return (
    <View style={styles.stat}>
      <Text style={type.muted}>{label}</Text>
      <Text style={[type.money, { fontSize: 14 }, tone === 'up' && { color: colors.yes }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  summary: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 2 },
  thumb: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  drop: { borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  position: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  goto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md },
  gotoText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.gold },
});
