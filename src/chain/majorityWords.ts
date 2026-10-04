// PORTED_FROM mentioned/lib/majorityMarket.ts @ ce01ac3
// Keep byte-identical to the web copy. If the program changes, change both.
// Mobile edits: none.

// Pure math + helpers for majority-word (pari-mutuel) free markets.
//
// A majority market is a single pari-mutuel pool: every user places a fixed number
// of equal bets (default 2 × 150 tokens) on distinct words, one word wins, and its
// backers split the pool pro-rata with a guaranteed-minimum floor. Because every bet
// is the same size, a word's pool share is just its bet count.
//
// A market can instead pay several places from the same pool (`payout_weights`,
// e.g. [3, 2, 1] for a top three): see "Placed payouts" below. The default [1] is
// the original single-winner market, and reproduces its numbers exactly.
//
// No DB dependencies here, this is the single source of truth for the odds/payout
// math, unit-tested by scripts/test-majority-market.ts. See
// specs/majority_word_market_spec.md.

export const DEFAULT_ENDOWMENT = 300
export const DEFAULT_BETS_PER_USER = 2
export const DEFAULT_TAKEOUT = 0 // v1: independent of the floor; dial up only to simulate cash
export const DEFAULT_FLOOR_MULTIPLE = 1.5

/** Tokens staked per bet, given the per-market endowment and bet count. */
export function betSize(endowment: number, betsPerUser: number): number {
  if (betsPerUser <= 0) return 0
  return endowment / betsPerUser
}

/**
 * A word's implied probability = its share of the pool. With equal bets this equals
 * (bets on word ÷ total bets). Returns 0 for an empty pool.
 */
export function impliedProb(wordStaked: number, totalPool: number): number {
  if (totalPool <= 0 || wordStaked <= 0) return 0
  return Math.min(1, wordStaked / totalPool)
}

/** Distributable pool after the house takeout. */
export function distributable(pool: number, takeout: number): number {
  const t = Math.min(Math.max(takeout, 0), 1)
  return Math.max(0, pool * (1 - t))
}

/**
 * Payout multiple applied to every winning stake.
 *
 * Returns 0 when the winning word has no backers (`winnerStaked <= 0`), the
 * zero-backer case, where there is no one to pay and the house keeps the pool
 * (no payout, no refund, no points). Otherwise `max(D / winnerStaked, floor)`, so
 * an over-backed favorite is topped up to the floor (minted in free tokens).
 */
export function payoutMultiple(
  pool: number,
  winnerStaked: number,
  takeout: number,
  floor: number,
): number {
  if (winnerStaked <= 0) return 0
  const natural = distributable(pool, takeout) / winnerStaked
  return Math.max(natural, floor)
}

/**
 * Gross payout for a fresh `betSize` bet on a word right now, if that word wins.
 * Uses the post-bet pool (your bet joins the pool and the word's stake), so it's the
 * odds a trader actually gets by entering now. Floored like every winning payout.
 */
export function potentialWin(
  wordStaked: number,
  pool: number,
  betSize: number,
  takeout: number = DEFAULT_TAKEOUT,
  floor: number = DEFAULT_FLOOR_MULTIPLE,
): number {
  return betSize * payoutMultiple(pool + betSize, wordStaked + betSize, takeout, floor)
}

export interface WinnerStake {
  wallet: string
  staked: number
}

export interface WinnerPayout {
  wallet: string
  staked: number
  payout: number
}

/**
 * Compute per-backer payouts for the winning word(s). `pool` is the full market
 * pool (sum of every stake). `winners` are the stakes on the winning side only.
 * Returns [] when there are no winners (house keeps the pool).
 */
export function computePayouts(
  winners: WinnerStake[],
  pool: number,
  takeout: number = DEFAULT_TAKEOUT,
  floor: number = DEFAULT_FLOOR_MULTIPLE,
): WinnerPayout[] {
  const winnerStaked = winners.reduce((sum, w) => sum + w.staked, 0)
  const mult = payoutMultiple(pool, winnerStaked, takeout, floor)
  if (mult === 0) return []
  return winners.map(w => ({ wallet: w.wallet, staked: w.staked, payout: w.staked * mult }))
}

