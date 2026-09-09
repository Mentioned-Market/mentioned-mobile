import { Image } from 'expo-image';
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFreeUserActivity, useIsScreenFocused, usePaidMajorityUserPositions, usePaidMarketUserPositions } from '@/api/queries';
import { tokens, usd } from '@/lib/format';
import { isPaid } from '@/markets/merge';
import { fromFree, fromPaidMajority, fromPaidYesNo, groupPositions, type PositionRow } from '@/markets/positions';
import { useWallet } from '@/store/wallet';
import { Button } from '@/ui/button';
import { ConnectWallet } from '@/ui/connect-wallet';
import { Pill } from '@/ui/pill';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, Skeleton } from '@/ui/states';
import { colors, spacing, type } from '@/ui/theme';

export default function PositionsScreen() {
  const focused = useIsScreenFocused();
  const { wallet: walletParam } = useLocalSearchParams<{ wallet?: string }>();
  const own = useWallet((s) => s.viewedAddress);
  // A public profile can open positions for another wallet without touching the store.
  const viewed = walletParam || own;
  const pm = usePaidMajorityUserPositions(viewed, focused);
  const pa = usePaidMarketUserPositions(viewed, focused);
  const fr = useFreeUserActivity(viewed, focused);
  const queries = [pm, pa, fr];

  const groups = useMemo(() => {
    const rows: PositionRow[] = [...(pm.data ?? []).map(fromPaidMajority), ...(pa.data ?? []).map(fromPaidYesNo), ...(fr.data ? fromFree(fr.data) : [])];
    return groupPositions(rows);
  }, [pm.data, pa.data, fr.data]);

  const loading = !!viewed && queries.some((q) => q.isPending);
  const failed = queries.filter((q) => q.isError);
  const [refreshing, setRefreshing] = useState(false);
  const refetchAll = () => {
    setRefreshing(true);
    Promise.all(queries.map((q) => q.refetch())).finally(() => setRefreshing(false));
  };

  return (
    <Screen title="Positions" subtitle={walletParam ? `Viewing ${walletParam.slice(0, 4)}…${walletParam.slice(-4)}` : viewed ? undefined : 'Connect a wallet to see its positions'}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.gold} />}>
        {walletParam ? null : <ConnectWallet compact={!!viewed} />}
        {!viewed ? null : loading ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={72} radius={12} />
            <Skeleton height={72} radius={12} />
            <Skeleton height={72} radius={12} />
          </View>
        ) : (
          <>
            {failed.length > 0 ? <ErrorState error={failed[0].error} onRetry={refetchAll} title={failed.length === 3 ? 'Could not load positions' : 'Some positions did not load'} /> : null}
            {groups.open.length === 0 && groups.finished.length === 0 && failed.length === 0 ? (
              <EmptyState title="No positions yet" body="Picks made with this wallet on mentioned.market show up here." />
            ) : (
              <View style={styles.summary}>
                <Stat label="Open" value={String(groups.summary.open)} />
                <Stat label="At stake" value={`${usd(groups.summary.stakedUsd)} · ${tokens(groups.summary.tokensIn)} tk`} />
                <Stat label="To claim" value={usd(groups.summary.claimableUsd)} tone={groups.summary.claimableUsd > 0 ? 'up' : undefined} />
              </View>
            )}
            {groups.summary.actionable > 0 ? (
              <Text style={type.muted}>
                {groups.summary.actionable} {groups.summary.actionable === 1 ? 'position is' : 'positions are'} ready to claim. Claims and redeems arrive with trading.
              </Text>
            ) : null}
            {groups.open.length > 0 ? <Section title="Open" rows={groups.open} /> : null}
            {groups.finished.length > 0 ? <Section title="Finished" rows={groups.finished} /> : null}
            {fr.data ? <Text style={type.muted}>{fr.data.pointsEarned.toLocaleString()} points earned on free markets</Text> : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({ title, rows }: { title: string; rows: PositionRow[] }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={type.heading}>{title}</Text>
      {rows.map((r) => (
        <Link key={r.key} href={r.href as Href} asChild>
          <Pressable style={styles.row} accessibilityRole="button">
            <View style={styles.thumb}>{r.cover ? <Image source={{ uri: r.cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={{ fontSize: 16 }}>{isPaid(r) ? '💵' : '🎟️'}</Text>}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[type.body, { flexShrink: 1 }]} numberOfLines={1}>
                  {r.title}
                </Text>
                {r.won === true ? <Pill label="WON" tone="green" /> : r.won === false ? <Pill label="LOST" tone="red" /> : <Pill label={isPaid(r) ? 'PAID' : 'FREE'} tone={isPaid(r) ? 'gold' : 'neutral'} />}
              </View>
              <Text style={type.muted}>{r.line}</Text>
              <Text style={[type.money, { fontSize: 14 }]}>{r.value}</Text>
            </View>
            {r.cta ? <Button label={r.cta.label} tone={r.cta.tone} disabled style={{ minWidth: 110 }} /> : null}
          </Pressable>
        </Link>
      ))}
    </View>
  );
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
