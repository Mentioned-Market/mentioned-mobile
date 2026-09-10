import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { compact as compactNumber, pct, tokens, usd } from '@/lib/format';
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

type MarketCardProps = { market: MarketSummary; now: number; hero?: boolean; compact?: boolean };

function MarketCardImpl({ market, now, hero = false, compact = false }: MarketCardProps) {
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
        style={StyleSheet.flatten([styles.card, compact && styles.compact, paid ? styles.paidBorder : styles.freeBorder, finished && styles.finished])}
      >
        <View style={[styles.cover, hero && styles.coverHero, compact && styles.coverCompact]}>
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
            {market.words.slice(0, hero ? 5 : compact ? 2 : 3).map((w) => (
              <View key={w.label} style={styles.wordRow}>
                <Text style={styles.wordLabel} numberOfLines={1}>
                  {w.label}
                </Text>
                {w.outcome ? (
                  <Pill
                    label={w.outcome === 'winner' ? 'WON' : w.outcome === 'loser' ? 'LOST' : w.outcome.toUpperCase()}
                    tone={w.outcome === 'winner' || w.outcome === 'yes' ? 'green' : 'red'}
                  />
                ) : (
                  <Text style={styles.wordPct}>{pct(w.pct)}</Text>
                )}
              </View>
            ))}
            {market.words.length === 0 ? <Text style={type.muted}>No words yet</Text> : null}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {market.pool.kind === 'usdc' ? (market.pool.usd > 0 ? `${usd(market.pool.usd)} pool` : 'USDC') : `${tokens(market.pool.tokens)} tokens`}
            </Text>
            <Text style={styles.footerDot}>·</Text>
            <Text style={styles.footerText}>{compactNumber(market.traderCount)} traders</Text>
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

/**
 * Does this market render identically to that one?
 *
 * Deliberately structural rather than by reference: `mergeMarkets` builds fresh
 * objects on every call and the lists call it on a 30s clock, so every card gets
 * a new `market` twice a minute even when nothing about it changed. Comparing by
 * reference here would make the memo a no-op.
 */
export function sameMarket(a: MarketSummary, b: MarketSummary): boolean {
  if (
    a.id !== b.id ||
    a.kind !== b.kind ||
    a.href !== b.href ||
    a.title !== b.title ||
    a.cover !== b.cover ||
    a.status !== b.status ||
    a.lockAt !== b.lockAt ||
    a.eventAt !== b.eventAt ||
    a.traderCount !== b.traderCount ||
    a.words.length !== b.words.length
  ) {
    return false;
  }
  if (a.pool.kind !== b.pool.kind) return false;
  if (a.pool.kind === 'usdc' && b.pool.kind === 'usdc' && a.pool.usd !== b.pool.usd) return false;
  if (a.pool.kind === 'tokens' && b.pool.kind === 'tokens' && a.pool.tokens !== b.pool.tokens) return false;
  return a.words.every((w, i) => {
    const o = b.words[i];
    return w.label === o.label && w.pct === o.pct && w.outcome === o.outcome;
  });
}

/**
 * Memoised because the lists that render it re-render on a ticking clock.
 *
 * `now` changes every 30s and every card takes it, but only the countdown in the
 * footer actually moves, and only for a market closing within the day. Without
 * this a list of thirty cards rebuilds its whole tree twice a minute, images
 * included, which is a large part of why switching tabs felt slow.
 */
export const MarketCard = memo(MarketCardImpl, (a, b) => {
  if (a.hero !== b.hero || a.compact !== b.compact) return false;
  if (!sameMarket(a.market, b.market)) return false;
  // The clock only matters while a countdown is on screen; once the market is
  // locked or settled the rendered output is the same for any `now`.
  if (a.market.status !== 'open') return true;
  return closesIn(a.market.lockAt, a.now) === closesIn(b.market.lockAt, b.now);
});
MarketCard.displayName = 'MarketCard';

const styles = StyleSheet.create({
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1 },
  compact: { width: 260 },
  coverCompact: { height: 110 },
  paidBorder: { borderColor: 'rgba(242,183,31,0.55)' },
  freeBorder: { borderColor: colors.border },
  finished: { opacity: 0.6 },
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
