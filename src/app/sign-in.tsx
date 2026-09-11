// Openfort sign-in. Email code needs no dashboard configuration, so it works
// first; Google and X need the redirect on the dev screen allowlisted in the
// Openfort dashboard.
//
// After authenticating we recover or create the embedded Solana wallet, then
// hand the access token to the Mentioned sign-in route, which verifies it
// server side and binds a session to that exact wallet.
import { OAuthProvider } from '@openfort/openfort-js';
import { useEmailAuthOtp, useEmbeddedSolanaWallet, useOAuth, useUser } from '@openfort/react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getProfile } from '@/api/user';
import { lastEncryptionSessionError, LegacyPrivyAccountError, WalletRoutingUnconfiguredError } from '@/auth/encryption-session';
import { chooseWalletAction, signInWithServer } from '@/auth/sign-in';
import { isOpenfortConfigured } from '@/config';
import { useSession } from '@/store/session';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { UsernameForm } from '@/ui/username-form';
import { colors, fonts, spacing, type } from '@/ui/theme';

export default function SignInScreen() {
  if (!isOpenfortConfigured) {
    return (
      <Screen title="Sign in" back backLabel="Back">
        <View style={styles.card}>
          <Text style={type.heading}>Not available in this build</Text>
          <Text style={type.muted}>This build was made without the Openfort keys, so sign-in is switched off. Browsing works as normal.</Text>
        </View>
      </Screen>
    );
  }
  return <SignInFlow />;
}

type Step = 'email' | 'code' | 'wallet' | 'username' | 'done';

