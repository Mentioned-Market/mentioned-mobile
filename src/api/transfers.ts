// Deposits and withdrawals of the signed-in wallet (web: app/api/wallet/transfers).
// Read from the chain by the server: only transactions that moved USDC or SOL
// and did nothing else, so trades and claims never appear here.
//
// Amounts are signed strings of base units: positive into the wallet, negative
// out of it.
import { z } from 'zod';

import { get } from './client';

export const WalletTransfer = z.object({
  signature: z.string(),
  blockTime: z.number().nullable(),
  direction: z.enum(['in', 'out']),
  usdcBaseUnits: z.string(),
  lamports: z.string(),
  counterparty: z.string().nullable(),
  /** What Mentioned recognises the other side as, when it does. */
  label: z.enum(['seeker_stake', 'seeker_wallet']).nullable(),
});
export type WalletTransfer = z.infer<typeof WalletTransfer>;

export const WalletTransfers = z.object({ transfers: z.array(WalletTransfer) });

/** Signed in only: the route answers for the bearer's wallet. */
export const getWalletTransfers = () => get('/api/wallet/transfers', WalletTransfers);
