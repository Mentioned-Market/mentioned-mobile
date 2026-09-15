// Ranks (SPEC v1 step 3): weekly points board with your row pinned, the prize
// pool split, and the raffle. The leaderboard route only knows this week and
// last week, so the switcher toggles between the two.
import { Link, type Href } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useIsScreenFocused, useLeaderboard, usePrizePool, useRaffle } from '@/api/queries';
import type { LeaderboardEntry, LeaderboardWeek } from '@/api/user';
import { shortAddress, usd } from '@/lib/format';
import { useActiveWallet } from '@/store/active-wallet';
import { CURRENT_ARENA, arenaStatus } from '@/arena/arenas';
import { Card, SectionTitle, Stat } from '@/ui/card';
import { Pill } from '@/ui/pill';
import { Screen } from '@/ui/screen';
import { Segmented } from '@/ui/segmented';
import { EmptyState, ErrorState, RowsSkeleton, Skeleton } from '@/ui/states';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

const MEDALS = ['🥇', '🥈', '🥉'];

/** A stable empty array, so an absent board does not remount the list each render. */
const EMPTY: LeaderboardEntry[] = [];

const keyExtractor = (e: LeaderboardEntry) => e.wallet;

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
  const viewed = useActiveWallet();
  const [week, setWeek] = useState<LeaderboardWeek>('current');
  const board = useLeaderboard(week, viewed, focused);
  const key = weekKey(board.data?.weekStart, week);
  const pool = usePrizePool(key, focused);
  const raffle = useRaffle(viewed, key, focused);
  const [refreshing, setRefreshing] = useState(false);

  const refetch = () => {
    setRefreshing(true);
    Promise.all([board.refetch(), pool.refetch(), raffle.refetch()]).finally(() => setRefreshing(false));
  };

  const rows = board.data?.data ?? EMPTY;
  const boardReady = !board.isPending && !board.isError;
  const myIndex = viewed ? rows.findIndex((e) => e.wallet === viewed) : -1;
  const pinned = board.data?.userEntry ?? null;
  const arena = arenaStatus(CURRENT_ARENA);

  // The rows are one card drawn in pieces: the first piece takes the top
  // corners, the last the bottom ones, and a hairline sits between each pair.
  // When your row is pinned above the list it is the top piece instead.
  const renderRow = useCallback(
    ({ item, index }: { item: LeaderboardEntry; index: number }) => (
      <Row entry={item} rank={index} you={viewed === item.wallet} top={index === 0 && !pinned} bottom={index === rows.length - 1} />
    ),
    [viewed, pinned, rows.length],
  );

  return (
    <Screen title="Ranks">
      {/* A FlatList rather than a ScrollView: the board runs to a hundred rows,
          and mounting all of them left several hundred views attached to this
          screen at all times, which the navigator re-attached on every focus.
          Everything above the board is the list header, so it still scrolls with
          the rows. */}
      <FlatList
        data={boardReady ? rows : EMPTY}
        keyExtractor={keyExtractor}
        renderItem={renderRow}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={colors.gold} />}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.weekRow}>
                {/* While a season runs the server scores the board over the season, not the week. */}
                <Segmented
                  options={[
                    { key: 'current', label: arena === 'active' ? 'This season' : 'This week' },
                    { key: 'last', label: 'Last week' },
                  ]}
                  value={week}
                  onChange={setWeek}
                />
                <Text style={[type.muted, { textAlign: 'center' }]}>{rangeLabel(board.data?.weekStart, board.data?.weekEnd ?? pool.data?.weekEnd)}</Text>
              </View>

              {pool.isPending ? (
                <Skeleton height={160} radius={radius.card} />
              ) : pool.isError ? (
                <ErrorState error={pool.error} onRetry={() => pool.refetch()} title="Could not load the prize pool" />
              ) : (
                <Card>
                  <Text style={type.label}>{pool.data.isCurrent ? 'Prize pool so far' : 'Prize pool'}</Text>
                  <Text style={styles.poolAmount}>{usd(pool.data.poolUsd)}</Text>
                  <View style={styles.statRow}>
                    {pool.data.split.slice(0, 3).map((s, i) => (
                      <Stat
                        key={`${s.kind}-${s.label}`}
                        label={s.medal ? `${s.medal} ${s.label}` : s.label}
                        value={usd(s.usd)}
                        align={i === 0 ? 'left' : i === 1 ? 'center' : 'right'}
                      />
                    ))}
                  </View>
                </Card>
              )}

              {raffle.isPending ? (
                <Skeleton height={120} radius={radius.card} />
              ) : raffle.isError ? (
                <ErrorState error={raffle.error} onRetry={() => raffle.refetch()} title="Could not load the raffle" />
              ) : (
                <Card style={{ gap: spacing.sm }}>
                  <Text style={type.heading}>Raffle</Text>
                  <Text style={type.muted}>{raffle.data.totalTickets} tickets in the draw</Text>
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
                </Card>
              )}

              <SectionTitle title="Points" />
              {board.isPending ? (
                <RowsSkeleton />
              ) : board.isError ? (
                <ErrorState error={board.error} onRetry={() => board.refetch()} title="Could not load the leaderboard" />
              ) : viewed && myIndex === -1 && !pinned ? (
                <Text style={type.muted}>Your wallet has no points this week yet.</Text>
              ) : null}
            </View>
            {boardReady && pinned ? <Row entry={pinned} rank={null} you top bottom={rows.length === 0} /> : null}
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
const Row = memo(function Row({ entry, rank, you, top, bottom }: { entry: LeaderboardEntry; rank: number | null; you: boolean; top: boolean; bottom: boolean }) {
  const href = (entry.username ? `/u/${encodeURIComponent(entry.username)}` : `/positions?wallet=${entry.wallet}`) as Href;
  return (
    <Link href={href} asChild>
      <Pressable
        style={StyleSheet.flatten([styles.row, top ? styles.rowTop : styles.divider, bottom && styles.rowBottom])}
        accessibilityRole="button"
        accessibilityLabel={`View ${entry.username ?? shortAddress(entry.wallet)}`}
      >
        <Text style={styles.rank}>{rank === null ? '·' : (MEDALS[rank] ?? rank + 1)}</Text>
        <Text style={{ fontSize: 20 }}>{entry.pfpEmoji ?? '🙂'}</Text>
        <View style={styles.rowName}>
          <Text style={styles.name} numberOfLines={1}>
            {entry.username ?? shortAddress(entry.wallet)}
          </Text>
          {you ? <Pill label="YOU" tone="gold" /> : null}
        </View>
        <Text style={type.money}>{entry.weeklyPoints.toLocaleString()}</Text>
      </Pressable>
    </Link>
  );
});

// A Pressable used as `<Link asChild>`'s child must be given a FLAT style,
// which is why the rows above go through StyleSheet.flatten.
const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingBottom: spacing.sm },
  weekRow: { alignItems: 'center', gap: spacing.sm },
  poolAmount: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 48, color: colors.text, fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  statRow: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm },


  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    minHeight: 56,
    backgroundColor: colors.surface,
  },
  rowTop: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  rowBottom: { borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text, flexShrink: 1 },
  rank: { width: 32, textAlign: 'center', fontFamily: fonts.bold, fontSize: 16, color: colors.textMuted, fontVariant: ['tabular-nums'] },
});
