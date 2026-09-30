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
| v9 more to scroll | Sep 18 | | Trending words from the website's sidebar feed on Home and every market screen, "More markets" at the foot of each one |
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

The website allows at most $15 of net spend on any one word and side, and no
buy under $0.50 (raised from $2 in September 2026; a position counts as full
once less than the minimum is left). Nothing on chain enforces either: the program
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

### Accounts from before Openfort sign in with Privy

The website moved new accounts to Openfort and kept Privy for everyone who
signed up before the cutover, because their funds are in their Privy wallets.
The app follows the same rule, and the server makes every call; nothing on the
device decides who is legacy.

Everyone starts on Openfort. For an identity with no Openfort wallet that
matches a Privy account created before the cutover, the encryption-session
route answers 409 `LEGACY_PRIVY_ACCOUNT` instead of minting a second, empty
wallet. The sign-in screen then logs out of Openfort and offers Privy, with the
same three methods. Privy is never a button before that answer: tapping it
would create exactly the Privy account the move is ending. The rule and the
error reading live in `src/auth/wallet-routing.ts`, with tests.

Two things differ from the web, both deliberately:

- **Privy logs in with `disableSignup`.** On the web, a new person who reaches
  Privy gets an account from Privy's own login and is only turned away at the
  session step (409 `PRIVY_SIGNUP_CLOSED`). Here Privy refuses an identity it
  has never seen, so the app cannot create a Privy account at all.
  `createOnLogin` is `off` for the same reason: a legacy account already has
  its wallet.
- **Privy signs through `signMessage`, not `signTransaction`.** Privy's
  documented `signTransaction` takes a `@solana/web3.js` object. Reading the
  SDK showed that it base64-encodes the message bytes, calls `signMessage`, and
  attaches the Ed25519 signature that comes back. `src/trade/privy-signer.ts`
  does the same and hands the signature to the ported `openfortSignOnly`, so
  both providers reach the chain through one signing path and web3.js stays
  out of the app.

The trap in the error reading: the Openfort SDK hides the 409 behind "Failed to
create Solana wallet", so the app reads back the last encryption-session error.
That value outlives the attempt that set it. Checked first, it turned Privy's
"no account for this login" into another trip to Privy, and the person bounced
between the two screens for ever. The explicit codes are now checked first, and
the stored error is cleared as each attempt starts.

The session records its provider (`useSession().provider`, absent on older
stored sessions and read as Openfort). `useTrade` picks the matching signer,
the Openfort reconnector leaves Privy sessions alone, and sign-out ends both
SDK sessions.

### A program upgrade is a port, not a patch

The mainnet AMM program was upgraded in September 2026 (log-sum-exp
normalisation and a higher-precision `fp_ln`, live at slot 449979571), and the
account gained a winner rake in bytes that used to be reserved. The app's copy
of `lib/mentionMarketUsdc.ts` was from before that. The account still decoded,
because the new fields sit at the end, so nothing looked wrong. But the
app's cost maths no longer matched the program's, and the web recorded what that
does: every buy and sell trips the 2% slippage guard and reverts with "the
price moved". `src/chain/amm.ts` is now re-ported from web main, unchanged
apart from its config import, and `scripts/try-buy.ts` simulated a $1 buy on
mainnet with the program charging exactly the cost the app quoted.

The lesson is the check, not the fix: before a release, diff every
`PORTED_FROM` sha against web main. One of the old tests pinned the overflow
the upgrade removed (a huge buy used to fill short), and now pins that a large
buy fills in full.

### AMM markets show multipliers and dollars only

The web shows paid YES/NO odds as a multiplier ("2.31x") with a cents toggle.
The app has no toggle: an AMM market shows what a side pays and what a stake
pays out, never cents, shares or percentages. `src/lib/oddsDisplay.ts` is a
straight port of the web's rules and tests; `src/trade/amm-display.ts` is the
app's use of them. Two deliberate differences from the web page:

