# Push notifications: what the `mentioned` web repo needs

Written Sep 12 2026 from the mobile side. The Android app is finished and
waiting: it asks for permission at first sign-in, gets the device's own FCM
token, and posts it to a route that does not exist yet. Everything below is the
other half.

Nothing here changes Discord or Telegram behaviour. Push is a third channel on
the machinery that already exists: `notification_settings` for the opt-in,
`notification_outbox` for durable delivery, the worker for sending.

**Why the device token and not an Expo push token.** The app calls
`getDevicePushTokenAsync()`, so what arrives is a plain FCM registration token.
Expo's push service is not in the path, there is no Expo project id involved,
and the worker talks to Firebase directly with `firebase-admin`.

---

## 1. Migration (`scripts/migrate.ts`)

Add alongside the other notification tables (they sit around line 890).

```sql
-- Devices a wallet can be pushed to. The TOKEN is the primary key, not the
-- wallet: one phone has one FCM token, and if a different account signs in on
-- that phone the same token must move to the new wallet rather than push to
-- both. FCM tokens also rotate, which is why the app re-registers on every
-- sign-in and last_seen_at is bumped on conflict.
CREATE TABLE IF NOT EXISTS push_tokens (
  token        TEXT PRIMARY KEY,
  wallet       TEXT NOT NULL,
  platform     TEXT NOT NULL DEFAULT 'android',  -- 'android' | 'ios'
  device_id    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_wallet ON push_tokens(wallet);

-- Push preferences. Unlike Discord and Telegram these default TRUE: the
-- Android permission prompt is already an explicit opt-in, and a user who
-- allowed notifications and then received none would read it as broken. A
-- refusal at the OS level means nothing is delivered regardless of these.
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_new_markets BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_resolutions BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_dev_updates BOOLEAN NOT NULL DEFAULT TRUE;
```

## 2. New route: `app/api/notifications/push-token/route.ts`

The app posts here after every sign-in, and ignores the response.

