# Mentioned Mobile: specification

Native Android app for Mentioned, built for the Solana Mobile CLOCK IN
hackathon (Sep 8 to Oct 8 2026) and shipped for real on the Solana dApp Store
on Sep 28. This document is the plan for everything after v0 (`V0_GUIDE.md`). Revised
Sep 9 2026: v1 is now the complete read-only app, and auth, trading, push and
store each moved one version later (section 3). Revised Sep 14 2026: v7 is a
UI pass over the whole app, the store release is v8 and cleanup is v9.
It is written to live in this repo; the web-side changes it depends on are
listed in section 14 and tracked in the `mentioned` repo.

Companion documents in the web repo: `specs/hackathon_fall_2026_plan.md`
(Colosseum overlap, Arena 3, owner lanes, branch landing schedule),
`specs/wallet_provider_routing.md` and `specs/openfort_migration_plan.md`
(Openfort), `specs/openfort_usdc_gas_plan.md` (Kora), `specs/paid_majority_market_spec.md`,
`specs/custom_free_market_spec.md`.

## 1. Product

Mentioned is a second-screen game for live events. You watch a stream, a
debate, a match, and you bet on what gets said: which word is said the most, or
whether a specific word gets said at all. The app ships every market type that
is live on mentioned.market:

| Market | Mechanism | Trades on mobile via | Gate |
|---|---|---|---|
| Paid majority | Pari-mutuel, on-chain (`mention-majority-market`), $1 flat per word, unlimited words, coin your own | In-app Openfort signature, broadcast through the RPC proxy. Claim on-chain; refunds are website-only (section 7.1) | Signed in |
| Free majority | Pari-mutuel, play tokens, one entry of exactly `bets_per_user` equal bets on distinct words | `POST /api/custom/[id]/entry` | Signed in, Discord linked while the gate stands (section 12) |
| Paid YES/NO | LMSR AMM, on-chain (`mention-market-usdc-amm`), USDC, up to 8 words, buy/sell/redeem | In-app Openfort signature, proxy broadcast | Signed in |
| Free YES/NO | LMSR, play tokens per market, profit to points at 0.5x | `POST /api/custom/[id]/trade` | Signed in (same) |

Not in the app: Jupiter/Polymarket markets, admin pages, live transcription
control, arena team pages, image studio, iOS.

Decisions already taken:

- **Own repo, native React Native.** Not a wrapped website.
- **Login is Openfort only.** Google, X, email OTP. Embedded Solana wallet,
  automatic recovery, no seed phrase. No Phantom, no Privy, no wallet-adapter
  sign-in. Mentioned is moving all logins to Openfort.
- **Mobile Wallet Adapter is the Seed Vault bridge**, used for exactly three
  things: deposit into the app wallet, withdraw destination, and Seeker
  ownership proof. Never the trade signer.
- **No Discord in the app.** Linking, DM settings and the 30-day rule are gone;
  the server gate is being retired.
- **Live mentions is parked.** No transcript panel, no mention push. Listed as
  unlikely stretch.
- **Trades never leave the app.** One tap, in-app confirm, signed by Openfort.

## 2. Architecture

```
Seeker / Android
  mentioned-mobile (Expo, expo-router, @solana/kit, TanStack Query, zustand)
  Openfort embedded wallet (@openfort/react-native): in-app Ed25519 signer
  Seed Vault wallet via MWA: deposit / withdraw / Seeker proof only
  expo-secure-store: session bearer, MWA auth_token, push token
        │ HTTPS                      │ signed tx via /api/paid-rpc
Railway (existing services, no new ones)
  Next.js web: /api/*, RPC proxy, Openfort verify + Shield session, bearer sessions
  notification-worker: outbox → Discord, Telegram, + FCM push
  transcript-worker: unchanged
  Postgres: + push_tokens, + seeker link columns
        │ Helius keyed RPC            ↑ webhooks
Solana mainnet: majority program F1AVzZe4…2j9r, AMM 7pL3oze3…m9pn, USDC
```

Rules carried over from the web app:

1. **No secrets in the APK.** Only Openfort's two publishable keys ship. Shield
   secrets stay behind `/api/openfort/encryption-session`. All RPC goes through
   `/api/paid-rpc` (method allowlist, body cap, rate limit) or the cached read
   routes. No Helius URL in the app, ever.
2. **Reads scale with market count, not user count.** The app polls the same
   3s/8s TTL-cached routes the website uses, only while a screen is focused.
3. **On-chain state is the source of truth.** Market bytes arrive raw base64
   and are decoded on device with the ported deserializers. No serialization
   schema to drift.
4. **Ported code stays byte-identical.** `src/chain/*` and `src/free/*` carry a
   `PORTED_FROM` header with the source commit. If a program or the LMSR maths
   changes, both repos change in the same week.
5. **Mirror the web's post-trade behaviour.** Paid majority calls `record-buys`
   after confirmation; paid AMM refetches at +4s; free trades use the
   `newAchievements` in the response for the toast.
6. **Contract discipline.** One typed function per route in `src/api/`, zod
   parsed. Any field the app depends on gets a comment in the web route file so
   a web refactor cannot silently break shipped APKs.

## 3. Versions

Each version is a runnable app on a Seeker and a store-shippable increment.

| Version | Contents | Needs from web repo | Target |
|---|---|---|---|
| **v0** | Read-only skeleton on a Seeker, MWA "view as" | nothing | Sep 10 |
| **v1** | Complete read-only app: every screen against production, AMM sheet design, polish list, tests | nothing | Sep 13 |
| **v3** | Openfort login, bearer sessions, Seed Vault deposit/withdraw, Seeker link | Openfort branches on staging; bearer + mobile token; seeker link route | Sep 16 |
| **v4** | All four trade flows, positions with claim/redeem enabled, post-trade behaviour | nothing further (bearer sessions from v3) | DONE Sep 11 on devnet |
| **v5** | Push, notification feed + settings, profile edit, share points, mobile config | push channel | Sep 19 |
| **v6** | Arena (seasons, prizes, team leaderboard, team profiles) and referrals (earned referral fees, share link), matching the website (section 9) | nothing: every route exists and is public | DONE Sep 14 2026. Production comparison and team actions are v9 checks (section 12) |
| **v7** | UI pass: the whole app re-laid out to one calmer system (section 10). Five tabs, one card shape, a single chance figure per word, full-screen trade sheet with a swipe to confirm, deposit and withdraw on Me | nothing | Sep 14 to 15 |
| **v8** | Release build, deep links + App Links, dApp Store submission | production deploy of all of the above (Sep 16); assetlinks.json | After v7. The Sep 21 submission limit and Sep 28 launch are at risk |
| **v8.1** | Stretch: Seeker perk, widget, price alerts, Kora gas | perk route | Sep 25 if green |
| **v9** | Final: cleanup and testing. Everything v4 left open, checked on a Seeker (section 12) | Discord gate decision; wallet-keyed rate limits; Helius webhook on dev; production deploy | Last |

v1 was inserted on Sep 9 so that all UI, ported maths, API client and tests
are finished while the Openfort branches land, and v2 on the same day so the
first-install experience (icon, splash, intro, Home) is seen on a real APK
before any auth work. v3 onwards is logic wired into finished screens. v3
starts the day Openfort staging is usable; every later date is a latest date,
and an early v3 pulls them all forward.

