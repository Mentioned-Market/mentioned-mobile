// The Seeker link and welcome stake as one flow, shared by the card on Me and
// the offer on Home, so the two can never drift in what they do.
//
// Linking asks the Seeker wallet for one message signature, never a
// transaction: the message names this account, so it cannot be replayed to
// link the Seeker to anyone else. What follows depends on what the server
// offers: a cash stake is requested at once, so a first-time owner taps once
// and gets both; a free pick is spent on a market, so the card points there.
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { useState } from 'react';

import { listPaidMajority } from '@/api/paidMajority';
import { keys } from '@/api/queries';
import { claimSeekerGrant, linkSeeker, submitSeekerPick, type SeekerStatus } from '@/api/seeker';
import { isNoWalletError, signMessageWithSeeker } from '@/chain/mwa';
import { freePickMarket, NO_FREE_PICK_MARKET, SEEKER_ACCOUNT_NO_PERK, seekerErrorMessage, seekerPerkWallet, sendingLabel, type SeekerAction } from '@/lib/seeker-perk';
import { buildSeekerLinkMessage } from '@/lib/seekerLinkMessage';
import { markSeekerVerified } from '@/store/seeker-verified';
import { useSession } from '@/store/session';

type Busy = null | 'wallet' | 'checking' | 'checking-pick' | 'pick' | 'sending';

const BUSY_LABEL: Record<'wallet' | 'checking' | 'checking-pick' | 'pick', string> = {
  wallet: 'Waiting for your wallet',
  checking: 'Checking your Seeker',
  'checking-pick': 'Checking your pick',
  pick: 'Finding a market',
};

export function useSeekerFlow(sessionWallet: string, status: SeekerStatus | undefined) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  // Something worth saying that is not a failure, e.g. nowhere to use the pick yet.
  const [notice, setNotice] = useState<string | null>(null);
  // Set when the stake lands while this flow is on screen; not persisted, so
  // the loud version shows once and the next visit is the quiet one.
  const [justFunded, setJustFunded] = useState(false);

  const store = (next: SeekerStatus) => {
    queryClient.setQueryData(keys.seekerStatus(sessionWallet), next);
    // The mark beside this account's name appears at once, not after the next lookup.
    if (next.linked) markSeekerVerified(sessionWallet);
  };

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

  // A free pick that was sent and not seen to land. Asking moves no money:
  // the server only looks at the chain for the transaction it already has.
  const checkPick = async () => {
    setBusy('checking-pick');
    const next = await submitSeekerPick();
    store(next);
    if (next.freePick.status === 'used') {
      setJustFunded(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  // The free pick only works on a paid majority market, so "use it" goes
  // straight to one, not to a list of markets it mostly cannot be used on.
  const openPickMarket = async () => {
    if (status?.freePick.status !== 'available') return router.push('/markets');
    setBusy('pick');
    try {
      const markets = await queryClient.fetchQuery({ queryKey: keys.paidMajorityList, queryFn: listPaidMajority, staleTime: 30_000 });
      const href = freePickMarket(markets, status);
      if (href) router.push(href as Href);
      else setNotice(NO_FREE_PICK_MARKET);
    } catch {
      router.push('/markets');
    } finally {
      setBusy(null);
    }
  };

  const run = async (action: SeekerAction) => {
    setNotice(null);
    if (action === 'pick') return openPickMarket();
    if (action === 'history') return router.push('/transactions');
    if (action === 'positions') return router.push('/positions');
    setError(null);
    // The card is not drawn for an account signed in with the Seeker, so this
    // should be unreachable. It is checked here as well because this is where
    // the link is actually made, and a second way to the card must not be a
    // second way to link (see seekerPerkWallet).
    if (!seekerPerkWallet(sessionWallet, useSession.getState().provider)) {
      setError(SEEKER_ACCOUNT_NO_PERK);
      return;
    }
    try {
      if (action === 'link') {
        setBusy('wallet');
        const signed = await signMessageWithSeeker((seeker) => buildSeekerLinkMessage(seeker, sessionWallet, Math.floor(Date.now() / 1000)));
        setBusy('checking');
        const linked = await linkSeeker({ seekerWallet: signed.address, message: signed.message, signature: signed.signature });
        store(linked);
        // A cash stake is collected at once. A free pick has nothing to
        // collect: the card now offers it, and it is spent on a market.
        if (linked.grant.status === 'available') await claim();
      } else if (action === 'check-pick') {
        await checkPick();
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

  return { busy: busy !== null, busyLabel, error, notice, justFunded, run };
}
