# Mentioned Mobile: v0 guide

v0 is the smallest thing that runs on a Seeker and looks like Mentioned. It is
read-only, it talks to production, and it needs nothing from the web repo,
Openfort, or Railway. The point is to prove the toolchain on the device, port the
on-chain SDKs, build the navigation and the four market screens, and exercise
Mobile Wallet Adapter once. Everything that needs a backend change comes after
(see `SPEC.md`).

Why this works today: every read route the app needs on mentioned.market is
public, and the position and profile routes take the wallet as a query
parameter. So the app can show a Seeker owner their own positions by asking the
Seed Vault wallet for its address over MWA, with no sign-in at all.

## What v0 does

- Runs as an Expo dev-client APK on a Seeker (and any Android phone).
- Markets tab with the All / Free / Paid filter, listing all four market types
  from production.
- Four market screens, read-only: paid majority board, paid YES/NO trade sheet,
  free YES/NO trade sheet, free majority board. Quotes are computed on device
  with the ported maths so the trade sheets show real numbers, with the trade
  button disabled and labelled "Trading arrives in v1".
- "View as your Seeker wallet": MWA `authorize` against the Seed Vault wallet,
  address stored, Positions and You tabs populated from the `?wallet=` routes.
- Ranks tab: weekly points leaderboard and prize pool.

## What v0 does not do

No signing, no trading, no sign-in, no push, no Openfort, no App Links. If a
screen needs a session it shows a placeholder.

## 1. Prerequisites

- Node 20 (`nvm use 20`), npm. No yarn.
- Android Studio with SDK Platform 34+, build tools, and a JDK 17 (`java -version`).
  Set `ANDROID_HOME` and put `platform-tools` on `PATH`.
- Seeker: Settings → About → tap Build number 7 times → Developer options → USB
  debugging on. Plug in, accept the prompt, `adb devices` shows it.
- The Seed Vault wallet is set up on the Seeker with a small SOL balance.
- Optional: EAS CLI (`npm i -g eas-cli`) for cloud builds later. v0 builds locally.

## 2. Scaffold

```bash
npx create-expo-app@latest mentioned-mobile
cd mentioned-mobile
```

Take the default template (TypeScript, expo-router, tabs). Then install:

```bash
# Solana
npm i @solana/kit @noble/hashes bs58
# Mobile Wallet Adapter (native module: requires a dev build, not Expo Go)
npm i @solana-mobile/mobile-wallet-adapter-protocol @solana-mobile/mobile-wallet-adapter-protocol-kit
# Crypto polyfill (native)
npm i react-native-quick-crypto
# App plumbing
npx expo install expo-secure-store expo-haptics expo-web-browser expo-linking @react-native-community/netinfo
npm i @tanstack/react-query zustand zod
```

Pin exact versions in `package.json` once the first build is green; do not let
`^` ranges drift the Solana packages mid-hackathon.

## 3. Polyfills and entry point

`@solana/kit` derives PDAs with `crypto.subtle.digest('SHA-256')`, which Hermes
does not provide. `react-native-quick-crypto` installs it. The install must run
before any Solana import.

`polyfill.js`:

```js
import { install } from 'react-native-quick-crypto';
install();
```

`index.js`:

```js
import './polyfill';
import 'expo-router/entry';
```

`package.json`: `"main": "index.js"`.

Verify on device at first launch (put this behind a dev-only screen or a
`console.log` in the root layout):

- `typeof crypto.subtle.digest === 'function'`
- `typeof TextEncoder !== 'undefined' && typeof TextDecoder !== 'undefined'`
  (the SDKs use both; if `TextDecoder` is missing on your Hermes version, add
  `text-encoding` and import it in `polyfill.js`)
- `typeof BigInt !== 'undefined'`, `typeof atob === 'function'`
  (the AMM SDK uses `atob`/`btoa`)

## 4. App config

`app.json` additions:

