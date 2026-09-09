# Mentioned Mobile: specification

Native Android app for Mentioned, built for the Solana Mobile CLOCK IN
hackathon (Sep 8 to Oct 8 2026) and shipped for real on the Solana dApp Store
on Sep 28. This document is the plan for everything after v0 (`V0_GUIDE.md`).
It is written to live in this repo; the web-side changes it depends on are
listed in section 9 and tracked in the `mentioned` repo.

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
| Paid majority | Pari-mutuel, on-chain (`mention-majority-market`), $1 flat per word, unlimited words, coin your own | In-app Openfort signature, broadcast through the RPC proxy. Claim and refund on-chain | Signed in |
| Free majority | Pari-mutuel, play tokens, one entry of exactly `bets_per_user` equal bets on distinct words | `POST /api/custom/[id]/entry` | Signed in (Discord gate retired, section 9) |
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
| **v0** | Read-only everything, MWA "view as" | nothing | Sep 10 |
| **v1** | Openfort login, bearer sessions, Seed Vault deposit/withdraw, Seeker link | Openfort branches on staging; bearer + mobile token; seeker link route | Sep 12 |
| **v2** | All four trade flows, positions with claim/redeem/refund, results screens | Discord gate off (free markets) | Sep 15 |
| **v3** | Push, notification feed + settings, profile edit, App Links, share, hand-designed AMM sheet, polish | push channel; assetlinks.json | Sep 17 |
| **v4** | Release build, dApp Store submission | production deploy of all of the above (Sep 16) | Sep 18 submit, Sep 28 live |
| **v4.1** | Stretch: Seeker perk, widget, price alerts, Kora gas | perk route | Sep 25 if green |

Gates (checked on a Seeker, not an emulator):

- **Sep 10:** sign in with Google, get an Openfort wallet with no seed phrase,
  browse every production market. (v0 + first v1 slice)
- **Sep 15:** fund the app wallet from the Seed Vault via MWA, then one real
  trade of each of the four types signed in-app, all visible on mentioned.market.
- **Sep 18:** release APK in the store review queue; a new user can sign in,
  fund from their Seeker, trade any market type, and get a push, unaided.
- **Sep 25:** store approval received; launch markets scheduled.
- **Sep 28:** a stranger installs from the store and makes a pick.
- **Oct 6:** hackathon entry submitted with real usage numbers.

Order inside each version: on-chain flows first (they carry the risk), free
markets second (cheap REST calls), AMM polish last (the maths never changes).
A slipping gate cuts stretch, never the gate.

## 4. v1: auth, sessions, funding

### 4.1 Openfort login

Server side already exists on `feat/openfort-privy-routing` in the web repo:

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
  to `src/auth/signer.ts` with its test.

Mobile flow:

1. `OpenfortProvider` at the root with `publishableKey`, `walletConfig.shieldPublishableKey`
   and `walletConfig.createEncryptedSessionEndpoint = API_BASE + '/api/openfort/encryption-session'`.
   Auth hooks: `useOAuth` (Google, X), `useEmailAuthOtp`. OAuth returns on the
   `mentioned://` scheme via `expo-web-browser`.
2. After auth, `useEmbeddedSolanaWallet`: list SVM accounts; recover the
   existing one, else create with `RecoveryMethod.AUTOMATIC`. Mirror
   `ensureOpenfortSolanaWallet()` on the web branch, including the
   retry-once-before-create guard so a returning user never gets a second empty
   wallet.
3. A 409 from the encryption-session route means a legacy Privy identity. Show
   "Your account is being upgraded. Use mentioned.market for now." and stop.
   There is no Privy path in the app.
4. `POST /api/auth/sign-in` `{ type: 'openfort', token, wallet, client: 'mobile', ref }`.
   With `client: 'mobile'` the session token is returned in the JSON body
   (web change, section 9). Store it in `expo-secure-store`.
5. Every request sends `Authorization: Bearer <token>`. Cookies are not relied
   on. On 401, or at 6 days, repeat step 4 silently with a fresh Openfort access
   token.
