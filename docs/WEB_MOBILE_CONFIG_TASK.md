# Mobile config: what the `mentioned` web repo needs

Written Sep 14 2026 from the mobile side. The Android app is built and waiting:
it asks this route on launch what it may do. Until the route exists the app
treats the 404 as "no rules" and runs normally, so nothing breaks in the
meantime.

One new file, static JSON from environment variables. No database, no auth.

## 1. Route: `app/api/mobile/config/route.ts`

```ts
import { NextResponse } from 'next/server'
import { SOLANA_CLUSTER } from '@/lib/solanaConfig'

export const dynamic = 'force-dynamic'

// An unset variable keeps its default; only an explicit "true"/"1" or
// "false"/"0" changes it. The app is built the same way round: a missing or
// malformed flag never switches anything off, so a typo here cannot lock
// every phone out.
function flag(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase()
  if (v === 'true' || v === '1') return true
  if (v === 'false' || v === '0') return false
  return fallback
}

// GET /api/mobile/config — public. What the Mentioned Android app may do right now.
export async function GET() {
  return NextResponse.json(
    {
      // Oldest app version still supported, e.g. "0.2.0". Below it the app shows
      // a full-screen "update to continue". Leave unset to allow every version.
      minVersion: process.env.MOBILE_MIN_VERSION?.trim() || null,
      // true = the app shows a maintenance screen instead of itself.
      killSwitch: flag('MOBILE_KILL_SWITCH', false),
      // Optional line shown on the maintenance or update screen.
      message: process.env.MOBILE_MESSAGE?.trim() || null,
      // Where the update button goes, e.g. the dApp Store listing.
      updateUrl: process.env.MOBILE_UPDATE_URL?.trim() || null,
      cluster: SOLANA_CLUSTER,
      features: {
        paidTrading: flag('MOBILE_FEATURE_PAID_TRADING', true),
        freeTrading: flag('MOBILE_FEATURE_FREE_TRADING', true),
        seekerPerk: flag('MOBILE_FEATURE_SEEKER_PERK', false),
        onramp: flag('MOBILE_FEATURE_ONRAMP', false),
      },
    },
    // A minute is short enough that flipping the kill switch reaches phones
    // quickly, long enough that a launch spike is served from cache.
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  )
}
```

## 2. Environment (web service, all optional)

| Variable | Effect | Default |
|---|---|---|
| `MOBILE_MIN_VERSION` | Versions below this must update | unset: all allowed |
| `MOBILE_KILL_SWITCH` | `true` shows the maintenance screen | `false` |
| `MOBILE_MESSAGE` | Text on the maintenance or update screen | none |
| `MOBILE_UPDATE_URL` | Where "Update" opens | none: the app tells the user to update from the dApp Store |
| `MOBILE_FEATURE_PAID_TRADING` | `false` disables paid buys and sells | `true` |
| `MOBILE_FEATURE_FREE_TRADING` | `false` disables free trades and entries | `true` |
| `MOBILE_FEATURE_SEEKER_PERK` | Seeker perk (not built yet) | `false` |
| `MOBILE_FEATURE_ONRAMP` | Card on-ramp (not built yet) | `false` |

## 3. What the app does with it

- **Kill switch:** a full-screen maintenance message, checked before the version.
- **Below `minVersion`:** a full-screen "update to continue" with the update
  button. The app reads its own version from the installed build (`0.1.0` today).
- **`paidTrading` / `freeTrading` false:** the trade and entry buttons are
  disabled with "Trading is paused right now". **Claims are never disabled:**
  a claim returns a user's own money, and switching that off would strand funds.
- **No route, a 404, or malformed values:** the app runs normally. It keeps the
  last config it saw, so a kill switch still holds on a launch with no signal.

## 4. Check

`curl https://<deployment>/api/mobile/config` returns the JSON above. Then set
`MOBILE_KILL_SWITCH=true` on staging, relaunch the app on the staging flavour,
and the maintenance screen should appear within about a minute.
