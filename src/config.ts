// Per-flavour configuration. No secrets: everything here ships inside the APK,
// so only publishable keys and public ids belong in this file.
//
// The flavour is chosen by EXPO_PUBLIC_FLAVOR, which Expo inlines at build
// time (eas.json sets it per profile). Anything other than a known non-live
// name resolves to production, so an unset or mistyped value fails safe to the
// live configuration rather than to a half-configured test environment.
//
// Program ids and mints are copied from the web repo's lib/solanaConfig.ts.
// Verified Sep 10 2026 by asking each environment's RPC proxy for the two AMM
// program ids: the dev deployment answers on devnet, production on mainnet.

export type Flavor = 'production' | 'devnet' | 'staging';

const NON_LIVE: Flavor[] = ['devnet', 'staging'];

export const FLAVOR: Flavor = NON_LIVE.find((f) => f === process.env.EXPO_PUBLIC_FLAVOR) ?? 'production';

const CONFIG = {
  production: {
    apiBase: 'https://www.mentioned.market',
    cluster: 'mainnet',
    paidProgramId: '7pL3oze39xX7NmGFtndTz3EjhkCP9AcoVtX6fVmxm9pn',
    majorityProgramId: 'F1AVzZe4oX2cNDTvJjNFGWyYz4uxXxMwEqvTnamA2j9r',
    usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
  devnet: {
    // Railway dev deployment. Runs the merged Openfort code against devnet,
    // with its own database, so it has few or no markets.
    apiBase: 'https://mentioned-web-dev-dev.up.railway.app',
    cluster: 'devnet',
    paidProgramId: '9kSuebrHKKnFsgFcv5fc8S2gBazHA9Gki2NEWt2ft9tk',
    majorityProgramId: 'FYEiiL1iBRqHEGA8kU3gxVLDcGjSdE7aFRgjnYKxnisr',
    usdcMint: '6duUhxsjpsRasCSmvejAad4hH7aSyuBba99iZvsCsDum',
  },
  staging: {
    // Railway staging. Same devnet programs and USDC mint as the dev
    // deployment, verified Sep 12 2026 by deriving each market PDA and asking
    // staging's own RPC proxy which one exists (scripts/probe-env.ts). What it
    // has that dev does not is the notification worker, which is why push and
    // the notification feed are tested here.
    apiBase: 'https://mentioned-staging.up.railway.app',
    cluster: 'devnet',
    paidProgramId: '9kSuebrHKKnFsgFcv5fc8S2gBazHA9Gki2NEWt2ft9tk',
    majorityProgramId: 'FYEiiL1iBRqHEGA8kU3gxVLDcGjSdE7aFRgjnYKxnisr',
    usdcMint: '6duUhxsjpsRasCSmvejAad4hH7aSyuBba99iZvsCsDum',
  },
} as const;

const active = CONFIG[FLAVOR];

// The apex domain 301s to www; a redirect would break POSTs and MWA identity.
export const API_BASE: string = active.apiBase;
export const RPC_URL = `${API_BASE}/api/paid-rpc`;
export const CLUSTER: 'mainnet' | 'devnet' = active.cluster;
export const PAID_PROGRAM_ID: string = active.paidProgramId;
export const MAJORITY_PROGRAM_ID: string = active.majorityProgramId;
export const USDC_MINT: string = active.usdcMint;

export const APP_IDENTITY = {
  name: 'Mentioned',
  uri: 'https://mentioned.market',
  icon: 'favicon.ico',
};

// Openfort. Both keys are publishable and safe to ship; the Shield and server
// secrets stay behind /api/openfort/encryption-session. Empty means the
// provider renders inert, the same way the web behaves with the keys unset,
// so a build without them still runs read-only rather than crashing.
export const OPENFORT = {
  publishableKey: process.env.EXPO_PUBLIC_OPENFORT_PUBLISHABLE_KEY ?? '',
  shieldPublishableKey: process.env.EXPO_PUBLIC_OPENFORT_SHIELD_PUBLISHABLE_KEY ?? '',
  encryptionSessionUrl: `${API_BASE}/api/openfort/encryption-session`,
} as const;

export const isOpenfortConfigured = Boolean(OPENFORT.publishableKey && OPENFORT.shieldPublishableKey);

// Privy, for accounts made before the move to Openfort. Never offered to a new
// user: the sign-in screen only reaches it after the server has matched the
// identity to a pre-cutover Privy account (see src/auth/wallet-routing.ts).
// The app id is the web's NEXT_PUBLIC_PRIVY_APP_ID; the client id belongs to
// the Android app client in the Privy dashboard. Both are public. Empty means
// legacy accounts see the "use the website" message instead of a Privy login.
export const PRIVY = {
  appId: process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? '',
  clientId: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? '',
} as const;

export const isPrivyConfigured = Boolean(PRIVY.appId && PRIVY.clientId);
