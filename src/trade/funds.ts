// Whether a refusal is about money the wallet does not have, as opposed to a
// bad input or a chain fault. A screen that knows this can offer "Add funds"
// instead of "Try again", which would only fail the same way.
import type { TransferAsset } from '@/trade/transfer';

/** The asset the message is short of, or null when it is not a funds problem. */
export function fundsShortfall(message: string | null | undefined): TransferAsset | null {
  if (!message) return null;
  const m = message.toLowerCase();
  if (/\bsol\b/.test(m) && /not enough|need about|add sol|network fee|lamport/.test(m)) return 'SOL';
  if (/not enough usdc|add \$|insufficient.*usdc|insufficient funds|not enough in the wallet/.test(m)) return 'USDC';
  return null;
}
