// One market on the Markets tab: its cover, its title, when it closes, which
// game it is, and its words with the chance of each.
//
// Every card gets the cover treatment. The featured market used to be the only
// one with its art shown and the rest were a small thumbnail beside the title,
// which made everything but the top card read as an afterthought.
//
// The chance is the only figure a word shows (docs/DESIGN.md). On a YES/NO
// market it is the YES price; on a majority board it is the pool share.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Link, useFocusEffect, useRouter, type Href } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { pct } from '@/lib/format';
import { useCountdown } from '@/lib/use-countdown';
import { GAME_BADGE, GAME_ICON, STAKE_NAME, gameOf, moneyLine, stakeOf } from '@/markets/game';
import { isMajority, sameMarket, wordHref, type MarketSummary } from '@/markets/merge';
import { sideQuote } from '@/trade/amm-display';
import { LiveNumber } from '@/ui/live-number';
import { Pill } from '@/ui/pill';
import { CompactPodium } from '@/ui/podium';
import { PressableScale } from '@/ui/pressable-scale';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

type MarketCardProps = { market: MarketSummary };

/** The list route carries no fees, so a card's quote is before them, like the web's list. */
const NO_FEES = { feeBps: 0, rakeBps: 0 };

/** Words shown before "+N more" offers the rest. */
const WORDS_SHOWN = 3;

