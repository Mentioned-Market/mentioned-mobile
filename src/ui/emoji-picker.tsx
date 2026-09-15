// The profile emoji, which on Mentioned is earned rather than chosen: the
// server only accepts an emoji from an achievement this wallet has unlocked.
//
// So the picker is the achievement list. Unlocked ones are offered; the rest
// are shown locked, with what they take, because "you have no emoji yet" is
// only useful next to how to get one.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { keys, useAchievements } from '@/api/queries';
import { setPfpEmoji } from '@/api/user';
import { sanitise } from '@/trade/free';
import { ApiError } from '@/api/client';
import { colors, fonts, spacing, type } from '@/ui/theme';

export function EmojiPicker({ wallet, current }: { wallet: string; current: string | null }) {
  const queryClient = useQueryClient();
  const list = useAchievements(wallet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (emoji: string | null) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setPfpEmoji(emoji);
      await queryClient.invalidateQueries({ queryKey: keys.profile(wallet) });
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 403
            ? 'Unlock that achievement first.'
            : e.status === 429
              ? 'One moment. Try again shortly.'
              : sanitise(e.message)
          : 'Could not save that. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const achievements = list.data ?? [];
  const unlocked = achievements.filter((a) => a.unlocked);
  const locked = achievements.filter((a) => !a.unlocked);

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={type.muted}>Your emoji</Text>
      {unlocked.length > 0 ? (
        <View style={styles.row}>
          {unlocked.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => choose(a.emoji)}
              disabled={busy}
              style={[styles.chip, current === a.emoji && styles.chipOn]}
              accessibilityRole="button"
              accessibilityLabel={a.title}
              accessibilityState={{ selected: current === a.emoji }}
            >
              <Text style={{ fontSize: 22 }}>{a.emoji}</Text>
            </Pressable>
          ))}
          {current ? (
            <Pressable onPress={() => choose(null)} disabled={busy} style={styles.chip} accessibilityRole="button" accessibilityLabel="No emoji">
              <Text style={type.muted}>None</Text>
            </Pressable>
          ) : null}
        </View>
      ) : list.isPending ? null : (
        <Text style={type.muted}>Earn an emoji by unlocking an achievement.</Text>
      )}
      {error ? <Text style={[type.muted, { color: colors.no }]}>{error}</Text> : null}
      {locked.length > 0 ? (
        <View style={{ gap: 2 }}>
          {locked.map((a) => (
            <Text key={a.id} style={type.muted} numberOfLines={1}>
              <Text style={styles.lockedEmoji}>{a.emoji} </Text>
              {a.title}: {a.description}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: 'rgba(242,183,31,0.2)' },
  lockedEmoji: { fontFamily: fonts.regular, opacity: 0.5 },
});
