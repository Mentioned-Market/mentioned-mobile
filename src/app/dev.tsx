// Dev-only screen: runs the V0_GUIDE section 5 smoke tests on the device.
// Reached from the You tab in dev builds, or `adb shell am start -a android.intent.action.VIEW -d mentioned://dev`.
// `mentioned://dev?wallet=<base58>` sets the viewed wallet on open (QA shortcut).
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { runSmokeTests, type SmokeResult } from '@/dev/smoke';
import { usePrefs } from '@/store/prefs';
import { useWallet } from '@/store/wallet';
import { Screen } from '@/ui/screen';
import { colors, fonts, spacing, type } from '@/ui/theme';

export default function DevScreen() {
  const [runId, setRunId] = useState(0);
  const [state, setState] = useState<{ running: boolean; results?: SmokeResult[]; fatal?: string }>({
    running: true,
  });

  useEffect(() => {
    let active = true;
    runSmokeTests()
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
  }, [runId]);

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
    <Screen title="Smoke tests" subtitle="Ported SDKs against production">
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          <Text style={type.heading}>View as any address</Text>
          <Text style={type.muted}>QA helper: sets the viewed wallet without MWA. Current: {viewedAddress ?? 'none'}</Text>
          <TextInput value={addr} onChangeText={setAddr} placeholder="Base58 wallet" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} style={styles.input} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable onPress={() => addr.trim() && setWallet(addr.trim(), '')} style={styles.button}>
              <Text style={styles.buttonLabel}>Set</Text>
            </Pressable>
            <Pressable onPress={clear} style={[styles.button, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.buttonLabel, { color: colors.text }]}>Clear</Text>
            </Pressable>
          </View>
        </View>
        <Pressable onPress={() => setIntroSeen(false)} style={[styles.button, { backgroundColor: colors.surfaceRaised }]}>
          <Text style={[styles.buttonLabel, { color: colors.text }]}>Show intro on next launch</Text>
        </Pressable>
        <Pressable onPress={rerun} disabled={running} style={[styles.button, running && styles.buttonDisabled]}>
          <Text style={styles.buttonLabel}>{running ? 'Running' : 'Run again'}</Text>
        </Pressable>
        {fatal ? <Text style={[type.body, { color: colors.no }]}>{fatal}</Text> : null}
        {results?.map((r) => (
          <View key={r.name} style={styles.row}>
            <Text style={[type.heading, { color: r.ok ? colors.yes : colors.no }]}>
              {r.ok ? 'PASS' : 'FAIL'} {r.name}
            </Text>
            <Text style={type.muted} selectable>
              {r.detail}
            </Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
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
  input: { height: 44, paddingHorizontal: spacing.md, borderRadius: 10, backgroundColor: colors.surfaceRaised, color: colors.text, fontFamily: fonts.medium, fontSize: 14 },
  row: {
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
});
