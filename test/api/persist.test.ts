// Cache persistence. The failure that matters is not "the cache did not load",
// which costs a skeleton, but "the cache destroyed itself", which costs every
// future launch too. An offline session in particular reaches the writer with
// nothing successful to save, and must leave the existing file alone.

// A tiny in-memory stand-in for the one file this module owns.
const disk: { content: string | null } = { content: null };
const writes: string[] = [];

jest.mock('expo-file-system', () => ({
  Paths: { cache: '/cache' },
  File: class {
    constructor(..._parts: unknown[]) {}
    get exists() {
      return disk.content !== null;
    }
    create() {
      disk.content = '';
    }
    write(content: string) {
      disk.content = content;
      writes.push(content);
    }
    async text() {
      if (disk.content === null) throw new Error('ENOENT');
      return disk.content;
    }
    delete() {
      disk.content = null;
    }
  },
}));

import { QueryClient } from '@tanstack/react-query';

import { restoreQueryCache, startPersistingQueryCache } from '@/api/persist';

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

/** Seed a client with a successful query, the way a real fetch would. */
async function seed(client: QueryClient, key: readonly unknown[], data: unknown) {
  await client.fetchQuery({ queryKey: key, queryFn: async () => data });
}

beforeEach(() => {
  disk.content = null;
  writes.length = 0;
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Run the throttled writer once. */
function flushWrites() {
  jest.advanceTimersByTime(6_000);
}

describe('startPersistingQueryCache', () => {
  it('writes successful queries to disk', async () => {
    const client = freshClient();
    const stop = startPersistingQueryCache(client);
    await seed(client, ['markets'], [{ id: 'm1' }]);
    flushWrites();
    stop();

    expect(disk.content).not.toBeNull();
    const saved = JSON.parse(disk.content as string);
    expect(saved.version).toBe(1);
    expect(saved.state.queries).toHaveLength(1);
  });

  it('leaves an existing cache alone when nothing succeeded', async () => {
    // The offline-launch case: every query errors, so there is nothing to save.
    // Writing an empty state here would delete data the next launch needs.
    const client = freshClient();
    const stop = startPersistingQueryCache(client);
    await seed(client, ['markets'], [{ id: 'm1' }]);
    flushWrites();
    const good = disk.content;
    stop();

    const offline = freshClient();
    const stopOffline = startPersistingQueryCache(offline);
    await offline
      .fetchQuery({ queryKey: ['markets'], queryFn: async () => { throw new Error('offline'); } })
      .catch(() => undefined);
    flushWrites();
    stopOffline();

    expect(disk.content).toBe(good);
  });

  it('does not persist a failed query', async () => {
    const client = freshClient();
    const stop = startPersistingQueryCache(client);
    await seed(client, ['good'], [1]);
    await client
      .fetchQuery({ queryKey: ['bad'], queryFn: async () => { throw new Error('nope'); } })
      .catch(() => undefined);
    flushWrites();
    stop();

    const saved = JSON.parse(disk.content as string);
    expect(saved.state.queries).toHaveLength(1);
    expect(saved.state.queries[0].queryKey).toEqual(['good']);
  });

  it('coalesces a burst of updates into one write', async () => {
    const client = freshClient();
    const stop = startPersistingQueryCache(client);
    await seed(client, ['a'], [1]);
    await seed(client, ['b'], [2]);
    await seed(client, ['c'], [3]);
    flushWrites();
    stop();

    expect(writes).toHaveLength(1);
  });

  it('stops writing once unsubscribed', async () => {
    const client = freshClient();
    const stop = startPersistingQueryCache(client);
    stop();
    await seed(client, ['markets'], [{ id: 'm1' }]);
    flushWrites();

    expect(writes).toHaveLength(0);
  });
});

describe('restoreQueryCache', () => {
  it('puts saved data back into a fresh client', async () => {
    const source = freshClient();
    const stop = startPersistingQueryCache(source);
    await seed(source, ['markets'], [{ id: 'm1' }]);
    flushWrites();
    stop();

    const target = freshClient();
    await restoreQueryCache(target);
    expect(target.getQueryData(['markets'])).toEqual([{ id: 'm1' }]);
  });

  it('ignores a cache written by an older version', async () => {
    disk.content = JSON.stringify({ version: 0, savedAt: Date.now(), state: { queries: [], mutations: [] } });
    const client = freshClient();
    await restoreQueryCache(client);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('drops a cache older than a day rather than showing it', async () => {
    const source = freshClient();
    const stop = startPersistingQueryCache(source);
    await seed(source, ['markets'], [{ id: 'm1' }]);
    flushWrites();
    stop();

    const stale = JSON.parse(disk.content as string);
    stale.savedAt = Date.now() - 25 * 60 * 60 * 1000;
    disk.content = JSON.stringify(stale);

    const target = freshClient();
    await restoreQueryCache(target);
    expect(target.getQueryData(['markets'])).toBeUndefined();
    // and the useless file is cleared out
    expect(disk.content).toBeNull();
  });

  it('survives a corrupt file and clears it', async () => {
    disk.content = '{ this is not json';
    const client = freshClient();
    await expect(restoreQueryCache(client)).resolves.toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(disk.content).toBeNull();
  });

  it('does nothing when there is no file', async () => {
    const client = freshClient();
    await expect(restoreQueryCache(client)).resolves.toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
