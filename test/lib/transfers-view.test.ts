import { WalletTransfers, type WalletTransfer } from '@/api/transfers';
import { explorerUrl, transferRow, transferTime } from '@/lib/transfers-view';

const t = (over: Partial<WalletTransfer>): WalletTransfer => ({
  signature: 'sig1',
  blockTime: 1_790_000_000,
  direction: 'in',
  usdcBaseUnits: '0',
  lamports: '0',
  counterparty: 'Exch111111111111111111111111111111111111111',
  label: null,
  ...over,
});

describe('transferRow', () => {
  it('shows the Seeker stake with both amounts', () => {
    const r = transferRow(t({ usdcBaseUnits: '1000000', lamports: '6000000', label: 'seeker_stake', counterparty: 'Funder11111111111111111111111111111111111' }));
    expect([r.title, r.amount, r.extra, r.tone]).toEqual(['Seeker welcome stake', '+$1.00', '+0.006 SOL', 'up']);
    expect(r.subtitle).not.toContain('Fund');
  });

  it('shows a withdrawal as negative, to the address it went to', () => {
    const r = transferRow(t({ direction: 'out', usdcBaseUnits: '-2500000' }));
    expect([r.title, r.amount, r.extra, r.tone]).toEqual(['Withdrawal', '-$2.50', null, 'neutral']);
    expect(r.subtitle).toMatch(/^To Exch…1111 · /);
  });

  it('hides rent paid for a new token account on a withdrawal', () => {
    const r = transferRow(t({ direction: 'out', usdcBaseUnits: '-2000000', lamports: '2039280' }));
    expect(r.extra).toBeNull();
    const r2 = transferRow(t({ direction: 'out', usdcBaseUnits: '-2000000', lamports: '-2039280' }));
    expect(r2.extra).toBe('-0.002 SOL');
  });

  it('shows a SOL-only transfer in SOL', () => {
    const r = transferRow(t({ lamports: '20000000', label: 'seeker_wallet' }));
    expect([r.title, r.amount, r.extra]).toEqual(['From your Seeker', '+0.02 SOL', null]);
    expect(transferRow(t({ direction: 'out', lamports: '-20000000', label: 'seeker_wallet' })).title).toBe('To your Seeker');
  });

  it('never uses an em dash', () => {
    const r = transferRow(t({ usdcBaseUnits: '1000000' }));
    expect(`${r.title} ${r.subtitle} ${r.amount}`).not.toContain('—');
  });
});

describe('transferTime', () => {
  it('reads a missing time plainly', () => {
    expect(transferTime(null)).toBe('Time unknown');
  });
  it('gives day, month and time', () => {
    expect(transferTime(1_790_000_000)).toMatch(/^\d{1,2} [A-Z][a-z]{2,3}, \d{2}:\d{2}$/);
  });
});

describe('explorerUrl', () => {
  it('links to Solscan', () => {
    expect(explorerUrl('abc')).toMatch(/^https:\/\/solscan\.io\/tx\/abc/);
  });
});

describe('WalletTransfers schema', () => {
  it('parses what the server sends', () => {
    expect(WalletTransfers.safeParse({ transfers: [t({ usdcBaseUnits: '1000000' })] }).success).toBe(true);
  });
  it('rejects an unknown label', () => {
    expect(WalletTransfers.safeParse({ transfers: [{ ...t({}), label: 'mystery' }] }).success).toBe(false);
  });
});
