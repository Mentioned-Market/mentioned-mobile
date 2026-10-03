import { useState } from 'react';
// Sign-in is the primary identity in the app: it is what gives you an account
// and a wallet you can trade from. The Seeker wallet is a separate, secondary
// thing (a funding source and a way to look at a wallet's positions), so it
// does not belong next to this.
//
// Signed out, the card shows the ways in themselves rather than a button to a
// screen that shows them: Google and X, then email as a link. Each opens the
// sign-in screen with that login already started (its `start` param), so the
// steps after it (the code, the wallet, a username) stay in one place.
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useProviderLogout } from '@/auth/logout';
import { shortAddress } from '@/lib/format';
import { useSession } from '@/store/session';
import { Button } from '@/ui/button';
import { ProviderButton } from '@/ui/provider-button';
import { TextLink } from '@/ui/text-link';
import { colors, radius, spacing, type } from '@/ui/theme';
import { unregisterForPush } from '@/notifications/push';

export function SignInCard({ compact = false }: { compact?: boolean }) {
  const wallet = useSession((s) => s.wallet);
  const clear = useSession((s) => s.clear);
  const logoutProviders = useProviderLogout();
  const [signingOut, setSigningOut] = useState(false);
  // Unregister push first: the route needs this session's bearer to know whose
  // device registration to remove, so clearing first would orphan it and the
  // phone would keep receiving the previous account's notifications. Then end
  // the Openfort and Privy sessions too, or the next sign-in skips straight to
  // the wallet step because an SDK still thinks it is signed in. That never
  // throws: the app's own session is cleared regardless.
  const signOut = async () => {
    setSigningOut(true);
    await unregisterForPush();
    await logoutProviders();
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
        <Button label={signingOut ? 'Signing out' : 'Sign out'} tone="neutral" size="sm" onPress={signOut} disabled={signingOut} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {!compact ? (
        <View style={{ gap: 4 }}>
          <Text style={type.heading}>Sign in to play</Text>
          <Text style={type.muted}>You get a wallet with no seed phrase to remember.</Text>
        </View>
      ) : null}
      <View style={{ gap: spacing.sm }}>
        <ProviderButton provider="google" onPress={() => router.push('/sign-in?start=google')} />
        <ProviderButton provider="x" onPress={() => router.push('/sign-in?start=x')} />
      </View>
      <TextLink label="Continue with email instead" onPress={() => router.push('/sign-in?start=email')} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.surface, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center' },
});
