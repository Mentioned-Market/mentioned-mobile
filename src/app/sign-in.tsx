// Openfort sign-in, with Privy for accounts made before the move to Openfort.
// Email code needs no dashboard configuration, so it works first; Google and
// X need the redirect on the dev screen allowlisted in the Openfort dashboard.
//
// After authenticating we recover or create the embedded Solana wallet, then
// hand the access token to the Mentioned sign-in route, which verifies it
// server side and binds a session to that exact wallet.
//
// Everyone starts on Openfort. When the server recognises the identity as a
// pre-Openfort Privy account, it refuses to mint an Openfort wallet (409
// LEGACY_PRIVY_ACCOUNT) and this screen hands the person to Privy instead,
// the way the website does. Privy is never offered before that answer. See
// src/auth/wallet-routing.ts for the whole rule.
import { AccountTypeEnum, ChainTypeEnum, OAuthProvider } from '@openfort/openfort-js';
import { useEmailAuthOtp, useEmbeddedSolanaWallet, useOAuth, useOpenfortClient, useUser } from '@openfort/react-native';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { getProfile } from '@/api/user';
import {
  clearEncryptionSessionError,
  lastEncryptionSessionError,
  LegacyPrivyAccountError,
  WalletRoutingUnconfiguredError,
} from '@/auth/encryption-session';
import { useOpenfortLogout, useProviderLogout } from '@/auth/logout';
import { usePrivyAuth, type PrivyUserLike } from '@/auth/privy';
import { activateWallet } from '@/auth/recover-wallet';
import { chooseWalletAction, SignInError, signInWithServer } from '@/auth/sign-in';
import { handoffFor, privySolanaWallet, type WalletProvider } from '@/auth/wallet-routing';
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

type Step =
  | 'email'
  | 'code'
  | 'wallet'
  /** The server matched this identity to an account from before Openfort. */
  | 'privy'
  | 'privy-code'
  | 'privy-wallet'
  | 'username'
  | 'done';

/** How long the whole wallet step gets before the card offers a way out. */
const WALLET_STEP_MS = 30_000;

/** Said when Privy has no account for the login the person just used. */
const NO_LEGACY_LOGIN =
  'No account from before the upgrade uses that login. Try the way you first signed in, or an email code to the same address.';

