// Openfort sign-in. Email code needs no dashboard configuration, so it works
// first; Google and X need the redirect on the dev screen allowlisted in the
// Openfort dashboard.
//
// After authenticating we recover or create the embedded Solana wallet, then
// hand the access token to the Mentioned sign-in route, which verifies it
// server side and binds a session to that exact wallet.
import { AccountTypeEnum, ChainTypeEnum, OAuthProvider } from '@openfort/openfort-js';
import { useEmailAuthOtp, useEmbeddedSolanaWallet, useOAuth, useOpenfortClient, useUser } from '@openfort/react-native';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { getProfile } from '@/api/user';
import { lastEncryptionSessionError, LegacyPrivyAccountError, WalletRoutingUnconfiguredError } from '@/auth/encryption-session';
import { useOpenfortLogout } from '@/auth/logout';
import { activateWallet } from '@/auth/recover-wallet';
import { chooseWalletAction, signInWithServer } from '@/auth/sign-in';
import { isOpenfortConfigured } from '@/config';
import { usePrefs } from '@/store/prefs';
import { useSession } from '@/store/session';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Loader } from '@/ui/loader';
import { Screen } from '@/ui/screen';
import { UsernameForm } from '@/ui/username-form';
import { colors, fonts, spacing, type } from '@/ui/theme';

export default function SignInScreen() {
  if (!isOpenfortConfigured) {
    return (
      <Screen title="Sign in" back>
        <Card style={styles.card}>
          <Text style={type.heading}>Not available in this build</Text>
          <Text style={type.muted}>This build was made without the Openfort keys, so sign-in is switched off. Browsing works as normal.</Text>
        </Card>
      </Screen>
    );
  }
  return <SignInFlow />;
}

type Step = 'email' | 'code' | 'wallet' | 'username' | 'done';

/** How long the whole wallet step gets before the card offers a way out. */
const WALLET_STEP_MS = 30_000;

