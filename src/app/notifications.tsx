// The notification feed: what the server has already decided to tell this
// wallet, oldest concern first in the sense that nothing here is urgent.
//
// Opening the screen marks everything read, which is what the badge means: not
// "you have unseen rows" but "you have not looked since these arrived". Rows
// stay in place afterwards rather than disappearing, so the list does not
// rearrange itself under a thumb that is still reading.
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getFreeMarket, getFreeMarketIdBySlug } from '@/api/free';
import { clearNotifications, markNotificationsRead, type Notification } from '@/api/notifications';
import { keys, useNotifications } from '@/api/queries';
import { ago, toMs } from '@/lib/time';
import { notificationTarget } from '@/notifications/link';
import { useSession } from '@/store/session';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { SignInCard } from '@/ui/sign-in-card';
import { EmptyState, ErrorState, Skeleton } from '@/ui/states';
import { colors, fonts, spacing, type } from '@/ui/theme';

/** The website's own per-type emoji, for rows with no market cover. */
const ICON: Record<string, string> = {
  new_free_market: '🎮',
  new_paid_market: '💰',
  new_paid_majority_market: '💰',
  free_market_resolved: '🏆',
  paid_market_resolved: '🏆',
  paid_majority_resolved: '🏆',
  dev_update: '📣',
};

/** `metadata` is free-form on the server; these two fields are the ones it fills. */
function meta(n: Notification): { emoji?: string; imageUrl?: string | null } {
  const m = n.metadata as { emoji?: unknown; imageUrl?: unknown } | null | undefined;
  return {
    emoji: typeof m?.emoji === 'string' ? m.emoji : undefined,
    imageUrl: typeof m?.imageUrl === 'string' ? m.imageUrl : null,
  };
}

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const signedIn = !!useSession((s) => s.token);
  const feed = useNotifications(signedIn);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const rows = useMemo(() => feed.data?.pages.flat() ?? [], [feed.data]);
  const unreadIds = useMemo(() => rows.filter((n) => !n.read_at).map((n) => n.id), [rows]);

  // Looking at the screen is what marks them read. The rows keep their unread
  // styling for this visit; only the badge changes, which is the thing the
  // count was ever about.
  useEffect(() => {
    if (!signedIn || unreadIds.length === 0) return;
    let cancelled = false;
    markNotificationsRead(unreadIds)
      .then(() => {
        if (!cancelled) void queryClient.invalidateQueries({ queryKey: keys.notificationsUnread });
      })
      .catch(() => {
        // The badge simply stays until the next visit.
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, unreadIds, queryClient]);

  const refresh = () => {
    setRefreshing(true);
    feed.refetch().finally(() => setRefreshing(false));
  };

  const open = async (n: Notification) => {
    const target = notificationTarget(n.link);
    if (!target) return;
    if (target.kind === 'route') {
      router.push(target.href as Href);
      return;
    }
    // A free market is a slug on the website and an id in the app, and which
    // screen it opens depends on whether it is a majority market, so both have
    // to be looked up before there is anywhere to go.
    setOpening(n.id);
    try {
      const id = await getFreeMarketIdBySlug(target.slug);
      const market = await getFreeMarket(id);
      router.push((market.market.market_type === 'majority' ? `/free-majority/${id}` : `/free/${id}`) as Href);
    } catch {
      // Nothing to show, so nothing happens: the row stays where it was.
    } finally {
      setOpening(null);
    }
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      await clearNotifications();
      await queryClient.invalidateQueries({ queryKey: keys.notifications });
      await queryClient.invalidateQueries({ queryKey: keys.notificationsUnread });
    } catch {
      // Left as it was; the list still shows what is there.
    } finally {
      setClearing(false);
    }
  };

  return (
    <Screen title="Notifications" back backLabel="Back">
      {!signedIn ? (
        <SignInCard />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
        >
          {feed.isPending ? (
            <View style={{ gap: spacing.sm }}>
              <Skeleton height={64} radius={12} />
              <Skeleton height={64} radius={12} />
              <Skeleton height={64} radius={12} />
            </View>
          ) : feed.isError ? (
            <ErrorState error={feed.error} onRetry={refresh} title="Could not load notifications" />
          ) : rows.length === 0 ? (
            <EmptyState title="Nothing yet" body="Market resolutions, new markets and updates land here." />
          ) : (
            <>
              {rows.map((n) => {
                const { emoji, imageUrl } = meta(n);
                const tappable = notificationTarget(n.link) !== null;
                return (
                  <Pressable
                    key={n.id}
                    onPress={() => open(n)}
                    disabled={!tappable || opening === n.id}
                    style={[styles.row, !n.read_at && styles.rowUnread]}
                    accessibilityRole={tappable ? 'link' : 'text'}
                  >
                    <View style={styles.avatar}>
                      {imageUrl ? (
                        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      ) : (
                        <Text style={{ fontSize: 18 }}>{emoji ?? ICON[n.type] ?? '🔔'}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.body, { fontFamily: fonts.semibold }]} numberOfLines={2}>
                        {n.title}
                      </Text>
                      {n.body ? (
                        <Text style={type.muted} numberOfLines={3}>
                          {n.body}
                        </Text>
                      ) : null}
                      <Text style={type.muted}>{ago(toMs(n.created_at))}</Text>
                    </View>
                    {!n.read_at ? <View style={styles.dot} /> : null}
                    {tappable ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
                  </Pressable>
                );
              })}

              {feed.hasNextPage ? (
                <Button
                  label={feed.isFetchingNextPage ? 'Loading' : 'Load older'}
                  tone="neutral"
                  onPress={() => feed.fetchNextPage()}
                  disabled={feed.isFetchingNextPage}
                />
              ) : null}
              <Button label={clearing ? 'Clearing' : 'Clear all'} tone="neutral" onPress={clearAll} disabled={clearing} />
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowUnread: { borderColor: 'rgba(242,183,31,0.45)' },
  avatar: { width: 36, height: 36, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
});
