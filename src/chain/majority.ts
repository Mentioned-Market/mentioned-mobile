// PORTED_FROM mentioned/lib/majorityMarketUsdc.ts @ ae8c82e
// Keep byte-identical to the web copy. If the program changes, change both.
// Mobile edits: imports only (config, ./amm, ./majorityWords, noble 2.x blake3.js path).

// ── On-chain SDK for the PAID MAJORITY market (mention-majority-market) ───────
//
// A pari-mutuel "majority word" market settled in USDC. Users buy whole UNITS of
// a word at a fixed unit_price; the word said the most wins; the pool (minus fee)
// is split pro-rata among holders of the winning word(s). This is the real-money,
// on-chain sibling of the free majority market (lib/majorityMarket.ts) and mirrors
// the hand-rolled @solana/kit conventions of the AMM SDK (lib/mentionMarketUsdc.ts):
// hardcoded Anchor discriminators, manual LE/Borsh encoders, getProgramDerivedAddress
// PDAs, byte-offset account decoders.
//
// It is a DIFFERENT program from the AMM (different id + account layouts), so this
// is a parallel SDK — but it reuses the AMM's program-agnostic plumbing
// (sendInstructions, ATA derivation, USDC balance/format helpers). Program id is
// cluster-selected in lib/solanaConfig.ts (devnet-only for now).
//
// getProgramAccounts (board/position enumeration) is NOT here — the browser
// /api/paid-rpc proxy blocks it. Server-side enumeration lives in
// lib/paidMajorityServer.ts.

import {
  address as toAddress,
  type Address,
  type Instruction,
  type AccountMeta,
  AccountRole,
  getProgramDerivedAddress,
  getAddressEncoder,
} from '@solana/kit'
import { blake3 } from '@noble/hashes/blake3.js'
import { isStopword } from './majorityWords'
import { MAJORITY_PROGRAM_ID } from '../config'
// Reuse the AMM SDK's program-agnostic helpers (they never reference the AMM
// program id — only the shared USDC mint, ATA/token programs, and the paid RPC).
import {
  USDC_MINT,
  TOKEN_PROGRAM,
  SYSTEM_PROGRAM,
  ASSOCIATED_TOKEN_PROGRAM,
  RENT_SYSVAR,
  USDC_PRECISION,
  getAssociatedTokenAddress,
  createAtaIx,
  sendInstructions,
  fetchUsdcBalance,
  formatUsdc,
} from './amm'

export {
  USDC_MINT,
  getAssociatedTokenAddress,
  createAtaIx,
  sendInstructions,
  fetchUsdcBalance,
  formatUsdc,
}

// ── Constants ────────────────────────────────────────────
export const PROGRAM_ID = toAddress(MAJORITY_PROGRAM_ID)

// Fixed $1 per unit for the paid majority markets we create (unit_price is per
// market on-chain, but the product only ever uses $1). 1 USDC = 1_000_000 base units.
export const UNIT_PRICE = 1_000_000n
// v1 floor is disabled (must be 1.0x = 1_000_000 fixed-point) per the contract.
export const FLOOR_MULTIPLE_ONE = 1_000_000n

// Word length + charset gate — mirror on-chain exactly (spec §4) so the UI rejects
// invalid words before submit. Min/max are inclusive.
export const MIN_WORD_LEN = 3
export const MAX_WORD_LEN = 12

// Anchor instruction discriminators (from the IDL; verified against the devnet
// program's passing e2e tests).
const DISC = {
  buy:         new Uint8Array([102, 6, 61, 18, 1, 218, 235, 234]),
  claim:       new Uint8Array([62, 198, 214, 193, 213, 159, 108, 210]),
  claimRefund: new Uint8Array([15, 16, 30, 161, 255, 228, 97, 60]),
  createMarket:new Uint8Array([103, 226, 97, 235, 200, 188, 251, 254]),
  resolve:     new Uint8Array([246, 150, 236, 206, 108, 63, 58, 10]),
  cancel:      new Uint8Array([232, 219, 223, 41, 219, 236, 220, 190]),
  setBannedWord: new Uint8Array([247, 0, 212, 185, 110, 130, 3, 7]),
  withdrawFees: new Uint8Array([198, 212, 171, 109, 144, 215, 174, 89]),
  removeWord: new Uint8Array([79, 71, 89, 189, 245, 139, 246, 174]),
}

