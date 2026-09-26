// The Seeker card on Me: link the Seeker's Seed Vault wallet to this account,
// then collect the welcome stake. What it says and offers comes from
// `@/lib/seeker-perk`; this file wires the MWA signature and the two routes.
//
// Linking asks the Seeker wallet for one message signature, never a
// transaction: the message names this account, so it cannot be replayed to
// link the Seeker to anyone else. The welcome stake is then requested at once,
// so a first-time owner taps once and gets both.
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { keys } from '@/api/queries';
import { claimSeekerGrant, linkSeeker, type SeekerStatus } from '@/api/seeker';
import { isNoWalletError, signMessageWithSeeker } from '@/chain/mwa';
import { seekerCard, seekerErrorMessage, sendingLabel, type SeekerAction } from '@/lib/seeker-perk';
import { buildSeekerLinkMessage } from '@/lib/seekerLinkMessage';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { colors, spacing, type } from '@/ui/theme';

type Busy = null | 'wallet' | 'checking' | 'sending';

const BUSY_LABEL: Record<'wallet' | 'checking', string> = {
  wallet: 'Waiting for your wallet',
  checking: 'Checking your Seeker',
};

export function SeekerCard({ sessionWallet, status }: { sessionWallet: string; status: SeekerStatus }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the stake lands while this card is on screen; not persisted, so
  // the loud version shows once and the next visit is the quiet one.
  const [justFunded, setJustFunded] = useState(false);

  const card = seekerCard(status, justFunded);
  if (!card) return null;

  const store = (next: SeekerStatus) => queryClient.setQueryData(keys.seekerStatus(sessionWallet), next);

  const claim = async () => {
    setBusy('sending');
    const next = await claimSeekerGrant();
    store(next);
    if (next.grant.status === 'funded') {
      void queryClient.invalidateQueries({ queryKey: keys.usdcBalance(sessionWallet) });
      void queryClient.invalidateQueries({ queryKey: keys.solBalance(sessionWallet) });
      void queryClient.invalidateQueries({ queryKey: keys.walletTransfers(sessionWallet) });
      setJustFunded(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const run = async (action: SeekerAction) => {
    if (action === 'pick') return router.push('/markets');
    if (action === 'history') return router.push('/transactions');
    setError(null);
    try {
      if (action === 'link') {
        setBusy('wallet');
        const signed = await signMessageWithSeeker((seeker) =>
          buildSeekerLinkMessage(seeker, sessionWallet, Math.floor(Date.now() / 1000)),
        );
        setBusy('checking');
        const linked = await linkSeeker({ seekerWallet: signed.address, message: signed.message, signature: signed.signature });
        store(linked);
        if (linked.grant.status === 'available') await claim();
      } else {
        await claim();
      }
    } catch (e) {
      setError(isNoWalletError(e) ? 'No wallet app answered. Open your Seeker wallet and try again.' : seekerErrorMessage(e));
      // A refusal can mean the state moved (already linked, stake already
      // sent); show where things actually stand.
      void queryClient.invalidateQueries({ queryKey: keys.seekerStatus(sessionWallet) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={[styles.card, card.celebrate && styles.celebrate]}>
      <View style={styles.head}>
        <Ionicons
          name={card.celebrate ? 'gift' : card.verified ? 'checkmark-circle' : 'phone-portrait-outline'}
          size={card.celebrate ? 26 : 22}
          color={card.verified ? colors.gold : colors.text}
        />
        <Text style={card.celebrate ? styles.celebrateTitle : type.heading}>{card.title}</Text>
      </View>
      <Text style={card.celebrate ? styles.celebrateBody : type.muted}>{card.body}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {card.action && card.cta ? (
        <Button
          label={busy === 'sending' ? sendingLabel(status.grant) : busy ? BUSY_LABEL[busy] : card.cta}
          tone={card.action === 'check' || card.action === 'history' ? 'neutral' : 'gold'}
          disabled={busy !== null}
          onPress={() => void run(card.action!)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  error: { ...type.muted, color: colors.no },
  celebrate: { backgroundColor: colors.goldTint },
  celebrateTitle: { ...type.heading, fontSize: 20, lineHeight: 26, color: colors.gold },
  celebrateBody: { ...type.body, color: colors.text },
});
