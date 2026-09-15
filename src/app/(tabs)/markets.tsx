// Markets: every market, sectioned by where it is in its life. The filter is
// the only control; the search button is the only other thing in the header.
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';

import { useFreeList, useIsScreenFocused, usePaidMajorityList, usePaidMarketsList } from '@/api/queries';
import { useNow } from '@/lib/use-now';
import { filterMarkets, isHero, mergeMarkets, sectionMarkets, type MarketFilter, type MarketSummary } from '@/markets/merge';
import { IconButton } from '@/ui/icon-button';
import { MarketCard } from '@/ui/market-card';
import { Screen } from '@/ui/screen';
import { Segmented } from '@/ui/segmented';
import { CardSkeleton, EmptyState, ErrorState } from '@/ui/states';
import { colors, fonts, spacing } from '@/ui/theme';

// Hoisted out of the render. As inline arrows these were a fresh component type
// on every render, so React tore down and rebuilt every separator in the list
// each time anything on the screen changed.
const ItemSeparator = () => <View style={styles.separator} />;
const SectionSeparator = () => <View style={{ height: spacing.xs }} />;

const renderSectionHeader = ({ section }: { section: { title: string; data: unknown[] } }) => (
  <Text style={styles.sectionTitle}>{section.title}</Text>
);

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
  // Only a first load shows the loader: once any list is on screen it stays
  // there through every poll, and a list that fails is reported above it.
  const loading = queries.every((q) => q.data === undefined) && queries.some((q) => q.isPending);
  const allFailed = queries.every((q) => q.isError);
  const someFailed = queries.some((q) => q.isError);
  const [refreshing, setRefreshing] = useState(false);

  const sections = useMemo(
    () => sectionMarkets(filterMarkets(mergeMarkets(paidMajority.data ?? [], paidYesNo.data ?? [], free.data ?? [], now), filter)),
    [paidMajority.data, paidYesNo.data, free.data, filter, now],
  );
  const empty = sections.length === 0;

  const renderItem = useCallback(
    ({ item, index, section }: { item: MarketSummary; index: number; section: { key: string } }) => (
      <MarketCard market={item} now={now} hero={section.key === 'open' && index === 0 && isHero(item)} />
    ),
    [now],
  );

  const retryAll = () => {
    setRefreshing(true);
    Promise.all(queries.map((q) => q.refetch())).finally(() => setRefreshing(false));
  };

  return (
    <Screen
      title="Markets"
      right={<IconButton name="search" label="Search" href="/search" />}
    >
      <Segmented options={FILTERS} value={filter} onChange={setFilter} stretch={false} size="sm" style={{ marginBottom: spacing.md }} />

      {loading && !allFailed ? (
        <View style={{ gap: spacing.md }}>
          <CardSkeleton />
          <CardSkeleton />
        </View>
      ) : allFailed ? (
        <ErrorState error={paidMajority.error ?? paidYesNo.error ?? free.error} onRetry={retryAll} title="Could not load markets" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(m) => `${m.kind}:${m.id}`}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          ItemSeparatorComponent={ItemSeparator}
          SectionSeparatorComponent={SectionSeparator}
          // A market card is a tall view tree with a cover image in it. The
          // default window keeps roughly twenty screens of them mounted, and
          // re-attaching that on every tab focus is what made switching to this
          // tab stall. Two screens either side is plenty for smooth scrolling.
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
          updateCellsBatchingPeriod={50}
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
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, color: colors.text, paddingTop: spacing.sm, paddingBottom: spacing.sm, paddingHorizontal: spacing.xs },
  separator: { height: spacing.md },
});
