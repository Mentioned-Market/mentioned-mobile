// V0_GUIDE section 3: verify on device at first launch that the runtime has
// everything the ported Solana SDKs need. Dev only; logs once.
import { API_BASE, FLAVOR } from '@/config';
export function logPolyfillChecks() {
  if (!__DEV__) return;
  const g = globalThis as any;
  const checks = {
    'crypto.subtle.digest': typeof g.crypto?.subtle?.digest === 'function',
    TextEncoder: typeof g.TextEncoder !== 'undefined',
    TextDecoder: typeof g.TextDecoder !== 'undefined',
    BigInt: typeof g.BigInt !== 'undefined',
    atob: typeof g.atob === 'function',
    btoa: typeof g.btoa === 'function',
  };
  const allOk = Object.values(checks).every(Boolean);
  console.log(`[polyfill-check] ${allOk ? 'all OK' : 'MISSING'}`, checks);
  // Metro caches the inlined EXPO_PUBLIC_FLAVOR, so a build made straight
  // after a different flavour can carry the wrong config unless the cache was
  // cleared. Naming it on every launch makes that visible immediately.
  console.log(`[flavour] ${FLAVOR} -> ${API_BASE}`);
}
