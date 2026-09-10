// Read routes are per-IP rate limited and phones share carrier NAT, so a 429
// on a poll is normal. One honoured retry beats showing an error state.
import { fetchWith429Retry } from '@/chain/fetchRetry';

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('fetchWith429Retry', () => {
  it('passes a normal response straight through', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const res = await fetchWith429Retry('https://example.test/api');
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not retry other error statuses', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    await fetchWith429Retry('https://example.test/api');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries once after a 429', async () => {
    jest.useFakeTimers();
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const promise = fetchWith429Retry('https://example.test/api');
    await jest.advanceTimersByTimeAsync(2_000);
    expect((await promise).status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('waits the Retry-After the server asked for', async () => {
    jest.useFakeTimers();
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '5' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const promise = fetchWith429Retry('https://example.test/api');
    await jest.advanceTimersByTimeAsync(4_000);
    await jest.advanceTimersByTimeAsync(2_000);
    expect((await promise).status).toBe(200);
  });

  it('gives up after one retry rather than hammering the route', async () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }));
    const promise = fetchWith429Retry('https://example.test/api');
    await jest.advanceTimersByTimeAsync(10_000);
    expect((await promise).status).toBe(429);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('forwards the request init', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await fetchWith429Retry('https://example.test/api', { headers: { Accept: 'application/json' } });
    expect(spy.mock.calls[0][1]).toMatchObject({ headers: { Accept: 'application/json' } });
  });
});
