// One typed GET for every read route. 10s timeout, one 429 retry (ported
// helper), JSON parsed through a zod schema so a web change that breaks the
// shipped app fails loudly here rather than deep in a screen.
import type { z } from 'zod';

import { fetchWith429Retry } from '@/chain/fetchRetry';
import { API_BASE } from '@/config';

export class ApiError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `GET ${path} -> ${status}`);
    this.name = 'ApiError';
  }
}

const TIMEOUT_MS = 10_000;

export async function get<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchWith429Retry(API_BASE + path, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
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

export const q = (params: Record<string, string | number | undefined>) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};
