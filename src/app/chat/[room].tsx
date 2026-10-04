// A chat room: the global room (`/chat/global`) or a market's
// (`/chat/<eventId>?title=`), live while it is on screen.
//
// Newest at the bottom, older pages on scrolling up (market rooms), a
// composer with replies, and a long press on any message to reply, report it
// or hide its author. Report and hide are what a store asks of any app that
// shows what strangers write; hiding is on this phone only.
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHAT_MAX, type ChatMessage } from '@/api/chat';
import { useIsScreenFocused } from '@/api/queries';
import { BUG_REPORT_MAX, reportBug } from '@/api/support';
import { quote, reportText, sendError, sendable, startsRun } from '@/chat/rules';
import { useChat } from '@/chat/use-chat';
import { useNow } from '@/lib/use-now';
import { useChatStore } from '@/store/chat';
import { useSession } from '@/store/session';
import { BottomSheet } from '@/ui/bottom-sheet';
import { debugInfo } from '@/ui/bug-report';
import { Button } from '@/ui/button';
import { rowStyle } from '@/ui/card';
import { ChatRow } from '@/ui/chat-row';
import { Screen } from '@/ui/screen';
import { ErrorState, RowsSkeleton } from '@/ui/states';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';
import { showAchievements, showToast } from '@/ui/toast';