6. Sign out: `POST /api/auth/sign-out`, the SDK's logout, clear the store.

Referral: the app has no cookie, so a `ref` code captured from an App Link
(`mentioned.market/ref/<code>`) is held in the store and sent in the sign-in
body once.

### 4.2 Signing

Signing is one function, `signTransaction(txBytes): Promise<Uint8Array>`, in
`src/auth/signer.ts`, backed by the RN SDK's Solana provider. Port exactly the
web contract: fully compiled wire transaction with an empty signature slot in,
the same transaction with our signature placed by kit's codec out. The RN
provider's `signTransaction({ messageBytes })` returns base58; decode, trim a
65th recovery byte if present, assert 64 bytes. Broadcast is never the signer's
job.

Day-one check for v1: sign a memo transaction on a Seeker and broadcast it
through the proxy before writing any trade UI.

### 4.3 Funding: the Seed Vault bridge (MWA)

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

### 4.4 Seeker link

`POST /api/seeker/link` (web, section 9): the app requests a nonce, signs it
with MWA `signMessages` from the Seed Vault address, posts address + signature.
Server verifies, stores `seeker_wallet` on the profile, runs the Seeker Genesis
Token check via Helius DAS, sets `seeker_verified_at`. Profile shows a Seeker
badge. This runs automatically after the first successful deposit and is also
offered on the You tab.

## 5. v2: trading

### 5.1 Paid majority: buy, claim, refund

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

Claim (`createClaimIx`) and refund (`createClaimRefundIx`) use the same path.
Payout maths on device with `payoutBaseUnits` against the decoded snapshot.

### 5.2 Paid YES/NO (AMM): buy, sell, redeem

1. Snapshot: `GET /api/paid-markets/market/[id]` (raw base64, decode with
   `deserializeMarketAccount`), metadata, chart, trades, `user-word-spend`
   (per-word cap shown on the sheet).
2. Quote: `sharesForUsdc` and `estimateBuyCost` (bigint, ported), same fee and
   max-cost slippage rule as the web. Sell quotes with `estimateSellReturn`
   against held shares read from the YES/NO mint ATAs via the proxy.
3. Build: `createAtaIx` for USDC and for the side's mint (idempotent), then
   `createBuyIx(wallet, marketId, wordIdx, side, shares, maxCost)`. Sell is
   `createSellIx`, redeem on a resolved word is `createRedeemIx`, closing empty
   token accounts uses `buildReclaimPlan` so users get rent back.
4. Same simulate → sign → broadcast → poll. Refetch at +4s.

The AMM sheet is two-stage: v2 ships a plain, correct sheet (word, side,
amount, quote, button); v3 replaces the visual design by hand. The maths and
builders do not change between the two.

### 5.3 Free YES/NO: one call

1. Load `/api/custom/[id]` and `/positions?wallet=`. Quote with
   `virtualBuyCost` / `virtualSellReturn` / `sharesForTokens`.
2. `POST /api/custom/[id]/trade` `{ word_id, action, side, amount, amount_type, max_cost }`
   with the bearer.
3. Server enforces the 2s per-wallet gap, 30 trades per 5 minutes, lock time,
   and the pool transaction; returns the fill, new balance, `newAchievements`.
4. Show the fill, toast achievements, refetch positions and chart. Map error
   strings (locked, too fast, insufficient balance, too small) to copy.

### 5.4 Free majority: one entry

1. Load `/api/custom/[id]/board?wallet=`.
2. Select exactly `bets_per_user` distinct words: existing by id or new by
   text, validated on device with the ported rules and the market's banned
   list. Submit enables at exactly that count.
3. `POST /api/custom/[id]/entry`. One entry per wallet per market.
4. Board refreshes with the user's words highlighted.

Free markets stay read-only in the app until the Discord gate is off in
production (section 9); the mobile config flag hides free trading, not free
browsing, so the app never shows a button that 403s.

### 5.5 Positions and results

