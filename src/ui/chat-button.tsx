// The way into the global chat, for Home's header, beside the bell. A gold dot
// when someone has said something since this phone last read the room.
//
// The first check only records where the room is, so a first launch does not
// greet you with a dot for every message ever sent.
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useGlobalChatLatest } from '@/api/queries';
import { useChatStore } from '@/store/chat';
import { chatHref } from '@/ui/chat-preview';
import { colors } from '@/ui/theme';

export function ChatButton({ focused }: { focused: boolean }) {
  const latest = useGlobalChatLatest(focused);
  const lastSeen = useChatStore((s) => s.lastSeenGlobal);
  const seeGlobal = useChatStore((s) => s.seeGlobal);
  const latestId = latest.data?.latestId;

  useEffect(() => {
    if (lastSeen === null && latestId !== undefined) seeGlobal(latestId);
  }, [lastSeen, latestId, seeGlobal]);

  const unread = lastSeen !== null && latestId !== undefined && latestId > lastSeen;

  return (
    <Link href={chatHref(null)} asChild>
      <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel={unread ? 'Chat, new messages' : 'Chat'} style={styles.button}>
        <Ionicons name="chatbubbles-outline" size={22} color={colors.text} />
        {unread ? <View style={styles.dot} /> : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  button: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 3, right: 2, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.gold, borderWidth: 1.5, borderColor: colors.bg },
});