// ── Placed payouts (top N share one pool) ────────────────────────────────────
// One pool, weighted by finishing place. A stake on a word that finished in place
// r counts `weights[r]` times when the pool is divided:
//
//   multiple(r) = weights[r] * D / Σ over placed words (weights[place] * staked)
//
// So 1st always pays more per token than 2nd, and 2nd more than 3rd, however the
// picks were spread. A fixed split per place (60/25/15) cannot promise that: a
// crowded winner can pay less than a thinly held third. Only the ratio between
// weights matters, and [1] is the original winner-takes-all market.

/** The original market: one winning word takes the pool. */
export const WINNER_TAKES_ALL_WEIGHTS: readonly number[] = [1]
/** Top three share the pool, 1st counting 3x, 2nd 2x, 3rd 1x. */
export const TOP_THREE_WEIGHTS: readonly number[] = [3, 2, 1]
export const MAX_PAID_PLACES = 5
const MAX_PLACE_WEIGHT = 100

/**
 * Validate a per-market weight list: 1 to MAX_PAID_PLACES positive whole numbers,
 * never increasing (a lower place can't out-weigh a higher one). Returns null when
 * the input is not a usable list, so a route can reject it out loud.
 */
export function parsePayoutWeights(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_PAID_PLACES) return null
  const out: number[] = []
  for (const raw of input) {
    const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_PLACE_WEIGHT) return null
    if (out.length > 0 && n > out[out.length - 1]) return null
    out.push(n)
  }
  return out
}

/** A market row's weights, falling back to winner-takes-all (rows that predate the column). */
export function payoutWeightsOf(input: unknown): number[] {
  return parsePayoutWeights(input) ?? [...WINNER_TAKES_ALL_WEIGHTS]
}

/** How many finishing places a market pays. */
export function paidPlaces(weights: readonly number[]): number {
  return Math.max(1, weights.length)
}

/**
 * The place each tier starts at (1-based), given how many words are in each tier.
 * Tied words share a place and use up the ones below it, as on a podium: two words
 * tied for 1st are both 1st and the next word is 3rd.
 */
export function tierPlaces(tierSizes: readonly number[]): number[] {
  const out: number[] = []
  let place = 1
  for (const size of tierSizes) {
    out.push(place)
    place += Math.max(0, size)
  }
  return out
}

/**
 * The weight each tier's words carry. Tied words split the places they cover, so
 * two words tied for 1st under [3, 2, 1] carry 2.5 each. A place past the end of
 * `weights` carries nothing.
 */
export function tierWeights(tierSizes: readonly number[], weights: readonly number[]): number[] {
  const places = tierPlaces(tierSizes)
  return tierSizes.map((size, i) => {
    if (size <= 0) return 0
    let sum = 0
    for (let k = 0; k < size; k++) sum += weights[places[i] - 1 + k] ?? 0
    return sum / size
  })
}

export interface PlacedTier {
  /** Words in this tier (more than one means a tie). */
  words: number
  /** Everything staked on those words, house seed included. */
  staked: number
}

/**
 * Payout multiple for each tier, best place first. A tier nobody backed gets 0 and
 * its share goes to the tiers that were backed; all zeros means nobody is paid and
 * the house keeps the pool. The guaranteed floor applies to 1st place only, which
 * keeps the places in order and leaves a single-winner market exactly as it was.
 */
export function tieredMultiples(
  pool: number,
  tiers: readonly PlacedTier[],
  takeout: number,
  floor: number,
  weights: readonly number[],
): number[] {
  const raw = tierWeights(tiers.map(t => t.words), weights)
  // Scale so 1st carries exactly 1: a single tier then divides D by its own stake
  // with no rounding detour, identical to payoutMultiple().
  const top = raw[0] > 0 ? raw[0] : 1
  const rel = raw.map(w => w / top)
  const denom = tiers.reduce((sum, t, i) => sum + rel[i] * Math.max(0, t.staked), 0)
  if (denom <= 0) return tiers.map(() => 0)
  const d = distributable(pool, takeout)
  return tiers.map((t, i) => {
    if (t.staked <= 0 || rel[i] <= 0) return 0
    const natural = (rel[i] * d) / denom
    return i === 0 ? Math.max(natural, floor) : natural
  })
}

