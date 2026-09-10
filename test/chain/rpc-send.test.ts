// Broadcast and confirmation, ported from the web. Nothing calls these until
// trading lands, but the retry and timeout semantics are the part that must
// not drift: a timeout means "may still land", never "failed".
import { bytesToBase64, ConfirmationTimeoutError, confirmSignature, sendViaProxy } from '@/chain/rpcSend';

const SIGNATURE = '4JZ5hkcsdBNuBgFaEwEXMYzUeaPA8fRKydfgWiyXgWQf5m3UWgNma97d1Bfpkvpd7KgK8tMMp4kEB6sVyyw6gtyC';

function rpcResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('bytesToBase64', () => {
  it('encodes small inputs', () => {
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe('aGk=');
  });

  it('encodes a transaction-sized input without blowing the stack', () => {
    // The naive spread form throws around 100k arguments; the chunked form
    // is why this helper exists.
    const big = new Uint8Array(200_000).fill(65);
    expect(bytesToBase64(big).length).toBeGreaterThan(200_000);
  });

  it('encodes an empty input', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
  });
});

describe('sendViaProxy', () => {
  it('returns the signature the proxy reports', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(rpcResponse({ result: SIGNATURE }));
    await expect(sendViaProxy(new Uint8Array([1, 2, 3]))).resolves.toBe(SIGNATURE);
  });

  it('posts the transaction base64 encoded with preflight skipped', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(rpcResponse({ result: SIGNATURE }));
    await sendViaProxy(new Uint8Array([104, 105]));
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.method).toBe('sendTransaction');
    expect(body.params[0]).toBe('aGk=');
    expect(body.params[1]).toMatchObject({ encoding: 'base64', skipPreflight: true });
  });

  it('does not retry a JSON-RPC error, which would return the same error', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(rpcResponse({ error: { message: 'Blockhash not found' } }));
    await expect(sendViaProxy(new Uint8Array([1]))).rejects.toThrow('Blockhash not found');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('throws when the proxy returns no signature', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(rpcResponse({ result: null }));
    await expect(sendViaProxy(new Uint8Array([1]))).rejects.toThrow('no signature');
  });

  it('retries once on a proxy 500, because a send is idempotent by signature', async () => {
    jest.useFakeTimers();
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(rpcResponse({}, 500))
      .mockResolvedValueOnce(rpcResponse({ result: SIGNATURE }));
    const promise = sendViaProxy(new Uint8Array([1]));
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(promise).resolves.toBe(SIGNATURE);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('honours Retry-After on a 429', async () => {
    jest.useFakeTimers();
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(rpcResponse({}, 429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(rpcResponse({ result: SIGNATURE }));
    const promise = sendViaProxy(new Uint8Array([1]));
    await jest.advanceTimersByTimeAsync(1_000);
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(promise).resolves.toBe(SIGNATURE);
  });

  it('gives up after the second transient failure', async () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(rpcResponse({}, 503));
    const promise = sendViaProxy(new Uint8Array([1])).catch((e: unknown) => e as Error);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(await promise).toBeInstanceOf(Error);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('confirmSignature', () => {
  it('resolves once the transaction confirms', async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(rpcResponse({ result: { value: [{ confirmationStatus: 'confirmed' }] } }));
    const promise = confirmSignature(SIGNATURE);
    await jest.advanceTimersByTimeAsync(1_500);
    await expect(promise).resolves.toBeUndefined();
  });

  it('propagates an on-chain failure', async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(rpcResponse({ result: { value: [{ err: { InstructionError: [0, 'Custom'] } }] } }));
    const promise = confirmSignature(SIGNATURE).catch((e: unknown) => e as Error);
    await jest.advanceTimersByTimeAsync(1_500);
    expect(((await promise) as Error).message).toMatch(/failed on-chain/);
  });

  it('times out with an error that says the transaction may still land', async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(rpcResponse({ result: { value: [null] } }));
    const promise = confirmSignature(SIGNATURE, { timeoutMs: 4_000 }).catch((e: unknown) => e as Error);
    await jest.advanceTimersByTimeAsync(10_000);
    const err = await promise;
    expect(err).toBeInstanceOf(ConfirmationTimeoutError);
    expect((err as ConfirmationTimeoutError).signature).toBe(SIGNATURE);
    expect((err as Error).message).toMatch(/may still go through/);
  });

  it('tolerates a failed poll rather than treating it as a failed transaction', async () => {
    jest.useFakeTimers();
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValue(rpcResponse({ result: { value: [{ confirmationStatus: 'finalized' }] } }));
    const promise = confirmSignature(SIGNATURE);
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(promise).resolves.toBeUndefined();
  });
});
