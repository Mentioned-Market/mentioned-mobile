// Search, chat, the docs and notifications: the ways out of any screen, on every
// screen's header. `Screen` draws them unless told otherwise, and Home puts
// them beside its wordmark. A screen that is one of the three leaves itself
// out (the chat room has no chat button), and a flow that should not be left
// halfway (signing in, reporting a bug) shows none.
//
// The docs open in an in-app browser tab over the app, not in the phone's
// browser: someone checking how a market pays should land back on the market
// they were reading about when they close it.
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';

import { useIsScreenFocused } from '@/api/queries';
import { DOCS_URL } from '@/config';
import { ChatButton } from '@/ui/chat-button';
import { NotificationBell } from '@/ui/notification-bell';
import { colors, spacing } from '@/ui/theme';

export type HeaderAction = 'search' | 'chat' | 'docs' | 'notifications';
export const ALL_ACTIONS: HeaderAction[] = ['search', 'chat', 'docs', 'notifications'];

/** Open the docs over the app. A phone with no browser able to host the tab gets the plain link instead. */
function openDocs() {
  WebBrowser.openBrowserAsync(DOCS_URL, { toolbarColor: colors.bg, controlsColor: colors.gold, showTitle: true }).catch(() => {
    void Linking.openURL(DOCS_URL).catch(() => {});
  });
}

export function HeaderActions({ show = ALL_ACTIONS }: { show?: HeaderAction[] }) {
  // The chat dot and the bell's count poll only while this screen is in front.
  const focused = useIsScreenFocused();
  return (
    <View style={styles.row}>
      {show.includes('search') ? (
        <Link href="/search" asChild>
          <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel="Search" style={styles.button}>
            <Ionicons name="search" size={22} color={colors.text} />
          </Pressable>
        </Link>
      ) : null}
      {show.includes('chat') ? <ChatButton focused={focused} /> : null}
      {show.includes('docs') ? (
        <Pressable onPress={openDocs} hitSlop={10} accessibilityRole="link" accessibilityLabel="How Mentioned works" style={styles.button}>
          <Ionicons name="book-outline" size={22} color={colors.text} />
        </Pressable>
      ) : null}
      {show.includes('notifications') ? <NotificationBell focused={focused} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  button: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
