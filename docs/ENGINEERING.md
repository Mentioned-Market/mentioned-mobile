# Engineering notes

What was built, in what order, and the problems that shaped it. The commit
history is organised by version rather than by change, so this document is
where the reasoning lives. Everything below points at the file that holds it.

## Build order

Written for the CLOCK IN hackathon (Sep 8 to Oct 8 2026), starting Sep 9 2026.
Line counts are source and tests, excluding the lockfile, `android/`, captured
fixtures and assets.

| Version | Landed | Lines | What it did |
|---|---|---|---|
| v0 skeleton | Sep 9 | 1.4k | Expo dev client running on a real Seeker, the crypto polyfill, the Mobile Wallet Adapter bridge, a launch-time check that the runtime has what the ported SDKs need |
| v1 read-only | Sep 9 | 7.5k | Every read route typed and schema-checked, market decoding, the merged markets list, profiles, leaderboard, all four market kinds on screen |
| v2 home and APK | Sep 9 | 0.7k | Home tab, and the first installable APK off the device build |
| test suite | Sep 10 | 1.9k | Offline fixtures, the unit suite, the daily contract test, CI |
| v3 Openfort login | Sep 10 | 1.4k | Embedded wallet sign-in, the Shield encryption session, the session exchange with the website |
| UI pass | Sep 10 | 1.6k | Theme, shared components, states, the visual pass over every screen |
| v4 trading | Sep 11 | 4.3k | The whole chain path: plan, simulate, sign, broadcast, confirm; buys, sells, claims, the spending cap, progress and error states |
| v5 engagement | Sep 12 to 14 | 2.5k | Notification feed and bell, push registration, deep links, emoji picker, sharing, bug reports, the staging flavour |
| v6 Arena | Sep 14 | 1.8k | Arena team competition, team profiles, referrals |
| v8 production, v9 prep | Sep 15 to 16 | | Production build on a Seeker with the first mainnet trade; sign-out, wallet recovery and cold-start reconnect fixes; balances at confirmed commitment; release signing from a gitignored `keystore.properties`, App Links for the website's five paths with redirect routes and slug resolution, referral capture at sign-in, the flavour-safe release script, the portal-based store submission (`dapp-store/README.md`) |
| v7 UI pass | Sep 14 to 15 | see `git diff --stat` | Every screen re-laid out to one system (`docs/DESIGN.md`): five tabs, one card shape, one chance figure per word, the trade sheet as a full screen with a swipe to confirm; deposit over MWA and withdraw from the app wallet (`src/trade/transfer.ts`, `src/ui/fund-sheet.tsx`) |

Two supporting documents went to the web repo as part of this work:
`docs/WEB_PUSH_TASK.md` and `docs/WEB_MOBILE_CONFIG_TASK.md` specify the
server-side halves that the app is already built against.

## The problems worth knowing about

### Hermes has no `crypto.subtle`

`@solana/kit` derives program addresses with `crypto.subtle.digest('SHA-256')`,
which the React Native engine does not provide. `polyfill.js` installs
`react-native-quick-crypto` and is imported by `index.js` before anything else,
because an import of a Solana module before the polyfill runs fails at PDA
derivation rather than at import, which is much harder to read. `src/lib/polyfill-check.ts`
verifies the runtime on device at first launch in development, so a missing
piece is named at startup rather than in a trade.

### Openfort on React Native signs different bytes than on the web

The web signs by handing `signMessage` a raw `Uint8Array`. On React Native that
is silently wrong: the SDK talks to its embedded wallet across a WebView, and
`postMessage` carries only strings, so a `Uint8Array` serialises to
`{"0":1,"1":2,...}` and the signature is over the wrong bytes. There is no
error; the transaction is simply rejected by the network later.

The fix is in `src/trade/openfort-signer.ts`: go through the SDK's own
`signTransaction`, which wraps the bytes as `{ type: 'Buffer', data: [...] }`
before they cross the bridge, so the bridge encoding is the SDK's problem and
the signature covers the bytes we meant. The rule that came out of it, written
at the top of that file: never call `signMessage` directly from this app.

### The signature is placed by the codec, never spliced

`src/auth/signer.ts` decodes the compiled transaction with kit's own codec,
signs the canonical `messageBytes`, puts the 64 signature bytes in the
signatures map keyed by address, and re-encodes. Nothing writes at a
compact-u16 offset by hand.

