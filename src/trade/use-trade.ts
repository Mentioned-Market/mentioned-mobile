// The one place a screen goes to put a trade on chain.
//
// Holds the whole path behind a single call: simulate, sign, broadcast, wait
// for confirmation. Screens supply instructions and get back signatures or a
// sentence they can show a user.
//
// A purchase can be more than one transaction: a majority basket is split into
// batches of three because a fourth buy overruns Solana's size limit. The state
// stays "working" across all of them, so the progress screen does not flash a
// completion between batches, and it says which batch it is on.
import { useEmbeddedSolanaWallet } from '@openfort/react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Instruction } from '@solana/kit';

import { usePrivySigner } from '@/auth/privy';
import { signTransactionWithSeeker } from '@/chain/mwa';
import { ConfirmationTimeoutError } from '@/chain/rpcSend';
import { SEEKER_ACCOUNT_NO_PERK } from '@/lib/seeker-perk';
import { isWalletCancel, WALLET_CANCELLED } from '@/lib/seeker-session';
import { useSession } from '@/store/session';
import { useWallet } from '@/store/wallet';
import { useWalletLink } from '@/store/wallet-link';
import { friendlyTradeError } from '@/trade/amm';
import { isAttestationRefusal, TRADE_REFUSED } from '@/trade/attestation';
import type { OpenfortRawSign } from '@/auth/signer';
import { rawSignWithProvider, type SolanaSigningProvider } from '@/trade/openfort-signer';
import { rawSignWithSeeker, signWithSeeker, type SeekerSignTransaction } from '@/trade/seeker-signer';
import { sendInstructions, SimulationError, type SendStep } from '@/trade/send';

export type TradeState =
  | { status: 'idle' }
  | { status: 'working'; step: SendStep; batch?: { index: number; count: number } }
  | { status: 'done'; signature: string }
  /** `indeterminate` means the transaction may still land. Never call it a failure. */
  | { status: 'failed'; message: string; indeterminate: boolean };

type RunOptions = {
  /** Turns a raw chain error into a sentence. Defaults to the AMM mapping. */
  explain?: (raw: string) => string;
  /** Told as each batch confirms, e.g. to record it with the web. */
  onConfirmed?: (index: number, signature: string) => void;
};

export type BatchResult = {
  /** Signatures of the batches that confirmed, in order. */
  confirmed: string[];
  /** True only if every batch confirmed. */
  complete: boolean;
};

/**
 * What a thrown error becomes on screen. `partial` is appended when earlier
 * batches of the same purchase already went through.
 */
function failure(e: unknown, explain: (raw: string) => string, partial: string): TradeState {
  // A confirmation timeout is NOT a failed trade. The transaction was
  // broadcast and may still be confirmed, so telling someone it failed
  // invites them to pay for it twice.
  if (e instanceof ConfirmationTimeoutError) {
    return { status: 'failed', message: `Still confirming. Check your positions in a moment before trying again.${partial}`, indeterminate: true };
  }
  const raw = e instanceof SimulationError ? e.message : e instanceof Error ? e.message : String(e);
  // The proxy refused to broadcast for want of an integrity
  // confirmation. Screens ask for one first, so this is the backstop,
  // and its raw form is a server code nobody should be shown.
  // Backing out of the wallet's approval is not an error to explain. It is
  // read here, ahead of each screen's own mapping, so every kind of trade
  // says the same thing and none shows the wallet's raw exception.
  const said = isAttestationRefusal(raw) ? TRADE_REFUSED : isWalletCancel(raw) ? WALLET_CANCELLED : explain(raw);
  return { status: 'failed', message: `${said}${partial}`, indeterminate: false };
}

