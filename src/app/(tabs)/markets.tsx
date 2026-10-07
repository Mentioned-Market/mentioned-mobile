// Markets: every market, sectioned by where it is in its life. One row of
// filters: All / Free / Paid on the left, the category on the right, as on the
// website. The header carries the shared search, chat and bell.
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';

import { useCategories, useFreeList, useIsScreenFocused, usePaidMajorityList, usePaidMarketsList } from '@/api/queries';
import { useNow } from '@/lib/use-now';
import { activeCategory, chooseFilter, filterByCategory, filterCounts, usedCategories } from '@/markets/categories';
import { filterMarkets, mergeMarkets, sectionMarkets, type MarketFilter, type MarketSummary } from '@/markets/merge';
import { Dropdown } from '@/ui/dropdown';
import { FilterTabs } from '@/ui/filter-tabs';
import { MarketCard } from '@/ui/market-card';
import { Screen } from '@/ui/screen';
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


export default function MarketsScreen() {
  const focused = useIsScreenFocused();
  const now = useNow(30_000);
  const [filter, setFilter] = useState<MarketFilter>('all');
  const [pickedCategory, setPickedCategory] = useState<string | null>(null);
  const categoryList = useCategories();

  const paidMajority = usePaidMajorityList(focused);
  const paidYesNo = usePaidMarketsList(focused);
  const free = useFreeList(focused);

  const queries = [paidMajority, paidYesNo, free];
  // Only a first load shows the loader: once any list is on screen it stays
  // there through every poll, and a list that fails is reported above it.
  const loading = queries.every((q) => q.data === undefined) && queries.some((q) => q.isPending);
  const allFailed = queries.every((q) => q.isError);
  // Only a list the filter shows can be missing from it: a paid list that
  // failed is no gap on Free.
  const shown = filter === 'free' ? [free] : filter === 'paid' ? [paidMajority, paidYesNo] : queries;
  const failed = shown.find((q) => q.isError);
  const [refreshing, setRefreshing] = useState(false);

  const all = useMemo(
    () => mergeMarkets(paidMajority.data ?? [], paidYesNo.data ?? [], free.data ?? [], now),
    [paidMajority.data, paidYesNo.data, free.data, now],
  );
  // Only categories with a listed market are offered, and a category narrows
  // every tab and its count (src/markets/categories.ts).
  const offered = useMemo(() => usedCategories(categoryList.data ?? [], all), [categoryList.data, all]);
  const category = activeCategory(pickedCategory, offered);
  const inCategory = useMemo(() => filterByCategory(all, category), [all, category]);
  const counts = filterCounts(inCategory);
  const sections = useMemo(() => sectionMarkets(filterMarkets(inCategory, filter)), [inCategory, filter]);
  const empty = sections.length === 0;

  const pickFilter = (next: MarketFilter) => {
    const chosen = chooseFilter(next, category);
    setFilter(chosen.filter);
    setPickedCategory(chosen.category);
  };

  // Every card looks the same now; `isHero` only decides the order, which
  // `mergeMarkets` has already applied.
  const renderItem = useCallback(({ item }: { item: MarketSummary }) => <MarketCard market={item} />, []);

  const retryAll = () => {
    setRefreshing(true);
    Promise.all(queries.map((q) => q.refetch())).finally(() => setRefreshing(false));
  };

  return (
    <Screen
      title="Markets"
    >
      <View style={styles.filters}>
        <FilterTabs
          tabs={[
            { key: 'all', label: 'All' },
            { key: 'free', label: 'Free', count: counts.free },
            { key: 'paid', label: 'Paid', count: counts.paid },
          ]}
          value={filter}
          onChange={pickFilter}
        />
        {offered.length > 0 ? (
          <Dropdown
            placeholder="Category"
            clearLabel="All categories"
            options={offered.map((c) => ({ key: c.slug, label: c.name }))}
            value={category}
            onChange={setPickedCategory}
          />
        ) : null}
      </View>

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
            failed ? (
              <View style={{ marginBottom: spacing.md }}>
                <ErrorState error={failed.error} onRetry={retryAll} title="Some markets did not load" />
              </View>
            ) : null
          }
          ListEmptyComponent={empty ? <EmptyState title="No markets here yet" body={filter === 'all' && !category ? 'Check back soon.' : 'Try another filter.'} /> : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retryAll} tintColor={colors.gold} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Tabs on the left, the category on the right, with whatever room is left between them.
  filters: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, color: colors.text, paddingTop: spacing.sm, paddingBottom: spacing.sm, paddingHorizontal: spacing.xs },
  separator: { height: spacing.md },
});
