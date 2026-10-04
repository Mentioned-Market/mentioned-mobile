// The result of a majority market that pays several places: what won, how the
// viewer's own picks did, and a flat stepped podium with one step per
// finishing place and the winner's step in solid gold. Tied words share a
// step, which is drawn wider.
//
// The sizes and colours are the website's (components/MajorityPodium.tsx and
// docs/MM_V2_SPEC.md section 8), written out here because they are the design,
// not theme values: flat colour and type only, no gradients, glows or shadows.
// What each step says, and in what order they stand, is `@/markets/top3`.
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import {
  finishText,
  mentionsText,
  netText,
  paysText,
  pickResults,
  podiumHeadline,
  podiumSubline,
  standingOrder,
  stepDelayMs,
  type PodiumTier,
  type ResolvedPick,
} from '@/markets/top3';
import { fonts } from '@/ui/theme';

const GOLD = '#F2B71F';
const GREEN = '#34C759';
const RED = '#FF3B30';

// Step height and numeral size by place; anything past 3rd sits level with 3rd.
const HEIGHT = [148, 104, 76];
const NUMERAL = [64, 44, 34];
const COMPACT_NUMERAL = [60, 42, 30];
/** Each column's share of the small card's podium box. */
const COMPACT_COLUMN = ['100%', '72%', '50%'] as const;
/** The height of the word area on a market card, which the small podium fills. */
export const COMPACT_PODIUM_HEIGHT = 174;

const pick = <T,>(list: readonly T[], place: number): T => list[Math.min(place, list.length) - 1];

/** `cubic-bezier(0.22, 1, 0.36, 1)`, the website's curve for the steps. */
const RISE = Easing.bezier(0.22, 1, 0.36, 1);

type Props = {
  tiers: PodiumTier[];
  /** How many places the market pays, for "The top 3 share the pool". */
  paidPlaces: number;
  /** The viewer's picks, if they entered. Stake and payout are in `unit`. */
  picks?: ResolvedPick[];
  unit: 'tokens' | 'usd';
};