export function useTrade() {
  const solana = useEmbeddedSolanaWallet();
  const wallet = useSession((s) => s.wallet);
  const sessionProvider = useSession((s) => s.provider);
  const privySigner = usePrivySigner();
  const [state, setState] = useState<TradeState>({ status: 'idle' });

  // The wallet that signs must be the wallet the session is for. An account
  // can hold several (this one grew nine from a race since fixed), and the
  // SDK will happily connect one the session is not for: the fee payer and
  // the signer would then differ and the chain would reject every
  // transaction. So a connected wallet only counts when it is the right one.
  const activeAddress = solana.status === 'connected' ? (solana.activeWallet?.address ?? null) : null;
  const onRightWallet = !!wallet && activeAddress === wallet;
  const openfortProvider =
    sessionProvider === 'openfort' && solana.status === 'connected' && onRightWallet ? (solana.provider as unknown as SolanaSigningProvider) : null;

  // An account signed in with the Seeker signs with the Seed Vault, which the
  // person approves each time. There is nothing to connect or recover first:
  // the wallet app is opened at the moment of signing, so this signer exists
  // as soon as the session does. The cached authorization only counts when it
  // is for this wallet, and whatever the wallet hands back replaces it.
  const seekerSign = useMemo<SeekerSignTransaction | null>(
    () =>
      sessionProvider === 'seeker' && wallet
        ? async (transaction) => {
            const cached = useWallet.getState();
            const done = await signTransactionWithSeeker(cached.viewedAddress === wallet ? cached.authToken : null, wallet, transaction);
            useWallet.getState().setWallet(wallet, done.authToken);
            return done.transaction;
          }
        : null,
    [sessionProvider, wallet],
  );
  // The strict signer, for a transaction someone else also signs (runCustom).
  const seekerSigner = useMemo(() => (seekerSign && wallet ? rawSignWithSeeker(wallet, seekerSign) : null), [seekerSign, wallet]);
  // The one ordinary trades use: the wallet may add its own fee (see
  // src/trade/seeker-signer.ts), and what it signed is what is sent.
  const seekerSignTransaction = useMemo(() => (seekerSign && wallet ? signWithSeeker(wallet, seekerSign) : undefined), [seekerSign, wallet]);

  // The signer for whichever provider the session is on: Openfort for new
  // accounts, Privy for ones made before the move, the Seed Vault for one
  // signed in with a Seeker. Privy's hook applies the same right-wallet rule
  // (see src/auth/privy.tsx). All three reach the chain through the same
  // ported signing code.
  const rawSign = useMemo(
    () => (sessionProvider === 'privy' ? privySigner : sessionProvider === 'seeker' ? seekerSigner : openfortProvider ? rawSignWithProvider(openfortProvider) : null),
    [sessionProvider, privySigner, seekerSigner, openfortProvider],
  );

  // A trade needs both halves: the wallet the session is for, and a live
  // signer for it. The sheet keeps its button disabled until this is true
  // rather than failing at the moment of signing.
  const ready = Boolean(rawSign && wallet);
  // Signed in, but the wallet has not been recovered yet (a cold start, see
  // src/auth/wallet-reconnect.tsx). A screen says "connecting" here, not
  // "sign in", because the person already did. `walletFailed` is the other
  // half: a recovery that will not finish on its own, which must not go on
  // reading as "connecting".
  const link = useWalletLink((st) => st.status);
  const retryWallet = useWalletLink((st) => st.retry);
  const connecting = Boolean(wallet && !rawSign && link !== 'failed' && link !== 'needs-sign-in');
  const walletFailed = Boolean(wallet && !rawSign && link === 'failed');
  /** Signed in here, but the provider's session has gone: only a sign-in fixes it. */
  const needsSignIn = Boolean(wallet && !rawSign && link === 'needs-sign-in');

  // Arriving on a screen that needs a signer is itself a reason to try again,
  // so leaving and coming back is a way out even without touching a button.
  useEffect(() => {
    if (walletFailed) retryWallet();
    // Mount only: a retry per visit, not per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runBatches = useCallback(
    async (batches: Instruction[][], opts: RunOptions = {}): Promise<BatchResult> => {
      const explain = opts.explain ?? friendlyTradeError;
      const confirmed: string[] = [];
      if (!rawSign || !wallet) {
        setState({ status: 'failed', message: 'Sign in before trading.', indeterminate: false });
        return { confirmed, complete: false };
      }

      const count = batches.length;
      const batchInfo = (index: number) => (count > 1 ? { index, count } : undefined);
      // Said after a failure part way through, so nobody retries the whole
      // basket and pays twice for the part that already went through.
      const partial = (index: number) => (index > 0 ? ` ${index} of ${count} went through before this.` : '');

      for (let i = 0; i < count; i++) {
        try {
          setState({ status: 'working', step: 'checking', batch: batchInfo(i) });
          const signature = await sendInstructions({
            wallet,
            rawSign,
            signTransaction: seekerSignTransaction,
            instructions: batches[i],
            onStep: (step) => setState({ status: 'working', step, batch: batchInfo(i) }),
          });
          confirmed.push(signature);
          opts.onConfirmed?.(i, signature);
        } catch (e) {
          setState(failure(e, explain, partial(i)));
          return { confirmed, complete: false };
        }
      }

      setState({ status: 'done', signature: confirmed[confirmed.length - 1] });
      return { confirmed, complete: true };
    },
    [rawSign, seekerSignTransaction, wallet],
  );

  /**
   * A transaction the app did not build from instructions, e.g. the Seeker's
   * sponsored pick, which the server builds and this wallet co-signs. `send`
   * does the work with the session's signer; the progress and the failure
   * rules are the same as for any other trade.
   */
  const runCustom = useCallback(
    async (
      send: (signer: { wallet: string; rawSign: OpenfortRawSign; onStep: (step: SendStep) => void }) => Promise<string>,
      opts: Pick<RunOptions, 'explain'> = {},
    ): Promise<string | null> => {
      if (!rawSign || !wallet) {
        setState({ status: 'failed', message: 'Sign in before trading.', indeterminate: false });
        return null;
      }
      // A co-signed transaction is one someone else signed first, and the Seed
      // Vault adds to what it signs, which that signature does not cover. So
      // it is refused before the server is asked to prepare anything, not
      // after the person has approved a transaction that cannot be sent.
      if (sessionProvider === 'seeker') {
        setState({ status: 'failed', message: SEEKER_ACCOUNT_NO_PERK, indeterminate: false });
        return null;
      }
      try {
        setState({ status: 'working', step: 'checking' });
        const signature = await send({ wallet, rawSign, onStep: (step) => setState({ status: 'working', step }) });
        setState({ status: 'done', signature });
        return signature;
      } catch (e) {
        setState(failure(e, opts.explain ?? friendlyTradeError, ''));
        return null;
      }
    },
    [rawSign, wallet, sessionProvider],
  );

  /** A single transaction. Returns its signature, or null if it did not go through. */
  const run = useCallback(
    async (instructions: Instruction[], opts: RunOptions = {}): Promise<string | null> => {
      const result = await runBatches([instructions], opts);
      return result.complete ? result.confirmed[0] : null;
    },
    [runBatches],
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  /**
   * Report a problem found before anything was built, such as an amount too
   * small to buy a share. Shown in the same place as a chain failure, because
   * to the user it is the same thing: the trade did not happen, and here is why.
   */
  const setInputError = useCallback((message: string) => {
    setState({ status: 'failed', message, indeterminate: false });
  }, []);

  return { ready, connecting, walletFailed, needsSignIn, retryWallet, state, run, runBatches, runCustom, reset, setInputError, wallet };
}