export default function ChatScreen() {
  const params = useLocalSearchParams<{ room: string; title?: string }>();
  const router = useRouter();
  const room = params.room === 'global' ? null : params.room;
  const focused = useIsScreenFocused();
  const now = useNow(30_000);
  const chat = useChat(room, focused);
  const wallet = useSession((s) => s.wallet);
  const signedIn = !!useSession((s) => s.token);
  const hidden = useChatStore((s) => s.hidden);
  const hide = useChatStore((s) => s.hide);
  const unhideAll = useChatStore((s) => s.unhideAll);
  const seeGlobal = useChatStore((s) => s.seeGlobal);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<ChatMessage | null>(null);

  // The app is edge to edge, so Android draws the keyboard over the screen
  // instead of resizing it, and KeyboardAvoidingView does not lift anything.
  // The room lifts itself by the keyboard's height instead, plus the bottom
  // inset, which the reported height leaves out on an edge-to-edge window
  // though the keyboard covers it. With the keyboard
  // down, the composer clears the gesture bar; with it up, that inset would
  // only be a gap between the box and the keys.
  const insets = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboard(e.endCoordinates.height));
    const hideKb = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hideKb.remove();
    };
  }, []);

  // Inverted list: newest first in the data, drawn at the bottom.
  const shown = useMemo(() => chat.messages.filter((m) => m.wallet === wallet || !hidden.includes(m.wallet)).reverse(), [chat.messages, hidden, wallet]);
  const hiddenHere = chat.messages.length - shown.length;

  // Reading the global room clears the unread dot on Home.
  const newestId = chat.messages[chat.messages.length - 1]?.id;
  useEffect(() => {
    if (room === null && focused && newestId) seeGlobal(newestId);
  }, [room, focused, newestId, seeGlobal]);

  const send = async () => {
    const body = sendable(text);
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const row = await chat.send(body, replyTo?.id);
      setText('');
      setReplyTo(null);
      void Haptics.selectionAsync();
      showAchievements(row.newAchievements);
    } catch (e) {
      setError(sendError(e));
    } finally {
      setSending(false);
    }
  };

  const report = async (m: ChatMessage) => {
    setActing(null);
    try {
      await reportBug(reportText(m, room, BUG_REPORT_MAX), { ...debugInfo(wallet), kind: 'chat-report' });
      showToast({ emoji: '🚩', title: 'Reported', body: 'Thanks. The team will take a look.' });
    } catch {
      showToast({ emoji: '⚠️', title: 'That report did not send', body: 'Check your connection and try again.' });
    }
  };

  // Inverted, so the message before an item is the next one in the data.
  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => (
      <ChatRow m={item} now={now} mine={item.wallet === wallet} head={startsRun(item, shown[index + 1])} onLongPress={setActing} />
    ),
    [now, wallet, shown],
  );

  const title = room === null ? 'Chat' : (params.title ?? 'Market chat');

  return (
    <Screen title={title} back flush right={<LiveDot live={chat.live} />} actions={['search', 'docs', 'notifications']}>
      <View style={{ flex: 1, paddingBottom: keyboard > 0 ? keyboard + insets.bottom : 0 }}>
        {chat.loading ? (
          <View style={styles.pad}>
            <RowsSkeleton />
          </View>
        ) : chat.error && chat.messages.length === 0 ? (
          <View style={styles.pad}>
            <ErrorState error={chat.error} onRetry={chat.retry} title="Could not load the chat" />
          </View>
        ) : shown.length === 0 && hiddenHere === 0 ? (
          // Outside the list: an inverted list flips its empty component on
          // both axes here, so it read back to front.
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={[type.muted, { textAlign: 'center' }]}>{room === null ? 'Say hello to everyone on Mentioned.' : 'Be the first to say what you think will be said.'}</Text>
          </View>
        ) : (
          <FlatList
            inverted
            data={shown}
            keyExtractor={(m) => String(m.id)}
            renderItem={renderItem}
            onEndReached={chat.canLoadOlder ? chat.loadOlder : undefined}
            onEndReachedThreshold={0.4}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            // Inverted: the header sits at the bottom, just above the composer.
            ListHeaderComponent={
              hiddenHere > 0 ? (
                <Pressable onPress={unhideAll} style={styles.hiddenNote} accessibilityRole="button">
                  <Text style={type.muted}>
                    {hiddenHere} message{hiddenHere === 1 ? '' : 's'} from hidden players · <Text style={styles.link}>Show everyone</Text>
                  </Text>
                </Pressable>
              ) : null
            }
            ListFooterComponent={
              chat.loadingOlder ? (
                <ActivityIndicator color={colors.gold} style={{ padding: spacing.md }} />
              ) : shown.length > 0 && !chat.canLoadOlder ? (
                <Text style={[type.muted, styles.start]}>Start of the chat</Text>
              ) : null
            }
          />
        )}

        <View style={[styles.composer, { paddingBottom: spacing.sm + (keyboard ? 0 : insets.bottom) }]}>
          {!signedIn ? (
            <Button label="Sign in to chat" onPress={() => router.push('/sign-in')} />
          ) : (
            <>
              {replyTo ? (
                <View style={styles.replyBar}>
                  <Text style={[type.muted, { flex: 1 }]} numberOfLines={1}>
                    Replying to <Text style={styles.replyName}>{replyTo.username}</Text>: {quote(replyTo.message, 60)}
                  </Text>
                  <Pressable onPress={() => setReplyTo(null)} hitSlop={10} accessibilityLabel="Cancel reply">
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.inputRow}>
                <TextInput
                  value={text}
                  onChangeText={(t) => {
                    setText(t);
                    if (error) setError(null);
                  }}
                  placeholder={replyTo ? 'Write a reply' : 'Say something'}
                  placeholderTextColor={colors.textMuted}
                  maxLength={CHAT_MAX}
                  multiline
                  style={styles.input}
                  accessibilityLabel="Message"
                />
                <Pressable
                  onPress={send}
                  disabled={!sendable(text) || sending}
                  style={[styles.send, (!sendable(text) || sending) && styles.sendOff]}
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                >
                  {sending ? <ActivityIndicator size="small" color={colors.bg} /> : <Ionicons name="arrow-up" size={20} color={colors.bg} />}
                </Pressable>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : text.length > CHAT_MAX - 40 ? <Text style={styles.count}>{`${text.length}/${CHAT_MAX}`}</Text> : null}
            </>
          )}
        </View>
      </View>

      <BottomSheet visible={acting !== null} onClose={() => setActing(null)} title={acting ? acting.username : undefined} subtitle={acting ? quote(acting.message, 80) : undefined}>
        {acting ? (
          <View>
            {signedIn ? (
              <SheetRow
                first
                icon="arrow-undo-outline"
                label="Reply"
                onPress={() => {
                  setReplyTo(acting);
                  setActing(null);
                }}
              />
            ) : null}
            {acting.wallet !== wallet ? (
              <>
                <SheetRow first={!signedIn} icon="flag-outline" label="Report this message" onPress={() => void report(acting)} />
                <SheetRow
                  icon="eye-off-outline"
                  label={`Hide messages from ${acting.username}`}
                  onPress={() => {
                    hide(acting.wallet);
                    setActing(null);
                    showToast({ emoji: '🙈', title: `${acting.username} is hidden`, body: 'Only on this phone. Show them again from the chat.' });
                  }}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

function SheetRow({ icon, label, onPress, first = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; first?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [rowStyle(first), pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

/** Green while the stream is up; grey while the room is catching up by polling. */
function LiveDot({ live }: { live: boolean }) {
  return (
    <View style={styles.live} accessible accessibilityLabel={live ? 'Live' : 'Reconnecting'}>
      <View style={[styles.dot, { backgroundColor: live ? colors.yes : colors.textMuted }]} />
      <Text style={styles.liveText}>{live ? 'Live' : 'Connecting'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: spacing.md },
  list: { paddingVertical: spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.lg },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text },
  start: { textAlign: 'center', padding: spacing.md },
  hiddenNote: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  link: { color: colors.gold, fontFamily: fonts.semibold },
  composer: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  replyName: { color: colors.text, fontFamily: fonts.semibold },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: radius.key,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.no, paddingHorizontal: spacing.xs },
  count: { ...type.muted, fontSize: 12, textAlign: 'right', paddingHorizontal: spacing.xs, fontVariant: ['tabular-nums'] },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
});
