import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { prefetchSharedData } from '@/api/prefetch';
import { restoreQueryCache, startPersistingQueryCache } from '@/api/persist';
import { OpenfortAuthProvider } from '@/auth/openfort-provider';
import { logPolyfillChecks } from '@/lib/polyfill-check';
import { usePrefs } from '@/store/prefs';
import { useSession } from '@/store/session';
import { useWallet } from '@/store/wallet';
import { colors } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();
logPolyfillChecks();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Long enough that moving between the tabs that share a list does not
      // refetch it, short enough that a market's odds are never visibly old.
      staleTime: 30_000,
      // Restored-from-disk data can be a day old, and it is shown while the
      // refetch runs. Keeping it in memory that long means returning to a tab
      // is never a blank screen, only a briefly stale one.
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
      // The cached value is always rendered first and refreshed underneath, so
      // a reconnect or a remount never flashes a skeleton. Restored data carries
      // its original timestamp, so anything older than the stale time above
      // refreshes on the first mount without needing to force it.
      refetchOnReconnect: true,
    },
  },
});

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.gold,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
  },
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  // Hold the tree until the fonts are in: Fabric caches text measurements by
  // font name, so labels rendered with the fallback font stay truncated.
  const prefsHydrated = usePrefs((s) => s.hydrated);
  const introSeen = usePrefs((s) => s.introSeen);
  const router = useRouter();
  const segments = useSegments();

  // Last session's data, read back from disk before anything can query. Doing
  // it inside the existing readiness gate is what guarantees the ordering: no
  // screen mounts, so no fetch can land on top of the restore.
  const [cacheRestored, setCacheRestored] = useState(false);
  useEffect(() => {
    let cancelled = false;
    restoreQueryCache(queryClient).finally(() => {
      if (!cancelled) setCacheRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cacheRestored) return;
    return startPersistingQueryCache(queryClient);
  }, [cacheRestored]);

  const ready = fontsLoaded && prefsHydrated && cacheRestored;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Warm every tab's data from the first frame, rather than when the tab is
  // first opened. Re-runs when the wallet arrives from secure storage, which is
  // what warms the position queries; a prefetch of already-fresh data is free.
  const sessionWallet = useSession((s) => s.wallet);
  const viewedWallet = useWallet((s) => s.viewedAddress);
  const wallet = sessionWallet ?? viewedWallet;
  useEffect(() => {
    if (!ready) return;
    prefetchSharedData(queryClient, wallet);
  }, [ready, wallet]);

  // First launch: the intro replaces whatever route the app opened on.
  useEffect(() => {
    if (ready && !introSeen && segments[0] !== 'intro') router.replace('/intro');
  }, [ready, introSeen, segments, router]);

  if (!ready) return null;

  return (
    // Every gesture in the app needs this above it; GestureDetector throws in
    // development without one, and expo-router does not provide it.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <OpenfortAuthProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={theme}>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="intro" options={{ animation: 'fade' }} />
            </Stack>
          </ThemeProvider>
        </QueryClientProvider>
      </OpenfortAuthProvider>
    </GestureHandlerRootView>
  );
}
