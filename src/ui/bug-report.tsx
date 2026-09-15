// Reporting a bug without leaving the app.
//
// The report lands in a Discord channel, where nobody can ask a follow-up
// question, so the app attaches what it would otherwise have to ask for: the
// build, the phone, the cluster and the wallet. The box itself stays for the
// one thing only the user knows, which is what went wrong.
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '@/api/client';
import { BUG_REPORT_MAX, reportBug } from '@/api/support';
import { FLAVOR } from '@/config';
import { Button } from '@/ui/button';
import { colors, spacing, type } from '@/ui/theme';

/** What the report carries besides the words: enough to reproduce it. */
export function debugInfo(wallet: string | null): Record<string, string> {
  const version = Application.nativeApplicationVersion ?? 'unknown';
  const build = Application.nativeBuildVersion ?? '?';
  return {
    app: `${version} (${build})`,
    device: `${Device.manufacturer ?? ''} ${Device.modelName ?? 'unknown'}`.trim(),
    os: `${Platform.OS} ${Device.osVersion ?? ''}`.trim(),
    cluster: FLAVOR,
    wallet: wallet ?? 'signed out',
  };
}

export function BugReport({ wallet }: { wallet: string | null }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const message = text.trim();
    if (!message) return;
    setBusy(true);
    setError(null);
    try {
      await reportBug(message, debugInfo(wallet));
      setSent(true);
      setText('');
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 429
            ? 'A few reports have gone in already. Try again later.'
            : e.status === 503
              ? 'Bug reports are not switched on right now.'
              : 'That did not send. Try again in a moment.'
          : 'That did not send. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.card}>
        <Text style={type.body}>Thanks. That is with us.</Text>
        <Text style={type.muted}>Your build, phone and wallet went with it, so we can find it.</Text>
        <Button label="Report something else" tone="neutral" onPress={() => setSent(false)} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={type.muted}>What went wrong? Your build, phone and wallet are attached automatically.</Text>
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v.slice(0, BUG_REPORT_MAX));
          setError(null);
        }}
        placeholder="The buy sheet closed before it finished"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={BUG_REPORT_MAX}
        style={styles.input}
        accessibilityLabel="What went wrong"
      />
      <Text style={type.muted}>
        {text.trim().length}/{BUG_REPORT_MAX}
      </Text>
      {error ? <Text style={[type.muted, { color: colors.no }]}>{error}</Text> : null}
      <Button label={busy ? 'Sending' : 'Send report'} onPress={send} disabled={busy || text.trim().length === 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, borderRadius: 24, backgroundColor: colors.surface, gap: spacing.sm },
  input: {
    minHeight: 96,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
});
