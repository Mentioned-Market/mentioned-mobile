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
import { ConfirmationTimeoutError } from '@/chain/rpcSend';
import { useSession } from '@/store/session';
import { useWalletLink } from '@/store/wallet-link';
import { friendlyTradeError } from '@/trade/amm';
import { rawSignWithProvider, type SolanaSigningProvider } from '@/trade/openfort-signer';
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

  // The signer for whichever provider the session is on: Openfort for new
  // accounts, Privy for ones made before the move. Privy's hook applies the
  // same right-wallet rule (see src/auth/privy.tsx). Both reach the chain
  // through the same ported signing code.
  const rawSign = useMemo(
    () => (sessionProvider === 'privy' ? privySigner : openfortProvider ? rawSignWithProvider(openfortProvider) : null),
    [sessionProvider, privySigner, openfortProvider],
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
            instructions: batches[i],
            onStep: (step) => setState({ status: 'working', step, batch: batchInfo(i) }),
          });
          confirmed.push(signature);
          opts.onConfirmed?.(i, signature);
        } catch (e) {
          // A confirmation timeout is NOT a failed trade. The transaction was
          // broadcast and may still be confirmed, so telling someone it failed
          // invites them to pay for it twice.
          if (e instanceof ConfirmationTimeoutError) {
            setState({
              status: 'failed',
              message: `Still confirming. Check your positions in a moment before trying again.${partial(i)}`,
              indeterminate: true,
            });
            return { confirmed, complete: false };
          }
          const raw = e instanceof SimulationError ? e.message : e instanceof Error ? e.message : String(e);
          setState({ status: 'failed', message: `${explain(raw)}${partial(i)}`, indeterminate: false });
          return { confirmed, complete: false };
        }
      }

      setState({ status: 'done', signature: confirmed[confirmed.length - 1] });
      return { confirmed, complete: true };
    },
    [rawSign, wallet],
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

  return { ready, connecting, walletFailed, needsSignIn, retryWallet, state, run, runBatches, reset, setInputError, wallet };
}
