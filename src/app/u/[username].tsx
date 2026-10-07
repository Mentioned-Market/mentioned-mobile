// Public profile (SPEC v1 step 2). Points, paid P/L, free-market stats, and a
// link to that wallet's positions.
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { usePublicProfile } from '@/api/queries';
import { shortAddress, tokens, usd } from '@/lib/format';
import { Button } from '@/ui/button';
import { Card, SectionTitle, Stat } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { ErrorState, Skeleton } from '@/ui/states';
import { SeekerBadge } from '@/ui/seeker-badge';
import { colors, radius, spacing, type } from '@/ui/theme';

export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const profile = usePublicProfile(username);

  if (profile.isPending) {
    return (
      <Screen back>
        <Skeleton height={120} radius={radius.card} />
      </Screen>
    );
  }
  if (profile.isError) {
    return (
      <Screen title={username} back>
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} title="Could not load this profile" />
      </Screen>
    );
  }
  const p = profile.data;
  const since = p.createdAt ? new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : null;
  return (
    <Screen back>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.emoji}>{p.pfpEmoji ?? '🙂'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={[type.title, { flexShrink: 1 }]} numberOfLines={1}>
                {p.username}
              </Text>
              <SeekerBadge wallet={p.wallet} size={14} />
            </View>
            <Text style={type.muted}>
              {shortAddress(p.wallet)}
              {since ? ` · since ${since}` : ''}
            </Text>
          </View>
        </Card>
        <View style={styles.section}>
          <SectionTitle title="Points" />
          <Card>
            <View style={styles.stats}>
              <Stat label="This week" value={p.stats.weeklyPoints.toLocaleString()} />
              <Stat label="All time" value={p.stats.allTimePoints.toLocaleString()} align="right" />
            </View>
          </Card>
        </View>
        <View style={styles.section}>
          <SectionTitle title="Paid markets" />
          <Card>
            <View style={styles.stats}>
              <Stat label="Realized P/L" value={usd(p.stats.realizedPnl)} tone={p.stats.realizedPnl > 0 ? 'up' : p.stats.realizedPnl < 0 ? 'down' : undefined} />
              <Stat label="Trades" value={String(p.stats.tradesCount)} align="center" />
              <Stat label="Biggest win" value={usd(p.stats.biggestWin)} align="right" />
            </View>
          </Card>
        </View>
        <View style={styles.section}>
          <SectionTitle title="Free markets" />
          <Card style={{ gap: spacing.md }}>
            <View style={styles.stats}>
              <Stat label="Markets" value={String(p.freeMarket.stats.totalMarkets)} />
              <Stat label="Trades" value={String(p.freeMarket.stats.totalTrades)} align="center" />
              <Stat label="Points" value={p.freeMarket.stats.totalPoints.toLocaleString()} align="right" />
            </View>
            <View style={styles.stats}>
              <Stat label="Tokens in" value={tokens(p.freeMarket.stats.totalTokensSpent)} />
              <Stat label="Tokens out" value={tokens(p.freeMarket.stats.totalTokensReceived)} align="center" />
              <Stat label="Active" value={String(p.freeMarket.stats.activePositions)} align="right" />
            </View>
          </Card>
        </View>
        <Link href={`/positions?wallet=${p.wallet}` as Href} asChild>
          <Button label="View positions" tone="neutral" />
        </Link>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  section: { gap: spacing.sm },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 56, lineHeight: 68 },
  stats: { flexDirection: 'row', gap: spacing.sm },
});