- Payouts are net of the winner rake everywhere and rounded down to the cent.
  The web's buy preview uses the gross share count, and rounding a payout up
  made it disagree with the floored multiplier beside it.
- Selling is by percent of the position, as the web's multiplier mode does, so
  no share count is ever typed or shown.

The fee line always says something. Every live market has a trading fee of 0
bps, so "fee $0.00" was accurate and read as a bug; it now says "No trading
fee", or the fee and its rate, plus any rake on winnings.

Majority markets are not AMM markets and keep their display, and so do free
markets.

### The chart is the web's chart, redrawn

The web's price chart uses lightweight-charts, a browser library, so its
behaviour is ported instead of the file: every word's line from the start
(untraded words at 50%), lines held flat between trades and eased into each
new price, a range padded by 15 points, a gradient under a single line, the
web's palette, and a finger dragged across it reading every line with labels
pushed apart. The rules are in `src/lib/chart.ts` with tests;
`src/ui/line-chart.tsx` only draws. There is no price axis: an AMM market's
values are read as multipliers from the legend and the scrub labels, and a
percent axis would put back the number the rest of the screen removed.

### A word on a market card goes straight to trading it

Each word on a Markets card links to its market with `?word=<label>`. The label
is the key because it is the one field every list route gives its words. A
YES/NO market opens that word's trade sheet; a majority board starts with the
word selected. The web has no equivalent, so this is the app's own route. The
screens act on the param while rendering rather than in an effect, because the
market arrives after mount and the lint rule rejects state set from effects.

### Reads before signing are retried; nothing else is

The website's RPC proxy answers 502 when its paid upstream and the public
fallback both fail, and on Sep 25 2026 that failed a trade at the blockhash, the
first step. `src/trade/send.ts` now retries its two reads, the blockhash and the
simulation, twice on a 5xx, a 429 or a dropped connection. Both happen before
anything is signed, so a retry cannot move money. A JSON-RPC error is an answer,
not an outage, and is not retried.

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

### A Seeker is proved by its Genesis Token, and the stake is paid once per token

A phone model string or a dApp Store install can be faked; the Seeker Genesis
Token cannot. Every Seeker mints one SGT into its Seed Vault wallet, so the app
has that wallet sign one message (`src/lib/seekerLinkMessage.ts`, ported from the
web) naming the Seeker and the signed-in account, and the server checks the
signature, then checks on mainnet that the wallet holds an SGT with a non-zero
balance. Naming the account stops a signature from one Seeker being replayed
to link it to someone else.

The anti-sybil key is the SGT's mint, not the wallet or the account: the
server's `seeker_links.sgt_mint` is unique for ever, so one Seeker funds one
welcome stake however many accounts its owner makes, and an account's SGT can
never be swapped (that would free the old one to fund a second account).

The stake ($1 USDC and 0.006 SOL, enough for a first pick) is a plain transfer
the person could withdraw. Making it spendable only on picks needs a credit in
the program or the website, which is far more work than $1.50 per Seeker is
worth protecting. The server saves the signed transfer before broadcasting it
and only ever re-checks or re-sends those bytes, so "Check again" on a stake
that is on its way is the same call and cannot pay twice.

SGTs live on mainnet only, so the check always reads mainnet. That is what lets
staging (devnet) verify a real Seeker and pay the stake in devnet USDC.

### Transaction history is read from the chain, and a transfer is an allowlist

Deposits and withdrawals happen from exchanges, the Seed Vault and the Seeker
stake, and most never touch the website's database, so the web's
`/api/wallet/transfers` reads them from the chain: the wallet's recent
signatures and its USDC account's (a USDC transfer in names only the token
account), each transaction parsed once and cached for good. The RPC proxy does
not allow history methods, and letting the app make forty reads per screen
through it would be the wrong place for that cost.