Gates (checked on a Seeker, not an emulator):

- **Sep 10:** browse every production market on a Seeker, view positions as
  the Seed Vault wallet over MWA. (v0)
- **Sep 13:** someone who does not try to trade believes the app is finished;
  every screen, quote and state is real; contract tests green against
  production. (v1)
- **Sep 14:** a release APK installed from a file on a Seeker shows the
  Mentioned icon, splash, intro and Home. (v2)
- **Sep 16:** sign in with Google, get an Openfort wallet with no seed phrase,
  fund it from the Seed Vault via MWA. (v3)
- **Sep 18:** one real trade of each of the four types signed in-app, all
  visible on mentioned.market. (v4: met on devnet Sep 11; the production
  check moved to v9)
- **Sep 21 at the latest:** release APK in the store review queue; a new user
  can sign in, fund from their Seeker, trade any market type, and get a push,
  unaided. Sep 18 stays the target if v3 starts early.
- **Sep 25:** store approval received; launch markets scheduled.
- **Sep 28:** a stranger installs from the store and makes a pick.
- **Oct 6:** hackathon entry submitted with real usage numbers.

Order inside each version: on-chain flows first (they carry the risk), free
markets second (cheap REST calls), AMM polish last (the maths never changes).
A slipping gate cuts stretch, never the gate.

## 4. v1: complete read-only app

Everything a user can see without a session, finished to shipping quality,
against production reads. Nothing in this version waits on the web repo,
Openfort, or a devnet. It exists so that the UI, the ported maths, the API
client and the test suite are done before the auth lane unblocks. Devnet does
not help here: read-only work runs against the public production routes, and
devnet only matters once there is something to sign, which is v3.

Build order, each step green on a Seeker before the next:

1. **Finish `V0_GUIDE.md` sections 5 to 8.** SDK port with the four smoke
   tests, typed API client, Markets list, four market screens with live
   quotes and disabled trade buttons, MWA "view as".
2. **Result screens.** `result/[type]/[id].tsx` from the public results
   routes for all three market families. Public profiles at `u/[username].tsx`,
   reachable by tapping any player anywhere: the Ranks leaderboard, result
   leaderboards, search hits and recent-trade rows. Search from
   `GET /api/search?q=`.
3. **Ranks complete.** Weekly points board with week arrows (`?week=`), prize
   pool, raffle tickets.
4. **Positions complete.** The viewed wallet's positions merged from the three
   sources, grouped open / resolved, with the correct CTA per row rendered
   disabled: Claim, Redeem, Reclaim rent, View result. v4 enables them. There
   is no Refund action: refunds are website-only (section 7.1).
5. **AMM sheet design pass** (pulled forward from the old v4). Word strip,
   YES/NO price pair, amount pad, live quote, chart, hand-built with the Seeker
   in hand. The same care on the majority cart and the two free sheets. The
   maths never changes, so the design can be final now and v4 only wires the
   builders into it.
6. **Polish list** (pulled forward). Skeletons, error states with retry, empty
   states with a next action, offline banner (`netinfo`), haptics, reduced
   motion respected, keyboard-safe sheets, no horizontal scroll, body text at
   least 14, tabular numerals on money.
7. **Tests** (section 17). Jest over the ported maths (quotes, payouts, LMSR),
   the deserializers against captured account bytes, word validation, list
   merging and position grouping, plus every `src/api` zod schema against
   captured responses. A contract-test script that parses every public route
   in section 15 against a live response, run daily in CI.

Deep-link routing was moved to v8 (section 11): intent filters are useless
until `assetlinks.json` carries the release certificate, and a chooser dialog
is a worse first impression than a link that opens the website. Flavour
groundwork moved to v3 (section 6), where a devnet target is first needed.

Not in v1: anything that sends a bearer. Sign-in, trading, profile edit,
notification feed, push, mobile config and bug report all wait for v3 onward.

Exit: the Sep 13 gate. The app should look finished to someone who does not
try to trade.

## 5. v2: first-install experience

What a new user sees between tapping the icon and reaching a market, built on
a real release APK so icon, splash and cold start are judged on the device.

1. **App icon and splash.** Generated from the brand mark
   (`public/apple-touch-icon.png` in the web repo): launcher icon, adaptive
   icon layers, monochrome icon, splash mark on black. Generated by a script
   so they can be regenerated if the mark changes.
2. **Intro.** Three slides on first launch (what Mentioned is, free versus
   paid, made for the Seeker) ending in "Connect Seeker wallet" or "Browse
   markets". Shown once; the dev screen can reset it.
3. **Home tab.** First tab. Prize pool banner, markets closing soon, the
   viewed wallet's position summary or the connect card, top three on the
   leaderboard, recently resolved markets. Markets keeps its own tab.
4. **Release APK.** `./gradlew assembleRelease` with the JS bundle embedded,
   installed from a file with `adb install`. Signed with the debug key until
   the store keystore exists (section 11). This is the build handed to anyone
   who wants to try the app before the store listing.

Exit: the Sep 14 gate.

## 6. v3: auth, sessions, funding

### 6.1 Flavours and the devnet target

Do this first: everything below signs real transactions, and testing a trade
flow against mainnet spends real USDC on every attempt.

DONE Sep 10. `src/config.ts` is keyed by `EXPO_PUBLIC_FLAVOR` with two
flavours, and `eas.json` carries the `dev`, `devnet-preview` and `production`
profiles (section 11). Anything but the literal `devnet` resolves to production,
so a typo fails safe to live rather than to a half-configured devnet, and a
test pins that the API, cluster, programs and mint always move as a set.

- `devnet` points at `https://mentioned-web-dev-dev.up.railway.app`, the
  Railway dev deployment. Confirmed on devnet by asking its RPC proxy for both
  AMM program ids: it answers for `9kSuebrHKKnFsgFcv5fc8S2gBazHA9Gki2NEWt2ft9tk`
  and not for the mainnet one. It runs the merged Openfort code with Shield
  configured, but it has its own database, so it holds few or no markets.
- Devnet majority program `FYEiiL1iBRqHEGA8kU3gxVLDcGjSdE7aFRgjnYKxnisr`,
  devnet USDC mint `6duUhxsjpsRasCSmvejAad4hH7aSyuBba99iZvsCsDum`.
- Still to do: one Seeker on the devnet flavour, one on production.

### 6.2 Openfort login