// Account discriminators (first 8 bytes of each account's data).
export const ACCT_DISC = {
  majorityMarket: new Uint8Array([29, 105, 133, 6, 64, 78, 99, 95]),
  wordEntry:      new Uint8Array([134, 5, 69, 87, 48, 184, 175, 178]),
  position:       new Uint8Array([170, 188, 143, 228, 122, 64, 247, 208]),
  config:         new Uint8Array([155, 12, 170, 224, 30, 250, 204, 130]),
}

// ── Enums ────────────────────────────────────────────────
export enum MajorityStatus {
  Open = 0,
  Resolved = 1,
  Cancelled = 2,
}

export enum WordOutcome {
  Unresolved = 0,
  Winner = 1,
  Refunding = 2,
}

// ── Types ────────────────────────────────────────────────
export interface MajorityMarketAccount {
  version: number
  bump: number
  marketId: bigint
  authority: Address
  admins: Address[]
  resolveAuthority: Address
  feeRecipient: Address
  usdcMint: Address
  unitPrice: bigint
  lockTs: bigint
  feeBps: number
  floorMultiple: bigint
  status: MajorityStatus
  createdAt: bigint
  resolvedAt: bigint | null
  claimableAfterTs: bigint
  totalUnits: bigint
  wordCount: number
  distributable: bigint
  winnerUnits: bigint
  feeCollected: bigint
  vault: Address
}

export interface WordEntryAccount {
  bump: number
  market: Address
  wordHash: Uint8Array
  wordHashHex: string
  totalUnits: bigint
  outcome: WordOutcome
  addedBy: Address
}

export interface PositionAccount {
  bump: number
  owner: Address
  units: bigint
  claimed: boolean
}

// ── Encoding helpers (duplicated from the AMM SDK; trivial + self-contained) ──
function u64LE(n: bigint): Uint8Array {
  const buf = new ArrayBuffer(8)
  new DataView(buf).setBigUint64(0, n, true)
  return new Uint8Array(buf)
}
function i64LE(n: bigint): Uint8Array {
  const buf = new ArrayBuffer(8)
  new DataView(buf).setBigInt64(0, n, true)
  return new Uint8Array(buf)
}
function u16LE(n: number): Uint8Array {
  const buf = new ArrayBuffer(2)
  new DataView(buf).setUint16(0, n, true)
  return new Uint8Array(buf)
}
function u32LE(n: number): Uint8Array {
  const buf = new ArrayBuffer(4)
  new DataView(buf).setUint32(0, n, true)
  return new Uint8Array(buf)
}
function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const a of arrays) {
    out.set(a, off)
    off += a.length
  }
  return out
}
function encodeString(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s)
  return concat(u32LE(bytes.length), bytes)
}
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58Encode(bytes: Uint8Array): string {
  const digits = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let str = ''
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) str += '1'
  for (let i = digits.length - 1; i >= 0; i--) str += BASE58_ALPHABET[digits[i]]
  return str
}
function readAddress(data: Uint8Array, offset: number): Address {
  return base58Encode(data.slice(offset, offset + 32)) as Address
}
function readU64(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(0, true)
}
function readI64(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset + offset, 8).getBigInt64(0, true)
}
function readU16(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 2).getUint16(0, true)
}
function readU32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true)
}

function toHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

// ── Word identity — blake3(normalize(word)), MUST match on-chain (spec §4) ────
// Plain trim + ASCII-lowercase (no internal whitespace collapse) to be byte-exact
// with the contract's normalization. Verified: matches tests/mention-majority-e2e.ts.
export function normalizeWord(raw: string): string {
  return raw.trim().toLowerCase()
}

