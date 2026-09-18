// Everything about Arena and referrals that is a rule rather than a layout:
// countdowns, labels, input checks that match the server's, and the wording of
// errors. Kept pure so it is tested, and so the screens stay about layout.
import { ApiError } from '@/api/client';
import type { Arena, ArenaStatus } from '@/arena/arenas';

export const MEDALS = ['🥇', '🥈', '🥉'];

/** "3d 04h 12m 09s", or "04:12:09" under a day. The website's own format. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${two(h)}h ${two(m)}m ${two(sec)}s`;
  return `${two(h)}:${two(m)}:${two(sec)}`;
}

/** What the countdown counts to, or null once the season is over. */
export function seasonCountdown(arena: Arena, now: number): { label: string; ms: number } | null {
  if (now < arena.start.getTime()) return { label: 'Starts in', ms: arena.start.getTime() - now };
  if (now < arena.end.getTime()) return { label: 'Ends in', ms: arena.end.getTime() - now };
  return null;
}

/** The pill on a season's hero. */
export function statusLabel(status: ArenaStatus, isCurrent: boolean): string {
  if (status === 'active') return 'Live';
  if (status === 'upcoming') return isCurrent ? 'Starting soon' : 'Preview';
  return 'Final standings';
}

/** "1st place", "2nd place", "11th place", "22nd place". */
export function placeLabel(place: number): string {
  const tens = place % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : place % 10 === 1 ? 'st' : place % 10 === 2 ? 'nd' : place % 10 === 3 ? 'rd' : 'th';
  return `${place}${suffix} place`;
}

/** The website's team size line, for a season's team limit. */
/**
 * What the leaderboard's top places share. A season with a medal board keeps
 * part of its pool for the medals, so "top 10 share $1,500" would overstate
 * it; the registry says which part is the leaderboard's.
 */
export function leaderboardPool(arena: Arena): string {
  return arena.bounty?.leaderboardPool ?? arena.prizePool;
}

/**
 * The web's medal copy says "betting"; the app never does (AGENTS.md). The
 * registry is ported byte for byte, so the word is swapped as it is shown.
 */
export function appCopy(text: string): string {
  return text.replace(/\bbetting\b/gi, 'predicting').replace(/\bbettors\b/gi, 'players').replace(/\bbets\b/gi, 'picks').replace(/\bbet\b/gi, 'pick');
}

export function teamSizeCopy(arena: Arena): string {
  return arena.maxMembers === 2
    ? 'Teams are 1 or 2 players. Go solo if you are confident, but a partner means more points.'
    : `Teams can be 1 to ${arena.maxMembers} members. Go solo if you are confident, but more traders means more points.`;
}

/** Create and join are open only in the current season, and not after it ends. */
export function canEnter(arena: Arena, current: Arena, now: Date): boolean {
  return arena.id === current.id && now < arena.end;
}

// ── Input checks, matching the server's own rules ───────────────────────────

/** Team names are 2 to 30 characters once trimmed. */
export function teamNameError(raw: string): string | null {
  const n = raw.trim().length;
  return n >= 2 && n <= 30 ? null : 'Team names are 2 to 30 characters.';
}

/** Join codes are exactly six letters or digits; case does not matter. */
export function joinCodeError(raw: string): string | null {
  return /^[A-Z0-9]{6}$/.test(raw.trim().toUpperCase()) ? null : 'A join code is 6 letters or numbers.';
}

export const BIO_MAX = 300;

export function bioError(raw: string): string | null {
  return raw.trim().length <= BIO_MAX ? null : `A bio is ${BIO_MAX} characters at most.`;
}

/**
 * An X handle from whatever was typed: "@name", "name", or a profile link on
 * x.com or twitter.com. Null means "remove the link". Returns an error when
 * what is left is not a valid handle. The server applies the same reading.
 */
export function readXHandle(raw: string): { handle: string | null } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { handle: null };
  const handle = trimmed
    .replace(/^https?:\/\/(www\.)?x\.com\//i, '')
    .replace(/^https?:\/\/(www\.)?twitter\.com\//i, '')
    .replace(/^@/, '')
    .split('/')[0]
    .split('?')[0];
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? { handle } : { error: 'That is not a valid X username.' };
}

/** Image uploads: the server's limit and accepted types. */
export const AVATAR_MAX_BYTES = 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function avatarError(fileSize: number | undefined, mimeType: string | undefined): string | null {
  if (mimeType && !AVATAR_TYPES.includes(mimeType)) return 'Pick a JPEG, PNG, GIF or WebP image.';
  if (fileSize !== undefined && fileSize > AVATAR_MAX_BYTES) return 'That image is over 1 MB. Pick a smaller one.';
  return null;
}

// ── Errors ───────────────────────────────────────────────────────────────────

/**
 * The server's team messages, in the app's words. Several contain an en dash
 * inside a range ("2–30"), which the generic sanitiser would turn into a
 * sentence break, so each known message is matched and replaced whole.
 */
export function friendlyTeamError(e: unknown): string {
  if (!(e instanceof ApiError)) return 'That did not go through. Check your connection and try again.';
  const m = (e.message ?? '').toLowerCase();
  if (m.includes('already in a team')) return 'You are already on a team this season.';
  if (m.includes('arena has ended')) return 'This season has ended.';
  if (m.includes('name is already taken')) return 'That team name is taken. Try another.';
  if (m.includes('must be 2')) return 'Team names are 2 to 30 characters.';
  if (m.includes('invalid join code format')) return 'A join code is 6 letters or numbers.';
  if (m.includes('invalid join code')) return 'That code does not match a team.';
  if (m.includes('team is full')) {
    const max = /max (\d+)/.exec(m)?.[1];
    return max ? `That team is full. Teams are ${max} at most.` : 'That team is full.';
  }
  if (m.includes('past arena season')) return 'That code is from a past season.';
  if (m.includes('discord account must be at least 30 days')) return 'Your Discord account needs to be at least 30 days old to enter the Arena.';
  if (m.includes('link your discord')) return 'Link a Discord account to your Mentioned profile to enter the Arena. You can do that on mentioned.market.';
  if (m.includes('only the team captain')) return 'Only the team captain can change this.';
  if (m.includes('bio must be')) return `A bio is ${BIO_MAX} characters at most.`;
  if (m.includes('invalid x username')) return 'That is not a valid X username.';
  if (m.includes('under 1 mb')) return 'That image is over 1 MB. Pick a smaller one.';
  if (m.includes('valid image')) return 'Pick a JPEG, PNG, GIF or WebP image.';
  if (e.status === 404) return 'That team no longer exists.';
  if (e.status >= 500) return 'The server could not do that just now. Try again in a moment.';
  return 'That did not go through. Try again.';
}

/** The words that go out with a referral link. */
export function referralShareText(username: string | null): string {
  return username
    ? `Join me on Mentioned, predicting what gets said, live. Sign up with my link 👇`
    : `Predict what gets said, live, on Mentioned. Sign up with my link 👇`;
}