Server side is merged to `main` in the web repo (PR #159, Sep 10):

- `POST /api/auth/sign-in` with `type: 'openfort'`, an Openfort access token,
  and the wallet the client is using. `verifyOpenfortToken` verifies the token
  with `@openfort/openfort-node`, lists the user's SVM accounts, and only issues
  a session for a wallet that belongs to that user.
- `POST /api/openfort/encryption-session` mints the Shield encryption session
  for automatic recovery. Token in the body, legacy-Privy gate
  (409 `LEGACY_PRIVY_ACCOUNT`), rate limited. Nothing in it assumes a browser.
- `lib/openfortSolanaSigner.ts`: pure function, compiled kit transaction + raw
  Ed25519 signer in, signed wire bytes out, hard 64-byte assertion. Unit tested
  with a local keypair in `scripts/test-openfort-signer.ts`. Port it unchanged
  to `src/auth/signer.ts` with its test. Verified portable on Sep 10: it
  imports only `bs58` and three `@solana/kit` symbols (`address`,
  `getTransactionDecoder`, `getTransactionEncoder`), all present in the kit
  7.1.1 the app pins even though the web is on kit 6. The test needs
  `tweetnacl` as a dev dependency and becomes a Jest test rather than a script.

SDK: `@openfort/react-native@2.1.2` (checked on npm Sep 10). Its peer
dependencies are `expo-application`, `expo-crypto`, `expo-linking`,
`expo-secure-store`, `expo-web-browser`, `react-native-webview` and
`expo-apple-authentication`; the app already has three of those. Note the web
verifies tokens with `@openfort/openfort-node` while the app would mint them
with the v2 React Native SDK, so proving one token verifies server side is the
first thing to check, before any UI (see section 19, open question 3).

Mobile flow:

1. `OpenfortProvider` at the root with `publishableKey` and
   `walletConfig.shieldPublishableKey`. NOT
   `createEncryptedSessionEndpoint`: the RN SDK does not implement that
   pathway yet (its own types carry a TODO saying so), so the provider takes a
   `getEncryptionSession` callback and the app calls the route itself. That is
   the better shape anyway, because it is what lets the app recognise the 409
   and show the legacy-Privy message rather than surfacing a generic SDK
   failure. Done in `src/auth/encryption-session.ts`, with the provider in
   `src/auth/openfort-provider.tsx` rendering its children untouched when the
   keys are unset, exactly as the web does. Auth hooks come from the SDK's
   `hooks/auth`; OAuth returns on the `mentioned://` scheme via
   `expo-web-browser`.
2. After auth, `useEmbeddedSolanaWallet`: list SVM accounts; recover the
   existing one, else create with `RecoveryMethod.AUTOMATIC`. Mirror
   `ensureOpenfortSolanaWallet()` on the web branch, including the
   retry-once-before-create guard so a returning user never gets a second empty
   wallet.
3. A 409 with code `LEGACY_PRIVY_ACCOUNT` from the encryption-session route
   means a legacy Privy identity. Show
   "Your account is being upgraded. Use mentioned.market for now." and stop.
   There is no Privy path in the app.
4. `POST /api/auth/sign-in` `{ type: 'openfort', token, wallet, client: 'mobile', ref }`.
   With `client: 'mobile'` the session token is returned in the JSON body
   (web change, section 14). Store it in `expo-secure-store`.
5. Every request sends `Authorization: Bearer <token>`. Cookies are not relied
   on. On 401, or at 6 days, repeat step 4 silently with a fresh Openfort access
   token.
6. Sign out: `POST /api/auth/sign-out`, the SDK's logout, clear the store.

Referral: the app has no cookie, so a `ref` code captured from an App Link
(`mentioned.market/ref/<code>`) is held in the store and sent in the sign-in
body once.

### 6.3 Signing

Signing is one function, `signTransaction(txBytes): Promise<Uint8Array>`, in
`src/auth/signer.ts`, backed by the RN SDK's Solana provider. Port exactly the
web contract: fully compiled wire transaction with an empty signature slot in,
the same transaction with our signature placed by kit's codec out. The RN
provider's `signTransaction({ messageBytes })` returns base58; decode, trim a
65th recovery byte if present, assert 64 bytes. Broadcast is never the signer's
job.

Day-one check for v3: sign a memo transaction on a Seeker and broadcast it
through the proxy before writing any trade UI.

### 6.4 Funding: the Seed Vault bridge (MWA)

Fund sheet (`app/fund.tsx`), reached from the You tab and from any "not enough
USDC" state:

1. Shows app wallet USDC. Options: "From your Seeker wallet", "Buy with card"
   (if the on-ramp routes are live), "Deposit address" (copy).
2. **Deposit:** amount input. The app adds a SOL reserve (fees plus one ATA
   rent) so the embedded wallet can never be stranded without gas.
   `transact()`: `authorize` with cached `auth_token` and `APP_IDENTITY`; the
   Seed Vault returns its address, stored as the linked Seeker address. Build a
   kit transaction with the Seed Vault address as fee payer: create the app
   wallet's USDC ATA if missing, transfer USDC, transfer the SOL reserve.
   Simulate via the proxy. `signTransactions` in the same MWA session (Seed
   Vault double-tap). Broadcast via the proxy, confirm, refresh balances,
   haptic. One approval total.
3. **Withdraw:** amount + destination defaulting to the linked Seeker address.
   Openfort signs a transfer. No MWA session.
4. **Card on-ramp:** `POST /api/onramp/session` returns a hosted Coinbase or
   Stripe URL; open in a Custom Tab; the return page is App-Linked back. USDC
   only, so the SOL reserve still comes from a Seed Vault deposit (or Kora,
   later).
5. **No MWA wallet installed** (stock Pixel): hide the Seeker option, show the
   others. Login and trading never depend on a wallet app.

The deposit is the only flow that leaves the app. Persist the pending deposit
and blockhash before `transact()`; on foreground resume by checking the
signature status or rebuilding with a fresh blockhash. 120s timeout, clear
retry.

### 6.5 Seeker link

`POST /api/seeker/link` (web, section 14): the app requests a nonce, signs it
with MWA `signMessages` from the Seed Vault address, posts address + signature.
Server verifies, stores `seeker_wallet` on the profile, runs the Seeker Genesis
Token check via Helius DAS, sets `seeker_verified_at`. Profile shows a Seeker
badge. This runs automatically after the first successful deposit and is also
offered on the You tab.

## 7. v4: trading

### 7.1 Paid majority: buy and claim

1. Tap words on the board. Each is a $1 unit; a new word is coined by its first
   buyer (rent for WordEntry + Position). Cart shows total and a rent line if
   any word is new. Word validation and the banned list come from the ported
   `majorityWords.ts`, identical to the web.
2. Preflight: USDC ATA exists and balance ≥ total, SOL ≥ rent + fees, market
   open (lock from the decoded account), network up. Every failure is a
   specific state: "Add $3 more", "Market locked 2 min ago", "You're offline".
3. Build: `createAtaIx` if needed, one `createBuyIx(buyer, marketId, word, 1n)`
   per word, `BUYS_PER_TX` per transaction as the web does. Blockhash via proxy.
4. Simulate via proxy (`sigVerify: false`, `replaceRecentBlockhash: true`);
   surface the Anchor error string on failure as `sendInstructions` does.
5. In-app confirm sheet (total, words, rent). Sign each transaction with
   Openfort, sequentially, no further prompts.
6. Broadcast each via proxy `sendTransaction`, poll `getSignatureStatuses`
   with `rpcSend`'s indeterminate-timeout semantics. A timeout is "may still
   land", never "failed".
7. On confirmation: `POST /api/paid-majority/record-buys` `{ marketId, wallet, signature, words }`
   with the bearer (so Plus One can award), haptic, invalidate the market
   query, refetch at +4s.

Claim (`createClaimIx`) uses the same path. Payout maths on device with
`payoutBaseUnits` against the decoded snapshot.

**Refunds are deliberately not a mobile flow.** A cancelled market, or a word
marked for refund, is an admin decision taken in the admin tab on
mentioned.market, and the refund is settled from there. The app never builds
`createClaimRefundIx` and never shows a Refund button.

A refunded position still has to read correctly, because it will appear in the
Positions tab. Show it as finished, labelled with the refund amount, and with
no action attached. The failure to avoid is a button that looks tappable and
either does nothing or hands the user an error; saying plainly that the refund
is handled on the website is better than either.

### 7.2 Paid YES/NO (AMM): buy, sell, redeem

1. Snapshot: `GET /api/paid-markets/market/[id]` (raw base64, decode with
   `deserializeMarketAccount`), metadata, chart, trades, `user-word-spend`
   (per-word cap shown on the sheet).
2. Quote: `sharesForUsdc` and `estimateBuyCost` (bigint, ported), same fee and
   max-cost slippage rule as the web. Sell quotes with `estimateSellReturn`
   against held shares read from the YES/NO mint ATAs via the proxy.
3. Build: `createAtaIx` for USDC and for the side's mint (idempotent), then
   `createBuyIx(wallet, marketId, wordIdx, side, shares, maxCost)`. Sell is
   `createSellIx`. Collecting from a resolved market is one action per market,
   as on the web: `buildReclaimPlan` redeems winning shares, burns dead ones
   and closes every token account so the SOL deposits come back.
4. Same simulate → sign → broadcast → poll. Refetch at +4s.

The AMM sheet design is built read-only in v1 (section 4). v4 wires the
builders into it and enables the button. The maths and builders do not change
between the two.

### 7.3 Free YES/NO: one call

1. Load `/api/custom/[id]` and `/positions?wallet=`. Quote with
   `virtualBuyCost` / `virtualSellReturn` / `sharesForTokens`.
2. `POST /api/custom/[id]/trade` `{ word_id, action, side, amount, amount_type, max_cost }`
   with the bearer.
3. Server enforces the 2s per-wallet gap, 30 trades per 5 minutes, lock time,
   and the pool transaction; returns the fill, new balance, `newAchievements`.
4. Show the fill, toast achievements, refetch positions and chart. Map error
   strings (locked, too fast, insufficient balance, too small) to copy.

### 7.4 Free majority: one entry

1. Load `/api/custom/[id]/board?wallet=`.
2. Select exactly `bets_per_user` distinct words: existing by id or new by
   text, validated on device with the ported rules and the market's banned
   list. Submit enables at exactly that count.
3. `POST /api/custom/[id]/entry`. One entry per wallet per market.
4. Board refreshes with the user's words highlighted.

Built with the Discord gate still on. A wallet without a linked, old enough
Discord account gets a plain sentence saying so, with Close rather than Try
again, instead of a hidden button. Whether to retire the gate or keep it is
a v9 decision (section 12).

### 7.5 Positions and results

Positions tab merges `paid-majority/user-positions`, `paid-markets/user-positions`
and `custom/user-activity`, grouped open / resolved, one card per market
showing its position count and total. Tapping a card drops down its positions;
tapping a position, or "Go to market", opens the market. Anything the signed-in
wallet can collect gets a "Ready to claim" card above the list, one per market:
winning majority words are claimed together, and a paid YES/NO market pays
out its winning shares and returns its token-account deposits in one tap. The
same card sits on that market's result screen. A refunded majority position
is shown as finished with its refund amount and no action (section 7.1).
Results screens use `paid-majority/[id]/results`, `paid-markets` history, and
`custom/[id]/results`.

## 8. v5: engagement and polish

- **Push.** BUILT, and verified end to end on staging Sep 14 2026.
  `expo-notifications` with the Firebase config at `google-services.json` in
  the repo root, wired through `android.googleServicesFile` so prebuild copies
  it to `android/app/` and applies the Gradle plugin. The token is the device's
  own FCM token (`getDevicePushTokenAsync`), not an Expo push token, because
  the worker sends through Firebase Admin: no Expo push service in the path and
  no EAS project id. Permission is asked at first sign-in rather than at first
  launch, then `POST /api/notifications/push-token`
  `{ token, platform: 'android', deviceId }`. A tap reads `data.link` and
  routes it through the same mapping the feed uses, falling back to the feed
  itself. The dev screen reports permission and token so a silent failure is
  visible. The web side (route, `push_tokens`, `push_*` settings, worker sender)
  is on `feat/mobile-api-updates`, deployed to staging: real pushes reached the
  Seeker, and a tap opened the right screen.
  Triggers (server side): resolution of any market the wallet traded, new
  market, dev update.
- **Notification settings.** BUILT Sep 14 2026. The three push switches from
  `GET/PUT /api/notifications/settings` (new markets, resolutions, product
  updates), changed optimistically and put back if the server refuses. The
  Discord and Telegram flags on the same route stay hidden. The screen also
  shows the phone's own notification permission, because a switch that is on
  while Android blocks the app delivers nothing.
- **Notification feed.** BUILT Sep 12 2026. `GET /api/notifications` with
  cursor paging, `POST /api/notifications/read`, unread badge from
  `unread-count` on focus (no SSE in the app), `DELETE` to clear. The bell sits
  in the Home header. Opening the feed marks its rows read. A tapped row maps
  the server's website path to an app route (`src/notifications/link.ts`); a
  free market arrives as a slug, so its id and market type are resolved first,
  and anything unrecognised opens nothing rather than the wrong market.
- **Profile.** BUILT Sep 12 2026. Username (`PUT`, shipped early in v4 because
  free markets need a profile row) and emoji (`PATCH`). The emoji picker is the
  achievement list from `GET /api/achievements`: the server only accepts an
  emoji from an achievement this wallet has unlocked, so locked ones are shown
  with what they take. Saving an emoji is untested (section 12). Public
  profiles already exist from v1.
- **Share.** BUILT Sep 12 2026. A result screen offers a card only to a wallet
  that actually has a position in that market, which is also what the server
  enforces. The Android share sheet goes out with the sharer's referral link,
  which unfurls into the website's card image; `POST /api/share/record` then
  unlocks the sharing achievements. Share points need proof of a real post, so
  pasting the X link is a separate step afterwards, never a condition of
  sharing (`/api/paid-markets/share`, `/api/paid-majority/share`). Free markets
  pay tokens, so they never produce a card claiming dollars. Claiming share
  points is untested (section 12).
- **Ranks, AMM sheet design and the polish list** shipped in v1 (section 4);
  deep links are in v8 (section 11). v5 adds only the pieces that need the web
  repo or a session.
- **Mobile config.** App side BUILT Sep 14 2026; the route is still missing on
  the web (handover: `docs/WEB_MOBILE_CONFIG_TASK.md`). `GET /api/mobile/config`
  on launch: `minVersion`, `killSwitch`, `cluster`, `features` (paid trading,
  free trading, seeker perk, onramp). A maintenance screen for the kill switch,
  a forced-update screen below `minVersion`, and the paid and free trade
  buttons disabled when their flag is off. Claims are never disabled: they
  return the user's own money. A 404 or a malformed value means "no rules",
  so a bad config can never lock users out; the last config seen is kept, so a
  kill switch still holds offline.
- **Bug report.** BUILT Sep 12 2026. `POST /api/bug-report` from the You tab,
  300 characters with a counter, attaching build, device, OS, cluster and
  wallet, because the report lands in a Discord channel where nobody can ask a
  follow-up question. Sending one is untested (section 12).

## 9. v6: Arena and referrals

BUILT Sep 14 2026, including team actions. Two website features brought across
so a Seeker user can follow the competition and earn from their referrals
without opening mentioned.market. Viewing is the core of v6 and needs nothing from the web repo:
every route below already exists on `main` and is public. Checked against
`Mentioned-Market/mentioned` `main` on Sep 14 2026.

### 9.1 Arena

**What it is on the website.** A team competition run in seasons. Each season
(`lib/arenas.ts`) is a fixed window with a name, emoji, tagline, display range,
team size, prize pool and prizes by place: Genesis (May 4 to 17, teams of 3,
$750) and World Cup (Jun 26 to Jul 19, teams of 2, $1,000, top 10 paid). A
team's score is the sum of its members' points earned inside the season window.
While a season is live the weekly leaderboard's window becomes the season window
too (`lib/scoringPeriod.ts`), so points "reset" at kickoff.

**Data.**
- Seasons: `lib/arenas.ts` is pure data plus helpers (`CURRENT_ARENA`,
  `arenaStatus`, `prizeForRank`, `resolveArena`) with no server imports. Port it
  byte-identical under the PORTED_FROM rule. The web adds a season by appending
  to that array, so the port goes stale when a season is added: a contract check
  compares `GET /api/teams/leaderboard` (no `arena` param resolves to the current
  season) against the ported `CURRENT_ARENA.slug`, so the daily job says when.
- `GET /api/teams/leaderboard?arena=<slug>` returns `{ data, arena, compStart,
  compEnd }`, each row `{ team_id, team_name, team_slug, member_count,
  weekly_points, all_time_points }`, where `weekly_points` is the season score.
- `GET /api/teams/my-team?wallet=&arena=` returns `{ team }` or `{ team: null }`,
  with the member's `role`. The join code is present only for a captain.
- `GET /api/teams/[slug]?wallet=` returns `{ team, members, weeklyTotal,
  allTimeTotal, compStart, compEnd, arena: { slug, name, emoji, displayRange,
  status } }`, each member carrying `weekly_points` and `all_time_points`. The
  join code is present only when `wallet` is the captain.
- `GET /api/teams/pfp/[slug]` serves the team avatar image.

**Screens.**
1. **Arena.** Reached from a card at the top of the Ranks tab, and from Home
   while a season is live. The current season's hero (emoji, name, tagline,
   dates, and upcoming, live or ended with a countdown), the prize pool and the
   prize table, "How to earn points", the season's team leaderboard, and the
   signed-in wallet's team if it has one. A season switcher shows past seasons
   read-only, as the website does.
