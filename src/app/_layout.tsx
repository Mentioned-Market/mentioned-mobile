import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { OpenfortAuthProvider } from '@/auth/openfort-provider';
import { logPolyfillChecks } from '@/lib/polyfill-check';
import { usePrefs } from '@/store/prefs';
import { colors } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();
logPolyfillChecks();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
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
  const ready = fontsLoaded && prefsHydrated;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // First launch: the intro replaces whatever route the app opened on.
  useEffect(() => {
    if (ready && !introSeen && segments[0] !== 'intro') router.replace('/intro');
  }, [ready, introSeen, segments, router]);

  if (!ready) return null;

  return (
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
  );
}
