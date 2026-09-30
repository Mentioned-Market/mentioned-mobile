// Push preferences: which kinds of notification reach this phone.
//
// Two separate switches decide whether a push arrives, and a person only sees
// one of them here. The server's per-kind preference is this screen's toggles;
// Android's own permission for the app sits above all of them. A toggle that is
// on while Android blocks the app delivers nothing, so the screen says which
// state the phone is in before offering the toggles at all.
//
// The website's Discord and Telegram flags live on the same route and are
// deliberately not shown: the app has no way to link either account.
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { updateNotificationSettings, type NotificationSettings, type PushSettingKey } from '@/api/notifications';
import { keys, useNotificationSettings } from '@/api/queries';
import { registerForPush } from '@/notifications/push';
import { useSession } from '@/store/session';
import { Button } from '@/ui/button';
import { Card, Row } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { SignInCard } from '@/ui/sign-in-card';
import { ErrorState, RowsSkeleton } from '@/ui/states';
import { colors, fonts, spacing, type } from '@/ui/theme';

/** The website's own wording for the three categories, most personal first. */
const ROWS: { key: PushSettingKey; label: string; description: string }[] = [
  { key: 'push_resolutions', label: 'Market resolutions', description: 'When a market you traded resolves.' },
  { key: 'push_new_markets', label: 'New markets', description: 'When a new free or paid market goes live.' },
  { key: 'push_dev_updates', label: 'Product updates', description: 'New features and announcements from the team.' },
];

type Permission = 'checking' | 'granted' | 'undetermined' | 'denied';

const readPermission = (p: Notifications.NotificationPermissionsStatus): Permission =>
  p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';

export default function NotificationSettingsScreen() {
  const queryClient = useQueryClient();
  const signedIn = !!useSession((s) => s.token);
  const settings = useNotificationSettings(signedIn);
  const [permission, setPermission] = useState<Permission>('checking');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read the permission now, and again whenever the app comes back to the
  // foreground: the usual way out of "denied" is a trip to Android's settings,
  // and the screen should reflect the change the moment the person returns.
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      Notifications.getPermissionsAsync().then((p) => {
        if (!cancelled) setPermission(readPermission(p));
      });
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const turnOn = async () => {
    setAsking(true);
    // Registration asks for the permission and, if granted, hands the token to
    // the server, which is the whole point of turning notifications on.
    await registerForPush();
    setPermission(readPermission(await Notifications.getPermissionsAsync()));
    setAsking(false);
  };

  const toggle = async (key: PushSettingKey, value: boolean) => {
    setError(null);
    const previous = queryClient.getQueryData<NotificationSettings>(keys.notificationSettings);
    // Optimistic: a switch that lags a network round trip feels broken.
    queryClient.setQueryData<NotificationSettings>(keys.notificationSettings, { ...previous, [key]: value });
    try {
      const saved = await updateNotificationSettings({ [key]: value });
      queryClient.setQueryData(keys.notificationSettings, saved);
    } catch {
      queryClient.setQueryData(keys.notificationSettings, previous);
      setError('That did not save. Check your connection and try again.');
    }
  };

  if (!signedIn) {
    return (
      <Screen title="Notifications" back actions={['search', 'chat']}>
        <SignInCard />
      </Screen>
    );
  }

  // A server without the push migration returns none of the push keys.
  const supported = settings.data ? ROWS.every((r) => typeof settings.data[r.key] === 'boolean') : true;

  return (
    <Screen title="Notifications" back actions={['search', 'chat']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {permission === 'denied' ? (
          <Card style={styles.card}>
            <Text style={type.heading}>Notifications are off for Mentioned</Text>
            <Text style={type.muted}>
              Android is blocking them for this app, so nothing arrives whatever is chosen below. Turn them on in the phone&apos;s settings.
            </Text>
            <Button label="Open settings" tone="neutral" onPress={() => Linking.openSettings()} />
          </Card>
        ) : permission === 'undetermined' ? (
          <Card style={styles.card}>
            <Text style={type.heading}>Turn on notifications</Text>
            <Text style={type.muted}>Get told when a market you traded resolves, without having to check.</Text>
            <Button label={asking ? 'Asking' : 'Turn on'} onPress={turnOn} disabled={asking} />
          </Card>
        ) : null}

        {settings.isPending ? (
          <RowsSkeleton />
        ) : settings.isError ? (
          <ErrorState error={settings.error} onRetry={() => settings.refetch()} title="Could not load your settings" />
        ) : !supported ? (
          <Card style={styles.card}>
            <Text style={type.muted}>Push settings are not available on this server yet.</Text>
          </Card>
        ) : (
          <Card padded={false} style={styles.toggles}>
            {ROWS.map((row, i) => {
              const on = settings.data?.[row.key] === true;
              return (
                <Row key={row.key} first={i === 0}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.body, { fontFamily: fonts.semibold }]}>{row.label}</Text>
                    <Text style={type.muted}>{row.description}</Text>
                  </View>
                  <Switch
                    value={on}
                    onValueChange={(v) => toggle(row.key, v)}
                    trackColor={{ false: colors.surfaceRaised, true: colors.gold }}
                    thumbColor={colors.text}
                    accessibilityLabel={row.label}
                  />
                </Row>
              );
            })}
          </Card>
        )}
        {error ? <Text style={[type.muted, { color: colors.no }]}>{error}</Text> : null}
        <Text style={type.muted}>Everything also appears in the notification feed, whichever of these are on.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  card: { gap: spacing.sm },
  toggles: { paddingHorizontal: spacing.md },
});
