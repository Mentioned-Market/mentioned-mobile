# Design system (v7)

The rules every screen follows since the v7 UI pass (SPEC section 10). The
reference was Bagel, another prediction app: each of its screens answers one
question and shows nothing that does not help answer it. This document is the
checklist for keeping the app that way. Tokens and components live in
`src/ui/`.

## Rules

1. **One chance figure per word.** A word shows the chance it happens, as a
   percentage: the YES price on a YES/NO market, the pool share on a majority
   board. The NO price is never printed and cents notation (`62c`) is not used
   anywhere. The side is chosen on the trade sheet, not on the list.
2. **One card shape.** `Card` from `src/ui/card.tsx`: `colors.surface` on the
   black ground, `radius.card` (24) corners, no border, no coloured outline.
   Lines inside a card are `Row`s with a hairline above every row but the
   first. Green and red tints (`colors.yesTint`, `colors.noTint`) are for a
   whole block whose meaning is a side or an outcome (a claim card), nothing
   else.
3. **Paid and free are told apart by the money unit**, `$` against `tokens`,
   not by a PAID or FREE badge. The kind of game is the one badge a card
   carries: "Most said wins" in gold for a majority board (whose words are
   numbered), "Yes or no on each word" for a YES/NO market. `Pill` is for a status word only: WON, LOST,
   YOU, CAPTAIN, NEW. A card with two pills is a card carrying too much.
4. **Headers are a title and at most one round button each side.** `Screen`
   draws them. A pushed screen gets a chevron, a modal one an X. No subtitles,
   no back labels, no section counts, no eyebrow captions.
5. **Controls are pills.** `Button` (56 tall, gold for the screen's one
   action, neutral beside it), `Segmented` for a choice between two to four
   things, `Chip` for a small fact with a caption, `IconButton` for a round
   icon.
6. **The trade sheet is a screen** (`BottomSheet full`): a thumbnail and two
   lines at the top, the side as a `Segmented`, the amount in `type.display`,
   the return under it in green, chips for the chance and the balance, four
   presets, the bare `NumberPad`, and `SwipeButton` pinned as the footer.
   Nothing else on it. Buy and sell, YES and NO, share the layout.
7. **Copy is kept.** Every state, warning and error sentence the app had
   before v7 is kept word for word. Only the frame changed.
8. **Numbers set tabular.** Anything that can change while on screen uses
   `type.money`, `type.display` or `fontVariant: ['tabular-nums']`.
9. **Body text is never under 14.** Captions at 12 are for a pill or the word
   "chance" under a figure, never a sentence.
10. **Five tabs in the standard bar.** Home, Markets, Ranks, Arena, Me, black
    with a hairline above and gold for the current one. Positions is a screen
    under Home and Me, not a tab.

## Tokens (`src/ui/theme.ts`)

| Token | Value | Use |
|---|---|---|
| `colors.bg` | `#000000` | The ground |
| `colors.surface` | `#151515` | Every card, chip, the tab bar |
| `colors.surfaceRaised` | `#242424` | A control on a card: a selected segment, a pressed key |
| `colors.border` | `#2A2A2A` | Hairlines between rows only |
| `colors.text` / `textMuted` | white / `#8F8F94` | The only two text colours |
| `colors.gold` | `#F2B71F` | The brand, the one action, anything selected |
| `colors.yes` / `no` | green / red | A side, an outcome, a chance figure |
| `radius.card` / `control` / `thumb` | 24 / pill / 14 | |
| `type.display` | 56 bold tabular | The one number a screen is about |
| `type.title` | 28 bold | Screen titles |
| `type.heading` | 18 semibold | A card's title |
| `type.label` | 14 medium muted | The caption over a `Stat` |

## Screens

- **Home**: wordmark and the bell; the prize pool on a gold card with the
  week's top three as a podium; the Arena row only while a season is live; a
  horizontal rail of cover-image cards for markets closing soon; a two-column
  grid of tiles for what just resolved, with the live trade ticker between
  them. Neither preview shows words: a preview is the market, the words are
  the market screen. Each
  section has its own shape on purpose. Nothing about the viewer: that is Me.
- **Markets**: title, search button, `Segmented` All / Free / Paid, the
  sectioned list of `MarketCard`s.
- **Ranks**: `Segmented` This week / Last week; the prize pool card; the
  raffle line; the board as rows in one card.
- **Arena**: its own tab: the season hero, your team or the entry card, how it
  works, the standings.
- **Me**: the name and picture; the portfolio card (total, then Cash and At
  stake, To claim only when there is something, Add funds and Withdraw); one
  list of Positions, Referrals and Report a bug; sign out. Notification
  settings live behind the bell, not here. The Seeker wallet is never a card
  of its own: it is reached from Add funds (it signs the deposit over MWA) and
  from Withdraw (as the destination).
- **Positions**: a stack screen. Two stats, claim cards, open markets,
  finished markets, each market one expandable row.
- **A market**: `MarketHeader` (thumbnail, title, one line), `YourPositions`
  when there is something to say, the board (`WordList` or `WordBoard`), the
  chart, recent trades. Stat boxes are gone; volume is in the chart's corner.
