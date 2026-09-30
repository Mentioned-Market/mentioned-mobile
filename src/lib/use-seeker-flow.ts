// The Seeker link and welcome stake as one flow, shared by the card on Me and
// the offer on Home, so the two can never drift in what they do.
//
// Linking asks the Seeker wallet for one message signature, never a
// transaction: the message names this account, so it cannot be replayed to
// link the Seeker to anyone else. The welcome stake is then requested at once,
// so a first-time owner taps once and gets both.
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';

import { keys } from '@/api/queries';
import { claimSeekerGrant, linkSeeker, type SeekerStatus } from '@/api/seeker';
import { isNoWalletError, signMessageWithSeeker } from '@/chain/mwa';
import { seekerErrorMessage, sendingLabel, type SeekerAction } from '@/lib/seeker-perk';
import { buildSeekerLinkMessage } from '@/lib/seekerLinkMessage';

type Busy = null | 'wallet' | 'checking' | 'sending';

const BUSY_LABEL: Record<'wallet' | 'checking', string> = {
  wallet: 'Waiting for your wallet',
  checking: 'Checking your Seeker',
};

export function useSeekerFlow(sessionWallet: string, status: SeekerStatus | undefined) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the stake lands while this flow is on screen; not persisted, so
  // the loud version shows once and the next visit is the quiet one.
  const [justFunded, setJustFunded] = useState(false);

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
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const run = async (action: SeekerAction) => {
    if (action === 'pick') return router.push('/markets');
    if (action === 'history') return router.push('/transactions');
    setError(null);
    try {
      if (action === 'link') {
        setBusy('wallet');
        const signed = await signMessageWithSeeker((seeker) => buildSeekerLinkMessage(seeker, sessionWallet, Math.floor(Date.now() / 1000)));
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

  /** The button's label while something is in flight, or null when idle. */
  const busyLabel = busy === 'sending' && status ? sendingLabel(status.grant) : busy && busy !== 'sending' ? BUSY_LABEL[busy] : null;

  return { busy: busy !== null, busyLabel, error, justFunded, run };
}