It refuses two things loudly rather than broadcasting something unverifiable: a
signer that is not a required signer of this transaction, and a returned
signature that is not exactly 64 bytes. The module is a pure function of an
injected signer, so `test/auth/signer.test.ts` exercises it with a local
Ed25519 keypair and no Openfort credentials at all.

### Simulate before signing, not after

`src/trade/send.ts` orders the path deliberately: build, simulate, sign,
broadcast, confirm. Simulation needs no signature, so a malformed instruction,
a locked market or a balance that is short is caught and named before the user
is asked to approve anything and before a fee is spent.

Anchor puts the human-readable reason in the program logs rather than in the
error code, so the logs are mined for it. "Add $3 more" is a better failure
than `{"InstructionError":[0,{"Custom":6002}]}`.

### A timeout is not a failure

`confirmSignature` throws `ConfirmationTimeoutError`, and
`src/trade/use-trade.ts` turns that into an `indeterminate` state whose message
is "still confirming, check your positions in a moment". Calling it a failure
would invite someone to pay for the same trade twice.

The same reasoning covers retries. Re-broadcasting signed bytes is idempotent
by signature, so `sendViaProxy` retries a transient proxy failure. A POST to
the website is not idempotent, so `src/api/client.ts` never retries one, not
even on a 429: the server answers 429 for exactly the case where going again
would be wrong.

### A basket is several transactions

A majority basket buys each word independently, and a fourth buy overruns the
transaction size limit, so `src/trade/majority.ts` returns batches of three.
That makes partial success a real state. `runBatches` in `src/trade/use-trade.ts`
holds one "working" state across the batches so the progress view does not
flash a completion between them, and a failure part way through says how many
already went through, so a retry does not repeat them.

### The spending cap has a counting problem

While paid markets are in early testing the website allows at most $2 of net
spend on any one word and side. Nothing on chain enforces it: the program
accepted a $293 buy from this app before `src/trade/spend.ts` existed. So the
app enforces the same limit the same way, or a mobile user could do what a web
user cannot.

The subtlety is counting. The server figure comes from the indexer, which
trails the chain by seconds on production and indefinitely on a dev deployment
with no webhook, so this session's own trades are tracked locally and added to
it. Net spend is buys minus sells rather than value held, so price drift cannot
open room under the cap and selling re-opens it by design.

### Flavours move as a set

Pointing the app at devnet data while decoding mainnet accounts fails in
confusing ways, so `src/config.ts` moves the API base, cluster, program ids and
mint together, and an unknown value resolves to production rather than to a
half-configured environment. `test/config.test.ts` pins both halves of that.

Two traps came with it. Metro inlines `EXPO_PUBLIC_FLAVOR` and caches it, so a
production build made straight after a devnet build silently carries devnet
config; the bundle scripts pass `--clear`, and every launch logs the flavour
while non-production builds show it as a pill on Home. And the on-disk query
cache is keyed by flavour (`src/api/persist.ts`), because one file for both
meant switching environment restored the other one's data and presented it as
current.

`scripts/probe-env.ts` exists because config alone should not be trusted: it
derives a known market's PDA under each candidate program and asks the
deployment's own RPC proxy which one exists, which is how the staging program
ids in `src/config.ts` were confirmed rather than assumed.

### The app is tested against frozen production responses

The unit suite runs offline against `test/fixtures/`, real responses captured by
`npm run fixtures`, so tests never depend on the website being up and never
drift quietly when it is.

The risk that creates is the app believing a shape the website no longer sends.
`contract.yml` parses every public route against production once a day and
opens an issue labelled `contract-failure` when a shape changes, then closes it
when the route is good again. It runs on a schedule rather than on push because
the thing that breaks these is a change in the other repo, and an APK in users'
hands cannot be patched quickly. The failure path distinguishes a real shape
change from the job falling over before the test ran, because the fix is
completely different.

`src/arena/arenas.ts` is ported data rather than code, and the same test covers
it: the web starts a new Arena season by appending to its registry, and the
contract test fails when the web's current season and the ported copy differ.

### Cold launch shows something immediately

Since v7 the native splash hands off to `src/ui/launch.tsx`, an overlay that
starts as a pixel copy of the splash (the mark at 140 wide on black) and
animates from it: a gold sweep, the word rising in, then a lift to reveal Home.
The splash is hidden from the overlay's first `onLayout`, not from `ready`,
because hiding it a frame earlier showed one black frame between the two. The
app is mounted and fetching underneath the whole time.

