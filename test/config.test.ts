// The flavour picks the API, the cluster, the program ids and the mint
// together. Mixing them would point the app at devnet data while decoding
// mainnet accounts, which fails in confusing ways, so this pins that they
// always move as a set.
type Config = typeof import('@/config');

function load(flavor?: string): Config {
  let mod!: Config;
  jest.isolateModules(() => {
    const previous = process.env.EXPO_PUBLIC_FLAVOR;
    if (flavor === undefined) delete process.env.EXPO_PUBLIC_FLAVOR;
    else process.env.EXPO_PUBLIC_FLAVOR = flavor;
    mod = require('@/config') as Config;
    if (previous === undefined) delete process.env.EXPO_PUBLIC_FLAVOR;
    else process.env.EXPO_PUBLIC_FLAVOR = previous;
  });
  return mod;
}

describe('flavour selection', () => {
  it('defaults to production when unset', () => {
    const c = load(undefined);
    expect(c.FLAVOR).toBe('production');
    expect(c.CLUSTER).toBe('mainnet');
    expect(c.API_BASE).toBe('https://www.mentioned.market');
  });

  it('fails safe to production on an unknown value', () => {
    // A typo must not leave the app half-configured.
    for (const bad of ['dev', 'DEVNET', 'Staging', 'stage', '']) {
      expect(load(bad).FLAVOR).toBe('production');
    }
  });

  it('switches to staging on the exact value', () => {
    const c = load('staging');
    expect(c.FLAVOR).toBe('staging');
    expect(c.CLUSTER).toBe('devnet');
    expect(c.API_BASE).toBe('https://mentioned-staging.up.railway.app');
  });

  it('points staging at the same chain as devnet, and only the API elsewhere', () => {
    // Verified against staging's own RPC proxy (scripts/probe-env.ts): the same
    // devnet programs and mint. What differs is the deployment, which is the
    // one with the notification worker.
    const dev = load('devnet');
    const staging = load('staging');
    expect(staging.API_BASE).not.toBe(dev.API_BASE);
    expect(staging.PAID_PROGRAM_ID).toBe(dev.PAID_PROGRAM_ID);
    expect(staging.MAJORITY_PROGRAM_ID).toBe(dev.MAJORITY_PROGRAM_ID);
    expect(staging.USDC_MINT).toBe(dev.USDC_MINT);
  });

  it('switches to devnet on the exact value', () => {
    const c = load('devnet');
    expect(c.FLAVOR).toBe('devnet');
    expect(c.CLUSTER).toBe('devnet');
    expect(c.API_BASE).toContain('railway.app');
  });

  it('moves the API, cluster, programs and mint together', () => {
    const prod = load(undefined);
    const dev = load('devnet');
    expect(dev.API_BASE).not.toBe(prod.API_BASE);
    expect(dev.CLUSTER).not.toBe(prod.CLUSTER);
    expect(dev.PAID_PROGRAM_ID).not.toBe(prod.PAID_PROGRAM_ID);
    expect(dev.MAJORITY_PROGRAM_ID).not.toBe(prod.MAJORITY_PROGRAM_ID);
    expect(dev.USDC_MINT).not.toBe(prod.USDC_MINT);
  });

  it('derives the RPC proxy and the encryption session from the API base', () => {
    for (const flavor of [undefined, 'devnet', 'staging']) {
      const c = load(flavor);
      expect(c.RPC_URL).toBe(`${c.API_BASE}/api/paid-rpc`);
      expect(c.OPENFORT.encryptionSessionUrl).toBe(`${c.API_BASE}/api/openfort/encryption-session`);
    }
  });

  it('uses the apex-free host so a 301 never breaks a POST', () => {
    expect(load(undefined).API_BASE).not.toBe('https://mentioned.market');
  });
});

describe('ids', () => {
  it('are plausible base58 addresses', () => {
    for (const flavor of [undefined, 'devnet']) {
      const c = load(flavor);
      for (const id of [c.PAID_PROGRAM_ID, c.MAJORITY_PROGRAM_ID, c.USDC_MINT]) {
        expect(id).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      }
    }
  });

  it('keeps the paid and majority programs distinct', () => {
    const c = load(undefined);
    expect(c.PAID_PROGRAM_ID).not.toBe(c.MAJORITY_PROGRAM_ID);
  });
});

describe('Openfort keys', () => {
  it('reports unconfigured when the keys are absent, rather than crashing', () => {
    const c = load(undefined);
    expect(c.isOpenfortConfigured).toBe(false);
    expect(c.OPENFORT.publishableKey).toBe('');
  });

  it('ships no secret, only publishable keys', () => {
    const c = load(undefined);
    expect(Object.keys(c.OPENFORT)).toEqual(['publishableKey', 'shieldPublishableKey', 'encryptionSessionUrl']);
  });
});

describe('app identity', () => {
  it('is the same on every flavour, because the wallet shows it to the user', () => {
    expect(load('devnet').APP_IDENTITY).toEqual(load(undefined).APP_IDENTITY);
    expect(load('staging').APP_IDENTITY).toEqual(load(undefined).APP_IDENTITY);
    expect(load(undefined).APP_IDENTITY.name).toBe('Mentioned');
  });
});