// Format gate mirroring the on-chain check: length 3..12, and ALL ascii letters OR
// ALL digits (never mixed, no spaces/punctuation). Also rejects the shared common-
// word list (`isStopword` from lib/majorityMarket — same list the free markets use)
// so "the" etc. are blocked in the UI before any tx; the contract's on-chain
// common_word gate is the backstop. Returns true for valid words.
export function isValidMajorityWord(raw: string): boolean {
  const w = normalizeWord(raw)
  if (w.length < MIN_WORD_LEN || w.length > MAX_WORD_LEN) return false
  if (!/^[a-z]{3,12}$/.test(w) && !/^[0-9]{3,12}$/.test(w)) return false
  if (isStopword(w)) return false
  return true
}

// A human-readable reason a word is invalid, or null if it's fine.
export function majorityWordError(raw: string): string | null {
  const w = normalizeWord(raw)
  if (w.length < MIN_WORD_LEN) return `Words must be at least ${MIN_WORD_LEN} characters.`
  if (w.length > MAX_WORD_LEN) return `Words must be at most ${MAX_WORD_LEN} characters.`
  if (!/^[a-z]{3,12}$/.test(w) && !/^[0-9]{3,12}$/.test(w)) {
    return 'Words must be 3-12 letters, or 3-12 digits (no spaces or symbols).'
  }
  if (isStopword(w)) return 'That word is too common to pick.'
  return null
}

// 32-byte blake3 hash of the normalized word — the on-chain word identity.
export function wordHashBytes(raw: string): Uint8Array {
  return blake3(new TextEncoder().encode(normalizeWord(raw)))
}
export function wordHashHex(raw: string): string {
  return toHex(wordHashBytes(raw))
}

// ── PDA derivations ──────────────────────────────────────
const addrEncoder = getAddressEncoder()

export async function getConfigPDA(): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: ['config'],
  })
  return pda
}

export async function getMarketPDA(marketId: bigint): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: ['market', u64LE(marketId)],
  })
  return pda
}

// vault = the market PDA's USDC associated-token account.
export async function getVaultAddress(marketPda: Address): Promise<Address> {
  return getAssociatedTokenAddress(USDC_MINT, marketPda)
}

export async function getWordEntryPDA(
  marketPda: Address,
  word: string
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: ['word', addrEncoder.encode(marketPda), wordHashBytes(word)],
  })
  return pda
}

export async function getPositionPDA(
  wordEntry: Address,
  owner: Address
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: ['pos', addrEncoder.encode(wordEntry), addrEncoder.encode(owner)],
  })
  return pda
}

export async function getCommonWordPDA(word: string): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: ['common', wordHashBytes(word)],
  })
  return pda
}

export async function getBannedWordPDA(
  marketPda: Address,
  word: string
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: ['banned', addrEncoder.encode(marketPda), wordHashBytes(word)],
  })
  return pda
}

// ── Instruction builders ─────────────────────────────────

// USER: buy `quantity` units of `word` (default 1 = $1 at UNIT_PRICE). First buy
// of a word coins it (pays rent for the WordEntry + Position). Requires the buyer
// to already hold a USDC ATA with balance >= quantity * unit_price (prepend
// createAtaIx + ensure funding at the call site).
export async function createBuyIx(
  buyer: Address,
  marketId: bigint,
  word: string,
  quantity: bigint = 1n
): Promise<Instruction> {
  const market = await getMarketPDA(marketId)
  const vault = await getVaultAddress(market)
  const buyerUsdc = await getAssociatedTokenAddress(USDC_MINT, buyer)
  const wordEntry = await getWordEntryPDA(market, word)
  const position = await getPositionPDA(wordEntry, buyer)
  const commonWord = await getCommonWordPDA(word)
  const bannedWord = await getBannedWordPDA(market, word)

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: buyer, role: AccountRole.WRITABLE_SIGNER },
      { address: market, role: AccountRole.WRITABLE },
      { address: vault, role: AccountRole.WRITABLE },
      { address: buyerUsdc, role: AccountRole.WRITABLE },
      { address: wordEntry, role: AccountRole.WRITABLE },
      { address: position, role: AccountRole.WRITABLE },
      { address: commonWord, role: AccountRole.READONLY },
      { address: bannedWord, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
    ] as AccountMeta[],
    // data = disc || word(string) || word_hash([u8;32], raw) || quantity(u64)
    data: concat(
      DISC.buy,
      encodeString(word),
      wordHashBytes(word),
      u64LE(quantity)
    ),
  }
}

