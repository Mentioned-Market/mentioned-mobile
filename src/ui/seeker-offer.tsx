// The Seeker offer on Home: a Seeker owner's first pick, paid for. One
// compact row: the gift, a line with the amount in gold, a line under it, and
// a small button. Only while there is money in it (`seekerHomeOffer`); the
// steps are `useSeekerFlow`, the same as Me's card. The × puts it away for
// good on this phone; Me still offers it.
//
// While a link or collect is running, the second line says how far it has
// got, since a small button has no room for "Waiting for your wallet".
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useSeekerStatus } from '@/api/queries';
import type { SeekerStatus } from '@/api/seeker';
import { seekerHomeOffer, type SeekerHomeOffer } from '@/lib/seeker-perk';
import { useSeekerFlow } from '@/lib/use-seeker-flow';
import { usePrefs } from '@/store/prefs';
import { useSession } from '@/store/session';
import { Button } from '@/ui/button';
import { useFeatures } from '@/ui/config-gate';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

export function SeekerOffer() {
  const sessionWallet = useSession((s) => s.wallet);
  const enabled = useFeatures().seekerPerk;
  const status = useSeekerStatus(sessionWallet, enabled);
  const dismissed = usePrefs((s) => s.seekerOfferDismissed);
  if (!enabled || !sessionWallet || !status.data || dismissed) return null;
  return <Offer sessionWallet={sessionWallet} status={status.data} />;
}

function Offer({ sessionWallet, status }: { sessionWallet: string; status: SeekerStatus }) {
  const flow = useSeekerFlow(sessionWallet, status);
  const dismiss = usePrefs((s) => s.dismissSeekerOffer);
  const offer = seekerHomeOffer(status, flow.justFunded);
  if (!offer) return null;
  return (
    <SeekerOfferCard
      offer={offer}
      busy={flow.busy}
      progress={flow.busyLabel}
      error={flow.error}
      onPress={() => void flow.run(offer.action)}
      onDismiss={dismiss}
    />
  );
}

type CardProps = {
  offer: SeekerHomeOffer;
  busy: boolean;
  /** What is happening while busy, in place of the subtitle. */
  progress: string | null;
  error: string | null;
  onPress: () => void;
  onDismiss: () => void;
};

/** The card alone, from an offer. Also drawn by the dev screen's preview, which must not touch the real offer. */
export function SeekerOfferCard({ offer, busy, progress, error, onPress, onDismiss }: CardProps) {
  // The amount in gold, wherever it sits in the title.
  const at = offer.title.indexOf(offer.amount);
  const title =
    at < 0 ? (
      offer.title
    ) : (
      <>
        {offer.title.slice(0, at)}
        <Text style={styles.amount}>{offer.amount}</Text>
        {offer.title.slice(at + offer.amount.length)}
      </>
    );
  const second = error ?? progress ?? offer.subtitle;

  return (
    <View style={[styles.card, offer.celebrate && styles.celebrate]}>
      <Glow still={offer.celebrate || busy} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
          {title}
        </Text>
        <Text style={[styles.subtitle, error ? styles.error : null]} numberOfLines={2}>
          {second}
        </Text>
      </View>
      <Button label={busy ? '…' : offer.cta} size="sm" disabled={busy} onPress={onPress} />
      {!offer.celebrate ? (
        <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Not now" style={styles.close}>
          <Ionicons name="close" size={14} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** The gift, with a slow gold glow breathing behind it. Still under reduce motion, while busy, or once it is claimed. */
function Glow({ still }: { still: boolean }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || still) return;
    t.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => {
      cancelAnimation(t);
      t.set(0);
    };
  }, [t, reduceMotion, still]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.2 + 0.35 * t.get(), transform: [{ scale: 1 + 0.2 * t.get() }] }));
  return (
    <View style={styles.giftWrap}>
      <Animated.View style={[styles.halo, halo]} />
      <View style={styles.gift}>
        <Ionicons name="gift" size={18} color={colors.bg} />
      </View>
    </View>
  );
}

const GIFT = 36;

const styles = StyleSheet.create({
  // No outline. A hairline gold border around corners this round drew
  // unevenly on Android, thicker on the curves than on the sides, and no other
  // card in the app has one (docs/DESIGN.md). The gold tint alone marks it out.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.goldTint,
  },
  // The moment the stake lands: a deeper gold ground, where the border used to thicken.
  celebrate: { backgroundColor: 'rgba(242,183,31,0.28)' },
  giftWrap: { width: GIFT + 6, height: GIFT + 6, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: GIFT + 6, height: GIFT + 6, borderRadius: (GIFT + 6) / 2, backgroundColor: colors.gold },
  gift: { width: GIFT, height: GIFT, borderRadius: GIFT / 2, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 1 },
  title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text },
  amount: { fontFamily: fonts.bold, color: colors.gold, fontVariant: ['tabular-nums'] },
  subtitle: { ...type.muted, fontSize: 13, lineHeight: 17 },
  error: { color: colors.no },
  close: { position: 'absolute', top: 10, right: 12 },
});
