// Collecting from finished markets. The paid YES/NO summary has to match what
// the transaction will actually do, since the button shows the amount before
// anything is signed.
import { address } from '@solana/kit';

import { MarketStatus, type TokenAccountState, type UsdcMarketAccount, type WordState } from '@/chain/amm';
import {
  ammClaimDetail,
  ammClaimLabel,
  ammClaimSummary,
  CLAIMS_PER_TX,
  friendlyClaimError,
  planMajorityClaims,
} from '@/trade/claim';

const WALLET = 'GjwcWFQYzemBtpUoN5fMAbtTfqxr3HHnMWxHzGoEt7HZ';
const MINT = address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const RENT = 2_039_280n;

const word = (i: number, outcome: boolean | null): WordState => ({
  wordIndex: i,
  label: `w${i}`,
  yesMint: MINT,
  noMint: MINT,
  yesQuantity: 0n,
  noQuantity: 0n,
  outcome,
  locked: true,
});

const market = (words: WordState[], status = MarketStatus.Resolved) => ({ status, words }) as unknown as UsdcMarketAccount;

const acct = (amount: bigint | null): TokenAccountState =>
  amount === null
    ? { mint: MINT, ata: MINT, exists: false, amount: 0n, lamports: 0n }
    : { mint: MINT, ata: MINT, exists: true, amount, lamports: RENT };

describe('ammClaimSummary', () => {
  it('pays winning shares and returns every deposit', () => {
    // Word 0 said: YES wins. Word 1 not said: the YES holding is dead.
    const m = market([word(0, true), word(1, false)]);
    const s = ammClaimSummary(m, [acct(1_909_059n), acct(null), acct(500_000n), acct(0n)]);
    expect(s).toEqual({ redeemUnits: 1_909_059, lamports: Number(RENT) * 3, closes: 3 });
  });

  it('pays the NO side when the word was not said', () => {
    const s = ammClaimSummary(market([word(0, false)]), [acct(null), acct(2_000_000n)]);
    expect(s?.redeemUnits).toBe(2_000_000);
  });

  it('still returns the deposit on an emptied account', () => {
    // Sold out before resolution: nothing to redeem, but the account holds rent.
    const s = ammClaimSummary(market([word(0, true)]), [acct(0n), acct(null)]);
    expect(s).toEqual({ redeemUnits: 0, lamports: Number(RENT), closes: 1 });
  });

  it('offers nothing before the market resolves', () => {
    expect(ammClaimSummary(market([word(0, true)], MarketStatus.Open), [acct(1n), acct(null)])).toBeNull();
  });

  it('skips a word with no outcome yet', () => {
    expect(ammClaimSummary(market([word(0, null)]), [acct(1_000_000n), acct(null)])).toBeNull();
  });

  it('offers nothing when the wallet has no accounts', () => {
    expect(ammClaimSummary(market([word(0, true)]), [acct(null), acct(null)])).toBeNull();
  });
});

describe('claim wording', () => {
  it('leads with the money when there is some', () => {
    const c = { redeemUnits: 1_909_059, lamports: 4_465_320, closes: 3 };
    expect(ammClaimLabel(c)).toBe('Claim $1.91');
    expect(ammClaimDetail(c)).toBe('Pays out your winning shares and returns 0.0045 SOL in deposits from 3 token accounts.');
  });

  it('names the deposit alone when that is all there is', () => {
    const c = { redeemUnits: 0, lamports: 2_039_280, closes: 1 };
    expect(ammClaimLabel(c)).toBe('Reclaim 0.002 SOL');
    expect(ammClaimDetail(c)).toBe('Returns 0.002 SOL in deposits from 1 token account.');
  });

  it('never passes a raw program error through', () => {
    expect(friendlyClaimError('custom program error: 0x1771 AlreadyClaimed')).toBe('This has already been claimed.');
    expect(friendlyClaimError('something unrecognised')).toBe('The claim did not go through. Try again in a moment.');
  });
});

describe('planMajorityClaims', () => {
  const plan = (words: string[]) => planMajorityClaims({ wallet: WALLET, marketId: 1789117562931n, words });

  it('claims several words in one transaction, with the USDC account first', async () => {
    const batches = await plan(['one', 'two']);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });

  it('splits past the per-transaction limit, creating the account once', async () => {
    const batches = await plan(['one', 'two', 'three', 'four', 'five']);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(CLAIMS_PER_TX + 1);
    expect(batches[1]).toHaveLength(1);
  });

  it('claims a word once however it was written', async () => {
    const batches = await plan(['Keeper', 'keeper']);
    expect(batches[0]).toHaveLength(2);
  });
});
