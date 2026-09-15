// "Your picks" on a market screen: what this wallet holds here, one line each.
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing, type } from '@/ui/theme';

export type HeldRow = { key: string; word: string; side: 'YES' | 'NO' | 'PICK'; amount: string; value: string; tone?: 'up' | 'down' };

type Props = { connected: boolean; rows: HeldRow[]; balanceLine?: string; loading?: boolean };

export function YourPositions({ connected, rows, balanceLine, loading }: Props) {
  // Nothing to say is nothing on screen: a card that reads "no picks yet" was
  // taking the top of every market from people who had not traded it.
  if (!connected || (!loading && rows.length === 0 && !balanceLine)) return null;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={type.heading}>Your picks</Text>
        {balanceLine ? <Text style={type.muted}>{balanceLine}</Text> : null}
      </View>
      {loading ? (
        <Text style={type.muted}>Loading…</Text>
      ) : rows.length === 0 ? (
        <Text style={type.muted}>None on this market yet.</Text>
      ) : (
        rows.map((r, i) => (
          <View key={r.key} style={[styles.row, i > 0 && styles.divider]}>
            <Text style={[styles.side, { color: r.side === 'YES' ? colors.yes : r.side === 'NO' ? colors.no : colors.gold }]}>{r.side}</Text>
            <Text style={[type.body, { flex: 1, fontFamily: fonts.semibold }]} numberOfLines={1}>
              {r.word}
            </Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[type.money, { fontSize: 15 }, r.tone === 'up' && { color: colors.yes }, r.tone === 'down' && { color: colors.no }]}>{r.value}</Text>
              <Text style={[type.muted, { fontSize: 13, lineHeight: 18 }]}>{r.amount}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.surface, gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm, paddingBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  side: { width: 40, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.5 },
});
