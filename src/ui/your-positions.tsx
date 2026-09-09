// "Your positions" card at the top of a market screen (under the rules).
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing, type } from '@/ui/theme';

export type HeldRow = { key: string; word: string; side: 'YES' | 'NO' | 'PICK'; amount: string; value: string; tone?: 'up' | 'down' };

type Props = { connected: boolean; rows: HeldRow[]; balanceLine?: string; loading?: boolean };

export function YourPositions({ connected, rows, balanceLine, loading }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={type.heading}>Your positions</Text>
        {balanceLine ? <Text style={type.muted}>{balanceLine}</Text> : null}
      </View>
      {!connected ? (
        <Text style={type.muted}>Connect a wallet on the You tab to see your picks here.</Text>
      ) : loading ? (
        <Text style={type.muted}>Loading…</Text>
      ) : rows.length === 0 ? (
        <Text style={type.muted}>No picks on this market yet.</Text>
      ) : (
        rows.map((r) => (
          <View key={r.key} style={styles.row}>
            <Text style={[styles.side, { color: r.side === 'YES' ? colors.yes : r.side === 'NO' ? colors.no : colors.gold }]}>{r.side}</Text>
            <Text style={[type.body, { flex: 1, fontFamily: fonts.semibold }]} numberOfLines={1}>
              {r.word}
            </Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[type.money, { fontSize: 14 }, r.tone === 'up' && { color: colors.yes }, r.tone === 'down' && { color: colors.no }]}>{r.value}</Text>
              <Text style={type.muted}>{r.amount}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(242,183,31,0.35)', gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  side: { width: 40, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.5 },
});