2. **Team profile.** A row on the leaderboard or the "your team" card opens it:
   avatar, name, bio, X link, season and all-time totals, and each member with
   their season points. A captain also sees the join code with a share button.

**How to earn points** is the website's copy, reworded where it uses "betting"
(the app never does): paid markets give +100 for holding at least $1 to close,
+150 per $1 of profit, with trades capped at 2 USDC so it rewards being right
rather than staking big; free markets start with 300 play tokens and give half
the token profit as points, capped at 200 per market.

**Ranks tab.** While a season is live the points board is already the season
board, because the server scopes it. Label it "This season" rather than "This
week" whenever `arenaStatus(CURRENT_ARENA)` is `active`.

**Team actions.** Create a team, join one by code, edit the name, bio and X
handle, and change the picture (`POST /api/teams/create`, `POST
/api/teams/join`, `PATCH /api/teams/[slug]`, `POST /api/teams/pfp/[slug]`).
Create and join are offered only in the current season and only before it ends,
as on the website, and both need Discord linked and at least 30 days old. Edits
and the picture are captain-only, and the app checks each field the way the
server does (2 to 30 character names, 300 character bios, an X handle read from
a handle or a profile link, images under 1 MB) so a form never sends something
the server will refuse.

All four routes take `wallet` from the request body and never check the
session, so any caller can act as any wallet. The app sends its own signed-in
wallet, which is all it can do from here; the fix belongs on the website
(section 14) and is worth making regardless.