/** The full result card, above the word board on a resolved market. */
export function Podium({ tiers, paidPlaces, picks = [], unit }: Props) {
  const held = new Set(picks.map((p) => p.key));
  const { rows, net } = pickResults(picks);
  return (
    <View style={styles.card} accessibilityLabel={`Final result. ${podiumHeadline(tiers)} finished 1st.`}>
      <View style={styles.text}>
        <Text style={styles.label}>FINAL RESULT</Text>
        <Text style={styles.headline}>{podiumHeadline(tiers)}</Text>
        <Text style={styles.sub}>{podiumSubline(tiers, paidPlaces)}</Text>
        {rows.length > 0 ? (
          <View style={styles.picks}>
            <View style={styles.pickHead}>
              <Text style={styles.pickLabel}>YOUR PICKS</Text>
              <Text style={[styles.net, { color: net >= 0 ? GREEN : RED }]}>
                {netText(net, unit)}
                {unit === 'tokens' ? <Text style={styles.netUnit}> tokens</Text> : null}
              </Text>
            </View>
            {rows.map((r) => (
              <View key={r.key} style={styles.pickRow}>
                <Text style={styles.pickWord} numberOfLines={1}>
                  {r.word}
                </Text>
                <Text style={styles.pickFinish} numberOfLines={1}>
                  {r.placeText ? (
                    <>
                      Finished <Text style={{ color: GOLD }}>{r.placeText}</Text>
                    </>
                  ) : (
                    finishText(null)
                  )}
                </Text>
                <Text style={[styles.pickNet, { color: r.net >= 0 ? GREEN : RED }]}>{netText(r.net, unit)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.steps}>
        <PodiumSteps tiers={tiers} held={held} />
      </View>
    </View>
  );
}

/** The steps alone at card size: no text block, no mentions, no "your pick". */
export function CompactPodium({ tiers }: { tiers: PodiumTier[] }) {
  return (
    <View style={{ height: COMPACT_PODIUM_HEIGHT }}>
      <PodiumSteps tiers={tiers} compact />
    </View>
  );
}

function PodiumSteps({ tiers, held, compact = false }: { tiers: PodiumTier[]; held?: Set<string>; compact?: boolean }) {
  return (
    <View style={[styles.row, compact && { height: '100%' }]}>
      {standingOrder(tiers).map((t) => (
        <Step key={t.place} tier={t} mine={!!held && t.words.some((w) => held.has(w.key))} compact={compact} />
      ))}
    </View>
  );
}

function Step({ tier, mine, compact }: { tier: PodiumTier; mine: boolean; compact: boolean }) {
  const first = tier.place === 1;
  const reduceMotion = useReducedMotion();
  // 0 = nothing shown, 1 = settled. One value for the block, one for the words.
  const rise = useSharedValue(reduceMotion ? 1 : 0);
  const words = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    const delay = stepDelayMs(tier.place);
    rise.set(withDelay(delay, withTiming(1, { duration: 650, easing: RISE })));
    words.set(withDelay(520 + delay, withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) })));
  }, [reduceMotion, rise, words, tier.place]);

  // The block is revealed by a curtain that lifts off it, not by scaling it:
  // the numeral must not stretch as the step rises.
  const curtain = useAnimatedStyle(() => ({ height: `${(1 - rise.get()) * 100}%` }));
  const wordsStyle = useAnimatedStyle(() => ({ opacity: words.get(), transform: [{ translateY: (1 - words.get()) * 12 }] }));

  const mentions = compact ? null : mentionsText(tier);
  const numeral = pick(compact ? COMPACT_NUMERAL : NUMERAL, tier.place);
  return (
    <View
      style={[
        styles.step,
        // A tie covers several places, so its step is that many times as wide.
        { flexGrow: tier.words.length },
        compact ? { height: pick(COMPACT_COLUMN, tier.place) } : null,
      ]}
      accessibilityLabel={`${tier.words.map((w) => w.word).join(' and ')}, place ${tier.place}, ${paysText(tier.multiple)}`}
    >
      <Animated.View style={[styles.words, compact && { paddingBottom: 6 }, wordsStyle]}>
        {mine && !compact ? <Text style={styles.yourPick}>YOUR PICK</Text> : null}
        {tier.words.map((w) => (
          <Text key={w.key} style={[styles.word, { fontSize: compact ? (first ? 14 : 13) : first ? 16 : 14 }]} numberOfLines={1}>
            {w.word}
          </Text>
        ))}
        {mentions ? <Text style={styles.mentions}>{mentions}</Text> : null}
      </Animated.View>
      <View
        style={[
          styles.block,
          compact ? { flex: 1, minHeight: 0 } : { height: pick(HEIGHT, tier.place) },
          first ? styles.blockFirst : styles.blockRest,
          // The website's step colour is one shade off this app's card surface,
          // so on a market card the lower steps are lifted a shade to stay visible.
          compact && !first ? { backgroundColor: '#242424' } : null,
        ]}
      >
        <Text style={[styles.numeral, { fontSize: numeral, lineHeight: numeral * 0.9, color: first ? '#0a0a0a' : '#ffffff' }]}>{tier.place}</Text>
        <Text style={[styles.pays, { color: first ? 'rgba(10,10,10,0.72)' : '#a3a3a3' }]} numberOfLines={1}>
          {paysText(tier.multiple, compact)}
        </Text>
        <Animated.View pointerEvents="none" style={[styles.curtain, { backgroundColor: compact ? CARD_BG_COMPACT : CARD_BG }, curtain]} />
      </View>
    </View>
  );
}

const CARD_BG = '#0d0d0d';
/** On a market card the steps sit on the card's own surface, which the curtain has to match. */
const CARD_BG_COMPACT = '#151515';

const styles = StyleSheet.create({
  card: { backgroundColor: CARD_BG, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' },
  text: { padding: 20 },
  label: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16, letterSpacing: 1.76, color: GOLD },
  headline: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 32, color: '#ffffff', marginTop: 6 },
  sub: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: '#a3a3a3', marginTop: 8 },
  picks: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', gap: 8 },
  pickHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickLabel: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16, letterSpacing: 1.1, color: '#737373' },
  net: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, fontVariant: ['tabular-nums'] },
  netUnit: { fontFamily: fonts.medium, fontSize: 12, color: '#737373' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickWord: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: '#ffffff', flexShrink: 1 },
  pickFinish: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: '#a3a3a3' },
  pickNet: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'] },

  steps: { paddingHorizontal: 12, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  step: { flexBasis: 0, minWidth: 0 },
  words: { alignItems: 'center', paddingHorizontal: 4, paddingBottom: 10 },
  yourPick: { fontFamily: fonts.bold, fontSize: 9, lineHeight: 12, letterSpacing: 1.26, color: GOLD, marginBottom: 4 },
  word: { fontFamily: fonts.bold, lineHeight: 20, color: '#ffffff', textAlign: 'center', maxWidth: '100%' },
  mentions: { fontFamily: fonts.regular, fontSize: 10, lineHeight: 14, color: '#737373', marginTop: 2 },
  block: { padding: 10, justifyContent: 'space-between', borderTopLeftRadius: 8, borderTopRightRadius: 8, overflow: 'hidden' },
  blockFirst: { backgroundColor: GOLD },
  blockRest: { backgroundColor: '#171717', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)' },
  numeral: { fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  pays: { fontFamily: fonts.semibold, fontSize: 10, lineHeight: 14 },
  curtain: { position: 'absolute', top: 0, left: 0, right: 0 },
});
