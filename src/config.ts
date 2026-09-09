// Static config. No process.env, no window: React Native has neither.
// v0 reads production. A devnet flavour is stubbed in v1 and used from v2 (SPEC section 4).
// The apex domain 301s to www; a redirect would break POSTs and MWA identity checks.
export const API_BASE = 'https://www.mentioned.market';
export const RPC_URL = `${API_BASE}/api/paid-rpc`;
export const CLUSTER = 'mainnet' as const;
export const PAID_PROGRAM_ID = '7pL3oze39xX7NmGFtndTz3EjhkCP9AcoVtX6fVmxm9pn';
export const MAJORITY_PROGRAM_ID = 'F1AVzZe4oX2cNDTvJjNFGWyYz4uxXxMwEqvTnamA2j9r';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const APP_IDENTITY = {
  name: 'Mentioned',
  uri: 'https://mentioned.market',
  icon: 'favicon.ico',
};