### 9.2 Referrals

**What it is on the website** (`/referrals`). A referrer earns a cash share of
the house rake their referrals generate (`lib/referral.ts`): 2% of their
majority volume and 20% of their AMM trade fees, computed from indexed trades
and paid out weekly. No points.

**Data.** `GET /api/referral?wallet=` (public; creates the code if the wallet
has none) returns `{ referralCode, referralCount, referredBy, earningsUsd,
referredUsers, bonusPointsEarned }`. Each referred user is `{ wallet, username,
createdAt }`. `bonusPointsEarned` is legacy and not shown. The share card image is
`GET /api/og/referral?code=<code>&v=3`.

**Screen.** Referrals, opened from the You tab (the existing Earnings and
Referrals figures there become a row that opens it):
- **Earned** in USD, all time, with one line on how it is earned and that it is
  paid weekly.
- **Your link**, `https://www.mentioned.market/ref/<code>`, with the card image
  above it and one Share button. The Android share sheet already offers copy,
  X and messaging apps, so the app needs no clipboard module.
- **Your referrals**: username (or short wallet) and when they joined, newest
  first, with an empty state that says to share the link.

Signed out, the screen asks the person to sign in, because the code belongs to a
wallet. Applying a code for a new user is not here: that is the `/ref/[code]`
App Link, captured and sent once at the next sign-in (section 11).

### 9.3 Tests and gate

Schemas for the four team routes and the referral route go into the offline
fixture tests and the daily contract test, with the `CURRENT_ARENA` check above.

Gate (met Sep 14 2026): on a Seeker against staging, the Arena screen renders
the current season and a past one, a team profile, the prize breakdown and the
scoring rules; the Referrals screen shows the earned figure, the card, the link
and the referral list; and the daily contract test parses all four team routes
and the referral route against production.

Comparing the screens with mentioned.market on the production flavour is a v9
check (section 12), not a v6 one: the Referrals screen is sign-in only and the
app cannot hold a production session until the mobile branch is deployed there.
Team actions wait for a live season, also in section 11.

## 10. v7: UI pass

Sep 14 2026. The app worked but every screen carried more than it needed to:
a status pill, a PAID or FREE pill, a MAJORITY pill, a date, a trader count, a
pool figure and a countdown on one card; a YES price and a NO price on every
word; three stat boxes above every board. Bagel, another prediction app, shows
what the same product looks like when each screen answers one question, and
that is the reference for this pass. The rules are in `docs/DESIGN.md`; the
short form:

- **One chance figure.** A word shows one number, the chance it happens: the
  YES price on an AMM market, the pool share on a majority board. The NO price
  is 100 minus it and is not printed. Cents notation is gone from the app.
- **Five tabs.** Home, Markets, Ranks, Arena, Me, in the standard bottom
  bar. Positions are a screen under Home and Me, not a tab. Home shows the
  Arena only while a season is live; the tab is always there.
