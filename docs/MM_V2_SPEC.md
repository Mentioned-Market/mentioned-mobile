# Mentioned Mobile: top 3 majority markets

For the `mentioned-mobile` repo. Self-contained: you do not need the web repo to
build this, though §11 lists the web files to copy logic from if you have it.

## 1. What changed

A majority market used to pay only the single most-said word. A market can now pay
the **three most-said words from one pool**, weighted 3 / 2 / 1 by finishing place.
This applies to both free (token) and paid (USDC, on-chain) majority markets.

- It is a per-market setting. Most existing markets are still winner-takes-all and
  must look and behave exactly as they do today.
- The paid program is upgraded on devnet and mainnet. The web app and API are done.
- **Buying and claiming transactions do not change.** Nothing new to sign.
- Creating and resolving markets is admin-only on the web. Out of scope here.

What the mobile app has to do:

1. Tell a top 3 market from a winner-takes-all one (§3).
2. Show the right claimable amount on a paid top 3 market (§5). This is the one
   place a wrong figure is possible: the chain always pays correctly, but an app
   using the old formula will display the wrong number.
3. Use top 3 wording and the "at least, if 1st" estimate while a market is open (§6).
4. Show the result podium once a top 3 market resolves, matching the web (§7, §8).

## 2. The rule

Each placed word's stake counts `weight[place]` times when the pool is divided:

```
payout per unit on place p = weight[p] * D / sum over placed words (weight[place] * stake)
```

`D` is the pool after the fee. 1st always pays more per unit than 2nd, and 2nd more
than 3rd. A lower place can pay less than the stake.

- **Ties share a place.** Two words tied for 1st are both 1st, and the next word is
  **3rd**. There is no 2nd in that result. A tied tier's weight is the average of
  the places it covers: (3 + 2) / 2 each for a two-way tie for 1st.
- **More than one of a player's picks can pay.**
- **A place nobody backed** pays nobody; its share goes to the backed places.
- **Fewer than three places can be called** (for example only 1st and 2nd).

## 3. Is this a top 3 market?

| Market | Where | Top 3 when |
|---|---|---|
| Free | `market.payout_weights` (number array) | length > 1, e.g. `[3,2,1]`. `[1]` or missing = winner-takes-all. |
| Paid | `payout_weights` in the market account (§4.2) | second byte > 0, e.g. `[3,2,1]`. `[0,0,0]` and `[n,0,0]` = winner-takes-all. |

Call this `paysPlaces` below. Number of paid places = count of non-zero weights.

## 4. Data

### 4.1 Free markets (API)

| Endpoint | Field | Meaning |
|---|---|---|
| `GET /api/custom/[id]/board` | `market.payout_weights` | see §3 |
| | `market.takeout_pct`, `market.floor_multiple` | fee (0 to 1) and the 1st-place floor. Numeric strings: parse them. |
| | `board[].place` | `number \| null`. Finishing place once resolved. Tied words share one. |
| | `board[].staked`, `board[].mention_count`, `board[].resolved_outcome` | as before. `resolved_outcome` is now `true` for **every placed word**, not just one. |
| | `userEntry[].tokens`, `userEntry[].tokens_received` | stake and settled payout per pick. Settled amounts need no math. |
| `GET /api/custom` (list) | `payout_weights`, `takeout_pct`, `floor_multiple` | per market |
| | `words_prices[].place` | as above. `yes_price` is the word's share of the pool. |

### 4.2 Paid markets (API + account bytes)

| Endpoint | Field | Meaning |
|---|---|---|
| `GET /api/paid-majority/market/[id]` | `account` | raw base64 market account. Decode the new fields below. |
| | `board[].place` | `number`. 1 to 3 once resolved on a top 3 market, else 0. |
| `GET /api/paid-majority/my-positions` | `positions[].place` | same |
| `GET /api/paid-majority/user-positions` | `payoutUsdc`, `claimableUsdc` | **already place-aware.** Prefer these over computing. |
| `GET /api/paid-majority/user-pnl` | `words[].place`, `payoutUsdc`, `pnlUsdc` | already place-aware |
| `GET /api/paid-majority/[id]/results` | leaderboard | unchanged shape, already place-aware |
| `GET /api/paid-majority/list` | `podium?` | `{ place, words: string[], multiple }[]`, best first. Present only on a resolved top 3 market. Ready to draw. |

