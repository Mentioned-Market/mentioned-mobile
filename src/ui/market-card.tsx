import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { compact, pct, tokens, usd } from '@/lib/format';
import { closesIn, eventDate } from '@/lib/time';
import { isMajority, isPaid, type MarketStatus, type MarketSummary } from '@/markets/merge';
import { Pill, type PillTone } from '@/ui/pill';
import { colors, fonts, spacing, type } from '@/ui/theme';

const STATUS: Record<MarketStatus, { label: string; tone: PillTone }> = {
  open: { label: 'Open', tone: 'green' },
  pending: { label: 'Pending resolution', tone: 'orange' },
  resolved: { label: 'Resolved', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export function MarketCard({ market, now, hero = false }: { market: MarketSummary; now: number; hero?: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  const paid = isPaid(market);
  const majority = isMajority(market);
  const status = STATUS[market.status];
  const finished = market.status === 'resolved' || market.status === 'cancelled';
  const closes = market.status === 'open' ? closesIn(market.lockAt, now) : null;
  const when = eventDate(market.eventAt ?? market.lockAt);

  return (
    <Link href={market.href as Href} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={market.title}
        style={({ pressed }) => [styles.card, paid ? styles.paidBorder : styles.freeBorder, finished && styles.finished, pressed && styles.pressed]}>
        <View style={[styles.cover, hero && styles.coverHero]}>
          {market.cover && !imgFailed ? (
            <Image source={{ uri: market.cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setImgFailed(true)} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.coverFallback]}>
              <Text style={{ fontSize: 28 }}>🎯</Text>
            </View>
          )}
          <View style={styles.overlayTop}>
            <Pill label={status.label} tone="dark" style={{ borderWidth: 0 }} />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pill label={paid ? 'PAID' : 'FREE'} tone={paid ? 'goldDark' : 'dark'} />
              {majority ? <Pill label="MAJORITY" tone="dark" /> : null}
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={[type.heading, hero && styles.heroTitle]} numberOfLines={2}>
            {market.title}
          </Text>
          {when ? <Text style={type.muted}>{when}</Text> : null}

          <View style={styles.words}>
            {market.words.slice(0, hero ? 5 : 3).map((w) => (
              <View key={w.label} style={styles.wordRow}>
                <Text style={styles.wordLabel} numberOfLines={1}>
                  {w.label}
                </Text>
                {w.outcome ? (
                  <Pill label={w.outcome === 'winner' ? 'WON' : w.outcome === 'loser' ? 'LOST' : w.outcome.toUpperCase()} tone={w.outcome === 'winner' || w.outcome === 'yes' ? 'green' : 'red'} />
                ) : (
                  <Text style={styles.wordPct}>{pct(w.pct)}</Text>
                )}
              </View>
            ))}
            {market.words.length === 0 ? <Text style={type.muted}>No words yet</Text> : null}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {market.pool.kind === 'usdc'
                ? market.pool.usd > 0
                  ? `${usd(market.pool.usd)} pool`
                  : 'USDC'
                : `${tokens(market.pool.tokens)} tokens`}
            </Text>
            <Text style={styles.footerDot}>·</Text>
            <Text style={styles.footerText}>{compact(market.traderCount)} traders</Text>
            {closes ? (
              <>
                <Text style={styles.footerDot}>·</Text>
                <Text style={[styles.footerText, { color: colors.gold }]}>{closes}</Text>
              </>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1 },
  paidBorder: { borderColor: 'rgba(242,183,31,0.55)' },
  freeBorder: { borderColor: colors.border },
  finished: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  cover: { height: 140, backgroundColor: colors.surfaceRaised },
  coverHero: { height: 200 },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  overlayTop: { position: 'absolute', top: spacing.sm, left: spacing.sm, right: spacing.sm, flexDirection: 'row', justifyContent: 'space-between' },
  body: { padding: spacing.md, gap: spacing.sm },
  heroTitle: { fontSize: 22, lineHeight: 28 },
  words: { gap: 6, marginTop: spacing.xs },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    height: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  wordLabel: { ...type.body, flex: 1, fontFamily: fonts.medium },
  wordPct: { ...type.money, fontSize: 14 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  footerText: { ...type.muted, fontSize: 13, lineHeight: 18 },
  footerDot: { ...type.muted, fontSize: 13, lineHeight: 18 },
});
