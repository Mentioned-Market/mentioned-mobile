// Ranks (SPEC v1 step 3): weekly points board with your row pinned, the prize
// pool split, and the raffle. The leaderboard route only knows this week and
// last week, so the arrows toggle between the two.
import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useIsScreenFocused, useLeaderboard, usePrizePool, useRaffle } from '@/api/queries';
import type { LeaderboardEntry, LeaderboardWeek } from '@/api/user';
import { shortAddress, usd } from '@/lib/format';
import { useWallet } from '@/store/wallet';
import { Pill } from '@/ui/pill';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, Skeleton } from '@/ui/states';
import { colors, fonts, spacing, type } from '@/ui/theme';

const MEDALS = ['🥇', '🥈', '🥉'];

/** A stable empty array, so an absent board does not remount the list each render. */
const EMPTY: LeaderboardEntry[] = [];

const keyExtractor = (e: LeaderboardEntry) => e.wallet;
const RowSeparator = () => <View style={{ height: spacing.sm }} />;

function weekKey(weekStartIso: string | undefined, week: LeaderboardWeek): string | undefined {
  // Past weeks are addressed by their UTC Monday; the current week by omission.
  if (week === 'current' || !weekStartIso) return undefined;
  return weekStartIso.slice(0, 10);
}

function rangeLabel(start?: string, end?: string | null): string {
  if (!start) return 'This week';
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const endDate = end ? new Date(new Date(end).getTime() - 1) : null;
  return endDate ? `${fmt(start)} to ${fmt(endDate.toISOString())}` : `Week of ${fmt(start)}`;
}

