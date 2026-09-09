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
import { Pill } from '@/ui/pill';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, Skeleton } from '@/ui/states';
import { colors, fonts, spacing, type } from '@/ui/theme';

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
      ...(paidMajority.data ?? []).filter((m) => m.title.toLowerCase().includes(needle)).map((m) => ({ key: `pm${m.marketId}`, title: m.title, cover: m.coverImageUrl, href: `/majority/${m.marketId}`, kind: 'PAID · MAJORITY' })),
      ...(paidYesNo.data ?? []).filter((m) => m.title.toLowerCase().includes(needle)).map((m) => ({ key: `pa${m.marketId}`, title: m.title, cover: m.coverImageUrl, href: `/paid/${m.marketId}`, kind: 'PAID' })),
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
    <Screen title="Search" back backLabel="Markets">
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
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={60} radius={12} />
            <Skeleton height={60} radius={12} />
          </View>
        ) : search.isError ? (
          <ErrorState error={search.error} onRetry={() => search.refetch()} title="Search failed" />
        ) : nothing ? (
          <EmptyState title="Nothing found" body={`No markets or players match "${q}".`} />
        ) : (
          <>
            {users.length > 0 ? <Text style={type.heading}>Players</Text> : null}
            {users.map((u) => (
              <Link key={u.wallet} href={u.username ? (`/u/${encodeURIComponent(u.username)}` as Href) : (`/positions?wallet=${u.wallet}` as Href)} asChild>
                <Pressable style={styles.row} accessibilityRole="button">
                  <Text style={{ fontSize: 22 }}>{u.pfpEmoji ?? '🙂'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { fontFamily: fonts.semibold }]}>{u.username ?? shortAddress(u.wallet)}</Text>
                    <Text style={type.muted}>{shortAddress(u.wallet)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              </Link>
            ))}
            {paidHits.length + freeHits.length > 0 ? <Text style={type.heading}>Markets</Text> : null}
            {paidHits.map((m) => (
              <Link key={m.key} href={m.href as Href} asChild>
                <Pressable style={styles.row} accessibilityRole="button">
                  <Cover uri={m.cover} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.body, { fontFamily: fonts.semibold }]} numberOfLines={2}>
                      {m.title}
                    </Text>
                    <Pill label={m.kind} tone="gold" />
                  </View>
                </Pressable>
              </Link>
            ))}
            {freeHits.map((m) => (
              <Pressable key={m.id} style={[styles.row, opening === m.id && { opacity: 0.6 }]} onPress={() => openFree(m.id)} accessibilityRole="button">
                <Cover uri={m.coverImageUrl} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.body, { fontFamily: fonts.semibold }]} numberOfLines={2}>
                    {m.title}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pill label="FREE" />
                    <Pill label={m.status.toUpperCase()} tone={m.status === 'open' ? 'green' : 'neutral'} />
                  </View>
                </View>
              </Pressable>
            ))}
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

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 48, paddingHorizontal: spacing.md, borderRadius: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.text, paddingVertical: 0 },
  content: { gap: spacing.sm, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cover: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
});