function SignInFlow() {
  const router = useRouter();
  const { getAccessToken, isAuthenticated } = useUser();
  const solana = useEmbeddedSolanaWallet();
  const client = useOpenfortClient();
  // The latest hook state, for code that has to wait on it (see finish): the
  // `solana` a closure captured is a snapshot and never changes.
  const solanaRef = useRef(solana);
  useEffect(() => {
    solanaRef.current = solana;
  });
  const { requestEmailOtp, signInEmailOtp } = useEmailAuthOtp();
  const { initOAuth } = useOAuth();
  const logoutOpenfort = useOpenfortLogout();
  const setSession = useSession((s) => s.setSession);
  const sessionWallet = useSession((s) => s.wallet);
  const pendingRef = usePrefs((s) => s.pendingRef);
  const setPendingRef = usePrefs((s) => s.setPendingRef);

  const [chosenStep, setStep] = useState<Step | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Whether the wallet step has been started on this mount (see the effect
  // below). The ref is the guard the effect reads; the state is what the
  // render reads, since a ref cannot be read during render.
  const attempted = useRef(false);
  const [walletFailed, setWalletFailed] = useState(false);

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
      if (attempted.current) setWalletFailed(true);
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
      attempted.current = true;
      await finish();
    });

  // The browser login returns through a deep link (`/oauth/callback`), which
  // can remount this screen. Whichever instance gets there first sets up the
  // wallet; the effect below covers the remounted one.
  // The way out when the wallet step keeps failing: the SDK still holds the
  // login, so without this the screen reopens on the wallet step every time
  // and there is no Sign out to reach, since the app never got a session.
  const startOver = () =>
    run(async () => {
      await logoutOpenfort();
      attempted.current = false;
      setWalletFailed(false);
      setNote(null);
      setStep('email');
    });

  const withGoogle = () => run(async () => void (await initOAuth({ provider: OAuthProvider.GOOGLE })));
  const withX = () => run(async () => void (await initOAuth({ provider: OAuthProvider.TWITTER })));


  /** Recover or create the Solana wallet, then bind a Mentioned session to it. */
  const finish = async () => {
    setNote('Setting up your wallet…');
    // The hook's own wallet list fills in asynchronously and is empty for a
    // moment after login; acting on that snapshot once created a second,
    // empty wallet for a returning user. The client's list is the truth, and
    // the wallet the app already has a session for is preferred, so signing
    // in again always comes back to the same one.
    const accounts = await client.embeddedWallet.list({ chainType: ChainTypeEnum.SVM, accountType: AccountTypeEnum.EOA, limit: 100 });
    const choice = chooseWalletAction(accounts, sessionWallet);
    const address =
      choice.action === 'recover'
        ? await activateWallet({ client, address: choice.address, hook: () => solanaRef.current }).then(() => choice.address)
        : (await solana.create()).address;

    setNote('Signing in…');
    const token = await getAccessToken();
    if (!token) throw new Error('Openfort returned no access token');

    // A referral code caught from a link goes with the first sign-in after it
    // and is then forgotten, whether or not the server honoured it.
    const result = await signInWithServer({ token, wallet: address, ref: pendingRef });
    setSession(result.wallet, result.sessionToken);
    if (pendingRef) setPendingRef(null);
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

  // The wallet step runs itself: as soon as the SDK reports the person
  // authenticated and the wallet module has settled, finish() is called
  // without a button. Guarded so a re-render or a remount cannot start it
  // twice, and so a failure leaves the retry to the person.
  const settled = solana.status === 'connected' || solana.status === 'disconnected' || solana.status === 'needs-recovery';
  useEffect(() => {
    // Deliberately NOT guarded on an existing app session. That session can
    // outlive Openfort's (see src/store/wallet-link.ts), and signing in again
    // is exactly how it is repaired, so the wallet step has to run for someone
    // who already holds one. What stops a second run is `attempted` plus the
    // step, which finish() moves off 'wallet' as soon as it succeeds.
    if (step !== 'wallet' || !settled || busy || attempted.current) return;
    attempted.current = true;
    void run(finish);
    // finish and run are stable enough for this: the effect fires once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, settled, busy]);

  // And nothing at all after this long is a failure, not a wait: the SDK's
  // wallet state can sit in 'connecting' or 'error' indefinitely, in which
  // case `settled` never comes true, the step above never runs, and the card
  // would show a loader with no way out of it.
  useEffect(() => {
    if (step !== 'wallet') return;
    const timer = setTimeout(() => setWalletFailed(true), WALLET_STEP_MS);
    return () => clearTimeout(timer);
  }, [step]);

  return (
    <Screen title="Sign in" back>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'email' ? (
          <Card style={styles.card}>
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
          </Card>
        ) : null}

        {step === 'code' ? (
          <Card style={styles.card}>
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
          </Card>
        ) : null}

        {step === 'email' ? (
          <Card style={styles.card}>
            <Text style={type.heading}>Or continue with</Text>
            <Button label="Google" tone="neutral" onPress={withGoogle} disabled={busy} />
            <Button label="X" tone="neutral" onPress={withX} disabled={busy} />
            <Text style={type.muted}>Social sign-in needs the app redirect allowlisted in Openfort. Email works without it.</Text>
          </Card>
        ) : null}

        {step === 'wallet' ? (
          <Card style={styles.card}>
            {busy || !walletFailed ? (
              <Loader label={note ?? 'Setting up your wallet'} style={{ paddingVertical: spacing.md }} />
            ) : (
              <>
                <Text style={type.heading}>That did not finish</Text>
                <Text style={type.muted}>Your wallet is recovered or created here, then signed in to Mentioned.</Text>
                <Button
                  label="Try again"
                  onPress={() => {
                    setWalletFailed(false);
                    attempted.current = true;
                    void run(finish);
                  }}
                  disabled={busy}
                />
                <Button label="Use a different account" tone="neutral" onPress={startOver} disabled={busy} />
              </>
            )}
          </Card>
        ) : null}

        {step === 'username' && sessionWallet ? (
          <UsernameForm wallet={sessionWallet} onSaved={() => setStep('done')} />
        ) : null}

        {step === 'done' ? (
          <Card style={styles.card}>
            <Text style={type.heading}>Signed in</Text>
            <Text style={type.muted}>{note}</Text>
            <Button label="Done" onPress={() => router.replace('/you')} />
          </Card>
        ) : null}

        {note && step !== 'done' ? <Text style={type.muted}>{note}</Text> : null}
        {error ? <Text style={[type.body, { color: colors.no }]}>{error}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  card: { gap: spacing.sm },
  input: {
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
});