```json
{
  "expo": {
    "name": "Mentioned",
    "slug": "mentioned",
    "scheme": "mentioned",
    "android": {
      "package": "market.mentioned.app",
      "adaptiveIcon": { "foregroundImage": "./assets/icon-fg.png", "backgroundColor": "#0F0E0B" }
    },
    "plugins": ["expo-router", "expo-secure-store"]
  }
}
```

The package name is permanent: it is what the dApp Store, App Links and the
release keystore are bound to. Pick it once.

`src/config.ts` (no `process.env`, no `window`):

```ts
export const API_BASE = 'https://mentioned.market';
export const RPC_URL = `${API_BASE}/api/paid-rpc`;
export const CLUSTER = 'mainnet' as const;
export const PAID_PROGRAM_ID = '7pL3oze39xX7NmGFtndTz3EjhkCP9AcoVtX6fVmxm9pn';
export const MAJORITY_PROGRAM_ID = 'F1AVzZe4oX2cNDTvJjNFGWyYz4uxXxMwEqvTnamA2j9r';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const APP_IDENTITY = { name: 'Mentioned', uri: 'https://mentioned.market', icon: 'favicon.ico' };
```

A devnet flavour (staging API, devnet ids) comes in v1 when there is something
to sign. v0 reads production.

## 5. Port the SDKs from the web repo

Copy these files from `mentioned/lib/` into `src/chain/` and `src/free/`. They
are pure TypeScript with no Node or DOM dependency beyond the globals checked
above. Put a header on each copy:

```ts
// PORTED_FROM mentioned/lib/majorityMarketUsdc.ts @ <commit sha>
// Keep byte-identical to the web copy. If the program changes, change both.
```

| Web file | Mobile file | Edits needed |
|---|---|---|
| `lib/majorityMarketUsdc.ts` | `src/chain/majority.ts` | Import program id from `src/config`; import ATA helpers etc. from `./amm` |
| `lib/mentionMarketUsdc.ts` | `src/chain/amm.ts` | Import ids and `RPC_URL` from `src/config`; import `sendViaProxy`/`confirmSignature` from `./rpcSend`; `fetchWith429Retry` from `./fetchRetry` |
| `lib/majorityMarket.ts` | `src/chain/majorityWords.ts` | None (stopwords + validation) |
| `lib/rpcSend.ts` | `src/chain/rpcSend.ts` | Replace the `MAINNET_RPC_PROXY` import with `RPC_URL` from config |
| `lib/fetchRetry.ts` | `src/chain/fetchRetry.ts` | None |
| `lib/virtualLmsr.ts` | `src/free/lmsr.ts` | None |
| `lib/customMarketUtils.ts` | `src/free/marketUtils.ts` | Drop the Tailwind class helpers or keep them as plain strings |
| `lib/solanaConfig.ts` | not copied | Replaced by `src/config.ts` |

Do not copy `lib/rpcProxy.ts` (reads `window.location`) or anything that
imports `lib/db.ts`.

Smoke test after porting, on the device, against real data:

1. `getMarketPDA(1n)` from `majority.ts` equals the address the website derives
   (print it from a browser console on `/paidmajority/1`).
2. Fetch `GET /api/paid-majority/market/1`, base64-decode `account`,
   `deserializeMajorityMarket(bytes)` returns a non-null object whose
   `totalUnits` matches the route's `totalUnits`.
3. Fetch `GET /api/paid-markets/market/<id>` for an open AMM market,
   `deserializeMarketAccount(bytes)` returns words whose `impliedYesPrice(word, market.liquidityParamB)`
   matches the YES price shown on `/market/<id>`.
4. `sharesForUsdc(word, b, 'YES', 1_000_000n)` on device equals the website's
   quote for $1 on the same word.

If step 1 fails the polyfill is wrong. If 2 or 3 fail the port is wrong. Fix
before writing any UI.

