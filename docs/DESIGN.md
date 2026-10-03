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
3. **Paid and free are told apart by the money line**, not by a PAID or FREE
   badge: "$12.00 pool" against "Free · 300 play tokens" (`poolLabel` in
   `src/markets/game.ts`; "300 tokens" alone read as a price). The kind of
   game is the one badge a card carries: "Most said wins" in gold for a majority board (whose words are
   numbered), "Yes or no on each word" for a YES/NO market. `Pill` is for a status word only: WON, LOST,
   YOU, CAPTAIN, NEW. A card with two pills is a card carrying too much.
4. **Headers are a title, the way back, and the three ways out.** `Screen`
   draws them. A pushed screen gets a chevron, a modal one an X. On the right,
   every screen carries search, chat and notifications (`HeaderActions`), so
   none of them is ever more than a tap away; a screen that is one of them
   leaves itself out, and a flow that should not be left halfway (sign in,
   bug report) shows none. No subtitles, no back labels, no section counts, no
   eyebrow captions.
5. **Controls are pills.** `Button` (56 tall, gold for the screen's one
   action, neutral beside it; the one exception is sign-in, which leads with
   white `ProviderButton`s carrying Google's and X's own marks, with an email
   code one gold text link below them), `Segmented` for a choice between two to four
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
    under Home and Me, not a tab. A sideways swipe anywhere but a rail moves
    to the neighbouring tab.
11. **Things that change show it.** A chance, a multiplier or a pool that moves
    goes through `LiveNumber`: it flashes green when the thing became more
    likely or larger, red for the other way, and counts to the new value. A
    countdown in its last hour shows seconds, ticks, and turns gold
    (`useCountdown`). Cards give a little under the finger (`PressableScale`);
    rows keep the opacity dip. Every one of these is off or instant under
    reduce motion.
12. **Rewards are marked for what was earned, never to push a stake.** A win
    gets its moment (`WinMoment`), points and achievements a toast
    (`src/ui/toast.tsx`), the week's climb a line under the podium. None of
    them appears for money staked, and none invents urgency the market does
    not have.

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

- **Home**: wordmark and the bell; signed out, "Call what gets said" first
  (`HowItWorks`: what Mentioned is in three lines, Sign in and "Try it free",
  which opens the free market closing soonest); the prize pool on a gold card with the
  week's top three as a podium; the Arena row only while a season is live;
  the Seeker offer while a welcome stake is on offer (the amount in big
  gold type, one tap to link, "Not now" puts it away; Me keeps the link);
  "Your picks" when signed in, a claim row and up to three open markets
  soonest to close; a horizontal rail of cover-image cards for markets closing
  soon; the live trade ticker; a two-column grid of tiles for what just
  resolved; the trending-word rail; then "Activity", the same feed as the
  ticker as a four-row board stepping through the latest ten trades, ending on
  a link to Markets.
  Neither market preview shows words: a preview is the market, the words are
  the market screen. Each section has its own shape on purpose. The viewer
  gets one section, their open picks, because it is the reason to open the
  app between events; the rest of them (balance, history, settings) is Me.
- **Markets**: title, `Segmented` All / Free / Paid, the
  sectioned list of `MarketCard`s.
- **Chat**: title (the market's, or "Chat"), a Live dot, messages as bubbles,
  newest at the bottom, and the composer pinned under them. Your own sit on
  the right in gold; everyone else's on the left under their avatar and name,
  shown once per run of messages. A long press is for reply, report and hide.
  A market screen carries a Chat card above "More markets"; the global room is
  the chat button in every header.
- **Ranks**: `Segmented` This week / Last week; the prize pool card; the
  raffle line; the board as rows in one card.
- **Arena**: its own tab: the season hero, your team or the entry card, how it
  works, the standings.
- **Me**: signed out, the ways in themselves (`SignInCard`: Google and X,
  email as a link, each opening sign-in with that login started), as on every
  screen that needs an account. Signed in, the name and picture; the portfolio card (total, then Cash and At
  stake, To claim only when there is something, Add funds and Withdraw); one
  list of Positions, Referrals and Report a bug; sign out. Notification
  settings live behind the bell, not here. The Seeker wallet is never a card
  of its own: it is reached from Add funds (it signs the deposit over MWA) and
  from Withdraw (as the destination).
- **Positions**: a stack screen. Two stats, claim cards, open markets,
  finished markets, each market one expandable row.
- **A market**: `MarketHeader` (thumbnail, title, one line, then the game's
  name and how it is won in a sentence, from `src/markets/game.ts`, so a first
  visit can read the board), `YourPositions`
  when there is something to say, the board (`WordList` or `WordBoard`), the
  chart, recent trades, then `FeaturedWords` and `SimilarMarkets` so the page
  ends somewhere to go rather than at the end of its own board. Stat boxes are
  gone; volume is in the chart's corner.