New market account fields. They sit **immediately after `vault`**, in what was
reserved space. `admins` earlier in the account is variable length, so read these
sequentially after `vault`, not at a fixed offset. Account size is unchanged.

| Field | Type | Bytes |
|---|---|---|
| `payout_weights` | `[u8; 3]` | 3 |
| `place_pot` | `[u64; 3]` little-endian, USDC base units | 24 |
| `place_units` | `[u64; 3]` little-endian | 24 |

Index = place - 1. A market created before the upgrade reads all zeros. If the
buffer ends before these fields, treat them as zero.

`WordEntry.place` is one byte at **offset 114** (right after `added_by`). 0 = not
placed, 1 to 3 = finishing place. A placed word also has `outcome = Winner (1)`.

A tie leaves a gap: two words tied for 1st both have `place = 1`, the next word has
`place = 3`, and `place_pot[1]` / `place_units[1]` stay 0.

## 5. Claimable amount (paid)

BigInt, floor division. Choose the formula from the word's `place`, nothing else:

```
place == 0:  units * distributable / winner_units            (unchanged)
place >= 1:  units * place_pot[place-1] / place_units[place-1]
```

Return 0 if the divisor is 0. Use one function for this everywhere a payout is
shown (claim button, holdings, portfolio value, win share card).

Which positions can be claimed is unchanged: any position on a word with
`outcome = Winner`. On a top 3 market that covers every placed word. The `claim`
instruction, its accounts and its data are byte-for-byte the same.

## 6. While the market is open

Only when `paysPlaces`. Winner-takes-all markets keep today's numbers and wording.

**Estimate.** The podium is unknown until the event ends, so show the least a pick
pays if its word finishes 1st: assume the most-backed rival words take the other
places, which shares the pool the most ways. The real payout is that or more.

```
weights  = [3, 2, 1]
D        = pool * (1 - fee)
rivals   = stakes of every OTHER word, sorted high to low, first (places - 1) of them
multiple = weights[0] * D / (weights[0]*wordStake + weights[1]*rivals[0] + weights[2]*rivals[1])
```

- A fresh pick: add the bet to both `pool` and `wordStake` first, then
  `win = bet * multiple`.
- A pick already placed: `pool` and `wordStake` as they are, `win = stake * multiple`.
- Fewer rivals than places: use the ones that exist.
- **Free only:** `multiple = max(multiple, floor_multiple)`. Paid has no floor.
- Fee: free `takeout_pct`; paid `fee_bps / 10000`.

Worked example (paid, 2% fee): pool 20 units, word has 2, biggest rivals 6 and 4.
Fresh $1: pool 21, word 3, D = 20.58. `3 * 20.58 / (9 + 12 + 4) = 2.4696`. Show
`$2.47`.

**Wording**

| Place | Winner-takes-all (keep) | Top 3 |
|---|---|---|
| Ticket line | `win ~$X` / `if it wins → X` | `if 1st, at least $X` |
| Holding line | `if wins ~$X` | `if 1st ~$X` |
| Word bubble | `win ~X` | `1st ~X` |
| Ticket note (free) | Only one word wins... | The 3 most-said words all pay from one pool: 1st pays the most, then each place below it. More than one of your picks can pay. Odds move as more picks land. |
| How it works | The most-mentioned word wins. Everyone who picked it splits the pool... | The 3 most-mentioned words all pay from one pool. 1st pays the most per pick, then 2nd, then 3rd. Rare picks pay big and popular picks pay small. |

## 7. Once resolved

Only when `paysPlaces`.

- **Podium** above the word board on the market screen (§8).
- **Compact podium** on the market list card, in place of the word tiles (§8.5).
- **Per pick:** `Finished 1st` / `Finished 2nd` / `Finished 3rd`, or `Did not place`.
  Winner-takes-all keeps `Won` / `Lost` / `no win`.