## 6. Typed API client

`src/api/client.ts`: one `get<T>(path)` using `fetch` with `API_BASE`, a 10s
timeout, and JSON parsing. One function per route in `src/api/*.ts`, each with a
zod schema written from a real response (fetch it once with curl and paste the
shape). v0 routes:

| Function | Route | Notes |
|---|---|---|
| `listPaidMajority()` | `GET /api/paid-majority/list` | Cached 8s server-side |
| `getPaidMajorityMarket(id)` | `GET /api/paid-majority/market/[id]` | `account` is base64; decode on device |
| `getPaidMajorityPositions(id, wallet)` | `GET /api/paid-majority/my-positions?id=&wallet=` | |
| `getPaidMajorityUserPositions(wallet)` | `GET /api/paid-majority/user-positions?wallet=` | Positions tab |
| `listPaidMarkets()` | `GET /api/paid-markets/list` | AMM cards |
| `getPaidMarket(id)` | `GET /api/paid-markets/market/[id]` | `{ account, vaultAmount }`, decode on device |
| `getPaidMarketMetadata(id)` | `GET /api/paid-markets/metadata?id=` | Title, cover, stream URL |
| `getPaidMarketChart(id)` | `GET /api/paid-markets/chart?id=` | |
| `getPaidMarketTrades(id)` | `GET /api/paid-markets/trades?id=` | |
| `getPaidMarketUserPositions(wallet)` | `GET /api/paid-markets/user-positions?wallet=` | Positions tab |
| `listFreeMarkets()` | `GET /api/custom` | `market_type` picks board vs sheet |
| `getFreeMarket(id)` | `GET /api/custom/[id]` | `{ market, words, traderCount }`, words carry pool prices |
| `getFreePositions(id, wallet)` | `GET /api/custom/[id]/positions?wallet=` | Holdings + play-token balance |
| `getFreeBoard(id, wallet)` | `GET /api/custom/[id]/board?wallet=` | Majority only |
| `getFreeChart(id)` | `GET /api/custom/[id]/chart` | |
| `getFreeUserActivity(wallet)` | `GET /api/custom/user-activity?wallet=` | Positions tab |
| `getProfile(wallet)` | `GET /api/profile?wallet=` | |
| `getLeaderboard()` | `GET /api/polymarket/leaderboard/points?sort=weekly` | Legacy path, current data |
| `getPrizePool()` | `GET /api/prize-pool` | |

Wrap each in TanStack Query. Poll the market detail queries every 5s while the
screen is focused (`refetchInterval` + `useFocusEffect`), never in the
background. The server caches these at 3s/8s so polling costs nothing upstream.

## 7. Screens

Expo Router layout:

```
app/
  _layout.tsx            QueryClientProvider, theme, wallet store hydrate
  (tabs)/
    _layout.tsx          Markets · Positions · Ranks · You
    index.tsx            Markets list + filter
    positions.tsx
    ranks.tsx
    you.tsx
  majority/[id].tsx      Paid majority board
  paid/[id].tsx          Paid YES/NO trade sheet + chart
  free/[id].tsx          Free YES/NO trade sheet
  free-majority/[id].tsx Free majority board
src/
  api/  chain/  free/  ui/  store/  config.ts
```

Build order, each one runnable on the Seeker before the next:

1. **Tabs and theme.** Black ground, gold `#F2B71F` accent, Plus Jakarta Sans
   (`expo-font`), tabular numerals for money. Match the website's feel, not its
   layout.
2. **Markets list.** Merge the three list routes into one array of
   `{ kind, id, title, cover, status, lockTs, topWords, pool | playTokens, traderCount, isFeatured }`.
   Featured hero on top, then cards by soonest lock, resolved below. Filter
   chips: All / Free / Paid. Card tap routes by `kind`.
