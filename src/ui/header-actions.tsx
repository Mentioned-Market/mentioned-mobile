// Search, chat and notifications: the three ways out of any screen, on every
// screen's header. `Screen` draws them unless told otherwise, and Home puts
// them beside its wordmark. A screen that is one of the three leaves itself
// out (the chat room has no chat button), and a flow that should not be left
// halfway (signing in, reporting a bug) shows none.
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useIsScreenFocused } from '@/api/queries';
import { ChatButton } from '@/ui/chat-button';
import { NotificationBell } from '@/ui/notification-bell';
import { colors, spacing } from '@/ui/theme';

export type HeaderAction = 'search' | 'chat' | 'notifications';
export const ALL_ACTIONS: HeaderAction[] = ['search', 'chat', 'notifications'];

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
      {show.includes('notifications') ? <NotificationBell focused={focused} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  button: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