function SignInFlow() {
  const router = useRouter();
  const { getAccessToken, isAuthenticated } = useUser();
  const solana = useEmbeddedSolanaWallet();
  const { requestEmailOtp, signInEmailOtp } = useEmailAuthOtp();
  const { initOAuth } = useOAuth();
  const setSession = useSession((s) => s.setSession);
  const sessionWallet = useSession((s) => s.wallet);

  const [chosenStep, setStep] = useState<Step | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Openfort keeps its own session, so someone who authenticated but whose
  // wallet step failed returns already signed in. `isAuthenticated` is false on
  // the first render while the SDK restores that session, so derive the step
  // rather than storing a stale one.
  const step: Step = chosenStep ?? (isAuthenticated ? 'wallet' : 'email');

  const fail = (e: unknown) => {
    // The SDK reports a summary like "Failed to create Solana wallet" and
    // hides the real reason underneath, so log the whole thing and show the
    // cause when there is one.
    console.log('[sign-in] failed', e);
    if (e instanceof LegacyPrivyAccountError || e instanceof WalletRoutingUnconfiguredError) {
      setError(e.message);
      return;
    }
    // The SDK reports a bare "Failed to create Solana wallet" and drops the
    // cause, so read back what the encryption-session call actually hit.
    const underlying = lastEncryptionSessionError();
    if (underlying) {
      setError(underlying.message);
      return;
    }
    const err = e as { name?: string; message?: string; cause?: unknown };
    // Openfort serves the embedded wallet page only to origins on the
    // project's dashboard allowlist. A mobile app is not a web origin, so
    // until it is registered the page 403s and the handshake times out.
    if (err?.name === 'IframeHandshakeTimeoutError') {
      setError('Openfort\u2019s wallet page did not respond in time. Check the connection and try again.');
      return;
    }
    const cause = err?.cause instanceof Error ? err.cause.message : typeof err?.cause === 'string' ? err.cause : null;
    setError([err?.message ?? 'Something went wrong.', cause].filter(Boolean).join('. '));
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      await requestEmailOtp({ email: email.trim() });
      setStep('code');
      setNote(`Code sent to ${email.trim()}`);
    });

  const verifyCode = () =>
    run(async () => {
      await signInEmailOtp({ email: email.trim(), otp: code.trim() });
      setStep('wallet');
      await finish();
    });

  const withGoogle = () => run(async () => void (await initOAuth({ provider: OAuthProvider.GOOGLE })));
  const withX = () => run(async () => void (await initOAuth({ provider: OAuthProvider.TWITTER })));

  /** Recover or create the Solana wallet, then bind a Mentioned session to it. */
  const finish = async () => {
    setNote('Setting up your wallet…');
    let address: string | undefined;
    if (solana.status === 'connected') {
      address = solana.wallets[0]?.address;
    } else if (solana.status === 'disconnected' || solana.status === 'needs-recovery') {
      const choice = chooseWalletAction(solana.wallets);
      if (choice.action === 'recover') {
        await solana.setActive({ address: choice.address });
        address = choice.address;
      } else {
        address = (await solana.create()).address;
      }
    }
    if (!address) throw new Error(`Wallet is ${solana.status}; try again in a moment.`);

    setNote('Signing in…');
    const token = await getAccessToken();
    if (!token) throw new Error('Openfort returned no access token');

    const result = await signInWithServer({ token, wallet: address });
    setSession(result.wallet, result.sessionToken);
    // A new account has no profile row until it picks a username, so ask now,
    // the way the website does, rather than leave it half set up.
    let hasName = true;
    try {
      hasName = !!(await getProfile(result.wallet)).username;
    } catch {
      // If the profile cannot be read, do not block sign-in on it; the You tab
      // asks again whenever the username is missing.
    }
    setStep(hasName ? 'done' : 'username');
    setNote(
      result.sessionToken ? 'Signed in.' : 'Openfort verified by the server. The session token is not returned to mobile yet, so trading stays disabled.',
    );
  };

  return (
    <Screen title="Sign in" back backLabel="Back">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'email' ? (
          <View style={styles.card}>
            <Text style={type.heading}>Email code</Text>
            <Text style={type.muted}>No password. We send a code to your email.</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
              accessibilityLabel="Email address"
            />
            <Button label={busy ? 'Sending' : 'Send code'} onPress={sendCode} disabled={busy || !email.includes('@')} />
          </View>
        ) : null}

        {step === 'code' ? (
          <View style={styles.card}>
            <Text style={type.heading}>Enter the code</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={styles.input}
              accessibilityLabel="Email code"
            />
            <Button label={busy ? 'Checking' : 'Confirm'} onPress={verifyCode} disabled={busy || code.trim().length < 4} />
            <Button label="Use a different email" tone="neutral" onPress={() => setStep('email')} disabled={busy} />
          </View>
        ) : null}

        {step === 'email' ? (
          <View style={styles.card}>
            <Text style={type.heading}>Or continue with</Text>
            <Button label="Google" tone="neutral" onPress={withGoogle} disabled={busy} />
            <Button label="X" tone="neutral" onPress={withX} disabled={busy} />
            <Text style={type.muted}>Social sign-in needs the app redirect allowlisted in Openfort. Email works without it.</Text>
          </View>
        ) : null}

        {step === 'wallet' ? (
          <View style={styles.card}>
            <Text style={type.heading}>Finish setting up</Text>
            <Text style={type.muted}>You are signed in with Openfort. This step recovers your Solana wallet, or creates one if you do not have it yet.</Text>
            <Button label={busy ? 'Working' : 'Set up wallet'} onPress={() => run(finish)} disabled={busy} />
          </View>
        ) : null}

        {step === 'username' && sessionWallet ? (
          <UsernameForm wallet={sessionWallet} onSaved={() => setStep('done')} />
        ) : null}

        {step === 'done' ? (
          <View style={styles.card}>
            <Text style={type.heading}>Signed in</Text>
            <Text style={type.muted}>{note}</Text>
            <Button label="Done" onPress={() => router.replace('/you')} />
          </View>
        ) : null}

        {note && step !== 'done' ? <Text style={type.muted}>{note}</Text> : null}
        {error ? <Text style={[type.body, { color: colors.no }]}>{error}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  input: {
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
});
