# Web task: wallet-keyed rate limits

Written Sep 16 2026 from the mobile side. `lib/rateLimit.ts` keys every
window on the client IP (`getClientIp`, from `x-forwarded-for`). Phones sit
behind carrier-grade NAT: one mobile network can present thousands of
handsets on a handful of IPs. During a live event that means one stadium's
worth of users shares one bucket on `/api/paid-rpc`, and honest users get
429s for other people's traffic. Desktop is unaffected either way.

## Change

Key the window on the wallet when the request carries a verified session, and
on the IP only when it does not. No new limiter; the change is what string is
passed as `ip` to `checkRateLimit`.

### 1. A helper, `lib/rateLimit.ts`

```ts
import type { NextRequest } from 'next/server'
import { getClientIp } from '@/lib/clientIp'
import { getVerifiedWallet } from '@/lib/walletAuth'

/**
 * Who a rate limit window belongs to. A signed-in caller is limited per
 * wallet, so a whole carrier NAT is not one bucket; anyone else per IP as
 * before. The prefix keeps the two namespaces from colliding.
 */
export function rateLimitKey(req: NextRequest): string | null {
  const wallet = getVerifiedWallet(req)
  if (wallet) return `w:${wallet}`
  const ip = getClientIp(req)
  return ip ? `ip:${ip}` : null
}
```

`getVerifiedWallet` already reads `Authorization: Bearer` first and the
cookie second (merged from `feat/mobile-api-updates`), so the app's requests
qualify with no app change. A forged bearer does not verify, so it cannot be
used to pick a fresh bucket.

### 2. Call sites

Replace `getClientIp(req)` with `rateLimitKey(req)` as the second argument
of `checkRateLimit` in these routes (`rg checkRateLimit app/`):

| Route | Note |
|---|---|
| `app/api/paid-rpc/route.ts` | The one that matters most: every balance read, simulation and broadcast from the app goes through it. |
| `app/api/paid-majority/record-buys/route.ts` | Already reads the wallet lower down; use the key at the top. |
| `app/api/paid-majority/my-positions`, `user-positions`, `market/[id]`, `[id]/results`, `recent-bets`, `word-text` | Polled by the app while a screen is open. |
| `app/api/paid-markets/market/[id]`, `user-positions`, `user-history`, `wallet-summary` | Same. |
| `app/api/onramp/quote`, `onramp/session` | Session-gated already. |
| `app/api/openfort/encryption-session` | Keep per IP: it runs BEFORE there is a session (it is how the wallet is recovered). Leave as is. |
| `app/api/rpc/mainnet`, `event-pass/verify` | Web-only paths; either is fine. |

Bucket names and ceilings stay as they are. The window store is in-process;
nothing about its lifetime changes.

### 3. Ceilings to check

With per-wallet keys the numbers should be what one person can reasonably do,
not what a network does:

- `paid-rpc`: the app polls a market screen every 5 s (one `getAccountInfo`),
  balances every 60 s, and a trade is about six calls (blockhash, simulate,
  send, two or three confirmation polls). 60 per minute per wallet is
  comfortable; anything under 20 will bite a trade.
- Positions and market routes: the app polls at 5 to 15 s per screen. 30 per
  minute per wallet is plenty.

## Verify

Two wallets from one IP must get separate windows: exhaust one, the other
still answers.

```bash
for i in $(seq 1 70); do curl -s -o /dev/null -w '%{http_code}\n' -X POST https://www.mentioned.market/api/paid-rpc \
  -H "Authorization: Bearer $TOKEN_A" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestBlockhash","params":[]}'; done | sort | uniq -c
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://www.mentioned.market/api/paid-rpc \
  -H "Authorization: Bearer $TOKEN_B" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestBlockhash","params":[]}'   # 200
```

Unauthenticated callers keep the old per-IP behaviour, so nothing on the
website changes for signed-out visitors.

## Not in this task

Anything keyed by design on IP (sign-in itself, the encryption session) stays
on IP. Persistent or shared limit storage is out of scope; the in-memory
store is fine per instance.
