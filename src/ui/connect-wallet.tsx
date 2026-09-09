// "View as your Seeker wallet" (V0_GUIDE section 8). One MWA authorize, the
// address stored, nothing signed. Shared by the You and Positions tabs.
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { connectSeekerWallet, disconnectSeekerWallet, isNoWalletError } from '@/chain/mwa';
import { shortAddress } from '@/lib/format';
import { useWallet } from '@/store/wallet';
import { Button } from '@/ui/button';
import { colors, spacing, type } from '@/ui/theme';

export function ConnectWallet({ compact = false }: { compact?: boolean }) {
  const { viewedAddress, authToken, setWallet, clear } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const w = await connectSeekerWallet(authToken);
      setWallet(w.address, w.authToken);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(isNoWalletError(e) ? 'Install Phantom or Solflare to view your positions.' : e instanceof Error ? e.message : 'Could not connect.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      if (authToken) await disconnectSeekerWallet(authToken).catch(() => undefined);
    } finally {
      clear();
      setBusy(false);
    }
  };

  if (viewedAddress) {
    return (
      <View style={[styles.card, compact && styles.compact]}>
        <View style={{ flex: 1 }}>
          <Text style={type.muted}>Viewing as</Text>
          <Text style={type.money}>{shortAddress(viewedAddress)}</Text>
        </View>
        <Button label={busy ? 'Working' : 'Disconnect'} tone="neutral" onPress={disconnect} disabled={busy} style={{ minWidth: 130 }} />
      </View>
    );
  }
  return (
    <View style={styles.card}>
      {!compact ? (
        <View style={{ gap: 4 }}>
          <Text style={type.heading}>View as your Seeker wallet</Text>
          <Text style={type.muted}>Connect the Seed Vault wallet to see its positions and profile. Nothing is signed.</Text>
        </View>
      ) : null}
      <Button label={busy ? 'Connecting' : 'Connect Seeker wallet'} onPress={connect} disabled={busy} />
      {error ? <Text style={[type.muted, { color: colors.no }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  compact: { flexDirection: 'row', alignItems: 'center' },
});