A transaction counts only if every instruction, inner ones included, belongs to
System, Token, Token-2022, ATA, Compute Budget or Memo. Excluding the trading
programs instead was tried on a real devnet wallet and let through rent paid
into old program versions and MagicBlock delegation. The SOL line on Me is
there because fees are still paid in SOL; it goes when trading is gasless.

### The tabs are a pager of our own

A sideways swipe anywhere moves to the next or previous tab, with both pages
following the finger (`src/ui/swipe-tabs.tsx`). Bottom tabs cannot be dragged,
only animated after a tap. Material top tabs can, but need
react-native-pager-view, a native pager that decides for itself which
horizontal touches it takes, and its current release is built on Compose, so
whether the Home rails still scroll inside it was an open question with a
native rebuild behind each answer.

So the navigator is React Navigation's `TabRouter` (back button, deep links
and `router.navigate` unchanged) and the stock `BottomTabBar`, over pages
positioned from shared values on the UI thread. Rails need no exceptions: a
native horizontal ScrollView claims the touch at Android's 8dp slop, and
gesture-handler cancels every gesture when a native view does that, so the
pager waits for 16dp and a rail that can scroll always wins. `adb shell input
swipe` faster than about 300ms jumps both thresholds in one event and the pager
wins; a finger reports in far smaller steps. `freezeOnBlur` became a `Freeze`
around every tab but the current one and its neighbours, which have to stay
live to be seen mid-swipe.

### Moments are only ever for things the server confirmed

The win screen, the points toasts and "▲4" on Home (`src/markets/moments.ts`
for the rules, `src/store/moments.ts` for what the phone remembers) never show
a number the app made up. A trade's ten points are awarded later by the
website's webhook, so a trade toasts nothing; the gain turns up on the weekly
board, and Home toasts it from there, compared against what this phone saw
last time. A share claim toasts the `awarded` the route returned, and an
unlock only when a route reports it.

Two rules keep the win screen honest. The first time a wallet is seen on a
phone, its existing wins are remembered without a moment, so an update does
not replay a season of old wins. And a win is marked when its moment is
dismissed, not when it is found, so one found as the app closes is not lost.
Every win still in the positions list stays remembered however many there
are; only keys the list no longer carries are trimmed.

`mentioned://dev` has a Moments section: toast previews, a win screen with a
sample market, and two buttons that rewind what the phone remembers (your
latest win, your standing) so Home goes through the real path again.

### Chat is the website's rooms, live over its SSE stream

Global chat and one room per market (`paid_<id>`, `paidmaj_<id>`, `custom_<id>`,
the website's own event ids; `chatEventId` in src/chat/rules.ts, pinned by the
contract test). A room is live only while its screen is focused, the rule the
website follows to keep connections down; a market screen shows a slow-polled
card of the last few messages instead, since a composer and a keyboard have no
place on a screen that pins a trade bar.

React Native has no EventSource, but its XMLHttpRequest reports the response
as it grows, so src/chat/sse.ts is a small reader rather than a dependency
(the format parser is unit tested). The connection is recycled every five
minutes because `responseText` only grows. If the stream fails, the room polls
`?after=` every five seconds and retries the stream; every (re)connect fetches
what it missed first, because the stream does not replay.

A long press on a message offers Report (to the bug-report route, which lands
in Discord) and Hide (this phone only). Stores ask any app that shows what
strangers write for both.

The app is edge to edge, so Android draws the keyboard over the screen rather
than resizing it and `KeyboardAvoidingView` lifts nothing. The chat screen lifts
itself by the keyboard's reported height plus the bottom inset, which that
height leaves out.

## What is tested, and what is not

- 501 unit tests over 34 files, offline, against 29 captured fixtures.
- The pure layers are the tested ones: market maths, account decoding, schemas,
  merging, positions, the spending cap, claim planning, deep links, formatting,
  Arena derivations.
- The signer is tested end to end with a local keypair, including the refusals.
  The Privy adapter runs through the same ported signer in its own test.
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
