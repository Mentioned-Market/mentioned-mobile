// Dev-only screen: runs the V0_GUIDE section 5 smoke tests on the device.
// Reached from the You tab in dev builds, or `adb shell am start -a android.intent.action.VIEW -d mentioned://dev`.
// `mentioned://dev?wallet=<base58>` sets the viewed wallet on open (QA shortcut).
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { runSmokeTests, type SmokeResult } from '@/dev/smoke';
import * as Notifications from 'expo-notifications';

import { ensureChannel, getPushToken, requestPermission } from '@/notifications/push';
import * as Linking from 'expo-linking';

import { API_BASE, FLAVOR, isOpenfortConfigured } from '@/config';
import * as Application from 'expo-application';

import type { MobileConfig } from '@/api/mobileConfig';
import { useMobileConfig } from '@/api/queries';
import { evaluateMobileConfig } from '@/lib/mobile-config';
import { usePrefs } from '@/store/prefs';
import { useSession } from '@/store/session';
import { useWallet } from '@/store/wallet';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

export default function DevScreen() {
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
    <Screen title="Smoke tests">
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
        <PushSection />
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