- **Funding on Me.** The "view as your Seeker wallet" card is gone. The
  portfolio card carries Add funds and Withdraw: a withdrawal is a USDC or
  SOL transfer signed by the app wallet to any address (the Seeker wallet one
  tap away as the destination); a deposit is a transfer the Seeker wallet
  pays for and signs over one MWA session, simulated first like everything
  else. This is section 6.4 without the card on-ramp and without the Seeker
  link, which stay where they were planned.
- **One card shape.** A dark rounded surface on black, no border, no coloured
  outline. Paid and free are told apart by the money unit on the card, not by
  a badge.
- **Full-screen trade sheet.** The word and market in a small header, a large
  amount, the potential return under it, a chance chip and a balance chip,
  four presets, a bare number pad, and a swipe to confirm. Nothing else.
  Buy and sell, and the YES and NO sides, are the same layout.
- **Less chrome everywhere.** No subtitles under screen titles, no section
  counts, no eyebrow labels, no "See all" links except where a list is cut.
  Headers are a title and at most one round icon button.
- **Copy stays.** Every state, warning and error message the app already had
  is kept word for word; only the frame around it changed. Nothing about what
  is signed, sent or simulated changed at all.

Not in v7: any new data, route or trade behaviour. The pass is layout and
presentation, with the pure modules untouched and the tests green.

## 11. v8: store release

- **Keystore.** A new signing key used only for the dApp Store (the store
  rejects APKs signed with a Google Play key). Generated once, stored in the
  team password manager, never in the repo. Its SHA-256 goes into
  `assetlinks.json`.
- **Deep links and App Links.** All of it lands here, because a link that
  opens a chooser is a worse first impression than one that opens the website.
  Intent filters for the paths that exist on the website (checked Sep 14
  2026): `/market/[id]`, `/paidmajority/[id]`, `/free/[slug]`, `/ref/[code]`
  and `/onramp/return`, with `autoVerify`. There is no `/paidmajoritymarket`
  or `/u` page. The host must be `www.mentioned.market`: the apex 301s to
  `www`, and Android does not follow redirects when it verifies
  `assetlinks.json`. Slug to
  id resolution through `paid-majority/metadata` and `custom/by-slug/[slug]`
  behind a resolver route. A `ref` code is held in the store and sent once on
  the next sign-in. `assetlinks.json`, served by the web app for the release
  cert above, is what makes the filters verified rather than a chooser. Push
  taps (v5) deep-link through the same resolver.
- **Flavours** (`eas.json`): `dev` (dev client, staging API, devnet ids),
  `devnet-preview` (release build, staging), `production` (release build,
  mainnet, store keystore). Config per flavour lives in `src/config.ts` keyed
  by `EXPO_PUBLIC_FLAVOR`; still no secrets.
- **Listing.** `@solana-mobile/dapp-store-cli`: publisher NFT and app NFT
  minted from the company wallet, release NFT per submission. Assets: icon
  512×512, banner 1200×600, 5+ screenshots from a Seeker, a 30s listing video,
  privacy policy URL (`mentioned.market/privacy`), age rating 18+, locales
  declared in `build.gradle`. `config.yaml` committed under `dapp-store/`
  without keys.
- **Submission.** Fri Sep 18 (Mon Sep 21 is the hard limit). Review is 3 to 5
  business days by email. The release branch is frozen from submission; only
  review fixes land on it. Every resubmission restarts the clock.
- **Release checklist.** Fresh-install run-through on a Seeker by someone who
  did not build it: sign in, deposit from Seed Vault, one trade of each type,
  one push received, sign out and back in with no dialog. Then the same on a
  Pixel with Phantom and a Samsung with Solflare.
- **Launch Sep 28.** Listing public, announcements out, first live-event
  market opens that evening. Hotfix build ready to submit within 24h. Record
  everything on Seekers for the demo video.

## 12. v9: cleanup and testing (final)

v4 was called done on Sep 11 with every flow built and all four trade types
signed in-app on devnet. Paid majority buy, AMM buy, sell and claim, free
YES/NO buy and sell, and a free majority entry were each run on a Seeker. What
did not fit in v4 is collected here, as the last version: nothing new, only
checks, loose ends and the production run. The rest of v4 is assumed to work.

**Testing still owed**

1. **Majority claim on a Seeker.** Built and unit tested; a four-word claim
   is 770 of 1232 bytes. Needs a resolved majority market on dev: resolve
   "Mobile Test 2 Paid Majority" from the admin tab, then claim from the
   Positions tab and from the result screen.
2. **Preflight states from section 7.1**, audited against the app: "Add $3
   more" style shortfalls, "Market locked 2 min ago", "You're offline", and
   the rent line in the majority cart when a word is new. Build whichever is
   missing.
3. **Volume, traders and cost basis.** All three come from the Helius
   webhook, which dev does not have yet. Once it is set up, confirm the market
   stats fill in and positions stop saying "cost updating".
4. **The v4 gate on production.** One trade of each of the four types,
   signed in-app on the production flavour, each visible on mentioned.market.
   Needs the production cutover (Openfort mobile key, bearer changes deployed).
   Overlaps the release checklist in section 10.
5. **Load check** (section 17) once wallet-keyed rate limits exist.
6. **Profile emoji save** (v5). Nothing is unlocked on the test account, so
   the picker has nothing to save. Share a card (it unlocks First Share), then
   pick the emoji on the You tab and confirm it saves and shows on the
   leaderboard.
7. **Share points claim** (v5). Needs a real X post link and the season
   switched on for the environment. Share a paid market card, paste the post
   link, and confirm the points land once and only once.
8. **Bug report send** (v5). Needs `DISCORD_BUG_REPORT_WEBHOOK_URL` on the
   environment. Send one and confirm it reaches Discord with build, device,
   cluster and wallet attached.
9. **Arena team actions** (v6). Built and checked against the routes, but not
   run on a device: no season was live when they were built (World Cup ended
   Jul 19 2026), so create and join are hidden, and the test wallet captains no
   team, so editing the name, bio and X handle, changing the picture and
   sharing the join code are all out of reach. A season is expected soon: run
   all of them the day it opens, including a second wallet joining by code.
10. **Arena and referrals against production** (v6). On the production flavour,
    compare the Arena screen and a team profile with mentioned.market, and the
    Referrals screen with the website's `/referrals` for the same wallet. The
    referral half needs the production deploy first, because that screen is
    sign-in only.
11. **Mobile config on a real route** (v5). Once the web route exists: flip
   `MOBILE_KILL_SWITCH`, raise `MOBILE_MIN_VERSION` above the installed build,
   and switch each trading flag off, confirming each screen appears and clears.

**Decisions and web changes**

12. **Discord gate on free markets.** Retire it behind the env flag in
   section 14 so web and app flip together, or keep it and leave the app's
   message as it is. The app works either way.
13. **Wallet-keyed rate limits** on authenticated routes and `/api/paid-rpc`
   (section 14). Carrier NAT would otherwise throttle whole networks of phones.

**Cleanup**

14. The per-step progress plumbing (`SendStep`, `onStep`) no longer reaches the
   screen, which only says "Placing trade". Keep it for logging or remove it.
15. `PositionRow.cta` now only ranks finished rows; the actions live on the
   claim cards. Simplify it to a rank if nothing else needs the labels.