```ts
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { getVerifiedWallet } from '@/lib/walletAuth'

export const dynamic = 'force-dynamic'

// POST { token, platform: 'android', deviceId? } — register this device for push.
export async function POST(req: NextRequest) {
  const wallet = getVerifiedWallet(req)
  if (!wallet) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  let body: { token?: unknown; platform?: unknown; deviceId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token || token.length > 4096) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }
  const platform = body.platform === 'ios' ? 'ios' : 'android'
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 200) : null

  // Reassigns the token if a different wallet signs in on the same phone.
  await pool.query(
    `INSERT INTO push_tokens (token, wallet, platform, device_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (token) DO UPDATE
       SET wallet = EXCLUDED.wallet,
           platform = EXCLUDED.platform,
           device_id = EXCLUDED.device_id,
           last_seen_at = NOW()`,
    [token, wallet, platform, deviceId],
  )

  // The enqueue below joins notification_settings, so a wallet with no row
  // would never be pushed to. Creating it here applies the TRUE defaults.
  await pool.query(
    `INSERT INTO notification_settings (wallet) VALUES ($1) ON CONFLICT (wallet) DO NOTHING`,
    [wallet],
  )

  return NextResponse.json({ ok: true })
}

// Optional, and the app does not call it yet: DELETE { token } on sign-out.
// Say if you add it and the mobile side will call it, which stops a shared
// phone pushing the previous account's markets.
```

## 3. Enqueue push rows (`lib/notifications.ts`)

`enqueueExternal` and `enqueueExternalBroadcast` loop over
`['discord', 'telegram']` and join `user_profiles` to check the channel is
linked. Push needs the same shape with a different join: a wallet is
"linked" when it has a row in `push_tokens`.

- Widen `prefColumn`'s channel type to include `'push'`, so it yields
  `push_new_markets`, `push_resolutions` and `push_dev_updates` from the
  existing `categoryForType`.
- Add the function below and call it from both `createNotification` (targeted,
  pass the wallets) and `broadcastNotification` (pass null).

```ts
/**
 * Enqueue push rows. One row per opted-in wallet that has at least one
 * registered device; the worker fans out to that wallet's tokens at send time,
 * so a phone registered after the row was written still gets it.
 */
async function enqueuePush(wallets: string[] | null, n: Omit<NewNotification, 'wallet'>): Promise<void> {
  const column = prefColumn('push', categoryForType(n.type))
  const params: unknown[] = [n.title, n.body ?? null, n.link ?? null, n.refId ?? null]
  if (wallets) params.push(wallets)
  await pool.query(
    `INSERT INTO notification_outbox (wallet, channel, title, body, link, ref_id)
     SELECT DISTINCT ns.wallet, 'push', $1, $2, $3, $4
       FROM notification_settings ns
       JOIN push_tokens pt ON pt.wallet = ns.wallet
      WHERE ns.${column} = TRUE
        ${wallets ? 'AND ns.wallet = ANY($5)' : ''}
     ON CONFLICT (wallet, channel, ref_id) WHERE ref_id IS NOT NULL DO NOTHING`,
    params,
  )
}
```

## 4. Send push (`services/notification-worker`)

`npm i firebase-admin` in `services/notification-worker`, then add
`src/push.ts`:

```ts
// FCM sender. Mirrors src/discord.ts: returns true on success, false to retry,
// null when the row is undeliverable and must not be retried.
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { pool } from './db'
import { log } from './log'

function messaging() {
  if (getApps().length === 0) {
    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON
    if (!raw) throw new Error('FCM_SERVICE_ACCOUNT_JSON is not set')
    initializeApp({ credential: cert(JSON.parse(raw)) })
  }
  return getMessaging()
}

export async function sendPush(
  wallet: string,
  title: string,
  body: string | null,
  link: string | null,
): Promise<boolean | null> {
  const { rows } = await pool.query<{ token: string }>(
    `SELECT token FROM push_tokens WHERE wallet = $1`,
    [wallet],
  )
  // Every device unregistered since the row was queued: nothing to retry.
  if (rows.length === 0) return null

  const result = await messaging().sendEachForMulticast({
    tokens: rows.map((r) => r.token),
    notification: { title, body: body ?? undefined },
    // The app reads data.link to decide where a tap goes. Keep it the same
    // website path stored on the notification row, e.g. "/market/123".
    data: link ? { link } : {},
    android: { priority: 'high', notification: { channelId: 'default' } },
  })

  // Drop tokens Firebase says are dead, or they are retried forever.
  const dead = result.responses
    .map((r, i) => (r.error?.code === 'messaging/registration-token-not-registered'
      || r.error?.code === 'messaging/invalid-argument' ? rows[i].token : null))
    .filter((t): t is string => t !== null)
  if (dead.length > 0) {
    await pool.query(`DELETE FROM push_tokens WHERE token = ANY($1)`, [dead])
    log.info('pruned dead push tokens', { count: dead.length })
  }

  return result.successCount > 0
}
```

Then in `src/drain.ts`:

- change the claim filter `channel IN ('discord','telegram')` to
  `channel IN ('discord','telegram','push')`
- add to `deliver()`:

```ts
  if (row.channel === 'push') {
    return sendPush(row.wallet, row.title, row.body, row.link)
  }
```

**Keep the web copy in sync.** `drainNotificationOutbox` in
`lib/notifications.ts` is the same drain with the same claim filter and
`deliver()`, and the worker README calls it a kept-in-sync copy. Either make
the same two edits there (it needs `firebase-admin` in the web app too), or
leave the web copy sending Discord and Telegram only and note that push is
worker-only. The mobile side does not care which; it only matters that the
admin "Flush queue now" button does not silently skip push rows forever.

## 5. Settings route (`app/api/notifications/settings/route.ts`)

Add the three keys to the `KEYS` array so `GET` returns them and `PUT` accepts
them:

```ts
const KEYS = [
  'discord_new_markets', 'discord_resolutions', 'discord_dev_updates',
  'telegram_new_markets', 'telegram_resolutions', 'telegram_dev_updates',
  'push_new_markets', 'push_resolutions', 'push_dev_updates',
] as const
```

This is what unblocks the app's notification settings screen, which hides the
Discord and Telegram rows and shows only these three.

## 6. Environment

On the **notification worker service** (Railway), alongside `DATABASE_URL` and
the bot tokens:

```
FCM_SERVICE_ACCOUNT_JSON = <the whole service account JSON, as one value>
```

Generated in the Firebase console under Project settings, Service accounts,
Generate new private key, for project `mentioned-8668a`. It contains a private
key: environment only, never either repo.

Also relevant to testing: `NOTIFICATIONS_DELIVERY_MODE` gates push exactly as
it gates DMs. On staging it is `admins`, so a push row for a wallet that is not
in `ADMIN_WALLETS` is marked `skipped` and never sent. To test push on staging,
either add the test wallet to `ADMIN_WALLETS` or set the mode to `all` there.

## 7. Checks when it is in

1. `POST /api/notifications/push-token` with a bearer writes a `push_tokens`
   row, and a second post with the same token updates rather than duplicates.
2. Resolving a market a wallet traded writes a `notification_outbox` row with
   `channel = 'push'`.
3. The worker logs a drained batch and the phone shows the notification, with
   the title and body of the feed row.
4. Tapping it opens the market, not just the app. That is `data.link` arriving
   as a path.
5. A wallet with no device gets no push row, and no error.
