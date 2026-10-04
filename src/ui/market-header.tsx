// The top of a market screen: the cover as a thumbnail, the title, and one
// line saying where the market is in its life. Under that, which game this is
// and how it is won, in a sentence, so a first visit can read the board. The
// admin's rules sit under it, folded, because they are read once and the
// board is read every visit.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { countdown, eventDate } from '@/lib/time';
import { GAME_ICON, gameName, gameOf, howToPlay } from '@/markets/game';
import type { MarketKind, MarketStatus } from '@/markets/merge';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

export function statusFromLock(lockAt: number | null, finished: 'resolved' | 'cancelled' | null, now: number): MarketStatus {
  if (finished) return finished;
  return lockAt && now >= lockAt ? 'pending' : 'open';
}

/** The one line under a market title. */
export function statusLine(status: MarketStatus, lockAt: number | null, eventAt: number | null, now: number): { text: string; live: boolean } {
  if (status === 'open') {
    const when = eventDate(eventAt ?? lockAt);
    return { text: lockAt ? `Closes in ${countdown(lockAt, now)}${when ? ` · ${when}` : ''}` : (when ?? 'Open'), live: true };
  }
  if (status === 'pending') return { text: 'Locked, awaiting the result', live: false };
  if (status === 'resolved') return { text: 'Resolved', live: false };
  return { text: 'Cancelled', live: false };
}

type Props = {
  title: string;
  cover: string | null;
  status: MarketStatus;
  lockAt: number | null;
  eventAt: number | null;
  now: number;
  description?: string | null;
  /** The market's game, for the how-to-play line. Result screens leave it out. */
  kind?: MarketKind;
  /** How many finishing places a majority market pays, when it is more than the one. */
  paidPlaces?: number;
};

export function MarketHeader({ title, cover, status, lockAt, eventAt, now, description, kind, paidPlaces }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const line = statusLine(status, lockAt, eventAt, now);
  const game = kind ? gameOf(kind) : null;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.thumb}>
          {cover && !imgFailed ? (
            <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setImgFailed(true)} />
          ) : (
            <Text style={{ fontSize: 26 }}>🎯</Text>
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[type.muted, line.live && { color: colors.gold }]} numberOfLines={1}>
            {line.text}
          </Text>
        </View>
      </View>
      {game ? (
        <View style={styles.game}>
          <Ionicons name={GAME_ICON[game]} size={15} color={colors.text} style={styles.gameIcon} />
          <Text style={styles.gameText}>
            <Text style={styles.gameName}>{gameName(game, paidPlaces)}. </Text>
            {howToPlay(game, paidPlaces)}
          </Text>
        </View>
      ) : null}
      {description ? (
        <Pressable onPress={() => setRulesOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: rulesOpen }} style={styles.rules}>
          {rulesOpen ? <Text style={type.muted}>{description.trim()}</Text> : null}
          <Text style={styles.rulesLink}>{rulesOpen ? 'Hide rules' : 'Rules'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  thumb: { width: 60, height: 60, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: colors.text },
  game: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xs },
  gameIcon: { marginTop: 3 },
  gameText: { ...type.muted, flex: 1, fontSize: 14, lineHeight: 20 },
  gameName: { fontFamily: fonts.semibold, color: colors.text },
  rules: { gap: 4, paddingHorizontal: spacing.xs },
  rulesLink: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.textMuted },
});
