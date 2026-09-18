# Web task: App Links for the Android app (`assetlinks.json`)

Written Sep 16 2026 from the mobile side. The Android app already declares
intent filters for five paths on `www.mentioned.market` with `autoVerify`.
Until the website serves this file, Android cannot verify them, so every
shared link opens an "open with" chooser between Chrome and Mentioned. With
the file, the link opens the app directly, no dialog.

## What to add

One static file, served verbatim:

```
public/.well-known/assetlinks.json
```

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "market.mentioned.app",
      "sha256_cert_fingerprints": [
        "<RELEASE_CERT_SHA256>"
      ]
    }
  }
]
```

`<RELEASE_CERT_SHA256>` is the SHA-256 fingerprint of the certificate the
store APK is signed with, in colon-separated uppercase hex
(`AA:BB:CC:...`, 32 pairs). The mobile side supplies it once the store
keystore exists (`keytool -list -v -keystore <file> -alias mentioned`). A
second entry in the array for the debug key would make dev builds verified
too; optional.

## Requirements

1. **Host.** Must be reachable at exactly
   `https://www.mentioned.market/.well-known/assetlinks.json`. The apex
   `mentioned.market` 301s to `www`, and Android does NOT follow redirects
   when verifying, so the `www` origin must serve the file itself with a 200.
2. **Content type** `application/json`. Next serves `public/*.json` that way
   already; `public/.well-known/security.txt` proves the directory is served.
3. **No auth, no cookies, no redirect, no HTML error page.** A 404 today
   returns `text/html`; that is what has to change. If `next.config.js` has a
   rewrite or header rule touching `.well-known`, that is the first place to
   look.
4. **Paths covered by the app** (for reference, nothing to do on the web):
   `/market/[id]`, `/paidmajority/[id]`, `/free/[slug]`, `/ref/[code]`,
   `/onramp/return`. Any other path keeps opening the website.

## Verify

```bash
curl -si https://www.mentioned.market/.well-known/assetlinks.json | head -5
# HTTP/2 200, content-type: application/json
```

Google's checker, after deploy:
`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.mentioned.market&relation=delegate_permission/common.handle_all_urls`

On a phone with the store build installed,
`adb shell pm get-app-links market.mentioned.app` should show
`www.mentioned.market: verified`.

## Notes

- Changing the signing key later means changing the fingerprint here; the
  old builds stop verifying at that moment.
- Nothing in the app changes for this task. The filters are already in
  `app.json` and the committed `AndroidManifest.xml`.
