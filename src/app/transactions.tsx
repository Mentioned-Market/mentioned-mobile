// Transaction history: money into and out of the app wallet. Trades and claims
// are on Positions; this is deposits, withdrawals and the Seeker welcome stake.
// Each row opens the transaction on Solscan.
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useWalletTransfers } from '@/api/queries';
import { transferRow } from '@/lib/transfers-view';
import { useSession } from '@/store/session';
import { Card, Row } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { SignInCard } from '@/ui/sign-in-card';
import { EmptyState, ErrorState, RowsSkeleton } from '@/ui/states';
import { colors, fonts, spacing, type } from '@/ui/theme';

export default function TransactionsScreen() {
  const wallet = useSession((s) => s.wallet);
  const history = useWalletTransfers(wallet);
  const [refreshing, setRefreshing] = useState(false);

  if (!wallet) {
    return (
      <Screen title="Transactions" back>
        <SignInCard />
      </Screen>
    );
  }

  const refresh = () => {
    setRefreshing(true);
    history.refetch().finally(() => setRefreshing(false));
  };
  const rows = (history.data?.transfers ?? []).map(transferRow);

  return (
    <Screen title="Transactions" back>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
      >
        {history.isPending ? (
          <RowsSkeleton rows={4} />
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => history.refetch()} title="Could not load your transactions" />
        ) : rows.length === 0 ? (
          <EmptyState title="No deposits or withdrawals yet" body="Money you add or withdraw shows here. Your picks are on Positions." />
        ) : (
          <>
            <Card padded={false} style={styles.list}>
              {rows.map((r, i) => (
                <Row key={r.key} first={i === 0} onPress={() => void Linking.openURL(r.explorerUrl)} label={`${r.title}, ${r.amount}. Opens Solscan.`}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.title} numberOfLines={1}>
                      {r.title}
                    </Text>
                    <Text style={type.muted} numberOfLines={1}>
                      {r.subtitle}
                    </Text>
                  </View>
                  <View style={styles.amounts}>
                    <Text style={[styles.amount, r.tone === 'up' && { color: colors.yes }]}>{r.amount}</Text>
                    {r.extra ? <Text style={[type.muted, styles.extra]}>{r.extra}</Text> : null}
                  </View>
                </Row>
              ))}
            </Card>
            <Text style={[type.muted, styles.note]}>Your most recent activity. Tap one to see it on Solscan.</Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  list: { paddingHorizontal: spacing.md },
  title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text },
  amounts: { alignItems: 'flex-end', gap: 2 },
  amount: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text, fontVariant: ['tabular-nums'] },
  extra: { fontVariant: ['tabular-nums'] },
  note: { textAlign: 'center' },
});