// USER: claim a winning position's payout. Closes the position (rent back).
export async function createClaimIx(
  owner: Address,
  marketId: bigint,
  word: string
): Promise<Instruction> {
  const market = await getMarketPDA(marketId)
  const vault = await getVaultAddress(market)
  const ownerUsdc = await getAssociatedTokenAddress(USDC_MINT, owner)
  const wordEntry = await getWordEntryPDA(market, word)
  const position = await getPositionPDA(wordEntry, owner)

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: owner, role: AccountRole.WRITABLE_SIGNER },
      { address: market, role: AccountRole.READONLY },
      { address: wordEntry, role: AccountRole.READONLY },
      { address: position, role: AccountRole.WRITABLE },
      { address: vault, role: AccountRole.WRITABLE },
      { address: ownerUsdc, role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM, role: AccountRole.READONLY },
    ] as AccountMeta[],
    data: DISC.claim,
  }
}

// USER: reclaim exact stake for a cancelled market OR a removed/refunding word.
export async function createClaimRefundIx(
  owner: Address,
  marketId: bigint,
  word: string
): Promise<Instruction> {
  const market = await getMarketPDA(marketId)
  const vault = await getVaultAddress(market)
  const ownerUsdc = await getAssociatedTokenAddress(USDC_MINT, owner)
  const wordEntry = await getWordEntryPDA(market, word)
  const position = await getPositionPDA(wordEntry, owner)

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: owner, role: AccountRole.WRITABLE_SIGNER },
      { address: market, role: AccountRole.READONLY },
      { address: wordEntry, role: AccountRole.READONLY },
      { address: position, role: AccountRole.WRITABLE },
      { address: vault, role: AccountRole.WRITABLE },
      { address: ownerUsdc, role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM, role: AccountRole.READONLY },
    ] as AccountMeta[],
    data: DISC.claimRefund,
  }
}

export interface CreateMajorityMarketParams {
  marketId: bigint
  unitPrice?: bigint
  lockTs: bigint
  feeBps: number
  floorMultiple?: bigint
  resolveAuthority: Address
  feeRecipientAta: Address
  admins: Address[]
}

// ADMIN: create a market. Signer must be a global admin (Config.admins) or the
// config deployer. feeRecipient must be a USDC token account.
export async function createMajorityMarketIx(
  authority: Address,
  params: CreateMajorityMarketParams
): Promise<Instruction> {
  const {
    marketId,
    unitPrice = UNIT_PRICE,
    lockTs,
    feeBps,
    floorMultiple = FLOOR_MULTIPLE_ONE,
    resolveAuthority,
    feeRecipientAta,
    admins,
  } = params

  const market = await getMarketPDA(marketId)
  const vault = await getVaultAddress(market)

  const adminsVec = concat(
    u32LE(admins.length),
    ...admins.map((a) => new Uint8Array(addrEncoder.encode(a)))
  )

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: authority, role: AccountRole.WRITABLE_SIGNER },
      { address: await getConfigPDA(), role: AccountRole.READONLY },
      { address: market, role: AccountRole.WRITABLE },
      { address: USDC_MINT, role: AccountRole.READONLY },
      { address: vault, role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM, role: AccountRole.READONLY },
      { address: ASSOCIATED_TOKEN_PROGRAM, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
      { address: RENT_SYSVAR, role: AccountRole.READONLY },
    ] as AccountMeta[],
    data: concat(
      DISC.createMarket,
      u64LE(marketId),
      u64LE(unitPrice),
      i64LE(lockTs),
      u16LE(feeBps),
      u64LE(floorMultiple),
      new Uint8Array(addrEncoder.encode(resolveAuthority)),
      new Uint8Array(addrEncoder.encode(feeRecipientAta)),
      adminsVec
    ),
  }
}