- **Word board:** every placed word gets the winner styling plus its place label.
- **Claim** button on every placed word the user holds (paid), amount from §5.
- **Nothing placed had any picks:** no podium; the house kept the pool, as today's
  "no winner" state.

## 8. The podium

Flat colour and type only. No gradients, glows, shadows, images or emoji. Match
these values; they are the web's.

### 8.1 Tiers

Group the resolved words by `place`, lowest place first. Each group is one **step**.
A tie puts several words on one step.

Multiple shown on each step (what a pick on that place paid per unit staked):

- **Paid:** `place_pot[p-1] / (place_units[p-1] * unit_price)`. From the list
  endpoint it is already `podium[].multiple`.
- **Free:** with `stake_t` = sum of `staked` on the tier's words, `w_t` = average of
  `weights` over the places the tier covers (0 past the last weight),
  `multiple_t = w_t * D / sum(w_s * stake_s)`; the first tier is then
  `max(multiple, floor_multiple)`. A tier with no stake shows `no picks`.

### 8.2 Layout (market screen)

A card: background `#0d0d0d`, 1px border `rgba(255,255,255,0.07)`, radius 16.
On a phone it stacks: text block on top, steps below, steps flush to the card's
bottom edge.

**Text block** (padding 20)

- Label `FINAL RESULT`: 11px, semibold, uppercase, letter-spacing 0.16em, `#F2B71F`.
- Headline: the 1st-place word(s), joined with ` & ` for a tie. 30px, bold,
  line-height 1.05, white.
- Sub-line, 14px, `#a3a3a3`:
  - free: `Said the most, 11 times.` / tie: `Tied for the most said, 14 times each.`
  - paid (no mention counts): `Said the most.` / `Tied for the most said.`
  - then always: ` The top 3 share the pool.`
- **Your picks** (only if the user has picks), above a 1px top border:
  - label `YOUR PICKS` 11px uppercase `#737373`; net result right-aligned, 18px
    bold, green `#34C759` if >= 0 else red `#FF3B30`.
  - one row per pick, 14px: word (white, truncated) and
    `Finished 2nd` (the place in `#F2B71F`) or `Did not place`, then the pick's net.
  - net format: free `+369` (rounded tokens, with a small `tokens` after the
    total); paid `+$1.35` / `-$1.00`.
  - pick net = payout - stake (free: `tokens_received - tokens`).

**Steps** (padding 12 left and right, 8 top, 0 bottom)

- One row, aligned to the bottom, 1px gap between steps.
- **Visual order: 2nd, 1st, 3rd.** Read aloud in order 1st, 2nd, 3rd.
- Width: equal share, except a tied step is as many times wider as it has words.
- A missing place is simply not drawn (tie for 1st then 3rd = two steps).

Each step, top to bottom:

1. `YOUR PICK` if the user holds a word on it: 9px, bold, uppercase,
   letter-spacing 0.14em, `#F2B71F`.
2. The word(s), one per line, centred, bold, white, single line truncated:
   16px on 1st, 14px on the others.
3. Free only: `11 mentions` (prefix `Tied · ` on a tie), 10px, `#737373`.
4. 10px gap, then the block.

The block:

| | 1st | 2nd | 3rd |
|---|---|---|---|
| Height | 148 | 104 | 76 |
| Numeral size | 64 | 44 | 34 |
| Background | `#F2B71F` | `#171717` | `#171717` |
| Top edge | none | 1px `rgba(255,255,255,0.16)` | same |
| Numeral colour | `#0a0a0a` | `#ffffff` | `#ffffff` |
| Bottom text colour | `rgba(10,10,10,0.72)` | `#a3a3a3` | `#a3a3a3` |

- Top corners radius 8, bottom corners square. Padding 10.
- Numeral (`1`, `2`, `3`) top-left, bold, line-height 0.8, tabular figures.
- Bottom-left: `pays 2.81x` (two decimals), 10px semibold. `no picks` if nobody
  backed that place.

### 8.3 Motion

