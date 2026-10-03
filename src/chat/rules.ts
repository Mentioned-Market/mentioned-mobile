// Chat rules: which room a market talks in, how a list of messages is kept,
// what a send is allowed to be, and what to say when one fails. Pure, so it is
// unit tested; the screen and the hook only wire it up.
import { ApiError } from '@/api/client';
import { CHAT_MAX, type ChatMessage } from '@/api/chat';
import type { MarketKind } from '@/markets/merge';

/**
 * A market's chat room, as the website names it. Free YES/NO and free majority
 * markets share the `custom_` prefix because they share the table of ids.
 */
export function chatEventId(kind: MarketKind, id: string | number): string {
  if (kind === 'paid-yesno') return `paid_${id}`;
  if (kind === 'paid-majority') return `paidmaj_${id}`;
  return `custom_${id}`;
}

/** Most messages a room keeps in memory; older ones are dropped from the top. */
export const CHAT_KEEP = 300;

/**
 * Fold new messages in: one per id (a send's response and the stream can both
 * deliver the same row), oldest first, capped to the newest `CHAT_KEEP`.
 * Returns the same array when nothing new arrived, so React can skip a render.
 */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  let added = false;
  for (const m of incoming) {
    if (!byId.has(m.id)) added = true;
    byId.set(m.id, m);
  }
  if (!added) return current;
  const all = [...byId.values()].sort((a, b) => a.id - b.id);
  return all.length > CHAT_KEEP ? all.slice(all.length - CHAT_KEEP) : all;
}

/** Older messages go on the front; the cap is not applied, since the reader asked for them. */
export function prependMessages(current: ChatMessage[], older: ChatMessage[]): ChatMessage[] {
  const seen = new Set(current.map((m) => m.id));
  return [...older.filter((m) => !seen.has(m.id)), ...current].sort((a, b) => a.id - b.id);
}

/** Whether a stream event belongs to this room. The stream is per room, so this only guards a wrong wire. */
export function belongsTo(m: ChatMessage, room: string | null): boolean {
  return room === null ? m.event_id === undefined : m.event_id === room;
}

/** The text a send would post, or null when there is nothing to send. */
export function sendable(text: string): string | null {
  const t = text.trim();
  return t ? t.slice(0, CHAT_MAX) : null;
}

/** What the composer says about a send that failed. Copy the reader can act on, never a status code. */
export function sendError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Sign in to chat.';
    if (e.status === 429) return 'One message every five seconds. Try again in a moment.';
    if (e.status === 400 && /prohibited/i.test(e.message)) return 'That message has language that is not allowed here.';
    if (e.status >= 500) return 'Chat is having trouble. Try again.';
  }
  return 'That did not send. Check your connection and try again.';
}

/** A short quote for a reply bar or a quoted reply, cut at a word where it can be. */
export function quote(text: string, max = 80): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Where tapping a name goes. The server fills `username` with a shortened
 * address ("49GT...u2fY") for a wallet with no name, and a profile is only
 * addressable by a real name, so those open the wallet's positions instead.
 */
export function profileHref(m: Pick<ChatMessage, 'wallet' | 'username'>): string {
  return /^\w{4}\.\.\.\w{4}$/.test(m.username) ? `/positions?wallet=${m.wallet}` : `/u/${encodeURIComponent(m.username)}`;
}

/** The text sent for a report: enough to find and judge the message without a reply. */
export function reportText(m: ChatMessage, room: string | null, max: number): string {
  const where = room === null ? 'global chat' : `market chat ${room}`;
  const head = `Chat report: message ${m.id} in ${where} by ${m.username} (${m.wallet}): "`;
  // Room for the closing quote mark and the ellipsis `quote` adds when it cuts.
  return `${head}${quote(m.message, Math.max(20, max - head.length - 2))}"`;
}

/** Messages from one player this close together read as one run. */
export const RUN_GAP_MS = 5 * 60_000;

/**
 * Whether a message starts a new run, and so shows its author's avatar and
 * name: the first message, a different author from the one before it, or a
 * long enough pause since.
 */
export function startsRun(m: ChatMessage, before: ChatMessage | undefined): boolean {
  if (!before || before.wallet !== m.wallet) return true;
  return Date.parse(m.created_at) - Date.parse(before.created_at) > RUN_GAP_MS;
}