// ADMIN: resolve (declare winner word(s)). Signer must equal resolveAuthority and
// now >= lockTs. Winning WordEntry accounts are passed as remaining accounts
// (<= 16). Empty winners = zero-backer → house keeps the pool. Ties = pass several.
export async function createResolveIx(
  resolveAuthority: Address,
  marketId: bigint,
  winnerWordEntries: Address[]
): Promise<Instruction> {
  const market = await getMarketPDA(marketId)
  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: resolveAuthority, role: AccountRole.READONLY_SIGNER },
      { address: market, role: AccountRole.WRITABLE },
      ...winnerWordEntries.map((we) => ({
        address: we,
        role: AccountRole.WRITABLE,
      })),
    ] as AccountMeta[],
    data: DISC.resolve,
  }
}

// ADMIN: ban a word in this market (blocks future buys of it). Signer must be a
// market admin. Each ban is its own PDA (pays rent) — reversible only by not
// existing; use the global common-word list for a blocklist that spans markets.
export async function createSetBannedWordIx(
  admin: Address,
  marketId: bigint,
  word: string
): Promise<Instruction> {
  const market = await getMarketPDA(marketId)
  const bannedWord = await getBannedWordPDA(market, word)
  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: admin, role: AccountRole.WRITABLE_SIGNER },
      { address: market, role: AccountRole.READONLY },
      { address: bannedWord, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
    ] as AccountMeta[],
    data: concat(DISC.setBannedWord, encodeString(word), wordHashBytes(word)),
  }
}

// ADMIN: sweep accrued fees (fee_collected, set at resolve) from the vault to the
// market's stored fee_recipient. Signer must be a market admin or the fee-recipient
// owner. Pass the market's stored fee_recipient (decode it from the account).
export async function createWithdrawFeesIx(
  signer: Address,
  marketId: bigint,
  feeRecipientAta: Address
): Promise<Instruction> {
  const market = await getMarketPDA(marketId)
  const vault = await getVaultAddress(market)
  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: signer, role: AccountRole.READONLY_SIGNER },
      { address: market, role: AccountRole.WRITABLE },
      { address: vault, role: AccountRole.WRITABLE },
      { address: feeRecipientAta, role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM, role: AccountRole.READONLY },
    ] as AccountMeta[],
    data: DISC.withdrawFees,
  }
}

// ADMIN: surgically remove ONE word (moderation) — marks it `Refunding` so it
// leaves the board/odds and every buyer of that word reclaims their exact stake
// via claim_refund. The market keeps running for all other words. Open markets
// only. Signer must be a market admin. No args (word identified by the PDA).
export async function createRemoveWordIx(
  admin: Address,
  marketId: bigint,
  word: string
): Promise<Instruction> {
  const market = await getMarketPDA(marketId)
  const wordEntry = await getWordEntryPDA(market, word)
  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: admin, role: AccountRole.READONLY_SIGNER },
      { address: market, role: AccountRole.WRITABLE },
      { address: wordEntry, role: AccountRole.WRITABLE },
    ] as AccountMeta[],
    data: DISC.removeWord,
  }
}

// ADMIN: cancel an open market (enables refunds). Accounts { authority, market }.
export async function createCancelIx(
  authority: Address,
  marketId: bigint
): Promise<Instruction> {
  const market = await getMarketPDA(marketId)
  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: authority, role: AccountRole.WRITABLE_SIGNER },
      { address: market, role: AccountRole.WRITABLE },
    ] as AccountMeta[],
    data: DISC.cancel,
  }
}

