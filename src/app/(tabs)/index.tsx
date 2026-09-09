import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';

import { useFreeList, useIsScreenFocused, usePaidMajorityList, usePaidMarketsList } from '@/api/queries';
import { useNow } from '@/lib/time';
import { filterMarkets, isHero, mergeMarkets, sectionMarkets, type MarketFilter } from '@/markets/merge';
import { MarketCard } from '@/ui/market-card';
import { Screen } from '@/ui/screen';
import { CardSkeleton, EmptyState, ErrorState } from '@/ui/states';
import { colors, fonts, spacing } from '@/ui/theme';

const FILTERS: { key: MarketFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'free', label: 'Free' },
  { key: 'paid', label: 'Paid' },
];

export default function MarketsScreen() {
  const focused = useIsScreenFocused();
  const now = useNow(30_000);
  const [filter, setFilter] = useState<MarketFilter>('all');

  const paidMajority = usePaidMajorityList(focused);
  const paidYesNo = usePaidMarketsList(focused);
  const free = useFreeList(focused);

  const queries = [paidMajority, paidYesNo, free];
  const loading = queries.some((q) => q.isPending);
  const allFailed = queries.every((q) => q.isError);
  const someFailed = queries.some((q) => q.isError);
  const [refreshing, setRefreshing] = useState(false);

  const sections = useMemo(
    () => sectionMarkets(filterMarkets(mergeMarkets(paidMajority.data ?? [], paidYesNo.data ?? [], free.data ?? [], now), filter)),
    [paidMajority.data, paidYesNo.data, free.data, filter, now],
  );
  const empty = sections.length === 0;

  const retryAll = () => {
    setRefreshing(true);
    Promise.all(queries.map((q) => q.refetch())).finally(() => setRefreshing(false));
  };

  return (
    <Screen
      title="Markets"
      right={
        <Link href="/search" asChild>
          <Pressable style={styles.searchButton} accessibilityRole="button" accessibilityLabel="Search">
            <Ionicons name="search" size={20} color={colors.text} />
          </Pressable>
        </Link>
      }>
      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading && !allFailed ? (
        <View style={styles.list}>
          <CardSkeleton />
          <CardSkeleton />
        </View>
      ) : allFailed ? (
        <ErrorState error={paidMajority.error ?? paidYesNo.error ?? free.error} onRetry={retryAll} title="Could not load markets" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(m) => `${m.kind}:${m.id}`}
          renderItem={({ item, index, section }) => <MarketCard market={item} now={now} hero={section.key === 'open' && index === 0 && isHero(item)} />}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          SectionSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListHeaderComponent={
            someFailed ? (
              <View style={{ marginBottom: spacing.md }}>
                <ErrorState error={paidMajority.error ?? paidYesNo.error ?? free.error} onRetry={retryAll} title="Some markets did not load" />
              </View>
            ) : null
          }
          ListEmptyComponent={empty ? <EmptyState title="No markets here yet" body={filter === 'all' ? 'Check back soon.' : 'Try another filter.'} /> : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retryAll} tintColor={colors.gold} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textMuted },
  chipLabelActive: { color: colors.bg },
  list: { paddingBottom: spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, color: colors.text },
  sectionCount: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textMuted },
  separator: { height: spacing.lg },
  searchButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
});
