// The USDC balance read. The distinction that matters here is between a wallet
// that holds nothing (a real, knowable zero) and a chain we could not reach
// (unknown). Getting that wrong shows someone a confident $0 when their money
// is simply out of view.
import { getUsdcBalance } from '@/chain/balance';

// A real mainnet wallet; the value is irrelevant, it only has to be valid base58
// so the associated-token-account derivation succeeds.
const OWNER = 'GjwcWFQYzemBtpUoN5fMAbtTfqxr3HHnMWxHzGoEt7HZ';

function rpcResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => jest.restoreAllMocks());

describe('getUsdcBalance', () => {
  it('converts raw base units using the mint decimals', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      rpcResponse({ result: { value: { amount: '1234560000', decimals: 6, uiAmountString: '1234.56' } } }),
    );
    await expect(getUsdcBalance(OWNER)).resolves.toBe(1234.56);
  });

  it('prefers the raw amount over the node-formatted string', async () => {
    // uiAmountString is formatted by the node and has been seen to round; the
    // raw amount is authoritative.
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      rpcResponse({ result: { value: { amount: '1000001', decimals: 6, uiAmountString: '1' } } }),
    );
    await expect(getUsdcBalance(OWNER)).resolves.toBeCloseTo(1.000001, 9);
  });

  it('falls back to the formatted string when no raw amount is given', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(rpcResponse({ result: { value: { uiAmountString: '42.5' } } }));
    await expect(getUsdcBalance(OWNER)).resolves.toBe(42.5);
  });

  it('reads a wallet that has never held USDC as zero, not as an error', async () => {
    // No token account exists, so the RPC reports an error. That is still a
    // knowable balance.
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      rpcResponse({ error: { code: -32602, message: 'Invalid param: could not find account' } }),
    );
    await expect(getUsdcBalance(OWNER)).resolves.toBe(0);
  });

  it('reads "not a Token account" as zero', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      rpcResponse({ error: { code: -32602, message: 'Invalid param: not a Token account' } }),
    );
    await expect(getUsdcBalance(OWNER)).resolves.toBe(0);
  });

  it('throws on an unrecognised RPC error rather than reporting zero', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(rpcResponse({ error: { code: -32603, message: 'Internal error' } }));
    await expect(getUsdcBalance(OWNER)).rejects.toThrow('Internal error');
  });

  it('throws when the proxy itself fails', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(rpcResponse({}, 502));
    await expect(getUsdcBalance(OWNER)).rejects.toThrow('502');
  });

  it('asks for the balance of the derived token account, not the wallet', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(rpcResponse({ result: { value: { amount: '0', decimals: 6 } } }));
    await getUsdcBalance(OWNER);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.method).toBe('getTokenAccountBalance');
    expect(body.params[0]).not.toBe(OWNER);
    expect(typeof body.params[0]).toBe('string');
  });
});
