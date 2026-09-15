// The top of a market screen: the cover as a thumbnail, the title, and one
// line saying where the market is in its life. The rules sit under it,
// folded, because they are read once and the board is read every visit.
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { countdown, eventDate } from '@/lib/time';
import type { MarketStatus } from '@/markets/merge';
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
};

export function MarketHeader({ title, cover, status, lockAt, eventAt, now, description }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const line = statusLine(status, lockAt, eventAt, now);
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
  rules: { gap: 4, paddingHorizontal: spacing.xs },
  rulesLink: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.textMuted },
});