- Each block wipes up from its base (reveal by clipping, do not scale: the numeral
  must not stretch). 650ms, easing `cubic-bezier(0.22, 1, 0.36, 1)`.
- Stagger so the lowest step goes first and the winner last:
  delay = `(3 - place) * 120ms`.
- The words above fade up 12px over 400ms, delay `520ms + (3 - place) * 120ms`.
- Respect the system reduce-motion setting: no animation.

### 8.4 Sizes on a larger screen

On tablets the web uses heights 184 / 128 / 92, numerals 88 / 58 / 44, padding 16,
words 20 / 16px, and puts the text block to the left of the steps (5:7 split).

### 8.5 Compact podium (list card)

Same steps, no text block, no mentions line, no `YOUR PICK`.

- Fills the card's word area (174px tall on the web card).
- Each column takes a share of that height: 1st 100%, 2nd 72%, 3rd 50%. The word
  sits at the top of its column and the block fills the rest, so a tie's second
  line shortens the block instead of overflowing.
- Numerals 60 / 42 / 30. Padding 10. Words 14px (1st) and 13px.
- Bottom text is just `2.81x` (no "pays"), 10px.
- Whole podium taps through to the market.

## 9. Edge cases

- **Winner-takes-all market:** no podium, no new wording, old formulas. This must
  be a no-op.
- **Right after a paid resolve**, the market account can say Resolved before the
  word entries show their places (the word list comes from a slower index). For a
  short while a winning pick may read as unplaced. Do not cache that state; refetch.
- **Tie for 1st:** steps for 1st and 3rd only. `place_pot[1]` is 0.
- **Only two places called:** two steps.
- **Refunded word** (removed by an admin): unchanged. It refunds the exact stake
  and is never on the podium.
- **Cancelled market:** unchanged. No podium.
- **Long words** (up to 12 characters) and a two-word tie must not overflow a step
  on the narrowest supported screen.

## 10. Test vectors

**Pots**, verified on chain (unit price 10,000; weights 3/2/1). Use these to test
the decoder and §5 against a market's stored pots.

| Pool | Fee bps | Tiers (sizes) | Tier units | `place_pot` | Fee kept |
|---|---|---|---|---|---|
| 400,000 | 200 | 1, 1, 1 | 8, 10, 6 | 188160, 156800, 47040 | 8000 |
| 130,000 | 500 | 2, 1 | 7, 5 | 96055, 0, 27444 | 6501 |
| 60,000 | 500 | 1, 2 | 2, 4 | 28500, 28500, 0 | 3000 |
| 40,000 | 500 | 1, 1, 2 | 1, 1, 2 | 19000, 12666, 6333 | 2001 |
| 40,000 | 500 | 1, 1 | 1, 1 | 22800, 15200, 0 | 2000 |

**Claim** from the first row: 1 unit on 1st = `1 * 188160 / 8` = 23520; 1 unit on
2nd = 15680; 1 unit on 3rd = 7840.

**Free podium**, pool 4,500 tokens, no fee, floor 1.5: 1st staked 600, 2nd 900,
3rd 300 pay 3.46x, 2.31x, 1.15x. Tie for 1st (900 + 600) then 3rd (300) pays
2.78x and 1.11x.

**Estimate:** the worked example in §6 gives 2.4696.

## 11. Done when

- A winner-takes-all market, free and paid, is unchanged in every screen.
- On a paid top 3 market the claim amount shown equals the USDC received, to the
  base unit, for 1st, 2nd and 3rd, and after a tie.
- Open top 3 markets show the §6 wording and estimate.
- Resolved top 3 markets show the podium on the market screen and the list card,
  matching the web side by side, including a tie and a two-place result.
- A user holding picks sees `YOUR PICK`, per-pick finish and their net.

Web reference, if you have that repo: `components/MajorityPodium.tsx` (podium),
`lib/majorityMarket.ts` (`tieredMultiples`, `firstPlaceMultiple`,
`potentialWinPlaced`), `lib/majorityMarketUsdc.ts` (`deserializeMajorityMarket`,
`wordEntryPlace`, `winnerPayoutBaseUnits`).
