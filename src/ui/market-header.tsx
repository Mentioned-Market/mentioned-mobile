import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { compact } from '@/lib/format';
import { countdown, eventDate } from '@/lib/time';
import type { MarketStatus } from '@/markets/merge';
import { Pill, type PillTone } from '@/ui/pill';
import { colors, spacing, type } from '@/ui/theme';

const STATUS: Record<MarketStatus, { label: string; tone: PillTone }> = {
  open: { label: 'Open', tone: 'green' },
  pending: { label: 'Pending resolution', tone: 'orange' },
  resolved: { label: 'Resolved', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export function statusFromLock(lockAt: number | null, finished: 'resolved' | 'cancelled' | null, now: number): MarketStatus {
  if (finished) return finished;
  return lockAt && now >= lockAt ? 'pending' : 'open';
}

type Props = {
  title: string;
  cover: string | null;
  status: MarketStatus;
  paid: boolean;
  majority: boolean;
  lockAt: number | null;
  eventAt: number | null;
  traderCount: number | null;
  now: number;
  description?: string | null;
};

export function MarketHeader({ title, cover, status, paid, majority, lockAt, eventAt, traderCount, now, description }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const st = STATUS[status];
  const when = eventDate(eventAt ?? lockAt);
  const locksIn = status === 'open' && lockAt ? countdown(lockAt, now) : null;
  return (
    <View style={styles.wrap}>
      <View style={styles.cover}>
        {cover && !imgFailed ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setImgFailed(true)} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.coverFallback]}>
            <Text style={{ fontSize: 32 }}>🎯</Text>
          </View>
        )}
        <View style={styles.overlay}>
          <Pill label={st.label} tone="dark" />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pill label={paid ? 'PAID' : 'FREE'} tone={paid ? 'goldDark' : 'dark'} />
            {majority ? <Pill label="MAJORITY" tone="dark" /> : null}
          </View>
        </View>
      </View>
      <Text style={type.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.meta}>
        {when ? <Text style={type.muted}>{when}</Text> : null}
        {traderCount !== null ? <Text style={type.muted}>{compact(traderCount)} traders</Text> : null}
        {locksIn ? <Text style={[type.muted, { color: colors.gold }]}>Locks in {locksIn}</Text> : null}
      </View>
      {description ? (
        <Pressable onPress={() => setRulesOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: rulesOpen }} style={styles.rules}>
          <Text style={type.muted} numberOfLines={rulesOpen ? undefined : 2}>
            {description.trim()}
          </Text>
          <Text style={[type.muted, { color: colors.gold }]}>{rulesOpen ? 'Hide rules' : 'Read the rules'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  cover: {
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  overlay: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  rules: { gap: 4 },
});
