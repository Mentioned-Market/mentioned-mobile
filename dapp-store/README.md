# Solana dApp Store submission

The store moved to a publishing portal. `@solana-mobile/dapp-store-cli` 1.0.x
(a dev dependency here) no longer mints publisher, app and release NFTs from
a `config.yaml`; it uploads an APK to an app that already exists in the
portal, and the portal decides whether that is a first release or an update.

## One-time, in the portal

1. Sign in at https://publish.solanamobile.com with the company wallet.
2. Create the publisher and the app (`market.mentioned.app`). The portal
   mints the App NFT.
3. Fill the listing: name, short and long description, category, website
   `https://mentioned.market`, privacy policy `https://mentioned.market/privacy`,
   age rating 18+, contact email, and the assets below.
4. Create an API key for the CLI. It goes in the team password manager and
   in the `DAPP_STORE_API_KEY` environment variable on the machine that
   publishes, never in the repo.

## Assets (SPEC section 11)

| Asset | Size | Source |
|---|---|---|
| Icon | 512 x 512 PNG | `assets/images/icon.png` |
| Banner | 1200 x 600 PNG | to make from the wordmark |
| Screenshots | at least 5, Seeker resolution 1200 x 2670 | `adb exec-out screencap -p` on the production flavour, no STAGING pill |
| Video | up to 30 s, MP4 | screen recording on a Seeker |

## Each release

```bash
# 1. android/keystore.properties present (README, "Release build").
npm run apk:production                 # dist/mentioned-production-<version>-<date>.apk
# 2. Install it on a Seeker and run the release checklist (SPEC section 11).
# 3. Publish.
export DAPP_STORE_API_KEY=...          # from the password manager
npx dapp-store --apk-file dist/mentioned-production-1.0.0-2026-09-18.apk \
  --whats-new "First release" --keypair ~/.config/solana/mentioned-publisher.json
# A broken upload can be resumed: npx dapp-store resume --release-id <id>
```

Bump `expo.version` in `app.json` and `versionName` in
`android/app/build.gradle` together, and `versionCode` in both for every
submission: the store rejects a repeated `versionCode`.

Review takes 3 to 5 business days by email. The release branch is frozen from
submission; only review fixes land on it, and every resubmission restarts the
clock.