function SignInFlow() {
  const router = useRouter();
  const { getAccessToken, isAuthenticated } = useUser();
  const solana = useEmbeddedSolanaWallet();
  const client = useOpenfortClient();
  const privy = usePrivyAuth();
  // The latest hook state, for code that has to wait on it (see finish): the
  // `solana` and `privy` a closure captured are snapshots and never change.
  const solanaRef = useRef(solana);
  const privyRef = useRef(privy);
  useEffect(() => {
    solanaRef.current = solana;
    privyRef.current = privy;
  });
  const { requestEmailOtp, signInEmailOtp } = useEmailAuthOtp();
  const { initOAuth } = useOAuth();
  const logoutOpenfort = useOpenfortLogout();
  const logoutProviders = useProviderLogout();
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

  // Each SDK keeps its own session, so someone who authenticated but whose
  // wallet step failed returns already signed in, and a browser login returns
  // through a deep link that can remount this screen. Both SDKs report signed
  // out on the first render while they restore, so derive the step rather
  // than storing a stale one. Privy is checked first: someone is only ever
  // signed in to it after Openfort turned them away and was signed out.
  const step: Step = chosenStep ?? (privy.user ? 'privy-wallet' : isAuthenticated ? 'wallet' : 'email');
  const onWalletStep = step === 'wallet' || step === 'privy-wallet';

  /** Hand a legacy account to Privy, leaving Openfort signed out behind it. */
  const toPrivy = async () => {
    attempted.current = false;
    setWalletFailed(false);
    setError(null);
    setNote(null);
    setCode('');
    try {
      await logoutOpenfort();
    } catch (e) {
      // Harmless: the Privy step never reads Openfort, and signing out of the
      // app ends both sessions anyway.
      console.log('[sign-in] openfort logout before privy failed', e);
    }
    setStep('privy');
  };

  /** Back to the normal sign-in, for a Privy account the server will not take. */
  const toOpenfort = async (message: string) => {
    attempted.current = false;
    setWalletFailed(false);
    setNote(null);
    setCode('');
    try {
      await privyRef.current.logout();
    } catch (e) {
      console.log('[sign-in] privy logout failed', e);
    }
    setStep('email');
    setError(message);
  };

  const fail = (e: unknown) => {
    // The SDK reports a summary like "Failed to create Solana wallet" and
    // hides the real reason underneath, so log the whole thing and show the
    // cause when there is one.
    console.log('[sign-in] failed', e);
    const handoff = handoffFor(e);
    if (handoff === 'use-privy' && privyRef.current.configured) {
      // Not a failure: this person's account is on Privy. Cleared here, not
      // in toPrivy, so run() does not mark the new step as failed.
      attempted.current = false;
      void toPrivy();
      return;
    }
    if (e instanceof SignInError && e.code === 'PRIVY_SIGNUP_CLOSED') {
      attempted.current = false;
      void toOpenfort('That login has no account from before the upgrade. Sign in below to continue.');
      return;
    }
    if (handoff === 'use-openfort') {
      // Privy refused a login it has never seen. Stay here: the account the
      // server matched may use a different login method.
      setError(NO_LEGACY_LOGIN);
      return;
    }
    // A legacy account in a build without the Privy keys lands here, and is
    // told to use the website.
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
      setError('Openfort’s wallet page did not respond in time. Check the connection and try again.');
      return;
    }
    const cause = err?.cause instanceof Error ? err.cause.message : typeof err?.cause === 'string' ? err.cause : null;
    setError([err?.message ?? 'Something went wrong.', cause].filter(Boolean).join('. '));
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    // A fresh attempt: an earlier attempt's encryption-session answer must not
    // decide how this one's failure is read.
    clearEncryptionSessionError();
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
      await logoutProviders();
      attempted.current = false;
      setWalletFailed(false);
      setNote(null);
      setCode('');
      setStep('email');
    });

  const withGoogle = () => run(async () => void (await initOAuth({ provider: OAuthProvider.GOOGLE })));
  const withX = () => run(async () => void (await initOAuth({ provider: OAuthProvider.TWITTER })));

  // Privy, for a legacy account. Every login here passes disableSignup (see
  // src/auth/privy.tsx), so an identity Privy has never seen is refused
  // rather than given a new account.
  const privySendCode = () =>
    run(async () => {
      await privy.sendEmailCode(email.trim());
      setStep('privy-code');
      setNote(`Code sent to ${email.trim()}`);
    });

  const privyVerifyCode = () =>
    run(async () => {
      const user = await privy.loginWithEmailCode(email.trim(), code.trim());
      setStep('privy-wallet');
      attempted.current = true;
      await finishPrivy(user);
    });

  const privyOAuth = (provider: 'google' | 'twitter') =>
    run(async () => {
      const user = await privy.loginWithOAuth(provider);
      if (!user) return;
      setStep('privy-wallet');
      attempted.current = true;
      await finishPrivy(user);
    });

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
    await bindSession({ token, wallet: address, provider: 'openfort' });
  };

  /**
   * Bind a Mentioned session to the legacy account's Privy wallet. Nothing is
   * created: the wallet is the one Privy made when the account signed up, and
   * an account without one is sent to the website rather than given another.
   */
  const finishPrivy = async (loggedIn?: PrivyUserLike) => {
    setNote('Signing in…');
    const user = loggedIn ?? privyRef.current.user;
    const address = privySolanaWallet(user?.linked_accounts, sessionWallet);
    if (!address) throw new Error('No wallet was found on this account. Sign in on mentioned.market to check it.');
    const token = await privyRef.current.getAccessToken();
    if (!token) throw new Error('Privy returned no access token');
    await bindSession({ token, wallet: address, provider: 'privy' });
  };

  const bindSession = async (params: { token: string; wallet: string; provider: WalletProvider }) => {
    // A referral code caught from a link goes with the first sign-in after it
    // and is then forgotten, whether or not the server honoured it.
    const result = await signInWithServer({ ...params, ref: pendingRef });
    setSession(result.wallet, result.sessionToken, params.provider);
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
      result.sessionToken ? 'Signed in.' : 'Verified by the server. The session token is not returned to mobile yet, so trading stays disabled.',
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
    // The Privy case is the remounted screen after Privy's browser login, or a
    // Privy session left from an attempt that did not finish.
    const next = step === 'wallet' && settled ? finish : step === 'privy-wallet' && privy.user ? () => finishPrivy() : null;
    if (!next || busy || attempted.current) return;
    attempted.current = true;
    void run(next);
    // finish and run are stable enough for this: the effect fires once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, settled, busy, privy.user]);

  // And nothing at all after this long is a failure, not a wait: the SDK's
  // wallet state can sit in 'connecting' or 'error' indefinitely, in which
  // case `settled` never comes true, the step above never runs, and the card
  // would show a loader with no way out of it.
  useEffect(() => {
    if (!onWalletStep) return;
    const timer = setTimeout(() => setWalletFailed(true), WALLET_STEP_MS);
    return () => clearTimeout(timer);
  }, [onWalletStep]);

  const retryWallet = () => {
    setWalletFailed(false);
    attempted.current = true;
    void run(step === 'privy-wallet' ? () => finishPrivy() : finish);
  };

  return (
    <Screen title="Sign in" back>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'email' ? (
          <Card style={styles.card}>
            <Text style={type.heading}>Email code</Text>
            <Text style={type.muted}>No password. We send a code to your email.</Text>
            <EmailInput value={email} onChangeText={setEmail} />
            <Button label={busy ? 'Sending' : 'Send code'} onPress={sendCode} disabled={busy || !email.includes('@')} />
          </Card>
        ) : null}

        {step === 'code' ? (
          <Card style={styles.card}>
            <Text style={type.heading}>Enter the code</Text>
            <CodeInput value={code} onChangeText={setCode} />
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

        {step === 'privy' ? (
          <>
            <Card style={styles.card}>
              <Text style={type.heading}>Welcome back</Text>
              <Text style={type.muted}>
                Your account was made before we upgraded sign-in. Sign in the way you did then to reach it. Your funds and positions are all there.
              </Text>
              <Button label="Continue with Google" tone="neutral" onPress={() => privyOAuth('google')} disabled={busy} />
              <Button label="Continue with X" tone="neutral" onPress={() => privyOAuth('twitter')} disabled={busy} />
            </Card>
            <Card style={styles.card}>
              <Text style={type.heading}>Or an email code</Text>
              <EmailInput value={email} onChangeText={setEmail} />
              <Button label={busy ? 'Sending' : 'Send code'} onPress={privySendCode} disabled={busy || !email.includes('@')} />
              <Button label="Use a different account" tone="neutral" onPress={startOver} disabled={busy} />
            </Card>
          </>
        ) : null}

        {step === 'privy-code' ? (
          <Card style={styles.card}>
            <Text style={type.heading}>Enter the code</Text>
            <Text style={type.muted}>This is a new code, sent for your account from before the upgrade.</Text>
            <CodeInput value={code} onChangeText={setCode} />
            <Button label={busy ? 'Checking' : 'Confirm'} onPress={privyVerifyCode} disabled={busy || code.trim().length < 4} />
            <Button
              label="Go back"
              tone="neutral"
              onPress={() => {
                setCode('');
                setNote(null);
                setStep('privy');
              }}
              disabled={busy}
            />
          </Card>
        ) : null}

        {onWalletStep ? (
          <Card style={styles.card}>
            {busy || !walletFailed ? (
              <Loader label={note ?? 'Setting up your wallet'} style={{ paddingVertical: spacing.md }} />
            ) : (
              <>
                <Text style={type.heading}>That did not finish</Text>
                <Text style={type.muted}>
                  {step === 'privy-wallet'
                    ? 'Your account from before the upgrade is signed in here, then to Mentioned.'
                    : 'Your wallet is recovered or created here, then signed in to Mentioned.'}
                </Text>
                <Button label="Try again" onPress={retryWallet} disabled={busy} />
                <Button label="Use a different account" tone="neutral" onPress={startOver} disabled={busy} />
              </>
            )}
          </Card>
        ) : null}

        {step === 'username' && sessionWallet ? <UsernameForm wallet={sessionWallet} onSaved={() => setStep('done')} /> : null}

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

function EmailInput(props: { value: string; onChangeText: (v: string) => void }) {
  return (
    <TextInput
      {...props}
      placeholder="you@example.com"
      placeholderTextColor={colors.textMuted}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="email-address"
      style={styles.input}
      accessibilityLabel="Email address"
    />
  );
}

function CodeInput(props: { value: string; onChangeText: (v: string) => void }) {
  return (
    <TextInput
      {...props}
      placeholder="123456"
      placeholderTextColor={colors.textMuted}
      keyboardType="number-pad"
      style={styles.input}
      accessibilityLabel="Email code"
    />
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
