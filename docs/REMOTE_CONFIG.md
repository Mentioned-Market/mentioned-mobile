# Changing the app from the web

A build on someone's phone cannot be patched quickly: a release goes through the
dApp Store. So the things that change on the website's schedule are read from
the website. This is how to use that.

Two routes on the web app (`mentioned` repo) drive it:

| Route | File in the web repo | What it controls |
|---|---|---|
| `GET /api/mobile/config` | `app/api/mobile/config/route.ts` | Whether the app may run, which features are on, the point values it quotes |
| `GET /api/teams/arenas` | `app/api/teams/arenas/route.ts` | Arena seasons, prizes and medals |

Both are public, need no sign-in and touch no database.

## Quick reference

| You want to | You do | Needs a web deploy | Needs an app release |
|---|---|---|---|
| Make everyone update the app | Set `MOBILE_MIN_VERSION` | No | The new version must already be live in the store |
| Take the app offline | Set `MOBILE_KILL_SWITCH=true` | No | No |
| Pause paid or free trading | Set `MOBILE_FEATURE_PAID_TRADING=false` or `MOBILE_FEATURE_FREE_TRADING=false` | No | No |
| Hide the Seeker perk or the card on-ramp | Set `MOBILE_FEATURE_SEEKER_PERK=false` or `MOBILE_FEATURE_ONRAMP=false` | No | No |
| Start a season, change a prize, a medal or a rule | Edit `lib/arenas.ts` | Yes | No |
| Change how many points something pays | Edit the constants behind `lib/pointRules.ts` | Yes | No |
| Add a screen, change a layout, give a season its own look | Change this repo | No | Yes |

A change reaches phones within about ten minutes, or on the next launch,
whichever comes first.

## The environment variables

Set these on the web service (Railway). Every one is optional, and with none set
the app runs with no restrictions.

| Variable | Effect | When unset |
|---|---|---|
| `MOBILE_MIN_VERSION` | App versions below this see a full-screen "Update to keep going" | Every version is allowed |
| `MOBILE_KILL_SWITCH` | `true` replaces the whole app with a maintenance screen | Off |
| `MOBILE_MESSAGE` | Text shown on the update or maintenance screen | A default message |
| `MOBILE_UPDATE_URL` | Where the Update button goes | The app opens its own dApp Store page |
| `MOBILE_FEATURE_PAID_TRADING` | `false` disables paid buys and sells | On |
| `MOBILE_FEATURE_FREE_TRADING` | `false` disables free trades and entries | On |
| `MOBILE_FEATURE_SEEKER_PERK` | `false` hides the Seeker link and welcome stake | On |
| `MOBILE_FEATURE_ONRAMP` | `false` hides the card on-ramp | On |

Flags accept `true`, `1`, `false` or `0`. Anything else is ignored and the
default stands.

## Recipes

### Force everyone onto a new version

1. Bump the version in this repo before building: `version` and
   `android.versionCode` in `app.json`, and `versionName` and `versionCode` in
   `android/app/build.gradle`. The check compares version names, so the new
   build must have a higher one than the build it replaces.
2. Release the build and wait until it is live in the dApp Store.
3. Set `MOBILE_MIN_VERSION` to that version, for example `1.1.0`.

Phones on an older version show the update screen with a button to the store.
Phones on `1.1.0` or later see nothing.

Do not do step 3 before step 2 has finished. A minimum version that is not in
the store yet locks every phone out with nothing to update to. To undo it,
unset the variable.

### Take the app down for maintenance

Set `MOBILE_KILL_SWITCH=true`, and optionally `MOBILE_MESSAGE` to say why and
for how long. Set it back to `false` when done. The maintenance screen has a
"Try again" button, so people do not have to restart the app.

### Pause trading without taking the app down

Set `MOBILE_FEATURE_PAID_TRADING=false`, `MOBILE_FEATURE_FREE_TRADING=false`, or
both. Trade and entry buttons are disabled and read "Trading is paused right
now". Everything else keeps working.

Claims are never switched off by any flag. A claim returns a person's own money.

### Start a new Arena season, or change the current one

Edit `ARENAS` in the web repo's `lib/arenas.ts` exactly as you would for the
website, and deploy. The app picks up the new season, its prizes, its medals and
their rules from `/api/teams/arenas`. The medal standings and the team
leaderboard were already live and need nothing.

Two things still live in this repo:

- **The fallback copy.** `src/arena/arenas.ts` is a copy of `lib/arenas.ts`,
  used on a first launch with no signal. Re-port it when a season starts so
  that case is right too. `npm run contract` says when it has drifted; that is
  a warning, not a failure.
- **A season's own look.** The app draws every season with the same layout. A
  themed page like the website's World's Fair needs an app release.

### Change point values

Change the constant where the web defines it (`lib/paidPoints.ts`,
`lib/customMarketUtils.ts`, `lib/pointRules.ts`) and deploy. The config route
imports the same constants the scorers use, so the app's "How to earn points"
sheet follows on its own.

## Checking it worked

```bash
curl https://www.mentioned.market/api/mobile/config
curl https://www.mentioned.market/api/teams/arenas
```

Then, in this repo:

```bash
npm run contract
```

It parses both routes the way the app does, and reports whether the seasons
route and the leaderboard agree on the current season.

To see a change on a phone before it reaches real users, set the variable on
staging and use a staging build of the app.

## Rules that keep this safe

- **Add fields, never rename or remove them.** Installed builds ignore fields
  they do not know. A field that disappears breaks every build that reads it,
  and those builds cannot be recalled.
- **A bad value fails open.** A missing route, a typo such as
  `MOBILE_MIN_VERSION=latest`, or a malformed response all count as "no rules".
  Only an explicit kill switch, or a valid minimum version above the installed
  one, closes the app.
- **The app remembers the last answer.** It keeps the last config and seasons
  on disk for up to a day, so a kill switch still holds on a launch with no
  signal, and so does a mistake. Fix a wrong value quickly.
- **Nothing here reaches money.** Program ids, token mints and how a
  transaction is built are compiled into the app and cannot be changed from the
  web. A flag can only switch a feature off.
- **Old builds only know the old fields.** Builds released before Oct 4 2026
  read the kill switch, the minimum version and the feature flags, but not
  seasons or point values from the web. That is one reason to force the update.

## Where the app reads it

| Concern | Fetch | Rules | Used by |
|---|---|---|---|
| Kill switch, minimum version, flags | `src/api/mobileConfig.ts` | `src/lib/mobile-config.ts` | `src/ui/config-gate.tsx` |
| Point values | `src/api/mobileConfig.ts` | `src/lib/points-rules.ts` | the Arena tab's "How to earn points" sheet |
| Seasons | `src/api/arena.ts` | `src/arena/seasons.ts` | `useSeasons()` in `src/arena/use-seasons.ts` |
| Medal standings and table | `src/api/arena.ts` | `src/lib/medal-board.ts` | the Arena tab |

`docs/ENGINEERING.md` ("What the server decides, and what the build does") has
the reasoning behind the design. `docs/WEB_MOBILE_CONFIG_TASK.md` holds the
source of both web routes.
