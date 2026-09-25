// A retry is only safe for reads, and only worth it for failures that pass.
// Both halves matter: retrying a real answer (a bad transaction) just delays
// the error, and not retrying an upstream blip fails a trade that would have
// gone through a second later.
import { HttpStatusError, isTransient, retryTransient } from '@/lib/retry';
import { buildTransaction } from '@/trade/send';

const noWait = async () => undefined;

describe('isTransient', () => {
  it('retries a proxy outage or rate limit', () => {
    for (const status of [500, 502, 503, 504, 429]) expect(isTransient(new HttpStatusError(status, 'x'))).toBe(true);
  });

  it('retries a request that never arrived', () => {
    expect(isTransient(new TypeError('Network request failed'))).toBe(true);
  });

  it('does not retry an answer', () => {
    for (const status of [400, 401, 403, 404, 413]) expect(isTransient(new HttpStatusError(status, 'x'))).toBe(false);
    expect(isTransient(new Error('Blockhash not found'))).toBe(false);
  });
});

describe('retryTransient', () => {
  it('returns the first success', async () => {
    const fn = jest.fn().mockRejectedValueOnce(new HttpStatusError(502, 'x')).mockResolvedValueOnce('ok');
    await expect(retryTransient(fn, [1, 1], noWait)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('waits each delay in turn', async () => {
    const waits: number[] = [];
    const fn = jest.fn().mockRejectedValueOnce(new HttpStatusError(502, 'x')).mockRejectedValueOnce(new HttpStatusError(503, 'x')).mockResolvedValueOnce('ok');
    await retryTransient(fn, [600, 1500], async (ms) => void waits.push(ms));
    expect(waits).toEqual([600, 1500]);
  });

  it('gives up after the last delay with the last failure', async () => {
    const fn = jest.fn().mockRejectedValue(new HttpStatusError(502, 'RPC 502'));
    await expect(retryTransient(fn, [1, 1], noWait)).rejects.toThrow('RPC 502');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws a final failure at once', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Blockhash not found'));
    await expect(retryTransient(fn, [1, 1], noWait)).rejects.toThrow('Blockhash not found');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('the blockhash read before a trade', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rides out a 502 from the proxy', async () => {
    const blockhash = { context: { slot: 1 }, value: { blockhash: '5vmzxeatd3cP7efenfRRjDZdxvpL6RhhZpLQ4typxrDs', lastValidBlockHeight: 10 } };
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'RPC proxy error' } }), { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: blockhash }), { status: 200 }));
    jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as unknown as typeof setTimeout);

    const bytes = await buildTransaction('49GT1N8mRLp4Q9JYJDRR3YopGtfHFGTrwg6cmbm3u2fY', []);
    expect(bytes.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
