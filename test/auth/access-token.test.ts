// The encryption-session callback runs outside React, so it reads the access
// token through this registry. Getting it wrong fails wallet creation with a
// misleading "failed to create wallet", which is exactly what happened once.
import { currentAccessToken, registerAccessTokenGetter } from '@/auth/access-token';

describe('currentAccessToken', () => {
  it('refuses clearly before the bridge has mounted', async () => {
    // A fresh module: no getter registered yet.
    await jest.isolateModulesAsync(async () => {
      const mod = require('@/auth/access-token') as typeof import('@/auth/access-token');
      await expect(mod.currentAccessToken()).rejects.toThrow(/not ready/);
    });
  });

  it('returns the token the SDK provides', async () => {
    registerAccessTokenGetter(async () => 'tok_123');
    await expect(currentAccessToken()).resolves.toBe('tok_123');
  });

  it('says you are signed out rather than returning nothing', async () => {
    registerAccessTokenGetter(async () => null);
    await expect(currentAccessToken()).rejects.toThrow(/not signed in/);
  });

  it('takes the latest registration', async () => {
    registerAccessTokenGetter(async () => 'first');
    registerAccessTokenGetter(async () => 'second');
    await expect(currentAccessToken()).resolves.toBe('second');
  });

  it('propagates a failure from the SDK getter', async () => {
    registerAccessTokenGetter(async () => {
      throw new Error('session expired');
    });
    await expect(currentAccessToken()).rejects.toThrow('session expired');
  });
});
