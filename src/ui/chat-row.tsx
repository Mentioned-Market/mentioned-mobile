// One chat message as a bubble. Yours sit on the right in gold; everyone
// else's on the left, under their avatar and name. A run of messages from one
// player shows the avatar and name once, on the first (`head`), the way chat
// apps group a burst.
//
// The name opens the author's profile; a long press on a bubble is for
// replying, reporting or hiding (the screen's sheet).
import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ChatMessage } from '@/api/chat';
import { profileHref, quote } from '@/chat/rules';
import { ago } from '@/lib/time';
import { colors, fonts, spacing } from '@/ui/theme';

type Props = { m: ChatMessage; now: number; mine: boolean; head: boolean; onLongPress?: (m: ChatMessage) => void };

const AVATAR = 32;

export function ChatRow({ m, now, mine, head, onLongPress }: Props) {
  const when = ago(Date.parse(m.created_at), now);
  const reply = m.reply_to_username ? (
    <View style={[styles.reply, mine && styles.replyMine]}>
      <Text style={styles.replyText} numberOfLines={2}>
        <Text style={styles.replyName}>{m.reply_to_username} </Text>
        {quote(m.reply_to_message ?? '', 90)}
      </Text>
    </View>
  ) : null;
  const press = {
    onLongPress: onLongPress ? () => onLongPress(m) : undefined,
    delayLongPress: 350,
    accessibilityHint: onLongPress ? 'Long press to reply, report or hide' : undefined,
  };

  if (mine) {
    return (
      <View style={[styles.row, styles.rowMine, head && styles.runStart]}>
        <Pressable {...press} style={({ pressed }) => [styles.bubble, styles.bubbleMine, pressed && styles.pressed]} accessibilityLabel={`You: ${m.message}, ${when}`}>
          {reply}
          <Text style={styles.message} selectable>
            {m.message}
          </Text>
          <Text style={[styles.when, styles.whenMine]}>{when}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.row, head && styles.runStart]}>
      {head ? (
        <View style={styles.avatar}>
          <Text style={m.pfp_emoji ? styles.emoji : styles.initial}>{m.pfp_emoji ?? m.username.slice(0, 1).toUpperCase()}</Text>
        </View>
      ) : (
        <View style={styles.avatarSpace} />
      )}
      <Pressable {...press} style={({ pressed }) => [styles.bubble, styles.bubbleTheirs, pressed && styles.pressed]} accessibilityLabel={`${m.username}: ${m.message}, ${when}`}>
        {head ? (
          <View style={styles.head}>
            <Link href={profileHref(m) as Href} asChild>
              <Pressable hitSlop={6} accessibilityRole="link">
                <Text style={styles.name} numberOfLines={1}>
                  {m.username}
                </Text>
              </Pressable>
            </Link>
            <Text style={styles.when}>{when}</Text>
          </View>
        ) : null}
        {reply}
        <Text style={styles.message} selectable>
          {m.message}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, marginTop: 3 },
  rowMine: { justifyContent: 'flex-end' },
  runStart: { marginTop: spacing.sm + 2 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  avatarSpace: { width: AVATAR },
  emoji: { fontSize: 17 },
  initial: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, gap: 2 },
  bubbleTheirs: { backgroundColor: colors.surface, borderTopLeftRadius: 6 },
  bubbleMine: { backgroundColor: colors.goldTint, borderTopRightRadius: 6 },
  pressed: { opacity: 0.7 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  name: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.gold, maxWidth: 180 },
  when: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  whenMine: { alignSelf: 'flex-end' },
  reply: { borderLeftWidth: 2, borderLeftColor: colors.textMuted, paddingLeft: spacing.sm, marginVertical: 2 },
  replyMine: { borderLeftColor: colors.gold },
  replyText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  replyName: { fontFamily: fonts.semibold, color: colors.textMuted },
  message: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.text },
});
