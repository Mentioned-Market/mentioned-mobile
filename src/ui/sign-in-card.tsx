import { useState } from 'react';
// Sign-in is the primary identity in the app: it is what gives you an account
// and a wallet you can trade from. The Seeker wallet is a separate, secondary
// thing (a funding source and a way to look at a wallet's positions), so it
// does not belong next to this.
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { shortAddress } from '@/lib/format';
import { useSession } from '@/store/session';
import { Button } from '@/ui/button';
import { colors, spacing, type } from '@/ui/theme';
import { unregisterForPush } from '@/notifications/push';

export function SignInCard({ compact = false }: { compact?: boolean }) {
  const wallet = useSession((s) => s.wallet);
  const clear = useSession((s) => s.clear);
  const [signingOut, setSigningOut] = useState(false);
  // Unregister push first: the route needs this session's bearer to know whose
  // device registration to remove, so clearing first would orphan it and the
  // phone would keep receiving the previous account's notifications.
  const signOut = async () => {
    setSigningOut(true);
    await unregisterForPush();
    clear();
    setSigningOut(false);
  };

  if (wallet) {
    return (
      <View style={[styles.card, styles.row]}>
        <View style={{ flex: 1 }}>
          <Text style={type.muted}>Signed in</Text>
          <Text style={type.money}>{shortAddress(wallet)}</Text>
        </View>
        <Button label={signingOut ? 'Signing out' : 'Sign out'} tone="neutral" onPress={signOut} disabled={signingOut} style={{ minWidth: 120 }} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {!compact ? (
        <View style={{ gap: 4 }}>
          <Text style={type.heading}>Sign in to play</Text>
          <Text style={type.muted}>Google, X or an email code. You get a wallet with no seed phrase to remember.</Text>
        </View>
      ) : null}
      <Link href="/sign-in" asChild>
        <Button label="Sign in" />
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(242,183,31,0.35)', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center' },
});
