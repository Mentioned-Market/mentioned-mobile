// Dev-only screen: runs the V0_GUIDE section 5 smoke tests on the device.
// Reached from the You tab in dev builds, or `adb shell am start -a android.intent.action.VIEW -d mentioned://dev`.
// `mentioned://dev?wallet=<base58>` sets the viewed wallet on open (QA shortcut).
// In a production build it opens only for a signed-in admin wallet, and sends
// everyone else Home (src/lib/dev-access.ts).
import { AccountTypeEnum, ChainTypeEnum, EmbeddedState } from '@openfort/openfort-js';
import { useEmbeddedSolanaWallet, useOpenfortClient, useUser } from '@openfort/react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { runSmokeTests, type SmokeResult } from '@/dev/smoke';
import * as Notifications from 'expo-notifications';

import { ensureChannel, getPushToken, requestPermission } from '@/notifications/push';
import * as Linking from 'expo-linking';

import { API_BASE, FLAVOR, isOpenfortConfigured } from '@/config';
import * as Application from 'expo-application';

import type { MobileConfig } from '@/api/mobileConfig';
import { useIsAdmin, useLeaderboard, useMobileConfig } from '@/api/queries';
import { devAccess } from '@/lib/dev-access';
import { evaluateMobileConfig } from '@/lib/mobile-config';
import { usePositionGroups } from '@/lib/use-position-groups';
import { standingOf, winKeys } from '@/markets/moments';
import { useActiveWallet } from '@/store/active-wallet';
import { useMoments } from '@/store/moments';
import { usePrivyAuth } from '@/auth/privy';
import { ensureEmbeddedSigner } from '@/auth/recover-wallet';
import { usePrefs } from '@/store/prefs';
import { useWalletLink } from '@/store/wallet-link';
import type { AttestationVariant } from '@/lib/attestation';
import { useSession } from '@/store/session';
import { useWallet } from '@/store/wallet';
import { AttestationSheet } from '@/ui/attestation-sheet';
import { BottomSheet } from '@/ui/bottom-sheet';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { showAchievements, showPoints } from '@/ui/toast';
import { WinMomentPreview } from '@/ui/win-moment';
import { HowItWorks } from '@/ui/how-it-works';
import { SeekerOfferCard } from '@/ui/seeker-offer';
import { seekerHomeOffer } from '@/lib/seeker-perk';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

export default function DevRoute() {
  const sessionWallet = useSession((st) => st.wallet);
  // Only a production release build has anything to ask the server.
  const gated = !__DEV__ && FLAVOR === 'production';
  const check = useIsAdmin(sessionWallet, gated);
  const access = devAccess({
    devBuild: __DEV__,
    flavor: FLAVOR,
    sessionWallet,
    admin: check.isFetchedAfterMount ? check.data : undefined,
    failed: check.isError,
  });
  if (access === 'checking') return <Screen title="" actions={false} />;
  if (access === 'denied') return <Redirect href="/" />;
  return <DevScreen />;
}

