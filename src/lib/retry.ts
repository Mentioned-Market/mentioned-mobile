// Retrying a read that failed for a reason that is likely to pass.
//
// Only for reads. A write to the website is never retried (AGENTS.md): posting
// a trade twice is not the same as posting it once. Reads before signing, like
// the blockhash a transaction is built on, are safe to ask for again.

/** An HTTP failure from a proxy, kept apart so its status can be judged. */
export class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpStatusError';
  }
}

/**
 * Worth another go: the proxy or its upstream was down or busy (5xx, 429), or
 * the request never reached it (fetch throws a TypeError on a network drop).
 * Anything else, a 4xx or an answer the server actually gave, is final.
 */
export function isTransient(e: unknown): boolean {
  if (e instanceof HttpStatusError) return e.status >= 500 || e.status === 429;
  return e instanceof TypeError;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run `fn`, and after a transient failure wait each delay in turn and run it
 * again. The last failure is thrown once the delays run out, or at once if it
 * is not transient.
 */
export async function retryTransient<T>(fn: () => Promise<T>, delaysMs: readonly number[], wait: (ms: number) => Promise<void> = sleep): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= delaysMs.length || !isTransient(e)) throw e;
      await wait(delaysMs[attempt]);
    }
  }
}