/**
 * The least a word can pay per token if it finishes 1st. The rest of the podium is
 * not known until the event ends, so this assumes the most-backed rivals take the
 * other paid places, which is the outcome that shares the pool the most ways. The
 * real payout is this or higher. With one paid place it is payoutMultiple().
 */
export function firstPlaceMultiple(
  pool: number,
  wordStaked: number,
  rivalStakes: readonly number[],
  takeout: number,
  floor: number,
  weights: readonly number[],
): number {
  const rivals = [...rivalStakes].sort((a, b) => b - a).slice(0, Math.max(0, weights.length - 1))
  const tiers: PlacedTier[] = [{ words: 1, staked: wordStaked }, ...rivals.map(staked => ({ words: 1, staked }))]
  return tieredMultiples(pool, tiers, takeout, floor, weights)[0]
}

/**
 * Gross payout for a fresh `betSize` bet on a word if it finishes 1st (see
 * firstPlaceMultiple for the assumption about the other places). The bet joins the
 * pool and the word's stake, like potentialWin().
 */
export function potentialWinPlaced(
  wordStaked: number,
  rivalStakes: readonly number[],
  pool: number,
  betSize: number,
  takeout: number,
  floor: number,
  weights: readonly number[],
): number {
  return betSize * firstPlaceMultiple(pool + betSize, wordStaked + betSize, rivalStakes, takeout, floor, weights)
}