Positions tab merges `paid-majority/user-positions`, `paid-markets/user-positions`
and `custom/user-activity`, grouped open / resolved, with the right CTA per
row: Claim, Refund, Redeem, Reclaim rent, or View result. Results screens use
`paid-majority/[id]/results`, `paid-markets` history, and `custom/[id]/results`.

## 6. v3: engagement and polish

- **Push.** FCM via `expo-notifications`. Register on sign-in and on token
  refresh: `POST /api/notifications/push-token` `{ token, platform: 'android', deviceId }`.
  Triggers (server side): resolution of any market the wallet traded, new
  market, dev update. Tap deep-links to the market. Settings screen exposes the
  push toggles from `GET/PUT /api/notifications/settings`; Discord and Telegram
  rows are hidden in the app.
- **Notification feed.** `GET /api/notifications` with cursor paging,
  `POST /api/notifications/read`, unread badge from `unread-count` on focus
  (no SSE in the app).
- **Profile.** `PUT`/`PATCH /api/profile` for username and emoji PFP; toast
  `newAchievements`. Public profiles at `app/u/[username].tsx`.
- **Ranks.** Weekly points board, prize pool with week arrows (`?week=`),
  raffle tickets.
- **App Links.** `assetlinks.json` served by the web app for the release
  signing cert. Intent filters for `mentioned.market/paidmajoritymarket/*`,
  `/market/*`, `/free/*`, `/ref/*`, `/onramp/return`. Resolve slugs via
  `paid-majority/metadata` and `custom/by-slug/[slug]`.
- **Share.** Result screens open the Android share sheet with the existing
  share image URL; `POST /api/paid-majority/share` and `/api/paid-markets/share`
  for the tweet-proof points flow.
- **AMM sheet design pass.** Word strip, YES/NO price pair, amount pad, quote,
  chart. Hand-built with the Seeker in hand.
- **Polish list.** Skeletons, error states with retry, empty states with a next
  action, offline banner (`netinfo`), haptics on confirm, reduced-motion
  respect, keyboard-safe sheets, no horizontal scroll, body text ≥ 14, tabular
  numerals on money.
- **Mobile config.** `GET /api/mobile/config` on launch: `minVersion`,
  `killSwitch`, `cluster`, `features` (paid trading, free trading, seeker
  perk, onramp). A forced-update screen when below `minVersion`.
- **Bug report.** `POST /api/bug-report` with `platform`, app version, device.

## 7. v4: store release

- **Keystore.** A new signing key used only for the dApp Store (the store
  rejects APKs signed with a Google Play key). Generated once, stored in the
  team password manager, never in the repo. Its SHA-256 goes into
  `assetlinks.json`.
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

## 8. Stretch (v4.1, separate branch)

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

## 9. Web repo dependencies

All in the existing Railway services; no new service. The mobile lane is
blocked on the first three.

