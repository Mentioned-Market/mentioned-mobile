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
import { useCallback, useState } from 'react';
import type { Instruction } from '@solana/kit';

import { ConfirmationTimeoutError } from '@/chain/rpcSend';
import { useSession } from '@/store/session';
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
  const [state, setState] = useState<TradeState>({ status: 'idle' });

  const provider = solana.status === 'connected' ? (solana.provider as unknown as SolanaSigningProvider) : null;

  // A trade needs both halves: the wallet the session is for, and a live
  // provider able to sign for it. The sheet keeps its button disabled until
  // this is true rather than failing at the moment of signing.
  const ready = Boolean(provider && wallet);

  const runBatches = useCallback(
    async (batches: Instruction[][], opts: RunOptions = {}): Promise<BatchResult> => {
      const explain = opts.explain ?? friendlyTradeError;
      const confirmed: string[] = [];
      if (!provider || !wallet) {
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
            rawSign: rawSignWithProvider(provider),
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
    [provider, wallet],
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

  return { ready, state, run, runBatches, reset, setInputError, wallet };
}