16. The devnet scripts (`scripts/try-buy.ts`, `try-majority.ts`, `try-claim.ts`,
    `check-resolved.ts`) are read-only simulators. Keep them documented in
    section 17 or move them under `scripts/dev/`.

17. A market opened from the notification feed shows "Markets" as its back
    label, although Back returns to the feed. Label it by where it came from.

Gate: every item above is either checked on a Seeker or decided, and a fresh
`npm test`, `npm run lint` and `npx tsc --noEmit` are clean.

## 13. Stretch (v8.1, separate branch)

In priority order. Anything green on both Seekers by Sep 25 goes into a 1.1
submission that day; otherwise the post-launch update.

1. **Seeker holder perk.** `seeker_verified_at` holders get one sponsored $1
   majority pick into the app wallet via `POST /api/seeker/free-pick`
   (reuses `buildSponsoredPickTx`, budget-capped like the event pass).
2. **Share sheet polish** and share-points flow on every result screen.
3. **Price alerts UI** on free YES/NO words (API exists), delivered as push.
4. **Home-screen widget** (Kotlin AppWidget via an Expo config plugin) showing
   the user's best-ranked open pick from `GET /api/mobile/widget`.
5. **Gas in USDC via Kora** (`specs/openfort_usdc_gas_plan.md`, not built)
   so card-funded wallets with zero SOL can trade.
6. **Passkey recovery** as an upgrade from automatic recovery.
7. **Live mentions** (unlikely): a Live panel fed by a public SSE route, plus
   a "your word was just said" push. Parked.

## 14. Web repo dependencies

All in the existing Railway services; no new service.

**Status Sep 10 2026.** PR #159 (`feat/openfort-privy-routing`) is merged to
`main`, so `type: 'openfort'` sign-in, the encryption-session route, the signer
and the card on-ramp all exist. None of the four mobile-specific changes below
have been started, and the merged specs do not mention mobile. Three of them
are small; the first is the one that matters, because every authenticated route
goes through it.

| Change | Where | What | Needed by |
|---|---|---|---|
| ~~Land the Openfort branches~~ | merged as PR #159 | DONE. `type: 'openfort'` sign-in, `/api/openfort/encryption-session` (409 `LEGACY_PRIVY_ACCOUNT`, accessToken in body, no browser assumptions), `lib/openfortSolanaSigner.ts` and its test, `/api/onramp/quote` and `/session`. Gated on `NEXT_PUBLIC_OPENFORT_CUTOVER_AT` | v3 |
| **Bearer sessions** | `lib/walletAuth.ts:402` | `getVerifiedWallet` is cookie-only today (`req.cookies.get('session')`). Read `Authorization: Bearer` first, fall back to the cookie, same `verifySessionToken`. Four lines. This one change unlocks every authenticated route at once, including the on-ramp, which already 401s a mobile caller | v3 |
| **Mobile sign-in additions** | `app/api/auth/sign-in` | The route mints `sessionToken` and sets it only as an httpOnly cookie, and reads `ref` only from a cookie. Return the token in the JSON body when `client === 'mobile'`, and accept `ref` in the body. The app has no cookie jar to rely on | v3 |
| **Seeker wallet link** | `app/api/seeker/link`, `lib/seekerLink.ts` | Does not exist; there is no `app/api/seeker` directory. Nonce, verify MWA-signed message, store `seeker_wallet`, DAS check, `seeker_verified_at` | v3 |
| Retire the Discord gate | `lib/db.ts` (`assertDiscordTradingEligible`, `insertPointEvent`), free trade + entry routes | Behind an env flag so web and app flip together. Keep the lock check and rate limits. Watch Sybil pressure on free points | v9 |
| Wallet-keyed rate limits | `lib/rateLimit.ts`, `/api/paid-rpc` | Carrier NAT puts thousands of phones behind one IP. Key authenticated calls on the wallet; the proxy on the wallet when a bearer is present, IP otherwise | v9 |
| Push channel | `scripts/migrate.ts`, `lib/notifications.ts`, `services/notification-worker` | `push_tokens` table, `notification_settings.push_*`, `push` outbox rows, worker `push.ts` with Firebase Admin (`FCM_SERVICE_ACCOUNT_JSON`), remove tokens on `UNREGISTERED`. Delivery gate applies. Change both copies of delivery logic | v5 |
| Mobile config | `app/api/mobile/config` | Static JSON from env: `minVersion`, `killSwitch`, `cluster`, `features`. Handover with the exact route: `docs/WEB_MOBILE_CONFIG_TASK.md` | v5 |
| Verified wallets on team routes | `app/api/teams/create`, `join`, `[slug]` (PATCH), `pfp/[slug]` (POST) | All four trust `wallet` from the body; switch to `getVerifiedWallet` like every other write route. A security fix on the website regardless, and required before the app offers team actions | v6 (team actions only) |
| App Links | `public/.well-known/assetlinks.json` | Package name + release cert SHA-256 | v8 |
| Seeker perk | `app/api/seeker/free-pick`, `lib/seekerPerk.ts` | Requires `seeker_verified_at`; one row per (wallet, cluster); budget cap | v8.1 |
| Widget endpoint | `app/api/mobile/widget` | User's best-ranked open pick, cached 15s | v8.1 |

Env: `FCM_SERVICE_ACCOUNT_JSON` on the worker; nothing new in the app.

## 15. API contract

Public reads (no session):

| Route | Used for |
|---|---|
| `GET /api/paid-majority/list` | Markets tab |
| `GET /api/paid-majority/market/[id]` | Board: raw base64 account, board, hash→word map, vault |
| `GET /api/paid-majority/metadata` | Slug → id |
| `GET /api/paid-majority/recent-bets` | Picks feed on the board |
| `GET /api/paid-majority/my-positions?id=&wallet=` | Positions per market |
| `GET /api/paid-majority/user-positions`, `user-pnl` | Positions tab, P/L |
| `GET /api/paid-majority/[id]/results` | Result screen |
| `GET /api/paid-markets/list` | Markets tab (AMM) |
| `GET /api/paid-markets/market/[id]`, `metadata?id=` | AMM sheet |
| `GET /api/paid-markets/chart?id=`, `trades?id=` | AMM chart and feed |
| `GET /api/paid-markets/user-positions`, `user-history`, `user-pnl`, `user-word-spend`, `wallet-summary` | Positions, P/L, per-word cap |
| `GET /api/custom` | Free markets (both shapes) |
| `GET /api/custom/by-slug/[slug]` | Slug → id |
| `GET /api/custom/[id]`, `/positions?wallet=`, `/chart`, `/trades`, `/results`, `/sentiment` | Free YES/NO |
| `GET /api/custom/[id]/board?wallet=` | Free majority |
| `GET /api/custom/user-activity?wallet=` | Positions tab (free) |
| `GET /api/profile?wallet=`, `/api/profile/[username]` | You, public profiles |
| `GET /api/polymarket/leaderboard/points?sort=weekly` | Ranks (legacy path, current data) |
| `GET /api/prize-pool`, `/api/raffle/tickets` | Prize pool |
| `GET /api/search?q=` | Search |
| `POST /api/paid-rpc` | Blockhash, simulate, send, status, balances (allowlisted methods) |
| `GET /api/mobile/config` | Launch config (new) |

Session required (bearer):

