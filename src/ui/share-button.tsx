// Sharing a card to wherever the phone can send it.
//
// Three steps, in the order they actually matter to the user:
//  1. Share. The Android sheet goes out with the sharer's own referral link,
//     which unfurls into the card image the website renders.
//  2. Record. The server unlocks the sharing achievements from this, and says
//     which ones, so the app can show them.
//  3. Claim. Share points for a paid market need the link to the real post as
//     proof, so that is asked for separately and only after a share, never as
//     a condition of sharing.
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '@/api/client';
import {
  claimSharePoints,
  isPostUrl,
  recordShare,
  shareText,
  shareUrl,
  type AchievementUnlock,
  type ShareCard,
} from '@/api/share';
import { Button } from '@/ui/button';
import { colors, spacing, type } from '@/ui/theme';

type Props = {
  card: ShareCard;
  /** The market the card is about, for the achievements and the points claim. */
  marketId: string | null;
  /**
   * Which paid family the market belongs to, or null for a free market. Share
   * points exist for paid markets only, so a free card just shares.
   */
  family: 'paid-markets' | 'paid-majority' | null;
  /** The sharer's referral code, baked into the link so a click converts. */
  refCode: string | null;
  signedIn: boolean;
};

export function ShareButton({ card, marketId, family, refCode, signedIn }: Props) {
  const [shared, setShared] = useState(false);
  const [unlocked, setUnlocked] = useState<AchievementUnlock[]>([]);
  const [postUrl, setPostUrl] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const share = async () => {
    setError(null);
    try {
      const result = await Share.share({ message: `${shareText(card)}\n\n${shareUrl(card, refCode)}` });
      // Android reports a dismissed sheet rather than throwing. Nothing went
      // out, so nothing is recorded and the claim box stays shut.
      if (result.action === Share.dismissedAction) return;
      setShared(true);
      Haptics.selectionAsync();
      if (!signedIn) return;
      const recorded = await recordShare(card.kind, marketId);
      if (recorded.newAchievements.length > 0) setUnlocked(recorded.newAchievements);
    } catch {
      setError('That did not open. Try again.');
    }
  };

  const claim = async () => {
    if (!family || !marketId) return;
    if (!isPostUrl(postUrl)) {
      setError('Paste the link to your post, e.g. https://x.com/you/status/123.');
      return;
    }
    setClaiming(true);
    setError(null);
    try {
      const result = await claimSharePoints(family, marketId, postUrl.trim());
      setClaimed(result.alreadyShared ? 'Already claimed for this market.' : `+${result.awarded} points`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 401
            ? 'Sign in to claim the points.'
            : e.status === 403
              ? 'Points are for markets you traded, while the season is running.'
              : (e.message ?? 'That did not go through. Try again.')
          : 'That did not go through. Check your connection and try again.',
      );
    } finally {
      setClaiming(false);
    }
  };

  return (
    <View style={styles.card}>
      <Button label={shared ? 'Share again' : 'Share this'} tone={shared ? 'neutral' : 'gold'} onPress={share} />
      {unlocked.length > 0 ? (
        <Text style={[type.muted, { color: colors.yes }]}>
          {unlocked.map((a) => `${a.emoji} ${a.title} unlocked, +${a.points} points`).join('\n')}
        </Text>
      ) : null}

      {shared && signedIn && family && marketId ? (
        claimed ? (
          <Text style={[type.muted, { color: colors.yes }]}>{claimed}</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Text style={type.muted}>Posted it on X? Paste the link for your share points.</Text>
            <TextInput
              value={postUrl}
              onChangeText={(v) => {
                setPostUrl(v);
                setError(null);
              }}
              placeholder="https://x.com/you/status/..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.input}
              accessibilityLabel="Link to your post"
            />
            <Button label={claiming ? 'Checking' : 'Claim points'} tone="neutral" onPress={claim} disabled={claiming || postUrl.trim().length === 0} />
          </View>
        )
      ) : null}
      {error ? <Text style={[type.muted, { color: colors.no }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, marginTop: spacing.sm },
  input: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
  },
});
