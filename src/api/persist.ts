// Disk persistence for the query cache.
//
// Without this, every cold launch starts with an empty cache and the whole app
// is skeletons until the network answers. The data we show is a weekly
// leaderboard, a prize pool and a market list: all of it is perfectly useful a
// few minutes old, and showing yesterday's number immediately while today's
// loads behind it reads as instant rather than as stale.
//
// Deliberately built on the `dehydrate`/`hydrate` primitives that ship with
// react-query rather than on the separate persist-client package. The restore
// has to finish before any query runs, or an in-flight fetch races the restore
// and the older cached value can land on top of fresh data. The root layout
// already holds the tree behind a readiness gate for fonts, so restoring inside
// that same gate gives that ordering for free and adds no dependency.
import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { AppState } from 'react-native';

/** Bump when the cached shapes change, so old files are ignored, not parsed. */
const VERSION = 1;
const FILE_NAME = `query-cache-v${VERSION}.json`;

/** Older than this and the network is worth waiting for. A week's data goes stale. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Writes are synchronous, so an unbounded cache would block the JS thread.
 * The real payload is a few hundred KB; anything past this means something
 * unexpected got cached and is not worth the frame it would cost.
 */
const MAX_BYTES = 2_000_000;

/** At most one write per this interval, so a burst of query updates costs one. */
const WRITE_INTERVAL_MS = 5_000;

type Payload = { version: number; savedAt: number; state: DehydratedState };

function cacheFile(): File {
  return new File(Paths.cache, FILE_NAME);
}

/**
 * Load the last session's data into `client`.
 *
 * Never throws. A cache that cannot be read is not a reason to fail a launch,
 * and the only cost of ignoring it is the skeletons we would have shown anyway.
 */
export async function restoreQueryCache(client: QueryClient): Promise<void> {
  try {
    const file = cacheFile();
    if (!file.exists) return;

    const parsed = JSON.parse(await file.text()) as Payload | null;
    if (!parsed || parsed.version !== VERSION) return;

    if (!Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      file.delete();
      return;
    }
    hydrate(client, parsed.state);
    if (__DEV__) console.log(`[cache] restored ${parsed.state.queries?.length ?? 0} queries from disk`);
  } catch {
    // A corrupt or half-written file: drop it so the next launch starts clean.
    try {
      const file = cacheFile();
      if (file.exists) file.delete();
    } catch {
      // Nothing further to try; the cache is simply unavailable this run.
    }
  }
}

function write(client: QueryClient): void {
  try {
    // Only successful queries. Persisting an error or a pending fetch would
    // restore a broken screen rather than a stale one.
    const state = dehydrate(client, { shouldDehydrateQuery: (q) => q.state.status === 'success' });
    // Never replace a good cache with an empty one. A launch with no network
    // reaches this with nothing successful to save, and writing that would
    // destroy the very data the next launch needs. An empty write is always a
    // loss and never a gain, so it is simply skipped.
    if (state.queries.length === 0) return;

    const json = JSON.stringify({ version: VERSION, savedAt: Date.now(), state } satisfies Payload);
    if (json.length > MAX_BYTES) return;

    const file = cacheFile();
    if (!file.exists) file.create();
    file.write(json);
    if (__DEV__) console.log(`[cache] wrote ${state.queries.length} queries, ${json.length} bytes`);
  } catch (e) {
    // Disk full, or the cache directory was reclaimed by the system. Skipping a
    // write only costs the next launch its head start.
    if (__DEV__) console.log('[cache] write failed', e);
  }
}

/**
 * Keep the file in step with the cache. Returns an unsubscribe function.
 *
 * Throttled rather than debounced: a debounce can starve forever while polling
 * keeps firing, and the point is to always have something recent on disk. The
 * app going to the background flushes immediately, because that is the moment
 * before the process is most likely to be killed.
 */
export function startPersistingQueryCache(client: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const flush = () => {
    timer = null;
    if (!dirty) return;
    dirty = false;
    write(client);
  };

  const schedule = () => {
    dirty = true;
    if (timer) return;
    timer = setTimeout(flush, WRITE_INTERVAL_MS);
  };

  const unsubscribeCache = client.getQueryCache().subscribe(schedule);

  const appState = AppState.addEventListener('change', (next) => {
    if (next !== 'active') {
      if (timer) clearTimeout(timer);
      flush();
    }
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribeCache();
    appState.remove();
  };
}
