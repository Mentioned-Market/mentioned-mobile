// Moving money in and out of the app wallet, from the Me tab (SPEC 6.4).
//
// Withdraw: the app wallet signs a USDC or SOL transfer to any address, the
// Seeker wallet being one tap away as the destination. Same pipeline as a
// trade: simulate, sign with Openfort, broadcast, confirm.
//
// Deposit: the Seeker wallet pays and signs, over one MWA session, a transfer
// into the app wallet. The Seed Vault prompt is the confirmation, so the
// button is a plain one rather than a swipe. The app wallet's address is also
// shown for anyone sending from somewhere else.
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { keys, useSolBalance, useUsdcBalance } from '@/api/queries';
import { connectSeekerWallet, depositWithSeeker, isNoWalletError } from '@/chain/mwa';
import { ConfirmationTimeoutError, confirmSignature } from '@/chain/rpcSend';
import { RPC_URL } from '@/config';
import { shortAddress, usd } from '@/lib/format';
import { toBaseUnits } from '@/lib/units';
import { useWallet } from '@/store/wallet';
import { checkTransfer, DECIMALS, friendlyTransferError, maxTransfer, planTransfer, type TransferAsset } from '@/trade/transfer';
import { useTrade } from '@/trade/use-trade';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { NumberPad } from '@/ui/number-pad';
import { Segmented } from '@/ui/segmented';
import { SwipeButton } from '@/ui/swipe-button';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';
import { TradeProgress } from '@/ui/trade-progress';
import { PresetRow } from '@/ui/trade-sheet';

const ASSETS = [
  { key: 'USDC' as const, label: 'USDC' },
  { key: 'SOL' as const, label: 'SOL' },
];

