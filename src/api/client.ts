// One typed GET for every read route. 10s timeout, one 429 retry (ported
// helper), JSON parsed through a zod schema so a web change that breaks the
// shipped app fails loudly here rather than deep in a screen.
import type { z } from 'zod';

import { fetchWith429Retry } from '@/chain/fetchRetry';
import { API_BASE } from '@/config';
import { useSession } from '@/store/session';

export class ApiError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    message?: string,
    /** The server's machine-readable reason, when it sends one (e.g. DISCORD_REQUIRED). */
    public readonly code?: string,
  ) {
    super(message ?? `${path} -> ${status}`);
    this.name = 'ApiError';
  }
}

const TIMEOUT_MS = 10_000;

/**
 * The session token, as an Authorization header, or nothing when signed out.
 *
 * Read from the store rather than passed in, so every route gets it without
 * each caller remembering to. The web equivalent is a cookie the browser
 * attaches on its own; a native app has no cookie jar, so this is that.
 *
 * Read at call time, never captured: a token can arrive or be cleared between
 * a query being defined and it running.
 */
function authHeader(): Record<string, string> {
  const token = useSession.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function get<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchWith429Retry(API_BASE + path, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeader() },
    });
    if (!res.ok) {
      let message: string | undefined;
      try {
        const body = (await res.json()) as { error?: string };
        if (typeof body?.error === 'string') message = body.error;
      } catch {
        // non-JSON error body; the status is enough
      }
      throw new ApiError(path, res.status, message);
    }
    const json: unknown = await res.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(path, res.status, `Unexpected response shape for ${path}: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
    }
    return parsed.data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One typed POST, for the routes that change something: a free trade, an entry,
 * recording a paid buy.
 *
 * Unlike `get` it never retries, not even on a 429. A write that is repeated is
 * a second trade, and the server's own "too fast" limit answers 429 for exactly
 * the case where going again would be wrong. The user can tap again; the app
 * must not do it for them.
 */
export async function post<S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.infer<S>> {
  return send('POST', path, body, schema);
}

/** A PUT with the same rules as `post`: bearer attached, never retried. */
export async function put<S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.infer<S>> {
  return send('PUT', path, body, schema);
}

/** A PATCH, for the routes that change one field of something, e.g. a profile emoji. */
export async function patch<S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.infer<S>> {
  return send('PATCH', path, body, schema);
}

/** A DELETE. No body: every route that takes one is a POST. */
export async function del<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  return send('DELETE', path, undefined, schema);
}

async function send<S extends z.ZodType>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body: unknown, schema: S): Promise<z.infer<S>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + path, {
      method,
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...authHeader() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // non-JSON body; the status is enough
    }
    if (!res.ok) {
      const err = (json ?? {}) as { error?: unknown; code?: unknown };
      throw new ApiError(
        path,
        res.status,
        typeof err.error === 'string' ? err.error : undefined,
        typeof err.code === 'string' ? err.code : undefined,
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(path, res.status, `Unexpected response shape for ${path}: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
    }
    return parsed.data;
  } finally {
    clearTimeout(timer);
  }
}

export const q = (params: Record<string, string | number | undefined>) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};
