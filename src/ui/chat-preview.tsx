// A market's chat, as a card on its screen: the last few messages and a way
// in. The room itself is a screen of its own (src/app/chat/[room].tsx), since
// a composer and a keyboard have no good place on a screen that already pins a
// trade bar to the bottom.
//
// The card polls slowly while the market is on screen; only the open room is
// live.
import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useChatPreview } from '@/api/queries';
import { ago } from '@/lib/time';
import { useChatStore } from '@/store/chat';
import { SectionTitle } from '@/ui/card';
import { PressableScale } from '@/ui/pressable-scale';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

const SHOWN = 3;

export const chatHref = (eventId: string | null, title?: string) =>
  (eventId === null ? '/chat/global' : `/chat/${encodeURIComponent(eventId)}${title ? `?title=${encodeURIComponent(title)}` : ''}`) as Href;

export function ChatPreview({ eventId, title, focused, now }: { eventId: string; title: string; focused: boolean; now: number }) {
  const chat = useChatPreview(eventId, focused);
  const hidden = useChatStore((s) => s.hidden);
  const recent = (chat.data ?? []).filter((m) => !hidden.includes(m.wallet)).slice(-SHOWN);

  return (
    <View style={styles.section}>
      <SectionTitle title="Chat" />
      <Link href={chatHref(eventId, title)} asChild>
        <PressableScale style={styles.card} accessibilityRole="button" accessibilityLabel="Open the market chat">
          {recent.length === 0 ? (
            <Text style={type.muted}>{chat.isPending ? 'Loading the chat' : 'Nobody has said anything yet. Start the conversation.'}</Text>
          ) : (
            recent.map((m) => (
              <View key={m.id} style={styles.line}>
                <Text style={styles.text} numberOfLines={1}>
                  <Text style={styles.name}>{m.username} </Text>
                  {m.message}
                </Text>
                <Text style={styles.when}>{ago(Date.parse(m.created_at), now)}</Text>
              </View>
            ))
          )}
          <View style={styles.open}>
            <Ionicons name="chatbubbles-outline" size={16} color={colors.gold} />
            <Text style={styles.openText}>{recent.length === 0 ? 'Say something' : 'Open the chat'}</Text>
          </View>
        </PressableScale>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.surface, gap: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  text: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text },
  name: { fontFamily: fonts.semibold, color: colors.textMuted },
  when: { ...type.muted, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  open: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: spacing.xs },
  openText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gold },
});