| Change | Where | What | Needed by |
|---|---|---|---|
| Land the Openfort branches | `feat/openfort-wallet`, `feat/openfort-privy-routing` | Already scheduled: staging Sep 9, production Sep 16, Privy allowlist first then `OPENFORT_CUTOVER_AT`. Brings `type: 'openfort'` sign-in, encryption-session, on-ramp routes | v1 |
| Bearer sessions | `lib/walletAuth.ts` | `getVerifiedWallet` reads `Authorization: Bearer` before the cookie. Same token, same verifier, same expiry. Covers every authenticated route | v1 |
| Mobile sign-in additions | `app/api/auth/sign-in` | Return `sessionToken` in the body when `client === 'mobile'`; accept `ref` in the body | v1 |
| Seeker wallet link | `app/api/seeker/link`, `lib/seekerLink.ts` | Nonce, verify MWA-signed message, store `seeker_wallet`, DAS check, `seeker_verified_at` | v1 |
| Retire the Discord gate | `lib/db.ts` (`assertDiscordTradingEligible`, `insertPointEvent`), free trade + entry routes | Behind an env flag so web and app flip together. Keep the lock check and rate limits. Watch Sybil pressure on free points | v2 |
| Wallet-keyed rate limits | `lib/rateLimit.ts`, `/api/paid-rpc` | Carrier NAT puts thousands of phones behind one IP. Key authenticated calls on the wallet; the proxy on the wallet when a bearer is present, IP otherwise | v2 |
| Push channel | `scripts/migrate.ts`, `lib/notifications.ts`, `services/notification-worker` | `push_tokens` table, `notification_settings.push_*`, `push` outbox rows, worker `push.ts` with Firebase Admin (`FCM_SERVICE_ACCOUNT_JSON`), remove tokens on `UNREGISTERED`. Delivery gate applies. Change both copies of delivery logic | v3 |
| Mobile config | `app/api/mobile/config` | Static JSON from env: `minVersion`, `killSwitch`, `cluster`, `features` | v3 |
| App Links | `public/.well-known/assetlinks.json` | Package name + release cert SHA-256 | v3 |
| Seeker perk | `app/api/seeker/free-pick`, `lib/seekerPerk.ts` | Requires `seeker_verified_at`; one row per (wallet, cluster); budget cap | v4.1 |
| Widget endpoint | `app/api/mobile/widget` | User's best-ranked open pick, cached 15s | v4.1 |

Env: `FCM_SERVICE_ACCOUNT_JSON` on the worker; nothing new in the app.

## 10. API contract

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

## 11. Repo layout

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

## 12. Testing

- **Device first.** Every gate is checked on a Seeker with the Seed Vault
  wallet. One Seeker on the devnet flavour for development, one on production
  for release and store-review reproduction. Emulators and the Mock MWA wallet
  are for unit-level work only.
- **Second device class.** Any Android phone with Phantom or Solflare, to
  confirm login and trading work with no MWA wallet and that the Fund sheet
  degrades correctly.
- **Unit tests** (Jest): the signer (ported test), quote functions against
  fixtures captured from the website, deserializers against captured account
  bytes, word validation, list merging.
- **Contract tests**: every `src/api` schema parsed against a live response in
  CI once a day, so a web change that breaks the shipped app is caught before
  users are.
- **Load check** before launch: 50 simulated wallets from one IP against
  staging to confirm the wallet-keyed rate limits.
- **Release run-through** as in section 7 by someone who did not build it.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Eligibility: the web product predates the 3-month window | New repo with a visible history from Sep 8; a deck slide listing the mobile-only engineering; the question sent to the organisers in writing |
| Openfort-only login versus "integrate MWA" | MWA is the funding and identity bridge, made unmissable: Fund sheet on first launch, Seed Vault approval in the first 30s of the video, Seeker badge. Confirm the reading with organisers; if they insist on MWA sign-in, that is a product decision, not a lane decision |
| Openfort branches are owned by another lane | Dated in the fall plan (staging Sep 9, prod Sep 16). If Sep 9 slips, the mobile lane rebases them itself |
| Legacy Privy users are blocked in the app | Clear message pointing at the website; count active ones before launch |
| RN Openfort Solana signing parity | v1 day-one memo spike; the signer hard-asserts 64 bytes |
| Embedded wallet with no SOL | Seed Vault deposit always carries a SOL reserve; Kora is stretch |
| Free markets depend on the Discord gate retiring | Ship it in the Sep 16 release; the config flag hides free trading until then |
| dApp Store policy on real-money prediction markets | Read the current policy before writing store code; the config kill switch can hide paid trading for a store flavour; age rating 18+ regardless |
| Carrier NAT versus per-IP limits | Wallet-keyed limits; load check before launch |
| App killed during the MWA deposit | Persist pending state before `transact()`, resume on foreground, 120s timeout |
| Store review timing | Submit Sep 18; frozen release branch; review fixes only |
| Four market types in ten days | Two screen types cover all four; AMM ships plain if sprint 2 slips and gets its design in 1.1; never cut |

## 14. Open questions

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