function DevScreen() {
  const [runId, setRunId] = useState(0);
  const [state, setState] = useState<{ running: boolean; results?: SmokeResult[]; fatal?: string }>({
    running: true,
  });

  const sessionWallet = useSession((st) => st.wallet);
  const sessionToken = useSession((st) => st.token);
  const mobile = useMobileConfig();

  // Printed so the address can be copied off the wire exactly, rather than read
  // off a screenshot. A wallet address is public; the bearer never gets logged.
  useEffect(() => {
    if (sessionWallet) console.log(`[dev] session wallet ${sessionWallet}`);
  }, [sessionWallet]);

  useEffect(() => {
    let active = true;
    runSmokeTests({ sessionToken })
      .then((results) => {
        for (const r of results) console.log(`[smoke] ${r.ok ? 'PASS' : 'FAIL'} ${r.name}: ${r.detail}`);
        if (active) setState({ running: false, results });
      })
      .catch((e: unknown) => {
        const fatal = e instanceof Error ? e.message : String(e);
        console.log(`[smoke] FATAL ${fatal}`);
        if (active) setState({ running: false, fatal });
      });
    return () => {
      active = false;
    };
  }, [runId, sessionToken]);

  const rerun = () => {
    setState({ running: true });
    setRunId((n) => n + 1);
  };
  const { running, results, fatal } = state;
  const { viewedAddress, setWallet, clear } = useWallet();
  const setIntroSeen = usePrefs((s) => s.setIntroSeen);
  const [addr, setAddr] = useState('');
  const { wallet: walletParam } = useLocalSearchParams<{ wallet?: string }>();
  useEffect(() => {
    if (walletParam && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletParam)) setWallet(walletParam, '');
  }, [walletParam, setWallet]);

  return (
    <Screen title="Smoke tests" actions={false}>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        <Card style={styles.row}>
          <Text style={type.heading}>Build</Text>
          <Text style={type.muted}>
            flavour {FLAVOR} · {API_BASE.replace('https://', '')} · Openfort {isOpenfortConfigured ? 'configured' : 'not configured'}
          </Text>
          {/* Whether the web returned a bearer token for this session. The
              token itself is never shown: only its presence and length, which
              is what tells you the mobile sign-in change is deployed. */}
          <Text style={type.muted}>
            session {sessionWallet ? 'signed in' : 'none'} · bearer{' '}
            {sessionToken ? `present (${sessionToken.length} chars)` : 'absent'}
          </Text>
          {/* Full and selectable: a wallet address is public, and this is the
              one you need to fund a fresh devnet account. The bearer above is
              deliberately never printed. */}
          {sessionWallet ? (
            <Text style={[type.body, { color: colors.gold }]} selectable>
              {sessionWallet}
            </Text>
          ) : null}
          {/* The exact string to allowlist as an OAuth redirect in the
              Openfort dashboard. The SDK derives it the same way. */}
          <Text style={type.muted}>
            app {Application.nativeApplicationVersion ?? '?'} · mobile config{' '}
            {mobile.isPending ? 'loading' : mobile.isError ? 'unreachable' : describeConfig(mobile.data)}
          </Text>
          <Text style={type.muted}>OAuth redirect</Text>
          <Text style={[type.body, { color: colors.gold }]} selectable>
            {Linking.createURL('/oauth/callback')}
          </Text>
        </Card>
        <WalletSection />
        <PushSection />
        <MomentsSection />
        <Card style={styles.row}>
          <Text style={type.heading}>View as any address</Text>
          <Text style={type.muted}>QA helper: sets the viewed wallet without MWA. Current: {viewedAddress ?? 'none'}</Text>
          <TextInput
            value={addr}
            onChangeText={setAddr}
            placeholder="Base58 wallet"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable onPress={() => addr.trim() && setWallet(addr.trim(), '')} style={styles.button}>
              <Text style={styles.buttonLabel}>Set</Text>
            </Pressable>
            <Pressable onPress={clear} style={[styles.button, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.buttonLabel, { color: colors.text }]}>Clear</Text>
            </Pressable>
          </View>
        </Card>
        <Pressable onPress={() => setIntroSeen(false)} style={[styles.button, { backgroundColor: colors.surfaceRaised }]}>
          <Text style={[styles.buttonLabel, { color: colors.text }]}>Show intro on next launch</Text>
        </Pressable>
        <Pressable onPress={rerun} disabled={running} style={[styles.button, running && styles.buttonDisabled]}>
          <Text style={styles.buttonLabel}>{running ? 'Running' : 'Run again'}</Text>
        </Pressable>
        {fatal ? <Text style={[type.body, { color: colors.no }]}>{fatal}</Text> : null}
        {results?.map((r) => (
          <Card key={r.name} style={styles.row}>
            <Text style={[type.heading, { color: r.ok ? colors.yes : colors.no }]}>
              {r.ok ? 'PASS' : 'FAIL'} {r.name}
            </Text>
            <Text style={type.muted} selectable>
              {r.detail}
            </Text>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

/** The server's mobile config in one line: what it does to this build, and what it switches off. */
function describeConfig(config: MobileConfig | null | undefined): string {
  if (!config) return 'none (route not deployed, so no rules)';
  const { gate, features } = evaluateMobileConfig(config, Application.nativeApplicationVersion ?? null);
  const off = (Object.keys(features) as (keyof typeof features)[]).filter((k) => !features[k]);
  return `${gate.kind} · server cluster ${config.cluster ?? '?'} · off: ${off.join(', ') || 'nothing'}`;
}

/** Permission in a word, from whichever call reported it. */
const describe = (p: Notifications.NotificationPermissionsStatus) => (p.granted ? 'granted' : p.canAskAgain ? 'not asked yet' : 'denied');

/**
 * Push, before the server can take a token: does this build have Firebase, does
 * the permission stick, and does a device token come back. The token is printed
 * to logcat in full and shown here in part, which is enough to tell a real
 * registration from a silent failure.
 */
/**
 * What the Openfort SDK thinks, on screen.
 *
 * A release build does not forward console output to logcat, so a wallet that
 * will not come back cannot be diagnosed from a device without this. Every
 * line here is a state some screen gates a signer on.
 */
function WalletSection() {
  const { isAuthenticated } = useUser();
  const solana = useEmbeddedSolanaWallet();
  const client = useOpenfortClient();
  const link = useWalletLink();
  const sessionProvider = useSession((st) => st.provider);
  const privy = usePrivyAuth();
  const [embedded, setEmbedded] = useState<string>('?');
  const [accounts, setAccounts] = useState<string>('?');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const read = async () => {
    setBusy(true);
    setNote(null);
    try {
      setEmbedded(EmbeddedState[await client.embeddedWallet.getEmbeddedState()] ?? 'unknown');
      const list = await client.embeddedWallet.list({ chainType: ChainTypeEnum.SVM, accountType: AccountTypeEnum.EOA, limit: 100 });
      setAccounts(list.length === 0 ? 'none' : list.map((a) => `${a.address.slice(0, 4)}…${a.address.slice(-4)} (${a.id.slice(0, 8)})`).join(', '));
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const recover = async () => {
    setBusy(true);
    setNote(null);
    try {
      const list = await client.embeddedWallet.list({ chainType: ChainTypeEnum.SVM, accountType: AccountTypeEnum.EOA, limit: 100 });
      const account = list[0];
      if (!account) throw new Error('no accounts to recover');
      await ensureEmbeddedSigner(client, account.id);
      setNote('recover returned; state ' + (EmbeddedState[await client.embeddedWallet.getEmbeddedState()] ?? '?'));
    } catch (e) {
      setNote(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    setBusy(true);
    setNote(null);
    try {
      const address = solana.wallets[0]?.address;
      if (!address) throw new Error('the hook lists no wallets');
      await solana.setActive({ address });
      setNote('setActive returned');
    } catch (e) {
      setNote(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.row}>
      <Text style={type.heading}>Wallet</Text>
      <Text style={type.muted}>
        session provider: {sessionProvider}
        {'\n'}privy: {privy.configured ? (privy.user ? 'signed in' : privy.ready ? 'signed out' : 'restoring') : 'not in this build'}
        {'\n'}openfort authenticated: {String(isAuthenticated)}
        {'\n'}hook status: {solana.status}
        {'\n'}hook wallets: {solana.wallets.length === 0 ? 'none' : solana.wallets.map((w) => `${w.address.slice(0, 4)}…${w.address.slice(-4)}`).join(', ')}
        {'\n'}embedded state: {embedded}
        {'\n'}client accounts: {accounts}
        {'\n'}link: {link.status}
        {link.message ? ` (${link.message})` : ''}
      </Text>
      {note ? <Text style={[type.muted, { color: colors.gold }]}>{note}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Pressable onPress={() => void read()} disabled={busy} style={styles.button}>
          <Text style={styles.buttonLabel}>Read</Text>
        </Pressable>
        <Pressable onPress={() => void recover()} disabled={busy} style={styles.button}>
          <Text style={styles.buttonLabel}>Recover</Text>
        </Pressable>
        <Pressable onPress={() => void activate()} disabled={busy} style={styles.button}>
          <Text style={styles.buttonLabel}>setActive</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function PushSection() {
  const [permission, setPermission] = useState('checking');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readPermission = async () => {
    const current = await Notifications.getPermissionsAsync();
    setPermission(describe(current));
    return current.granted;
  };

  // Written as a promise callback rather than an awaited call: the compiler's
  // lint refuses a setState reachable synchronously from an effect body.
  useEffect(() => {
    let cancelled = false;
    Notifications.getPermissionsAsync().then((current) => {
      if (!cancelled) setPermission(describe(current));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const register = async () => {
    setBusy(true);
    try {
      await ensureChannel();
      const granted = await requestPermission();
      await readPermission();
      const next = granted ? await getPushToken() : null;
      setToken(next);
      // Never the whole token in a log: it is what a sender addresses this phone
      // with, and device logs are easy to share by accident.
      console.log(`[push] device token ${next ? `${next.slice(0, 12)}… (${next.length} chars)` : 'none'}`);
    } catch (e) {
      console.log(`[push] failed ${e instanceof Error ? e.message : String(e)}`);
      setToken(null);
    } finally {
      setBusy(false);
    }
  };

  const showTest = async () => {
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      content: { title: 'New market', body: 'What will be said during England vs Spain?' },
      trigger: null,
    });
  };

  return (
    <Card style={styles.row}>
      <Text style={type.heading}>Push</Text>
      <Text style={type.muted}>permission {permission}</Text>
      <Text style={type.muted} selectable>
        token {token ? `${token.slice(0, 12)}…${token.slice(-6)} (${token.length} chars)` : 'none yet'}
      </Text>
      <Pressable onPress={register} disabled={busy} style={[styles.button, busy && styles.buttonDisabled]}>
        <Text style={styles.buttonLabel}>{busy ? 'Asking' : 'Ask and get token'}</Text>
      </Pressable>
      {/* Posted on this phone, no server: for checking how a notification looks
          (the icon, the colour) without waiting for a real one. */}
      <Pressable onPress={() => void showTest()} style={[styles.button, { backgroundColor: colors.surfaceRaised }]}>
        <Text style={styles.buttonLabel}>Show a test notification</Text>
      </Pressable>
    </Card>
  );
}

const SAMPLE_GRANT = { usdcBaseUnits: '1000000', lamports: '6000000', signature: null };
/** The three states Home can show, for the Moments preview. */
const SEEKER_SAMPLES = [
  { name: 'link', justFunded: false, status: { linked: false, seekerWallet: null, verifiedAt: null, grant: { ...SAMPLE_GRANT, status: 'available' as const } } },
  { name: 'claim', justFunded: false, status: { linked: true, seekerWallet: null, verifiedAt: null, grant: { ...SAMPLE_GRANT, status: 'available' as const } } },
  { name: 'funded', justFunded: true, status: { linked: true, seekerWallet: null, verifiedAt: null, grant: { ...SAMPLE_GRANT, status: 'funded' as const } } },
];

/**
 * QA for the moments (src/ui/win-moment.tsx, src/ui/toast.tsx, Home's "Your
 * week"). The toasts are previews; the other two go through the real path by
 * rewinding what this phone remembers, so Home then does what it would do.
 */
function MomentsSection() {
  const router = useRouter();
  const wallet = useActiveWallet();
  const groups = usePositionGroups(wallet, true);
  const board = useLeaderboard('current', wallet, true);
  const celebrated = useMoments((st) => (wallet ? st.celebrated[wallet] : undefined));
  const setCelebrated = useMoments((st) => st.setCelebrated);
  const setStanding = useMoments((st) => st.setStanding);
  const wins = winKeys(groups.finished);
  const standing = wallet && board.data ? standingOf(board.data, wallet) : null;
  const [previewWin, setPreviewWin] = useState(false);
  // The confirmation sheets open over another sheet, as they do over the trade
  // sheet, and save nothing: Confirm here only waits a moment and closes.
  const [underSheet, setUnderSheet] = useState(false);
  const [checklist, setChecklist] = useState<AttestationVariant | null>(null);

  const replayWin = () => {
    if (!wallet || wins.length === 0) return;
    setCelebrated(wallet, (celebrated ?? wins).filter((k) => k !== wins[0]));
    router.navigate('/');
  };
  const rewindWeek = () => {
    if (!wallet || !standing) return;
    setStanding(wallet, { week: standing.week, points: Math.max(0, standing.points - 50), rank: standing.rank === null ? null : standing.rank + 3 });
    router.navigate('/');
  };

  return (
    <Card style={styles.row}>
      <Text style={type.heading}>Moments</Text>
      <Text style={type.muted}>
        {wallet ? `${wins.length} finished win${wins.length === 1 ? '' : 's'} · ${standing ? `#${standing.rank ?? '?'} with ${standing.points} pts` : 'not on the board'}` : 'Sign in or set a viewed wallet first'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Pressable onPress={() => showPoints(50, 'Preview')} style={styles.button}>
          <Text style={styles.buttonLabel}>Points toast</Text>
        </Pressable>
        <Pressable onPress={() => showAchievements([{ emoji: '🃏', title: 'First Share', points: 60 }])} style={styles.button}>
          <Text style={styles.buttonLabel}>Achievement toast</Text>
        </Pressable>
        <Pressable onPress={() => setPreviewWin(true)} style={styles.button}>
          <Text style={styles.buttonLabel}>Win screen</Text>
        </Pressable>
        <Pressable onPress={replayWin} disabled={wins.length === 0} style={[styles.button, wins.length === 0 && styles.buttonDisabled]}>
          <Text style={styles.buttonLabel}>Replay my latest win</Text>
        </Pressable>
        <Pressable onPress={rewindWeek} disabled={!standing} style={[styles.button, !standing && styles.buttonDisabled]}>
          <Text style={styles.buttonLabel}>Preview week movement</Text>
        </Pressable>
      </View>
      <WinMomentPreview visible={previewWin} onClose={() => setPreviewWin(false)} />
      <Text style={type.muted}>The integrity confirmation, over a sheet the way it opens over a trade. Nothing is saved from here:</Text>
      <Pressable onPress={() => setUnderSheet(true)} style={[styles.button, { alignSelf: 'flex-start' }]}>
        <Text style={styles.buttonLabel}>Confirmation sheets</Text>
      </Pressable>
      <BottomSheet visible={underSheet} onClose={() => setUnderSheet(false)} title="Standing in for the trade sheet">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.md }}>
          {(['full', 'compact', 'arena'] as const).map((v) => (
            <Pressable key={v} onPress={() => setChecklist(v)} style={styles.button}>
              <Text style={styles.buttonLabel}>{v}</Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
      {checklist ? (
        <AttestationSheet
          key={checklist}
          variant={checklist}
          onConfirm={() => new Promise<true>((resolve) => setTimeout(() => resolve(true), 800))}
          onClosed={() => setChecklist(null)}
        />
      ) : null}
      <Text style={type.muted}>{"Home's Seeker offer, with sample amounts (the buttons do nothing here):"}</Text>
      {SEEKER_SAMPLES.map((sample) => {
        const offer = seekerHomeOffer(sample.status, sample.justFunded);
        return offer ? <SeekerOfferCard key={sample.name} offer={offer} busy={false} progress={null} error={null} onPress={() => {}} onDismiss={() => {}} /> : null;
      })}
      <Text style={type.muted}>{"Home's first card when signed out (its buttons work):"}</Text>
      <HowItWorks />
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md, paddingBottom: spacing.xl },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { ...type.heading, color: colors.bg },
  input: {
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.key,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  row: { gap: spacing.xs },
});
