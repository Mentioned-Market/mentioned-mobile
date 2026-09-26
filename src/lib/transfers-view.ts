// How a deposit or withdrawal reads in the history list. The server says what
// moved; this decides the words, the sign and the colour.
import type { WalletTransfer } from '@/api/transfers';
import { formatSol } from '@/chain/amm';
import { shortAddress, usdc } from '@/lib/format';
import { CLUSTER } from '@/config';

export type TransferRow = {
  key: string;
  title: string;
  /** Who the other side was, and when. */
  subtitle: string;
  /** The headline amount, signed: "+$1.00" or "-0.02 SOL". */
  amount: string;
  /** A second amount when both moved, e.g. the SOL that came with a stake. */
  extra: string | null;
  tone: 'up' | 'neutral';
  explorerUrl: string;
};

const abs = (v: bigint) => (v < 0n ? -v : v);
const sign = (v: bigint) => (v < 0n ? '-' : '+');

function title(t: WalletTransfer): string {
  if (t.label === 'seeker_stake') return 'Seeker welcome stake';
  if (t.label === 'seeker_wallet') return t.direction === 'in' ? 'From your Seeker' : 'To your Seeker';
  return t.direction === 'in' ? 'Deposit' : 'Withdrawal';
}

/** "26 Sep, 14:12" in the phone's own time zone. */
export function transferTime(blockTime: number | null): string {
  if (blockTime == null) return 'Time unknown';
  const d = new Date(blockTime * 1000);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function explorerUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}${CLUSTER === 'devnet' ? '?cluster=devnet' : ''}`;
}

export function transferRow(t: WalletTransfer): TransferRow {
  const usdcDelta = BigInt(t.usdcBaseUnits);
  const solDelta = BigInt(t.lamports);
  const usdcText = usdcDelta !== 0n ? `${sign(usdcDelta)}${usdc(abs(usdcDelta), { dp: 2 })}` : null;
  // SOL that moved the same way as the transfer is worth showing. SOL that
  // went the other way alongside USDC is rent for a new token account, a detail
  // rather than part of what the person sent or got.
  const solSameWay = solDelta !== 0n && (usdcDelta === 0n || (solDelta > 0n) === (usdcDelta > 0n));
  const solText = solSameWay ? `${sign(solDelta)}${formatSol(abs(solDelta))} SOL` : null;

  const who = t.label ? null : t.counterparty ? `${t.direction === 'in' ? 'From' : 'To'} ${shortAddress(t.counterparty)}` : null;
  return {
    key: t.signature,
    title: title(t),
    subtitle: [who, transferTime(t.blockTime)].filter(Boolean).join(' · '),
    amount: usdcText ?? solText ?? '',
    extra: usdcText ? solText : null,
    tone: t.direction === 'in' ? 'up' : 'neutral',
    explorerUrl: explorerUrl(t.signature),
  };
}
