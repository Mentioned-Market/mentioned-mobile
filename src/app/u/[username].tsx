// Public profile (SPEC v1 step 2). Points, paid P/L, free-market stats, and a
// link to that wallet's positions.
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { usePublicProfile } from '@/api/queries';
import { shortAddress, tokens, usd } from '@/lib/format';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { ErrorState, Skeleton } from '@/ui/states';
import { colors, spacing, type } from '@/ui/theme';

export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const profile = usePublicProfile(username);

  if (profile.isPending) {
    return (
      <Screen title="" back backLabel="Back">
        <Skeleton height={120} radius={16} />
      </Screen>
    );
  }
  if (profile.isError) {
    return (
      <Screen title={username} back backLabel="Back">
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} title="Could not load this profile" />
      </Screen>
    );
  }
  const p = profile.data;
  const since = p.createdAt ? new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : null;
  return (
    <Screen title="" back backLabel="Back">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text style={{ fontSize: 44 }}>{p.pfpEmoji ?? '🙂'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={type.title}>{p.username}</Text>
              <Text style={type.muted}>
                {shortAddress(p.wallet)}
                {since ? ` · since ${since}` : ''}
              </Text>
            </View>
          </View>
        </View>
        <Text style={type.heading}>Points</Text>
        <View style={styles.stats}>
          <Stat label="This week" value={p.stats.weeklyPoints.toLocaleString()} />
          <Stat label="All time" value={p.stats.allTimePoints.toLocaleString()} />
        </View>
        <Text style={type.heading}>Paid markets</Text>
        <View style={styles.stats}>
          <Stat label="Realized P/L" value={usd(p.stats.realizedPnl)} tone={p.stats.realizedPnl > 0 ? 'up' : p.stats.realizedPnl < 0 ? 'down' : undefined} />
          <Stat label="Trades" value={String(p.stats.tradesCount)} />
          <Stat label="Biggest win" value={usd(p.stats.biggestWin)} />
        </View>
        <Text style={type.heading}>Free markets</Text>
        <View style={styles.stats}>
          <Stat label="Markets" value={String(p.freeMarket.stats.totalMarkets)} />
          <Stat label="Trades" value={String(p.freeMarket.stats.totalTrades)} />
          <Stat label="Points" value={p.freeMarket.stats.totalPoints.toLocaleString()} />
        </View>
        <View style={styles.stats}>
          <Stat label="Tokens in" value={tokens(p.freeMarket.stats.totalTokensSpent)} />
          <Stat label="Tokens out" value={tokens(p.freeMarket.stats.totalTokensReceived)} />
          <Stat label="Active" value={String(p.freeMarket.stats.activePositions)} />
        </View>
        <Link href={`/positions?wallet=${p.wallet}` as Href} asChild>
          <Button label="View positions" tone="neutral" />
        </Link>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <View style={styles.stat}>
      <Text style={type.muted}>{label}</Text>
      <Text style={[type.money, tone === 'up' && { color: colors.yes }, tone === 'down' && { color: colors.no }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, paddingBottom: spacing.xl },
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  stat: { flex: 1, padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 2 },
});