/** "1st", "2nd", "3rd", "4th". */
export function placeLabel(place: number): string {
  const mod100 = place % 100
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`
  const suffix = ['th', 'st', 'nd', 'rd'][place % 10] ?? 'th'
  return `${place}${suffix}`
}

// ── Word normalization + spam filter ──────────────────────────────────────────

/** Lowercase, trim, collapse internal whitespace. Used for duplicate detection. */
export function normalizeWord(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Words that would trivially win "most-said" and ruin the board: function words
// (articles, pronouns, prepositions, conjunctions, auxiliaries), contractions, and
// the most common spoken fillers / generic verbs. Deliberately excludes topical
// content words (e.g. "border", "economy", "jobs") and proper nouns/slang, since
// those are exactly what makes a user-picked board interesting.
const STOPWORDS = new Set([
  // Articles / determiners / quantifiers
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'each', 'every', 'all', 'any',
  'some', 'no', 'none', 'both', 'either', 'neither', 'much', 'many', 'more', 'most',
  'few', 'fewer', 'less', 'least', 'such', 'own', 'same', 'other', 'another', 'enough',
  // Pronouns
  'i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their',
  'theirs', 'themselves', 'who', 'whom', 'whose', 'which', 'what', 'whatever',
  'whoever', 'whomever', 'someone', 'somebody', 'something', 'anyone', 'anybody',
  'anything', 'everyone', 'everybody', 'everything', 'nobody', 'nothing', 'one', 'ones',
  // Prepositions
  'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'about', 'as', 'into',
  'like', 'through', 'after', 'before', 'over', 'under', 'above', 'below', 'between',
  'among', 'against', 'during', 'without', 'within', 'along', 'across', 'behind',
  'beyond', 'around', 'near', 'off', 'up', 'down', 'out', 'onto', 'upon', 'per',
  // Conjunctions
  'and', 'or', 'but', 'if', 'because', 'so', 'than', 'then', 'while', 'although',
  'though', 'unless', 'until', 'whether', 'yet', 'nor', 'since', 'whereas',
  // Auxiliary / common verbs
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'having', 'do', 'does', 'did', 'doing', 'done', 'will', 'would', 'shall', 'should',
  'can', 'could', 'may', 'might', 'must', 'get', 'got', 'gets', 'getting', 'go',
  'goes', 'going', 'gone', 'went', 'come', 'comes', 'coming', 'came', 'make', 'makes',
  'making', 'made', 'take', 'takes', 'took', 'say', 'says', 'said', 'saying', 'see',
  'sees', 'saw', 'seen', 'know', 'knows', 'knew', 'known', 'think', 'thinks', 'thought',
  'want', 'wants', 'need', 'needs', 'let', 'put', 'give', 'gives', 'gave', 'tell',
  'tells', 'told', 'ask', 'asks', 'asked', 'look', 'looks', 'looking', 'use', 'used',
  // Adverbs / fillers / discourse
  'not', 'no', 'yes', 'yeah', 'yep', 'yup', 'nope', 'nah', 'ok', 'okay', 'well',
  'just', 'very', 'too', 'also', 'really', 'actually', 'basically', 'literally',
  'honestly', 'obviously', 'seriously', 'again', 'always', 'never', 'ever', 'now',
  'here', 'there', 'when', 'where', 'why', 'how', 'how', 'only', 'even', 'still',
  'quite', 'rather', 'somewhat', 'maybe', 'perhaps', 'right', 'sure', 'thing', 'things',
  'stuff', 'kind', 'sort', 'way', 'ways', 'lot', 'lots', 'bit', 'guy', 'guys',
  'um', 'uh', 'uhh', 'umm', 'hmm', 'mhm', 'er', 'ah', 'oh', 'huh', 'gonna', 'wanna',
  'gotta', 'kinda', 'sorta', 'lemme', 'gimme', 'dunno', 'cause', 'cos',
  // Contractions
  "i'm", "you're", "he's", "she's", "it's", "we're", "they're", "i've", "you've",
  "we've", "they've", "i'll", "you'll", "he'll", "she'll", "we'll", "they'll",
  "i'd", "you'd", "he'd", "she'd", "we'd", "they'd", "isn't", "aren't", "wasn't",
  "weren't", "don't", "doesn't", "didn't", "won't", "wouldn't", "can't", "couldn't",
  "shouldn't", "mustn't", "haven't", "hasn't", "hadn't", "that's", "there's", "here's",
  "what's", "who's", "let's", "y'all", "gonna",
])

export function isStopword(word: string): boolean {
  return STOPWORDS.has(normalizeWord(word))
}

export const MIN_WORD_LEN = 3
export const MAX_WORD_LEN = 12

/**
 * Returns a user-facing reason a coined word is not allowed, or null if it passes.
 * Rules: 3-12 chars, English letters and numbers only (no spaces, accents, or
 * symbols), and not a blocked common/filler word. Names, brands, and slang pass.
 * Profanity is checked separately (server + client) via lib/chatFilter.
 */
export function coinedWordError(word: string): string | null {
  const n = normalizeWord(word)
  if (n.length < MIN_WORD_LEN) return `Words need at least ${MIN_WORD_LEN} characters`
  if (n.length > MAX_WORD_LEN) return `Words can be at most ${MAX_WORD_LEN} characters`
  // Either all letters or all numbers, never a mix (e.g. "and1") or symbols/accents.
  if (!/^[a-z]+$/.test(n) && !/^[0-9]+$/.test(n)) return 'Use only letters, or only numbers'
  if (isStopword(n)) return 'That word is too common to pick'
  return null
}

export function isValidCoinedWord(word: string): boolean {
  return coinedWordError(word) === null
}

/**
 * Normalize an admin-provided per-market ban list: lowercase/trim each entry, drop
 * blanks, and dedupe. Entries are matched against a coined word's `normalizeWord`
 * form, so they don't need to pass `coinedWordError` (an admin can ban anything;
 * out-of-format entries simply never match a coinable word). Capped to keep the
 * stored array bounded.
 */
export const MAX_BANNED_WORDS = 500

export function normalizeBanList(words: string[]): string[] {
  const out = new Set<string>()
  for (const w of words) {
    const n = normalizeWord(w)
    if (n) out.add(n)
    if (out.size >= MAX_BANNED_WORDS) break
  }
  return [...out]
}
