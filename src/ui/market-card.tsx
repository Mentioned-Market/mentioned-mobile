// One market on the Explore tab: the cover as a thumbnail, the title, up to
// three words each with the chance it happens, and one line of when it closes.
//
// The chance is the only figure a word shows (docs/DESIGN.md). On a YES/NO
// market it is the YES price; on a majority board it is the pool share.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { pct, tokens, usd } from '@/lib/format';
import { closesIn } from '@/lib/time';
import { isMajority, type MarketSummary } from '@/markets/merge';
import { Pill } from '@/ui/pill';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

type MarketCardProps = { market: MarketSummary; now: number; hero?: boolean };

const WORDS_SHOWN = 3;

function MarketCardImpl({ market, now, hero = false }: MarketCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const finished = market.status === 'resolved' || market.status === 'cancelled';
  const majority = isMajority(market);
  const closes = market.status === 'open' ? closesIn(market.lockAt, now) : null;
  const pool = market.pool.kind === 'usdc' ? (market.pool.usd > 0 ? `${usd(market.pool.usd)} pool` : 'USDC') : `${tokens(market.pool.tokens)} tokens`;
  const meta = [market.status === 'pending' ? 'Locked' : market.status === 'cancelled' ? 'Cancelled' : market.status === 'resolved' ? 'Resolved' : null, pool]
    .filter(Boolean)
    .join(' · ');
  const showCover = hero && market.cover && !imgFailed;

  return (
    <Link href={market.href as Href} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={market.title} style={StyleSheet.flatten([styles.card, finished && styles.finished])}>
        {showCover ? <Image source={{ uri: market.cover as string }} style={styles.hero} contentFit="cover" transition={150} onError={() => setImgFailed(true)} /> : null}
        <View style={styles.body}>
          <View style={styles.head}>
            {!showCover ? (
              <View style={styles.thumb}>
                {market.cover && !imgFailed ? (
                  <Image source={{ uri: market.cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setImgFailed(true)} />
                ) : (
                  <Text style={{ fontSize: 22 }}>🎯</Text>
                )}
              </View>
            ) : null}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.title, hero && styles.heroTitle]} numberOfLines={2}>
                {market.title}
              </Text>
              <Text style={type.muted} numberOfLines={1}>
                {closes ? <Text style={styles.closes}>{closes}</Text> : null}
                {closes ? ' · ' : ''}
                {meta}
              </Text>
            </View>
          </View>

          {/* Which game this is, at a glance: a majority board is won by the
              word said most, a YES/NO market by each word on its own. The
              badge is the one place the kind is named; the numbered rows
              below say it again without words. */}
          <View style={[styles.kind, majority && styles.kindMajority]}>
            <Ionicons name={majority ? 'podium' : 'checkmark-done'} size={14} color={majority ? colors.gold : colors.textMuted} />
            <Text style={[styles.kindText, majority && { color: colors.gold }]}>{majority ? 'Most said wins' : 'Yes or no on each word'}</Text>
          </View>

          {market.words.length > 0 ? (
            <View style={styles.words}>
              {market.words.slice(0, WORDS_SHOWN).map((w, i) => (
                // Keyed by position: two words can share a label while the
                // server has not resolved their text.
                <View key={`${i}:${w.label}`} style={[styles.wordRow, i > 0 && styles.wordDivider]}>
                  {majority ? <Text style={styles.rank}>{i + 1}</Text> : null}
                  <Text style={styles.wordLabel} numberOfLines={1}>
                    {w.label}
                  </Text>
                  {w.outcome ? (
                    <Pill
                      label={w.outcome === 'winner' ? 'WON' : w.outcome === 'loser' ? 'LOST' : w.outcome.toUpperCase()}
                      tone={w.outcome === 'winner' || w.outcome === 'yes' ? 'green' : w.outcome === 'loser' ? 'neutral' : 'red'}
                    />
                  ) : (
                    <Text style={[styles.wordPct, majority && { color: colors.text }]}>{pct(w.pct)}</Text>
                  )}
                </View>
              ))}
              {market.words.length > WORDS_SHOWN ? <Text style={styles.more}>+{market.words.length - WORDS_SHOWN} more</Text> : null}
            </View>
          ) : null}
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
 * `now` changes every 30s and every card takes it, but only the countdown
 * actually moves, and only for a market closing within the day. Without this a
 * list of thirty cards rebuilds its whole tree twice a minute, images included,
 * which is a large part of why switching tabs felt slow.
 */
export const MarketCard = memo(MarketCardImpl, (a, b) => {
  if (a.hero !== b.hero) return false;
  if (!sameMarket(a.market, b.market)) return false;
  // The clock only matters while a countdown is on screen; once the market is
  // locked or settled the rendered output is the same for any `now`.
  if (a.market.status !== 'open') return true;
  return closesIn(a.market.lockAt, a.now) === closesIn(b.market.lockAt, b.now);
});
MarketCard.displayName = 'MarketCard';

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.surface },
  finished: { opacity: 0.6 },
  hero: { height: 180, backgroundColor: colors.surfaceRaised },
  body: { padding: spacing.md, gap: spacing.sm + 4 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, height: 26, borderRadius: radius.control, backgroundColor: colors.surfaceRaised },
  kindMajority: { backgroundColor: colors.goldTint },
  kindText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  rank: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted, width: 18, fontVariant: ['tabular-nums'] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  thumb: { width: 56, height: 56, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.text },
  heroTitle: { fontSize: 20, lineHeight: 26 },
  closes: { fontFamily: fonts.semibold, color: colors.gold, fontVariant: ['tabular-nums'] },
  words: { gap: 0 },
  wordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, height: 40 },
  wordDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  wordLabel: { ...type.body, flex: 1, fontFamily: fonts.medium },
  wordPct: { fontFamily: fonts.semibold, fontSize: 16, color: colors.yes, fontVariant: ['tabular-nums'] },
  more: { ...type.muted, fontSize: 13, paddingTop: 6 },
});
