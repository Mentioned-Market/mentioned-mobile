// "Ready to claim": one card per finished market the signed-in wallet can
// collect from. The claim runs in a sheet, from `useClaimFlow`, that shows the
// same progress and completion as a trade.
//
// A paid YES/NO card reads its own amount from the chain and draws nothing when
// there is nothing to collect, so a caller can offer a card for every resolved
// market it knows of without checking first. A majority card is given its
// amount, which the positions route already knows.
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getPaidMarket } from '@/api/paidMarkets';
import { keys, useAmmClaim, useSolBalance } from '@/api/queries';
import { deserializeMarketAccount } from '@/chain/amm';
import { base64ToBytes } from '@/lib/bytes';
import { usd, usdc } from '@/lib/format';
import {
  ammClaimDetail,
  ammClaimLabel,
  friendlyClaimError,
  majorityClaimLabel,
  MIN_SOL_TO_CLAIM,
  planAmmClaim,
  planMajorityClaims,
  solText,
} from '@/trade/claim';
import { useTrade } from '@/trade/use-trade';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';
import { TradeProgress } from '@/ui/trade-progress';

export type ClaimTarget =
  | { kind: 'amm'; marketId: string; title: string }
  | { kind: 'majority'; marketId: string; title: string; words: string[]; dollars: number };

type CardProps = { target: ClaimTarget; wallet: string; flow: ClaimFlow };

export function ClaimCard({ target, wallet, flow }: CardProps) {
  // Only a paid YES/NO card needs the chain read; for majority the hook idles.
  const amm = useAmmClaim(target.kind === 'amm' ? wallet : null, target.marketId);
  if (target.kind === 'amm') {
    if (!amm.data) return null;
    return <CardBody target={target} flow={flow} label={ammClaimLabel(amm.data)} detail={ammClaimDetail(amm.data)} />;
  }
  if (target.dollars <= 0) return null;
  const count = target.words.length;
  return (
    <CardBody
      target={target}
      flow={flow}
      label={majorityClaimLabel(target.dollars)}
      detail={`Your ${count === 1 ? 'winning word pays' : `${count} winning words pay`} out ${usd(target.dollars)}.`}
    />
  );
}

function CardBody({ target, flow, label, detail }: { target: ClaimTarget; flow: ClaimFlow; label: string; detail: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Ready to claim</Text>
      <Text style={[type.body, { fontFamily: fonts.semibold }]} numberOfLines={2}>
        {target.title}
      </Text>
      <Text style={type.muted}>{detail}</Text>
      <Button
        label={label}
        tone="yes"
        onPress={() => flow.start(target)}
        disabled={!flow.ready || flow.busy}
        note={flow.ready ? undefined : flow.connecting ? 'Connecting your wallet' : 'Sign in to claim'}
      />
    </View>
  );
}

type Result = { title: string; detail: string };

export type ClaimFlow = { start: (target: ClaimTarget) => void; ready: boolean; connecting: boolean; busy: boolean; sheet: ReactNode };

/**
 * The claim itself, and the sheet it runs in. Owned by the screen rather than
 * by a card: a successful claim empties the card, and the positions refresh
 * that follows removes it, so a sheet living inside the card would vanish in
 * the middle of its own completion animation. Held here, it stays put until
 * the user closes it, and only then are the positions refreshed.
 */