3. **Paid majority board.** Decode the account, render the board as a ranked
   list first (bubbles later). Odds %, units, your picks highlighted when a
   viewed wallet is set. Lock countdown from `lockTs`. Word tap opens a cart
   sheet that totals $1 per word and shows a disabled "Trading arrives in v1".
4. **Paid YES/NO sheet.** Word strip, YES/NO price per word, amount input,
   live quote from `sharesForUsdc` and `estimateBuyCost`, disabled button.
   Chart below from the chart route (a simple line with `react-native-svg` is
   enough for v0).
5. **Free YES/NO sheet.** Same component, quotes from `virtualBuyCost`,
   balance from positions.
6. **Free majority board.** `board?wallet=`, required pick count from
   `market.bets_per_user`, selection UI that enables at exactly that count,
   disabled submit.
7. **Positions.** Three sources merged by market, grouped by open / resolved.
8. **Ranks and You.** Leaderboard, prize pool, profile card for the viewed
   wallet.

Every screen has a loading skeleton, an error state with retry, and an empty
state. Body text never smaller than 14. No horizontal scroll anywhere.

## 8. View as your Seeker wallet (MWA)

This is the one piece of Solana Mobile Stack in v0, and it is worth doing early
because it proves MWA works on the device with our app identity.

`src/store/wallet.ts` (zustand, persisted to `expo-secure-store`):
`{ viewedAddress: string | null, authToken: string | null }`.

`src/chain/mwa.ts`:

```ts
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-kit';
import { APP_IDENTITY } from '../config';

export async function connectSeekerWallet(cachedToken: string | null) {
  return transact(async (wallet) => {
    const auth = await wallet.authorize({
      chain: 'solana:mainnet',
      identity: APP_IDENTITY,
      auth_token: cachedToken ?? undefined,
    });
    return { address: auth.accounts[0].address, authToken: auth.auth_token };
  });
}

export async function disconnectSeekerWallet(token: string) {
  await transact(async (wallet) => wallet.deauthorize({ auth_token: token }));
}
```

You tab: "Connect Seeker wallet" → stores the address and token → Positions
and You switch to that wallet. Second tap on a later launch passes the cached
token and should not show a dialog. "Disconnect" calls `deauthorize` and clears
the store.

If no MWA wallet is installed (a stock Pixel), `transact` throws; show "Install
Phantom or Solflare to view your positions" and keep browsing working.

## 9. Build and run on the Seeker

```bash
npx expo prebuild --platform android      # generates android/ (commit it)
npx expo run:android --device             # pick the Seeker
```

Metro serves JS over USB; the API is production so nothing else runs locally.
Iterate with fast refresh. Rebuild only when native deps change.

Check on the Seeker, in this order:

- [ ] App launches, tabs render, no red box
- [ ] Section 3 polyfill checks all true
- [ ] Section 5 smoke tests 1–4 pass with real data
- [ ] Markets tab lists paid majority, paid AMM and free markets from production
- [ ] All four detail screens open from the list and refresh while focused
- [ ] Quotes on the two trade sheets match the website for the same input
- [ ] Connect Seeker wallet: Seed Vault dialog appears, address stored
- [ ] Relaunch: connect again with cached token, no dialog
- [ ] Positions tab shows that wallet's real positions (use a wallet that has some)
- [ ] Disconnect clears everything
- [ ] Airplane mode: every screen shows its error state with a working retry
- [ ] Rotate, background, foreground: no crash, polling resumes

Then the same list on a non-Seeker Android phone with Phantom installed.

## 10. Repo hygiene from the first commit

- `README.md`: what this is, how to run on a Seeker, the PORTED_FROM rule.
- Commit `android/` so builds are reproducible; keystores are never committed.
- `.env` is not used. Config is code. Flavours come in v1 via `eas.json` profiles.
- Conventional commits, small PRs, one screen per PR. The commit history is
  part of the hackathon submission.
- Copy `SPEC.md` next to this file. It is the plan for everything after v0.