function MarketCardImpl({ market }: MarketCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // The word just tapped, while its market opens. Opening a market takes a
  // moment, and with nothing on screen changing a tap reads as missed, so the
  // row lights up and its odds turn into a spinner until the screen changes.
  // Cleared whenever this tab is shown again, so coming back finds it at rest.
  const [opening, setOpening] = useState<number | null>(null);
  useFocusEffect(useCallback(() => setOpening(null), []));
  const router = useRouter();

  // Navigate only after the feedback has been drawn. A Link would navigate in
  // the same turn as the tap, and when the market screen is slow to mount (a
  // dev build especially) React never paints the highlight before the new
  // screen takes over, so the tap looked ignored. Two frames: one to commit
  // the highlight, one for it to reach the screen.
  const openWord = (i: number, href: string) => {
    Haptics.selectionAsync();
    setOpening(i);
    requestAnimationFrame(() => requestAnimationFrame(() => router.push(href as Href)));
  };
  const finished = market.status === 'resolved' || market.status === 'cancelled';
  const majority = isMajority(market);
  // The card runs its own countdown, by the second in the last hour, so the
  // list never re-renders for the clock.
  const { text: closes } = useCountdown(market.status === 'open' ? market.lockAt : null);
  const paid = stakeOf(market.kind) === 'paid';
  const meta = [market.status === 'pending' ? 'Locked' : market.status === 'cancelled' ? 'Cancelled' : market.status === 'resolved' ? 'Resolved' : null, moneyLine(market)]
    .filter(Boolean)
    .join(' · ');
  const hidden = market.words.length - WORDS_SHOWN;
  const words = expanded ? market.words : market.words.slice(0, WORDS_SHOWN);

  return (
    <Link href={market.href as Href} asChild>
      <PressableScale accessibilityRole="button" accessibilityLabel={market.title} style={StyleSheet.flatten([styles.card, finished && !market.podium && styles.finished])}>
        <View style={styles.cover}>
          {market.cover && !imgFailed ? (
            <Image source={{ uri: market.cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setImgFailed(true)} />
          ) : (
            <Text style={{ fontSize: 40, opacity: 0.4 }}>🎯</Text>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {market.title}
          </Text>
          {closes || meta ? (
            <Text style={type.muted} numberOfLines={1}>
              {closes ? <Text style={styles.closes}>{closes}</Text> : null}
              {closes && meta ? ' · ' : ''}
              {meta}
            </Text>
          ) : null}

          {/* Which of the four markets this is, at a glance: what it is played
              with, then which game. The two badges are one shape and one text
              colour; only Paid is filled, in the brand gold, since money is
              the difference that matters most before tapping. */}
          <View style={styles.badges}>
            <View style={[styles.badge, paid && styles.badgePaid]}>
              <Text style={[styles.badgeText, paid && styles.badgePaidText]}>{STAKE_NAME[stakeOf(market.kind)]}</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name={GAME_ICON[gameOf(market.kind)]} size={14} color={colors.text} />
              <Text style={styles.badgeText}>{GAME_BADGE[gameOf(market.kind)]}</Text>
            </View>
          </View>

          {market.podium ? (
            // A resolved market that pays places shows its result, not its
            // rows. The whole card, podium included, opens the market.
            <CompactPodium tiers={market.podium} />
          ) : market.words.length > 0 ? (
            <View>
              {words.map((w, i) => (
                // Keyed by position: two words can share a label while the
                // server has not resolved their text. Each word is its own
                // link, straight to trading that word (see wordHref); the rest
                // of the card opens the market.
                <Pressable
                  key={`${i}:${w.label}`}
                  accessibilityRole="link"
                  accessibilityLabel={`${w.label}, ${market.title}`}
                  accessibilityState={{ busy: opening === i }}
                  onPress={() => openWord(i, wordHref(market, w.label))}
                  disabled={opening !== null}
                  style={({ pressed }) => [styles.wordRow, i > 0 && styles.wordDivider, (pressed || opening === i) && styles.wordOpening]}
                >
                  {majority ? <Text style={styles.rank}>{i + 1}</Text> : null}
                  <Text style={styles.wordLabel} numberOfLines={1}>
                    {w.label}
                  </Text>
                  {opening === i ? (
                    <ActivityIndicator size="small" color={colors.gold} />
                  ) : w.outcome ? (
                    <Pill
                      label={w.outcome === 'winner' ? 'WON' : w.outcome === 'loser' ? 'LOST' : w.outcome.toUpperCase()}
                      tone={w.outcome === 'winner' || w.outcome === 'yes' ? 'green' : w.outcome === 'loser' ? 'neutral' : 'red'}
                    />
                  ) : (
                    // A paid YES/NO market shows what Yes pays, as the web's list does
                    // (spot, before fees); everything else keeps its chance. Either
                    // way it flashes with the chance, green for up.
                    <LiveNumber
                      value={w.pct}
                      format={pct}
                      text={market.kind === 'paid-yesno' ? `Yes ${sideQuote(w.pct, 'YES', NO_FEES)}` : undefined}
                      style={StyleSheet.flatten([styles.wordPct, majority && { color: colors.text }])}
                    />
                  )}
                </Pressable>
              ))}
              {hidden > 0 ? (
                // Its own pressable, so tapping it opens the rest of the words
                // rather than the market.
                <Pressable
                  onPress={() => setExpanded((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  hitSlop={6}
                  style={({ pressed }) => [styles.moreRow, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.more}>{expanded ? 'Show fewer' : `+${hidden} more`}</Text>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </PressableScale>
    </Link>
  );
}

/**
 * Memoised so a list re-rendering (a poll, the filter) only rebuilds the cards
 * whose market changed. The countdown is the card's own (`useCountdown`), so
 * no clock is passed in and none can force a re-render of every card.
 */
export const MarketCard = memo(MarketCardImpl, (a, b) => sameMarket(a.market, b.market));
MarketCard.displayName = 'MarketCard';

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.surface },
  finished: { opacity: 0.6 },
  cover: { height: 160, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.md, gap: spacing.sm },
  title: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: colors.text },
  closes: { fontFamily: fonts.semibold, color: colors.gold, fontVariant: ['tabular-nums'] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceRaised,
  },
  badgePaid: { backgroundColor: colors.gold },
  badgeText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.text },
  // Black on gold, as on every gold button: white on it is too faint to read.
  badgePaidText: { color: '#000000' },
  wordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, height: 42 },
  wordDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  // Bleeds past the row's text so the highlight reads as the whole row.
  wordOpening: { backgroundColor: colors.surfaceRaised, marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm, borderRadius: 12 },
  rank: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted, width: 18, fontVariant: ['tabular-nums'] },
  wordLabel: { ...type.body, flex: 1, fontFamily: fonts.medium },
  wordPct: { fontFamily: fonts.semibold, fontSize: 16, color: colors.yes, fontVariant: ['tabular-nums'] },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  more: { ...type.muted, fontSize: 13, lineHeight: 18 },
});