export function useClaimFlow(wallet: string | null): ClaimFlow {
  const queryClient = useQueryClient();
  const trade = useTrade();
  const sheetRef = useRef<BottomSheetHandle>(null);
  const sol = useSolBalance(wallet, false);
  // The market being claimed, or null when the sheet is shut. Kept for as long
  // as the sheet is up, whatever happens to the card that opened it.
  const [target, setTarget] = useState<ClaimTarget | null>(null);
  // Reading the chain and building the transactions, before the trade hook
  // takes over. Shown as working too: to the user it is all one wait.
  const [planning, setPlanning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [landed, setLanded] = useState(false);

  const refresh = () => {
    if (!wallet) return;
    const run = () => {
      void queryClient.invalidateQueries({ queryKey: keys.ammClaimAll });
      void queryClient.invalidateQueries({ queryKey: keys.paidMarketUserPositions(wallet) });
      void queryClient.invalidateQueries({ queryKey: keys.paidMajorityUserPositions(wallet) });
      void queryClient.invalidateQueries({ queryKey: ['paid-majority', 'positions'] });
      void queryClient.invalidateQueries({ queryKey: keys.usdcBalance(wallet) });
      void queryClient.invalidateQueries({ queryKey: keys.solBalance(wallet) });
    };
    run();
    // The positions routes read through an indexer that trails the chain.
    setTimeout(run, 4000);
  };

  const start = async (t: ClaimTarget) => {
    if (!wallet) return;
    trade.reset();
    setResult(null);
    setLanded(false);
    setTarget(t);
    if (sol.data !== undefined && sol.data < MIN_SOL_TO_CLAIM) {
      trade.setInputError(`You need a little SOL (about ${MIN_SOL_TO_CLAIM}) for the network fee. The claim returns more than it costs.`);
      return;
    }
    setPlanning(true);
    try {
      let batches;
      if (t.kind === 'amm') {
        const market = deserializeMarketAccount(base64ToBytes((await getPaidMarket(t.marketId)).account));
        if (!market) throw new Error('Could not read this market.');
        const plan = await planAmmClaim(wallet, market);
        if (plan.batches.length === 0) {
          trade.setInputError('There is nothing left to claim here.');
          setLanded(true);
          return;
        }
        batches = plan.batches;
        setResult(
          plan.redeemUnits > 0
            ? { title: `Claimed ${usdc(plan.redeemUnits)}`, detail: `Added to your cash, and ${solText(plan.lamports)} in deposits is back in your wallet.` }
            : { title: `Returned ${solText(plan.lamports)}`, detail: 'The deposits from your token accounts are back in your wallet.' },
        );
      } else {
        batches = await planMajorityClaims({ wallet, marketId: BigInt(t.marketId), words: t.words });
        setResult({ title: `Claimed ${usd(t.dollars)}`, detail: 'Added to your cash.' });
      }
      setPlanning(false);
      const outcome = await trade.runBatches(batches, { explain: friendlyClaimError });
      if (outcome.complete) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (outcome.confirmed.length > 0) setLanded(true);
    } catch (e) {
      trade.setInputError(friendlyClaimError(e instanceof Error ? e.message : String(e)));
    } finally {
      setPlanning(false);
    }
  };

  const working = planning || trade.state.status === 'working';
  const phase = working ? 'working' : trade.state.status === 'done' ? 'done' : trade.state.status === 'failed' && trade.state.indeterminate ? 'pending' : 'failed';
  const close = () => sheetRef.current?.close();

  const sheet = (
    <BottomSheet
      ref={sheetRef}
      visible={target !== null}
      onClose={() => {
        setTarget(null);
        setResult(null);
        trade.reset();
        // Anything that landed, or may have, is reflected once the sheet is
        // gone, never under it.
        if (landed || (trade.state.status === 'failed' && trade.state.indeterminate)) refresh();
        setLanded(false);
      }}
      title="Claim"
      subtitle={target?.title}
      locked={working}
      footer={
        working ? (
          <View style={{ height: 52 }} />
        ) : trade.state.status === 'done' ? (
          <Button label="Done" tone="gold" onPress={close} />
        ) : trade.state.status === 'failed' && !trade.state.indeterminate && target ? (
          <Button label="Try again" tone="gold" onPress={() => start(target)} />
        ) : (
          <Button label="Close" tone="neutral" onPress={close} />
        )
      }
    >
      <TradeProgress
        phase={phase}
        workingLabel="Claiming"
        title={trade.state.status === 'done' ? result?.title : undefined}
        detail={trade.state.status === 'done' ? result?.detail : trade.state.status === 'failed' ? trade.state.message : undefined}
      />
    </BottomSheet>
  );

  return { start: (t) => void start(t), ready: trade.ready && !!wallet, connecting: trade.connecting, busy: target !== null, sheet };
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.yesTint,
    gap: spacing.sm,
  },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.yes },
});