| Route | Used for |
|---|---|
| `POST /api/auth/sign-in` | `type: 'openfort'`, mobile body token |
| `POST /api/auth/sign-out` | Sign out |
| `POST /api/openfort/encryption-session` | Shield session (called by the SDK) |
| `POST /api/paid-majority/record-buys` | After each confirmed majority buy |
| `POST /api/custom/[id]/trade`, `/entry` | Free trades and entries |
| `PUT` / `PATCH /api/profile` | Username, PFP |
| `GET /api/notifications`, `unread-count`, `POST read`, `GET/PUT settings` | Feed and settings |
| `POST /api/notifications/push-token` | FCM token (new) |
| `POST /api/seeker/link` | Seed Vault address proof (new) |
| `POST /api/onramp/quote`, `/session` | Card on-ramp (branch) |
| `POST /api/paid-majority/share`, `/api/paid-markets/share` | Share points |
| `POST /api/seeker/free-pick` | Seeker perk (new, stretch) |
| `POST /api/bug-report`, `/api/feedback` | In-app reports |

## 16. Repo layout

```
mentioned-mobile/
├── app/
│   ├── _layout.tsx             providers: query, Openfort, notifications, theme
│   ├── (tabs)/                 index (Markets) · positions · ranks · you
│   ├── paid/[id].tsx           AMM trade sheet + chart
│   ├── majority/[id].tsx       paid majority board + cart
│   ├── free/[id].tsx           free YES/NO sheet
│   ├── free-majority/[id].tsx  free majority board + entry
│   ├── result/[type]/[id].tsx
│   ├── u/[username].tsx
│   ├── fund.tsx                Seeker deposit · card on-ramp · withdraw
│   ├── notifications.tsx  notifications/settings.tsx
│   └── auth/callback.tsx       Openfort OAuth return
├── src/
│   ├── api/                    typed client, one fn per route, zod schemas
│   ├── auth/                   Openfort provider, wallet create/recover, signer.ts (+ test), session store
│   ├── chain/                  ported amm.ts, majority.ts, majorityWords.ts, rpcSend.ts, fetchRetry.ts, mwa.ts
│   ├── free/                   ported lmsr.ts, marketUtils.ts
│   ├── funding/                MWA deposit, withdraw, Seeker link
│   ├── push/                   FCM registration, deep-link routing
│   ├── ui/                     board, trade sheet (shared paid/free), cart, toasts, states
│   ├── store/                  zustand: session, wallet, viewed address
│   └── config.ts               per-flavour constants, no secrets
├── polyfill.js  index.js
├── android/                    generated, committed; widget module later
├── dapp-store/                 config.yaml, icon, banner, screenshots
├── eas.json                    dev · devnet-preview · production
└── docs/                       V0_GUIDE.md · SPEC.md
```

Stack: Expo (current SDK, dev client), expo-router, TypeScript, `@solana/kit`,
`@noble/hashes`, `react-native-quick-crypto`, `@openfort/react-native` plus its
peers (`expo-secure-store`, `expo-crypto`, `expo-web-browser`, `expo-linking`,
`expo-application`, `react-native-webview`, `react-native-get-random-values`)
and the Metro shim for `jose` its docs require, `@solana-mobile/mobile-wallet-adapter-protocol-kit`
for the Seed Vault bridge only, TanStack Query, zustand, zod,
`expo-notifications`, `expo-haptics`, `@react-native-community/netinfo`,
NativeWind for styling.

## 17. Testing

- **Device first.** Every gate is checked on a Seeker with the Seed Vault
  wallet. One Seeker on the devnet flavour for development, one on production
  for release and store-review reproduction. Emulators and the Mock MWA wallet
  are for unit-level work only.
- **Second device class.** Any Android phone with Phantom or Solflare, to
  confirm login and trading work with no MWA wallet and that the Fund sheet
  degrades correctly.
- **Unit tests** (Jest, `npm test`): offline against `test/fixtures/`, real
  production responses frozen by `npm run fixtures`. Cover the AMM and LMSR
  quote maths, the deserializers, on-chain word identity and PDA derivation,
  pari-mutuel payouts, word validation, list merging and sorting, position
  grouping, formatting, time helpers, the broadcast and retry paths, error
  copy, and every `src/api` schema. The Openfort signer test joins them in v3.
  Run on every push (`.github/workflows/test.yml`). UI components are checked
  on a Seeker, not here.
- **Contract tests**: every `src/api` schema parsed against a live response in
  CI once a day (`.github/workflows/contract.yml`, 07:00 UTC), so a web change
  that breaks the shipped app is caught before users are. A failure opens an
  issue labelled `contract-failure` rather than a silent red check; the same
  job closes it when the contract is green again. No secrets: every route
  under test is public.
- **Load check** before launch: 50 simulated wallets from one IP against
  staging to confirm the wallet-keyed rate limits.
- **Release run-through** as in section 11 by someone who did not build it.

## 18. Risks

| Risk | Mitigation |
|---|---|
| Eligibility: the web product predates the 3-month window | New repo with a visible history from Sep 8; a deck slide listing the mobile-only engineering; the question sent to the organisers in writing |
| Openfort-only login versus "integrate MWA" | MWA is the funding and identity bridge, made unmissable: Fund sheet on first launch, Seed Vault approval in the first 30s of the video, Seeker badge. Confirm the reading with organisers; if they insist on MWA sign-in, that is a product decision, not a lane decision |
| Openfort branches are owned by another lane | v1 (section 4) needs nothing from them, so the mobile lane stays busy until Sep 13 regardless. If staging is not usable by Sep 13, the mobile lane rebases the branches itself |
| Legacy Privy users are blocked in the app | Clear message pointing at the website; count active ones before launch |
| RN Openfort Solana signing parity | v3 day-one memo spike; the signer hard-asserts 64 bytes |
| Embedded wallet with no SOL | Seed Vault deposit always carries a SOL reserve; Kora is stretch |
| Free markets depend on the Discord gate | The app already explains the gate to anyone it blocks; retiring it is a v9 decision (section 12) |
| dApp Store policy on real-money prediction markets | Read the current policy before writing store code; the config kill switch can hide paid trading for a store flavour; age rating 18+ regardless |
| Carrier NAT versus per-IP limits | Wallet-keyed limits; load check before launch |
| App killed during the MWA deposit | Persist pending state before `transact()`, resume on foreground, 120s timeout |
| Store review timing | Submit Sep 18 if v3 started early, Sep 21 at the latest; frozen release branch; review fixes only. Sep 21 leaves no slack for a resubmission before Sep 28 |
| Four market types in ten days | Two screen types cover all four and are designed read-only in v1, so v4 is builders and confirm sheets only; never cut |

## 19. Open questions

1. Organisers: eligibility of an existing product with a new native client, and
   whether MWA as funding/identity satisfies the MWA requirement.
2. Current dApp Store publisher policy on prediction markets and the required
   age rating.
3. Openfort: mainnet keys and Shield keys for the mobile identity; whether the
   RN SDK needs its own Openfort project or shares the web one (the
   encryption-session route must accept tokens from whichever it is).
4. Seeker Genesis Token collection address for the DAS check.
5. Which company wallet mints the publisher NFT; who holds the store keystore.
6. Firebase project ownership and where the FCM service account lives in
   Railway.
