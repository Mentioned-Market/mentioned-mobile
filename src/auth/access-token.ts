// A bridge from the SDK's React context to the plain callback the provider
// hands to Openfort for minting encryption sessions.
//
// The provider needs `getEncryptionSession` at construction time, but the
// access token only exists inside the SDK's context, and the callback is
// invoked by the SDK outside React. So a small registry: a component mounted
// inside the provider registers the getter, and the callback reads it.
let getter: (() => Promise<string | null>) | null = null;

export function registerAccessTokenGetter(fn: () => Promise<string | null>) {
  getter = fn;
}

export async function currentAccessToken(): Promise<string> {
  if (!getter) throw new Error('Openfort is not ready yet. Try again in a moment.');
  const token = await getter();
  if (!token) throw new Error('You are not signed in to Openfort.');
  return token;
}
