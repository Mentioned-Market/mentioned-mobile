// The bell and its unread count, for a screen header.
//
// Draws nothing at all when signed out: both notification routes read the
// bearer rather than a wallet parameter, so there is no feed to open and a bell
// would only be a dead end.
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useUnreadCount } from '@/api/queries';
import { useSession } from '@/store/session';
import { colors, fonts } from '@/ui/theme';

export function NotificationBell({ focused }: { focused: boolean }) {
  const signedIn = !!useSession((s) => s.token);
  const unread = useUnreadCount(signedIn, focused);
  if (!signedIn) return null;
  const count = unread.data ?? 0;

  return (
    <Link href="/notifications" asChild>
      <Pressable
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        style={styles.button}
      >
        <Ionicons name="notifications-outline" size={22} color={colors.text} />
        {count > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  button: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10, color: colors.bg },
});
