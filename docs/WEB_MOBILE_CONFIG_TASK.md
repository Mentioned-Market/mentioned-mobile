# Mobile config: what the `mentioned` web repo needs

Written Sep 14 2026 from the mobile side. The Android app is built and waiting:
it asks this route on launch what it may do. Until the route exists the app
treats the 404 as "no rules" and runs normally, so nothing breaks in the
meantime.

One new file, static JSON from environment variables. No database, no auth.

## 1. Routes

Updated Oct 4 2026. Two files in the web repo, both live in production. How to
use them day to day is in `docs/REMOTE_CONFIG.md`; this file keeps their source.

### `app/api/mobile/config/route.ts`

The kill switch, the minimum version, the feature flags, and a `points` block
built from `lib/pointRules.ts` so the app's "How to earn points" sheet quotes
what the scorers pay.

```ts
import { NextResponse } from 'next/server'
import { SOLANA_CLUSTER } from '@/lib/solanaConfig'
import {
  PAID_PROFIT_MULTIPLIER,
  PAID_HOLD_BONUS,
  PAID_HOLD_MIN_STAKE_USDC,
  PAID_PROFIT_POINTS_CAP,
  PAID_POINTS_CAP,
  MAJ_HOLD_BONUS,
  MAJ_HOLD_MIN_STAKE_USDC,
  MAJ_PROFIT_POINTS_CAP,
  MAJ_POINTS_CAP,
  VIRTUAL_MARKET_POINTS_MULTIPLIER,
  VIRTUAL_MARKET_POINTS_CAP,
  CHAT_POINTS,
  CHAT_DAILY_CAP,
} from '@/lib/pointRules'

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

// GET /api/mobile/config: public. What the Mentioned Android app may do right
// now, and the numbers it quotes when it explains points.
export async function GET() {
  return NextResponse.json(
    {
      // Oldest app version still supported, e.g. "1.1.0". Below it the app shows
      // a full-screen "update to keep going". Set it to the version that is live
      // on the dApp Store to make everyone update; set it only AFTER that version
      // is live there, or phones are locked out with nothing to update to.
      // Leave unset to allow every version.
      minVersion: process.env.MOBILE_MIN_VERSION?.trim() || null,
      // true = the app shows a maintenance screen instead of itself.
      killSwitch: flag('MOBILE_KILL_SWITCH', false),
      // Optional line shown on the maintenance or update screen.
      message: process.env.MOBILE_MESSAGE?.trim() || null,
      // Where the update button goes. Unset: the app opens its own dApp Store
      // listing, which is right for every build shipped through that store.
      updateUrl: process.env.MOBILE_UPDATE_URL?.trim() || null,
      cluster: SOLANA_CLUSTER,
      features: {
        paidTrading: flag('MOBILE_FEATURE_PAID_TRADING', true),
        freeTrading: flag('MOBILE_FEATURE_FREE_TRADING', true),
        seekerPerk: flag('MOBILE_FEATURE_SEEKER_PERK', true),
        onramp: flag('MOBILE_FEATURE_ONRAMP', true),
      },
      // The scorers' own constants (lib/pointRules.ts), so the app's "How to
      // earn points" sheet cannot quote a number the server no longer pays.
      points: {
        paidHoldBonus: PAID_HOLD_BONUS,
        paidHoldMinStake: PAID_HOLD_MIN_STAKE_USDC,
        paidProfitMultiplier: PAID_PROFIT_MULTIPLIER,
        paidProfitCap: PAID_PROFIT_POINTS_CAP,
        paidCap: PAID_POINTS_CAP,
        majorityHoldBonus: MAJ_HOLD_BONUS,
        majorityHoldMinStake: MAJ_HOLD_MIN_STAKE_USDC,
        majorityProfitCap: MAJ_PROFIT_POINTS_CAP,
        majorityCap: MAJ_POINTS_CAP,
        freeMultiplier: VIRTUAL_MARKET_POINTS_MULTIPLIER,
        freeCap: VIRTUAL_MARKET_POINTS_CAP,
        chatPoints: CHAT_POINTS,
        chatDailyCap: CHAT_DAILY_CAP,
      },
    },
    // A minute is short enough that flipping the kill switch reaches phones
    // quickly, long enough that a launch spike is served from cache.
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  )
}
```

### `app/api/teams/arenas/route.ts`

`{ current, arenas }`: `lib/arenas.ts` as JSON. The app reads its seasons,
prizes and medals from this, so a new season or an edited medal no longer needs
an app release.

```ts
import { NextResponse } from 'next/server'
import { ARENAS, CURRENT_ARENA } from '@/lib/arenas'

export const dynamic = 'force-dynamic'

// GET /api/teams/arenas: public. Every Arena season as lib/arenas.ts defines it
// (dates as ISO strings), plus the slug of the one open for entry.
//
// The Android app reads its seasons from here. It ships with a copy of the
// registry as a fallback, but a copy inside an installed build cannot change:
// before this route a new season, a swapped medal or an edited rule reached
// phones only through a store release. Add fields freely; the app ignores what
// it does not know. Renaming or removing one is a breaking change for builds
// already installed.
export async function GET() {
  return NextResponse.json(
    { current: CURRENT_ARENA.slug, arenas: ARENAS },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
  )
}
```

## 2. Environment (web service, all optional)

| Variable | Effect | Default |
|---|---|---|
| `MOBILE_MIN_VERSION` | Versions below this must update. Set it to the version live in the dApp Store to make everyone update, and only once it is live there | unset: all allowed |
| `MOBILE_KILL_SWITCH` | `true` shows the maintenance screen | `false` |
| `MOBILE_MESSAGE` | Text on the maintenance or update screen | none |
| `MOBILE_UPDATE_URL` | Where "Update" opens | none: the app opens its own dApp Store page |
| `MOBILE_FEATURE_PAID_TRADING` | `false` disables paid buys and sells | `true` |
| `MOBILE_FEATURE_FREE_TRADING` | `false` disables free trades and entries | `true` |
| `MOBILE_FEATURE_SEEKER_PERK` | `false` hides the Seeker perk | `true` |
| `MOBILE_FEATURE_ONRAMP` | `false` hides the card on-ramp | `true` |

## 3. What the app does with it

- **Kill switch:** a full-screen maintenance message, checked before the version.
- **Below `minVersion`:** a full-screen "update to continue" with the update
  button, which opens the app's dApp Store page unless `MOBILE_UPDATE_URL`
  says otherwise. The app reads its own version from the installed build
  (`1.0.0` today).
- **`paidTrading` / `freeTrading` false:** the trade and entry buttons are
  disabled with "Trading is paused right now". **Claims are never disabled:**
  a claim returns a user's own money, and switching that off would strand funds.
- **No route, a 404, or malformed values:** the app runs normally. It keeps the
  last config it saw, so a kill switch still holds on a launch with no signal.

## 4. Check

`curl https://<deployment>/api/mobile/config` returns the JSON above. Then set
`MOBILE_KILL_SWITCH=true` on staging, relaunch the app on the staging flavour,
and the maintenance screen should appear within about a minute.
