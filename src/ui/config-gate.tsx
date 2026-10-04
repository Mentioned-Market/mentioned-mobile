// The server's say over whether this build runs: a maintenance screen when the
// kill switch is on, an update screen when this build is below the minimum, and
// the per-feature flags for everything else.
//
// All the judgement lives in `@/lib/mobile-config`, which is tested; this file
// only draws it. Until a config has been fetched (or when the route does not
// exist) the app runs normally: the gate can only ever close on an explicit
// instruction, never on a missing one.
import * as Application from 'expo-application';
import * as Linking from 'expo-linking';
import { useMemo, useState, type ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMobileConfig } from '@/api/queries';
import { evaluateMobileConfig, storeListingUrl, type Features } from '@/lib/mobile-config';
import { readPoints, type PointsRules } from '@/lib/points-rules';
import { Button } from '@/ui/button';
import { colors, fonts, spacing, type } from '@/ui/theme';

/** The installed build's version, e.g. "0.1.0". Null on a platform that cannot say. */
const APP_VERSION = Application.nativeApplicationVersion ?? null;

/** Which features this build may use right now. Everything is on until the server says otherwise. */
export function useFeatures(): Features {
  const config = useMobileConfig();
  return evaluateMobileConfig(config.data, APP_VERSION).features;
}

/** How points are earned right now: the server's numbers, over the ones this build shipped with. */
export function usePointsRules(): PointsRules {
  const points = useMobileConfig().data?.points;
  return useMemo(() => readPoints(points), [points]);
}

/** The note a disabled trade button shows when its feature is switched off. */
export const PAUSED_NOTE = 'Trading is paused right now';

export function ConfigGate({ children }: { children: ReactNode }) {
  const config = useMobileConfig();
  const { gate } = evaluateMobileConfig(config.data, APP_VERSION);
  // Set when the update link would not open: a build installed some other way
  // than through the dApp Store has no store app to hand the link to.
  const [linkFailed, setLinkFailed] = useState(false);
  if (gate.kind === 'ok') return <>{children}</>;

  const retry = () => void config.refetch();
  // The server's link when it names one, this app's own store page otherwise.
  const updateUrl = gate.kind === 'update' ? (gate.updateUrl ?? storeListingUrl(Application.applicationId)) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Image source={require('@/assets/images/logo-mark.png')} style={styles.logo} resizeMode="contain" />
        {gate.kind === 'maintenance' ? (
          <>
            <Text style={styles.title}>Back shortly</Text>
            <Text style={styles.text}>
              {gate.message ?? 'Mentioned is paused for maintenance. This is temporary, and nothing you hold changes while the app is paused.'}
            </Text>
            <Button label={config.isFetching ? 'Checking' : 'Try again'} tone="neutral" onPress={retry} disabled={config.isFetching} style={styles.button} />
          </>
        ) : (
          <>
            <Text style={styles.title}>Update to keep going</Text>
            <Text style={styles.text}>
              {gate.message ??
                `This version${APP_VERSION ? ` (${APP_VERSION})` : ''} is no longer supported. Version ${gate.minVersion} or later is needed.`}
            </Text>
            {updateUrl && !linkFailed ? (
              <Button label="Update" onPress={() => Linking.openURL(updateUrl).catch(() => setLinkFailed(true))} style={styles.button} />
            ) : (
              <Text style={styles.text}>Update Mentioned from the Solana dApp Store.</Text>
            )}
            <Button label={config.isFetching ? 'Checking' : 'Check again'} tone="neutral" onPress={retry} disabled={config.isFetching} style={styles.button} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
  logo: { width: 72, height: 72, marginBottom: spacing.sm },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, color: colors.text, textAlign: 'center' },
  text: { ...type.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: { alignSelf: 'stretch' },
});