// ── Account decoders ─────────────────────────────────────
export function deserializeMajorityMarket(
  data: Uint8Array
): MajorityMarketAccount | null {
  if (data.length < 8 + 2) return null
  if (!arraysEqual(data.slice(0, 8), ACCT_DISC.majorityMarket)) return null

  let off = 8
  const version = data[off]; off += 1
  const bump = data[off]; off += 1
  const marketId = readU64(data, off); off += 8
  const authority = readAddress(data, off); off += 32

  // admins: vec<pubkey> (u32 len + 32*len)
  const adminCount = readU32(data, off); off += 4
  const admins: Address[] = []
  for (let i = 0; i < adminCount; i++) {
    admins.push(readAddress(data, off)); off += 32
  }

  const resolveAuthority = readAddress(data, off); off += 32
  const feeRecipient = readAddress(data, off); off += 32
  const usdcMint = readAddress(data, off); off += 32
  const unitPrice = readU64(data, off); off += 8
  const lockTs = readI64(data, off); off += 8
  const feeBps = readU16(data, off); off += 2
  const floorMultiple = readU64(data, off); off += 8
  const status = data[off] as MajorityStatus; off += 1
  const createdAt = readI64(data, off); off += 8

  // resolved_at: option<i64>
  const hasResolvedAt = data[off]; off += 1
  let resolvedAt: bigint | null = null
  if (hasResolvedAt === 1) { resolvedAt = readI64(data, off); off += 8 }

  const claimableAfterTs = readI64(data, off); off += 8
  const totalUnits = readU64(data, off); off += 8
  const wordCount = readU32(data, off); off += 4
  const distributable = readU64(data, off); off += 8
  const winnerUnits = readU64(data, off); off += 8
  const feeCollected = readU64(data, off); off += 8
  const vault = readAddress(data, off); off += 32

  return {
    version, bump, marketId, authority, admins, resolveAuthority,
    feeRecipient, usdcMint, unitPrice, lockTs, feeBps, floorMultiple,
    status, createdAt, resolvedAt, claimableAfterTs, totalUnits, wordCount,
    distributable, winnerUnits, feeCollected, vault,
  }
}

export function deserializeWordEntry(data: Uint8Array): WordEntryAccount | null {
  if (data.length < 8 + 82 + 32) return null
  if (!arraysEqual(data.slice(0, 8), ACCT_DISC.wordEntry)) return null

  const bump = data[8]
  const market = readAddress(data, 9)
  const wordHash = data.slice(41, 73)
  const totalUnits = readU64(data, 73)
  const outcome = data[81] as WordOutcome
  const addedBy = readAddress(data, 82)

  return {
    bump, market, wordHash, wordHashHex: toHex(wordHash),
    totalUnits, outcome, addedBy,
  }
}

export function deserializePosition(data: Uint8Array): PositionAccount | null {
  if (data.length < 8 + 42) return null
  if (!arraysEqual(data.slice(0, 8), ACCT_DISC.position)) return null

  const bump = data[8]
  const owner = readAddress(data, 9)
  const units = readU64(data, 41)
  const claimed = data[49] !== 0

  return { bump, owner, units, claimed }
}

// ── Math ─────────────────────────────────────────────────

// Winner payout for a position, in USDC base units. BigInt floor — matches on-chain
// (spec §7.4): units * distributable / winnerUnits (0 for a zero-backer market).
export function payoutBaseUnits(
  units: bigint,
  distributable: bigint,
  winnerUnits: bigint
): bigint {
  if (winnerUnits === 0n) return 0n
  return (units * distributable) / winnerUnits
}

// Exact-stake refund for a position (cancelled market / refunding word).
export function refundBaseUnits(units: bigint, unitPrice: bigint): bigint {
  return units * unitPrice
}

// Pool size in USDC base units: total_units * unit_price.
export function poolBaseUnits(totalUnits: bigint, unitPrice: bigint): bigint {
  return totalUnits * unitPrice
}

export { USDC_PRECISION }
