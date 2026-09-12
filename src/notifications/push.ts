// Push registration and what happens when a push is tapped.
//
// The token here is the device's own FCM token, not an Expo push token: the
// server sends through Firebase Admin directly (SPEC section 12), so Expo's
// push service is not in the path and no EAS project id is needed.
//
// Nothing here asks for permission at launch. A permission prompt with no
// context is the one most often refused, and on Android a refusal is close to
// final. The app asks once the person has an account worth notifying, which is
// the first time they sign in.
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken } from '@/api/notifications';
import { colors } from '@/ui/theme';

// A push that arrives while the app is open still shows: these are market
// resolutions and new markets, which are worth seeing at the moment they
// happen, not only in the feed afterwards.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** The channel every notification lands in until there is a reason for more. */
export const DEFAULT_CHANNEL = 'default';

/**
 * Android 13 and up refuses a token request before a channel exists, so this
 * runs first, every time; creating a channel that is already there is a no-op.
 */
export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL, {
    name: 'Market updates',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: colors.gold,
    vibrationPattern: [0, 200, 150, 200],
  });
}

/** True when notifications may be shown. Never prompts twice over a refusal. */
export async function requestPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** The device's FCM token, or null on an emulator or without permission. */
export async function getPushToken(): Promise<string | null> {
  // A simulator has no FCM registration to hand out, and asking throws.
  if (!Device.isDevice) return null;
  const token = await Notifications.getDevicePushTokenAsync();
  return typeof token.data === 'string' ? token.data : null;
}

/**
 * Everything the app has to do to start receiving push, in order. Returns the
 * token it registered, or null when there is nothing to register: no
 * permission, no device, or a server that does not take tokens yet.
 *
 * Never throws. Push is an extra; a failure here must not colour a sign-in.
 */
export async function registerForPush(): Promise<string | null> {
  try {
    await ensureChannel();
    if (!(await requestPermission())) return null;
    const token = await getPushToken();
    if (!token) return null;
    await registerPushToken(token, Application.getAndroidId() ?? undefined);
    return token;
  } catch {
    return null;
  }
}
