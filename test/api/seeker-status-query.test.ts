// Why the Seeker status query uses `skipToken` for an account it must never
// ask about, and not `enabled: false`.
//
// Version 1.2.0 hid the Seeker offer from accounts signed in with a Seeker by
// disabling the query. The Me tab's pull to refresh calls `refetch()`, and a
// disabled query still runs then, so the offer came back, the account linked
// to itself, and was offered a pick it could not sign. These two cases pin the
// library behaviour that fix depends on, so an upgrade that changed it would
// fail here and not in someone's hand.
import { QueryClient, QueryObserver, skipToken } from '@tanstack/react-query';

const KEY = ['seeker', 'status', ''] as const;

describe('a query that must never run', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => client.clear());

  it('still runs on refetch() when it is only disabled', async () => {
    const queryFn = jest.fn(async () => ({ linked: false }));
    const observer = new QueryObserver(client, { queryKey: KEY, queryFn, enabled: false });
    const result = await observer.refetch();
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({ linked: false });
  });

  it('has nothing to run on refetch() with skipToken, and holds no data', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const observer = new QueryObserver(client, { queryKey: KEY, queryFn: skipToken, enabled: false });
    const result = await observer.refetch();
    expect(result.data).toBeUndefined();
    expect(client.getQueryData(KEY)).toBeUndefined();
    error.mockRestore();
  });
});