const fmtSol = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} SOL`;
const fmtAmount = (asset: TransferAsset, n: number | undefined) => (n === undefined ? '—' : asset === 'USDC' ? usd(n, { dp: 2 }) : fmtSol(n));

type SheetProps = { visible: boolean; onClose: () => void; wallet: string; initialAsset?: TransferAsset };

// ── Withdraw ────────────────────────────────────────────────────────────────

export function WithdrawSheet({ visible, onClose, wallet }: SheetProps) {
  const queryClient = useQueryClient();
  const sheetRef = useRef<BottomSheetHandle>(null);
  const trade = useTrade();
  const usdcBalance = useUsdcBalance(wallet, visible);
  const solBalance = useSolBalance(wallet, visible);
  const seeker = useWallet((s) => s.viewedAddress);
  const seekerToken = useWallet((s) => s.authToken);
  const setSeeker = useWallet((s) => s.setWallet);

  const [asset, setAsset] = useState<TransferAsset>('USDC');
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; detail: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [formHeight, setFormHeight] = useState(0);

  const balance = asset === 'USDC' ? usdcBalance.data : solBalance.data;

  const refreshBalances = () => {
    const run = () => {
      void queryClient.invalidateQueries({ queryKey: keys.usdcBalance(wallet) });
      void queryClient.invalidateQueries({ queryKey: keys.solBalance(wallet) });
    };
    run();
    setTimeout(run, 4000);
    setTimeout(run, 15000);
  };

  const fillSeekerAddress = async () => {
    setInputError(null);
    if (seeker) {
      setTo(seeker);
      return;
    }
    setConnecting(true);
    try {
      const w = await connectSeekerWallet(seekerToken);
      setSeeker(w.address, w.authToken);
      setTo(w.address);
    } catch (e) {
      setInputError(isNoWalletError(e) ? 'No wallet app answered. Open your Seeker wallet and try again.' : friendlyTransferError(e instanceof Error ? e.message : String(e)));
    } finally {
      setConnecting(false);
    }
  };

  const submit = async () => {
    setInputError(null);
    const check = checkTransfer({ asset, amount, to, from: wallet, balance });
    if ('error' in check) {
      setInputError(check.error);
      return;
    }
    const instructions = await planTransfer({ asset, from: wallet, to: check.to, units: check.units, payer: wallet });
    setResult({ title: `Sent ${asset === 'USDC' ? usd(Number(amount), { dp: 2 }) : fmtSol(Number(amount))}`, detail: `To ${shortAddress(check.to)}` });
    const signature = await trade.run(instructions, { explain: friendlyTransferError });
    if (!signature) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refreshBalances();
  };

  const close = () => {
    setAmount('');
    setInputError(null);
    setResult(null);
    trade.reset();
    onClose();
  };

  const working = trade.state.status === 'working';

  return (
    <BottomSheet ref={sheetRef} visible={visible} onClose={close} full title="Withdraw" locked={working}>
      {trade.state.status !== 'idle' ? (
        <TradeProgress
          phase={working ? 'working' : trade.state.status === 'done' ? 'done' : trade.state.status === 'failed' && trade.state.indeterminate ? 'pending' : 'failed'}
          workingLabel="Sending"
          minHeight={formHeight || undefined}
          title={trade.state.status === 'done' ? result?.title : undefined}
          detail={trade.state.status === 'done' ? result?.detail : trade.state.status === 'failed' ? trade.state.message : undefined}
        />
      ) : (
        <View style={styles.form} onLayout={(e) => setFormHeight(e.nativeEvent.layout.height)}>
          <Segmented
            options={ASSETS}
            value={asset}
            onChange={(a) => {
              setAsset(a);
              setAmount('');
              setInputError(null);
            }}
          />
          <AmountBlock asset={asset} amount={amount} />
          <View style={styles.chips}>
            <Chip value={fmtAmount(asset, balance)} caption="available" />
          </View>

          <View style={styles.field}>
            <TextInput
              value={to}
              onChangeText={(v) => {
                setTo(v);
                setInputError(null);
              }}
              placeholder="Wallet address"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              accessibilityLabel="Destination wallet address"
            />
            <Button label={connecting ? 'Opening' : seeker ? 'Seeker' : 'Use Seeker'} tone="neutral" size="sm" onPress={() => void fillSeekerAddress()} disabled={connecting} />
          </View>

          <PresetRow
            presets={[25, 50, 75, 100].map((n) => ({
              label: n === 100 ? 'Max' : `${n}%`,
              value: n === 100 ? maxTransfer(asset, balance) : balance ? String(Math.floor((balance * n) / 100 * 10 ** DECIMALS[asset]) / 10 ** DECIMALS[asset]) : '',
            }))}
            onPick={(v) => {
              setAmount(v);
              setInputError(null);
            }}
          />
          <NumberPad
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setInputError(null);
            }}
            maxDecimals={asset === 'USDC' ? 2 : 4}
          />
        </View>
      )}
      <View style={styles.footer}>
        {working ? (
          <View style={{ height: 64 }} />
        ) : trade.state.status === 'done' ? (
          <Button label="Done" tone="gold" onPress={() => sheetRef.current?.close()} />
        ) : trade.state.status === 'failed' && trade.state.indeterminate ? (
          <Button label="Close" tone="neutral" onPress={() => sheetRef.current?.close()} />
        ) : trade.state.status === 'failed' ? (
          <Button label="Try again" tone="gold" onPress={trade.reset} />
        ) : trade.needsSignIn ? (
          <Link href="/sign-in" asChild>
            <Button label="Sign in again" tone="gold" note="Your Openfort session has gone. Nothing is lost." />
          </Link>
        ) : trade.walletFailed ? (
          <Button label="Reconnect wallet" tone="neutral" onPress={trade.retryWallet} note="Your wallet did not come back. Nothing is lost." />
        ) : (
          <SwipeButton
            label={`Swipe to send ${asset}`}
            tone="gold"
            disabled={!trade.ready || !amount || !to.trim()}
            note={inputError ?? (!trade.ready ? (trade.connecting ? 'Connecting your wallet' : 'Sign in to withdraw') : undefined)}
            onConfirm={() => void submit()}
          />
        )}
      </View>
    </BottomSheet>
  );
}

// ── Deposit ─────────────────────────────────────────────────────────────────

type DepositState = { status: 'idle' } | { status: 'working' } | { status: 'done'; signature: string } | { status: 'failed'; message: string; indeterminate: boolean };

export function DepositSheet({ visible, onClose, wallet, initialAsset = 'USDC' }: SheetProps) {
  const queryClient = useQueryClient();
  const sheetRef = useRef<BottomSheetHandle>(null);
  const seeker = useWallet((s) => s.viewedAddress);
  const seekerToken = useWallet((s) => s.authToken);
  const setSeeker = useWallet((s) => s.setWallet);
  const seekerUsdc = useUsdcBalance(seeker, visible && !!seeker);
  const seekerSol = useSolBalance(seeker, visible && !!seeker);

  // Callers that want a particular asset remount the sheet with `key`, so
  // the initial value is the only one needed.
  const [asset, setAsset] = useState<TransferAsset>(initialAsset);
  const [amount, setAmount] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [state, setState] = useState<DepositState>({ status: 'idle' });
  const [formHeight, setFormHeight] = useState(0);

  const seekerBalance = asset === 'USDC' ? seekerUsdc.data : seekerSol.data;

  const refreshBalances = () => {
    const run = () => {
      void queryClient.invalidateQueries({ queryKey: keys.usdcBalance(wallet) });
      void queryClient.invalidateQueries({ queryKey: keys.solBalance(wallet) });
      if (seeker) {
        void queryClient.invalidateQueries({ queryKey: keys.usdcBalance(seeker) });
        void queryClient.invalidateQueries({ queryKey: keys.solBalance(seeker) });
      }
    };
    run();
    setTimeout(run, 4000);
    setTimeout(run, 15000);
  };

  const submit = async () => {
    setInputError(null);
    const units = toBaseUnits(amount, DECIMALS[asset]);
    if (units <= 0n) {
      setInputError('Enter an amount.');
      return;
    }
    setState({ status: 'working' });
    try {
      // The Seeker wallet pays the fee and signs; the app wallet only receives.
      const done = await depositWithSeeker(seekerToken, (from) => planTransfer({ asset, from, to: wallet as never, units, payer: from }));
      setSeeker(done.address, done.authToken);
      try {
        await confirmSignature(done.signature, { proxyUrl: RPC_URL });
      } catch (e) {
        if (e instanceof ConfirmationTimeoutError) {
          setState({ status: 'failed', message: e.message, indeterminate: true });
          return;
        }
        throw e;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState({ status: 'done', signature: done.signature });
      refreshBalances();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setState({ status: 'failed', message: isNoWalletError(e) ? 'No wallet app answered. Open your Seeker wallet and try again.' : friendlyTransferError(raw), indeterminate: false });
    }
  };

  const close = () => {
    setAmount('');
    setInputError(null);
    setState({ status: 'idle' });
    onClose();
  };

  const working = state.status === 'working';

  return (
    <BottomSheet ref={sheetRef} visible={visible} onClose={close} full title="Add funds" locked={working}>
      {state.status !== 'idle' ? (
        <TradeProgress
          phase={working ? 'working' : state.status === 'done' ? 'done' : state.indeterminate ? 'pending' : 'failed'}
          workingLabel="Waiting for your wallet app"
          minHeight={formHeight || undefined}
          title={state.status === 'done' ? `Added ${asset === 'USDC' ? usd(Number(amount), { dp: 2 }) : fmtSol(Number(amount))}` : undefined}
          detail={state.status === 'done' ? 'It is in your app wallet.' : state.status === 'failed' ? state.message : undefined}
        />
      ) : (
        <View style={styles.form} onLayout={(e) => setFormHeight(e.nativeEvent.layout.height)}>
          <Segmented
            options={ASSETS}
            value={asset}
            onChange={(a) => {
              setAsset(a);
              setAmount('');
              setInputError(null);
            }}
          />
          <AmountBlock asset={asset} amount={amount} />
          <View style={styles.chips}>
            {seeker ? <Chip value={fmtAmount(asset, seekerBalance)} caption="in your wallet app" /> : <Chip value="Your wallet app" caption="opens to approve when you tap send" />}
          </View>

          <View style={styles.addressCard}>
            <Text style={type.label}>Or send from anywhere to your app wallet</Text>
            <Text style={styles.address} selectable>
              {wallet}
            </Text>
          </View>

          <NumberPad
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setInputError(null);
            }}
            maxDecimals={asset === 'USDC' ? 2 : 4}
          />
        </View>
      )}
      <View style={styles.footer}>
        {working ? (
          <View style={{ height: 56 }} />
        ) : state.status === 'done' ? (
          <Button label="Done" tone="gold" onPress={() => sheetRef.current?.close()} />
        ) : state.status === 'failed' && state.indeterminate ? (
          <Button label="Close" tone="neutral" onPress={() => sheetRef.current?.close()} />
        ) : state.status === 'failed' ? (
          <Button label="Try again" tone="gold" onPress={() => setState({ status: 'idle' })} />
        ) : (
          <Button label={`Send ${asset} from your wallet app`} tone="gold" disabled={!amount} note={inputError ?? 'Seed Vault on a Seeker, or Phantom or Solflare on any Android'} onPress={() => void submit()} />
        )}
      </View>
    </BottomSheet>
  );
}

// ── Shared ──────────────────────────────────────────────────────────────────

function AmountBlock({ asset, amount }: { asset: TransferAsset; amount: string }) {
  return (
    <View style={styles.amountRow}>
      {asset === 'USDC' ? <Text style={styles.amountUnit}>$</Text> : null}
      <Text style={[type.display, { maxWidth: '80%' }, !amount && { color: colors.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
        {amount || '0'}
      </Text>
      {asset === 'SOL' ? <Text style={styles.amountSuffix}>SOL</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  footer: { paddingTop: spacing.sm },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4, minHeight: 64, paddingVertical: spacing.sm },
  amountUnit: { fontFamily: fonts.bold, fontSize: 40, color: colors.text },
  amountSuffix: { fontFamily: fonts.semibold, fontSize: 20, color: colors.textMuted },
  chips: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { flex: 1, height: 48, paddingHorizontal: spacing.md, borderRadius: radius.control, backgroundColor: colors.surfaceRaised, color: colors.text, fontFamily: fonts.medium, fontSize: 15 },
  addressCard: { padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.surface, gap: 4 },
  address: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.text },
});