Without persistence every launch is skeletons until the network answers.
`src/api/persist.ts` dehydrates successful queries to disk and restores them
inside the readiness gate the root layout already holds for fonts, so a restore
can never land on top of fresher data.

The details that matter there: writes are throttled rather than debounced,
since a debounce can starve forever while polling keeps firing; going to the
background flushes immediately, because that is when the process is most likely
to be killed; only successful queries are persisted, so a restore cannot bring
back a broken screen; and an empty write is skipped, because a launch with no
network would otherwise destroy the very cache the next launch needs.

### Working around SDK and server gaps

The React Native Openfort SDK does not implement the encryption session
endpoint yet, so `src/auth/encryption-session.ts` calls the route and hands the
SDK a callback. That turned out to be the better shape anyway: the website
answers 409 `LEGACY_PRIVY_ACCOUNT` for a user whose funds are still in Privy,
and owning the call is what lets the app turn that into a specific, recognisable
message instead of a generic SDK failure.

Sign-in has a similar edge. The website returns the session token only as an
httpOnly cookie, and a native app has no cookie jar, so `src/auth/sign-in.ts`
carries a documented null until the web returns it in the body for mobile
clients. The app still proves the part that matters today: a token minted by
the React Native SDK verifies server side and binds to the claimed wallet.

### The UI is a small set of parts, and screens only arrange them

`src/ui/` holds the whole visual vocabulary after v7: `Screen`, `Card` and
`Row`, `Chip`, `Segmented`, `Button`, `IconButton`, `Pill`, `SwipeButton` and
the trade sheet. A screen file composes them and wires
data; it does not invent a border, a radius or a colour of its own.
`docs/DESIGN.md` lists the rules and is the checklist for a new screen.

Two things bit while building it:

- **A `Link asChild` child must have a flat style.** expo-router clones the
  child to inject `onPress` and `href`, and throws on a style array or a
  function. Every row that is a link goes through `rowStyle(first)` from
  `src/ui/card.tsx`, and `IconButton` flattens its style for the same reason.
- **Swipe to confirm reads `travel` from a shared value.** The gesture is
  rebuilt on each render but its worklets capture values at creation, so the
  track width is written to a shared value and read inside `onEnd` rather than
  closed over.

### The dApp Store CLI is a portal client now

SPEC section 11 was written against the NFT-minting `dapp-store` CLI with a
committed `config.yaml`. Version 1.0.x of `@solana-mobile/dapp-store-cli` is
different: the publisher, the app and its listing are created in the
publishing portal, which mints the App NFT, and the CLI only uploads an APK
under an API key. `dapp-store/README.md` is the procedure; nothing about the
listing lives in this repo.

### Two things about the release build

- Expo reads `.env.local` over the shell environment, so
  `EXPO_PUBLIC_FLAVOR=production ./gradlew assembleRelease` would still build
  staging if that file said so. `scripts/release-apk.sh` writes the flavour
  into a temporary `.env.local` and restores the original on exit.
- Console output is not forwarded to logcat in a release build, so the
  `[flavour]` launch line cannot verify one. The pill on Home (any flavour but
  production shows it) and a grep of the Hermes bundle for the API host are
  the checks.

### A notification has to become an app route

The server writes website paths, because the same row feeds the website, a
Discord DM and a Telegram message, so `src/notifications/link.ts` translates
each one. A free market is addressed by slug on the web and by id in the app,
which needs a lookup rather than a rewrite. Anything unrecognised returns null:
a tap that does nothing is better than a tap that opens the wrong market, and
the row still reads fine on its own.

## What is tested, and what is not

- 501 unit tests over 34 files, offline, against 29 captured fixtures.
- The pure layers are the tested ones: market maths, account decoding, schemas,
  merging, positions, the spending cap, claim planning, deep links, formatting,
  Arena derivations.
- The signer is tested end to end with a local keypair, including the refusals.
- Screens are not unit tested. They are checked on a Seeker, which is why
  anything that is a rule rather than a layout gets moved out of the screen and
  into a pure module first (`src/lib/arena-view.ts` is the clearest example).
- The chain path is proven by simulation against real programs through the
  `scripts/try-*.ts` tools before any signature is involved.

## Known gaps

- The session token still comes back only as a cookie; see above.
- Push needs the web routes in `docs/WEB_PUSH_TASK.md` to land before the
  device token the app already registers goes anywhere.
- The older paid market and majority screens still derive more in the component
  than they should. New work puts that in a pure module with tests, and the old
  screens move that way as they are touched.
