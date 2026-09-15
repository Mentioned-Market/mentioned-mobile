// Withdraw and deposit rules. Money leaves a wallet on the strength of these,
// so every refusal and every byte of the two instructions is pinned.
import { address as toAddress } from '@solana/kit';

import { SYSTEM_PROGRAM, TOKEN_PROGRAM } from '@/chain/amm';
import { checkTransfer, createSolTransferIx, createTokenTransferIx, maxTransfer, planTransfer, SOL_RESERVE } from '@/trade/transfer';

const ME = '49GT1N8mRLp4Q9JYJDRR3YopGtfHFGTrwg6cmbm3u2fY';
const THEM = 'EjM5rYxZQaXQzE7g1z5wD6eWqvXDo9iXVK9hM6bCBgRk';

describe('checkTransfer', () => {
  it('refuses an empty or malformed address', () => {
    expect(checkTransfer({ asset: 'USDC', amount: '1', to: '', from: ME, balance: 5 })).toEqual({ error: 'Enter the wallet address to send to.' });
    expect(checkTransfer({ asset: 'USDC', amount: '1', to: 'not-an-address', from: ME, balance: 5 })).toEqual({ error: 'That is not a Solana wallet address.' });
  });

  it('refuses sending to itself', () => {
    expect(checkTransfer({ asset: 'USDC', amount: '1', to: ME, from: ME, balance: 5 })).toEqual({ error: 'That is this wallet. Choose another address.' });
  });

  it('refuses a zero amount and an unknown balance', () => {
    expect(checkTransfer({ asset: 'USDC', amount: '', to: THEM, from: ME, balance: 5 })).toEqual({ error: 'Enter an amount.' });
    expect(checkTransfer({ asset: 'USDC', amount: '1', to: THEM, from: ME, balance: undefined })).toEqual({ error: 'Your balance is still loading.' });
  });

  it('refuses more USDC than is held', () => {
    expect(checkTransfer({ asset: 'USDC', amount: '5.01', to: THEM, from: ME, balance: 5 })).toEqual({ error: 'Not enough USDC. You have $5.00.' });
  });

  it('keeps the fee reserve back on a SOL send', () => {
    const r = checkTransfer({ asset: 'SOL', amount: '0.1', to: THEM, from: ME, balance: 0.1 });
    expect('error' in r && r.error).toMatch(/stays for network fees/);
    const ok = checkTransfer({ asset: 'SOL', amount: '0.09', to: THEM, from: ME, balance: 0.1 });
    expect(ok).toEqual({ units: 90_000_000n, to: toAddress(THEM) });
  });

  it('turns dollars into base units', () => {
    expect(checkTransfer({ asset: 'USDC', amount: '2.50', to: THEM, from: ME, balance: 5 })).toEqual({ units: 2_500_000n, to: toAddress(THEM) });
  });
});

describe('maxTransfer', () => {
  it('rounds USDC down to the cent', () => {
    expect(maxTransfer('USDC', 3.039)).toBe('3.03');
  });
  it('leaves the reserve out of SOL', () => {
    expect(Number(maxTransfer('SOL', 0.1))).toBeCloseTo(0.1 - SOL_RESERVE, 4);
    expect(maxTransfer('SOL', 0.001)).toBe('0');
  });
  it('is empty with no balance', () => {
    expect(maxTransfer('USDC', undefined)).toBe('');
  });
});

describe('instructions', () => {
  it('encodes a System transfer as index 2 plus lamports little-endian', () => {
    const ix = createSolTransferIx(toAddress(ME), toAddress(THEM), 1_000n);
    expect(ix.programAddress).toBe(SYSTEM_PROGRAM);
    expect(Array.from(ix.data as Uint8Array)).toEqual([2, 0, 0, 0, 0xe8, 3, 0, 0, 0, 0, 0, 0]);
    expect(ix.accounts?.map((a) => a.address)).toEqual([ME, THEM]);
  });

  it('encodes a token transfer as instruction 3 plus amount', () => {
    const ix = createTokenTransferIx(toAddress(ME), toAddress(THEM), toAddress(ME), 2_500_000n);
    expect(ix.programAddress).toBe(TOKEN_PROGRAM);
    expect(Array.from(ix.data as Uint8Array)).toEqual([3, 0xa0, 0x25, 0x26, 0, 0, 0, 0, 0]);
  });

  it('creates the recipient token account before a USDC transfer, paid by the payer', async () => {
    const ixs = await planTransfer({ asset: 'USDC', from: ME, to: toAddress(THEM), units: 1n, payer: THEM });
    expect(ixs).toHaveLength(2);
    expect(ixs[0].accounts?.[0].address).toBe(THEM);
    expect(ixs[1].programAddress).toBe(TOKEN_PROGRAM);
  });

  it('is a single instruction for SOL', async () => {
    const ixs = await planTransfer({ asset: 'SOL', from: ME, to: toAddress(THEM), units: 1n, payer: ME });
    expect(ixs).toHaveLength(1);
    expect(ixs[0].programAddress).toBe(SYSTEM_PROGRAM);
  });
});