export default function RanksScreen() {
  const focused = useIsScreenFocused();
  const viewed = useWallet((s) => s.viewedAddress);
  const [week, setWeek] = useState<LeaderboardWeek>('current');
  const board = useLeaderboard(week, viewed, focused);
  const key = weekKey(board.data?.weekStart, week);
  const pool = usePrizePool(key, focused);
  const raffle = useRaffle(viewed, key, focused);
  const [refreshing, setRefreshing] = useState(false);
  const renderRow = useCallback(
    ({ item, index }: { item: LeaderboardEntry; index: number }) => <Row entry={item} rank={index} you={viewed === item.wallet} />,
    [viewed],
  );

  const refetch = () => {
    setRefreshing(true);
    Promise.all([board.refetch(), pool.refetch(), raffle.refetch()]).finally(() => setRefreshing(false));
  };

  const rows = board.data?.data ?? EMPTY;
  const boardReady = !board.isPending && !board.isError;
  const myIndex = viewed ? rows.findIndex((e) => e.wallet === viewed) : -1;
  const pinned = board.data?.userEntry ?? null;

  return (
    <Screen title="Ranks" subtitle="Weekly points, prize pool and raffle">
      {/* A FlatList rather than a ScrollView: the board runs to a hundred rows,
          and mounting all of them left several hundred views attached to this
          screen at all times, which the navigator re-attached on every focus.
          Everything above the board is the list header, so it still scrolls with
          the rows. */}
      <FlatList
        data={boardReady ? rows : EMPTY}
        keyExtractor={keyExtractor}
        renderItem={renderRow}
        ItemSeparatorComponent={RowSeparator}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={colors.gold} />}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={styles.header}>
        <View style={styles.weekRow}>
          <Pressable
            onPress={() => setWeek('last')}
            disabled={week === 'last'}
            style={[styles.arrow, week === 'last' && styles.arrowOff]}
            accessibilityRole="button"
            accessibilityLabel="Last week"
          >
            <Text style={styles.arrowLabel}>‹</Text>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={type.heading}>{week === 'current' ? 'This week' : 'Last week'}</Text>
            <Text style={type.muted}>{rangeLabel(board.data?.weekStart, board.data?.weekEnd ?? pool.data?.weekEnd)}</Text>
          </View>
          <Pressable
            onPress={() => setWeek('current')}
            disabled={week === 'current'}
            style={[styles.arrow, week === 'current' && styles.arrowOff]}
            accessibilityRole="button"
            accessibilityLabel="This week"
          >
            <Text style={styles.arrowLabel}>›</Text>
          </Pressable>
        </View>

        {pool.isPending ? (
          <Skeleton height={140} radius={16} />
        ) : pool.isError ? (
          <ErrorState error={pool.error} onRetry={() => pool.refetch()} title="Could not load the prize pool" />
        ) : (
          <View style={styles.poolCard}>
            <Text style={type.muted}>{pool.data.isCurrent ? 'Prize pool so far' : 'Prize pool'}</Text>
            <Text style={styles.poolAmount}>{usd(pool.data.poolUsd)}</Text>
            <Text style={type.muted}>
              {usd(pool.data.floorUsd)} floor · {usd(pool.data.volumeUsd)} volume
            </Text>
            <View style={styles.split}>
              {pool.data.split.map((s) => (
                <View key={`${s.kind}-${s.label}`} style={styles.splitItem}>
                  <Text style={type.muted}>
                    {s.medal ? `${s.medal} ` : ''}
                    {s.label}
                  </Text>
                  <Text style={type.money}>{usd(s.usd)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {raffle.isPending ? (
          <Skeleton height={100} radius={16} />
        ) : raffle.isError ? (
          <ErrorState error={raffle.error} onRetry={() => raffle.refetch()} title="Could not load the raffle" />
        ) : (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={type.heading}>🎟️ Raffle</Text>
              <Text style={type.muted}>{raffle.data.totalTickets} tickets in the draw</Text>
            </View>
            {raffle.data.me ? (
              <Text style={type.body}>
                You hold <Text style={{ color: colors.gold }}>{raffle.data.me.tickets}</Text> {raffle.data.me.tickets === 1 ? 'ticket' : 'tickets'}
                {raffle.data.me.eligible
                  ? ` · ${raffle.data.me.oddsPct.toFixed(1)}% odds`
                  : raffle.data.me.reason === 'placed'
                    ? ' · top 5 take a placing prize instead'
                    : raffle.data.me.reason === 'creator'
                      ? ' · creators are not entered'
                      : ''}
              </Text>
            ) : (
              <Text style={type.muted}>Connect a wallet to see your tickets. Every point earned this week is a ticket.</Text>
            )}
            {raffle.data.winner ? (
              <Text style={type.muted}>
                Winner: {raffle.data.winner.username ?? shortAddress(raffle.data.winner.wallet)}
                {raffle.data.winner.raffleUsd ? ` won ${usd(raffle.data.winner.raffleUsd)}` : ''}
              </Text>
            ) : raffle.data.lastWinner ? (
              <Text style={type.muted}>
                Last week {raffle.data.lastWinner.username ?? shortAddress(raffle.data.lastWinner.wallet)} won {usd(raffle.data.lastWinner.raffleUsd)} with{' '}
                {raffle.data.lastWinner.tickets} of {raffle.data.lastWinner.totalTickets} tickets.
              </Text>
            ) : null}
          </View>
        )}

        <Text style={type.heading}>Points</Text>
            {board.isPending ? (
              <View style={{ gap: spacing.sm }}>
                <Skeleton height={56} radius={12} />
                <Skeleton height={56} radius={12} />
                <Skeleton height={56} radius={12} />
              </View>
            ) : board.isError ? (
              <ErrorState error={board.error} onRetry={() => board.refetch()} title="Could not load the leaderboard" />
            ) : (
              <>
                {pinned ? <Row entry={pinned} rank={null} you /> : null}
                {viewed && myIndex === -1 && !pinned ? <Text style={type.muted}>Your wallet has no points this week yet.</Text> : null}
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          boardReady && rows.length === 0 ? <EmptyState title="No points yet this week" body="Make a pick to get on the board." /> : null
        }
      />
    </Screen>
  );
}

/** Tap opens the player's public profile (or their positions when they have no username). */
const Row = memo(function Row({ entry, rank, you }: { entry: LeaderboardEntry; rank: number | null; you: boolean }) {
  const href = (entry.username ? `/u/${encodeURIComponent(entry.username)}` : `/positions?wallet=${entry.wallet}`) as Href;
  return (
    <Link href={href} asChild>
      <Pressable
        style={StyleSheet.flatten([styles.row, you && styles.rowYou])}
        accessibilityRole="button"
        accessibilityLabel={`View ${entry.username ?? shortAddress(entry.wallet)}`}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={styles.rank}>{rank === null ? '·' : (MEDALS[rank] ?? rank + 1)}</Text>
          <Text style={{ fontSize: 20 }}>{entry.pfpEmoji ?? '🙂'}</Text>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[type.body, { fontFamily: fonts.semibold, flexShrink: 1 }]} numberOfLines={1}>
                {entry.username ?? shortAddress(entry.wallet)}
              </Text>
              {you ? <Pill label="YOU" tone="gold" /> : null}
            </View>
            <Text style={type.muted}>{entry.allTimePoints.toLocaleString()} all time</Text>
          </View>
          <Text style={type.money}>{entry.weeklyPoints.toLocaleString()}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </Pressable>
    </Link>
  );
});

const styles = StyleSheet.create({
  // The list supplies the gap between rows; the header keeps its own.
  content: { paddingBottom: spacing.xl },
  header: { gap: spacing.md, paddingBottom: spacing.sm },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowOff: { opacity: 0.3 },
  arrowLabel: { color: colors.text, fontSize: 24, lineHeight: 28, fontFamily: fonts.bold },
  poolCard: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(242,183,31,0.45)', gap: 4 },
  poolAmount: { fontFamily: fonts.bold, fontSize: 36, lineHeight: 42, color: colors.gold, fontVariant: ['tabular-nums'] },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  splitItem: { minWidth: 90, gap: 2 },
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  row: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  rowYou: { borderColor: colors.gold },
  rank: { width: 32, textAlign: 'center', fontFamily: fonts.bold, fontSize: 16, color: colors.textMuted, fontVariant: ['tabular-nums'] },
});
