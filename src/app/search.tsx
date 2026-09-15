// Search (SPEC v1 step 2). The server searches users and free markets; paid
// markets are matched client-side from the already loaded lists.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getFreeMarket } from '@/api/free';
import { useFreeList, usePaidMajorityList, usePaidMarketsList, useSearch } from '@/api/queries';
import { shortAddress } from '@/lib/format';
import { Card, SectionTitle, rowStyle } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, RowsSkeleton } from '@/ui/states';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function SearchScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const search = useSearch(q);
  const paidMajority = usePaidMajorityList(false);
  const paidYesNo = usePaidMarketsList(false);
  const free = useFreeList(false);
  const [opening, setOpening] = useState<number | null>(null);

  const paidHits = useMemo(() => {
    if (q.length < 2) return [];
    const needle = q.toLowerCase();
    return [
      ...(paidMajority.data ?? []).filter((m) => m.title.toLowerCase().includes(needle)).map((m) => ({ key: `pm${m.marketId}`, title: m.title, cover: m.coverImageUrl, href: `/majority/${m.marketId}`, kind: 'Paid majority' })),
      ...(paidYesNo.data ?? []).filter((m) => m.title.toLowerCase().includes(needle)).map((m) => ({ key: `pa${m.marketId}`, title: m.title, cover: m.coverImageUrl, href: `/paid/${m.marketId}`, kind: 'Paid' })),
    ];
  }, [q, paidMajority.data, paidYesNo.data]);

  // Free search hits carry no market_type; resolve it from the list or the market route.
  const openFree = async (id: number) => {
    const listed = free.data?.find((m) => m.id === id);
    let majority = listed?.market_type === 'majority';
    if (!listed) {
      setOpening(id);
      try {
        majority = (await getFreeMarket(id)).market.market_type === 'majority';
      } catch {
        majority = false;
      } finally {
        setOpening(null);
      }
    }
    router.push((majority ? `/free-majority/${id}` : `/free/${id}`) as Href);
  };

  const users = search.data?.results ?? [];
  const freeHits = search.data?.markets ?? [];
  const nothing = q.length >= 2 && !search.isPending && users.length + freeHits.length + paidHits.length === 0;

  return (
    <Screen title="Search" back>
      <View style={styles.field}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Markets, players, wallets"
          placeholderTextColor={colors.textMuted}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
          accessibilityLabel="Search"
        />
        {text ? (
          <Pressable onPress={() => setText('')} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {q.length < 2 ? (
          <Text style={type.muted}>Type at least two characters.</Text>
        ) : search.isPending ? (
          <RowsSkeleton rows={2} />
        ) : search.isError ? (
          <ErrorState error={search.error} onRetry={() => search.refetch()} title="Search failed" />
        ) : nothing ? (
          <EmptyState title="Nothing found" body={`No markets or players match "${q}".`} />
        ) : (
          <>
            {users.length > 0 ? (
              <View style={styles.section}>
                <SectionTitle title="Players" />
                <Card padded={false} style={styles.listCard}>
                  {users.map((u, i) => (
                    <Link key={u.wallet} href={u.username ? (`/u/${encodeURIComponent(u.username)}` as Href) : (`/positions?wallet=${u.wallet}` as Href)} asChild>
                      <Pressable style={rowStyle(i === 0)} accessibilityRole="button">
                        <Text style={{ fontSize: 22 }}>{u.pfpEmoji ?? '🙂'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.name}>{u.username ?? shortAddress(u.wallet)}</Text>
                          <Text style={type.muted}>{shortAddress(u.wallet)}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      </Pressable>
                    </Link>
                  ))}
                </Card>
              </View>
            ) : null}
            {paidHits.length + freeHits.length > 0 ? (
              <View style={styles.section}>
                <SectionTitle title="Markets" />
                <Card padded={false} style={styles.listCard}>
                  {paidHits.map((m, i) => (
                    <Link key={m.key} href={m.href as Href} asChild>
                      <Pressable style={rowStyle(i === 0)} accessibilityRole="button">
                        <Cover uri={m.cover} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.name} numberOfLines={2}>
                            {m.title}
                          </Text>
                          <Text style={type.muted}>{m.kind}</Text>
                        </View>
                      </Pressable>
                    </Link>
                  ))}
                  {freeHits.map((m, i) => (
                    <Pressable key={m.id} style={[rowStyle(paidHits.length + i === 0), opening === m.id && { opacity: 0.6 }]} onPress={() => openFree(m.id)} accessibilityRole="button">
                      <Cover uri={m.coverImageUrl} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.name} numberOfLines={2}>
                          {m.title}
                        </Text>
                        <Text style={type.muted}>Free · {m.status.charAt(0).toUpperCase() + m.status.slice(1)}</Text>
                      </View>
                    </Pressable>
                  ))}
                </Card>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Cover({ uri }: { uri: string | null }) {
  return (
    <View style={styles.cover}>{uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={{ fontSize: 18 }}>🎯</Text>}</View>
  );
}

// Rows that are `<Link asChild>`'s child are given the flat style from rowStyle().
const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, paddingHorizontal: spacing.md, borderRadius: radius.control, backgroundColor: colors.surfaceRaised, marginBottom: spacing.md },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.text, paddingVertical: 0 },
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  section: { gap: spacing.sm },
  listCard: { paddingHorizontal: spacing.md },
  name: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: colors.text },
  cover: { width: 48, height: 48, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
});
