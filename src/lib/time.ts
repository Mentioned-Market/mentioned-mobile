// Lock and event times arrive in two shapes: unix seconds as a decimal string
// (paid routes) and ISO strings (free routes). Everything here works in ms.

export function toMs(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/**
 * The last stretch before a market locks, when its countdown shows seconds and
 * ticks every second (`useCountdown`). Real urgency, so it can be shown as such.
 */
export const URGENT_MS = 3_600_000;

/** Whether a lock time is in the future and inside the last hour. */
export function isUrgent(lockMs: number | null, now = Date.now()): boolean {
  if (!lockMs) return false;
  const diff = lockMs - now;
  return diff > 0 && diff < URGENT_MS;
}

/**
 * "Closes 2d 4h" / "Closes 3h 12m", then with seconds inside the last hour,
 * "Closes 8m 05s" / "Closes 42s", or null once passed. Seconds are only right
 * if the caller re-renders every second, which `useCountdown` does.
 */
export function closesIn(lockMs: number | null, now = Date.now()): string | null {
  if (!lockMs) return null;
  const diff = lockMs - now;
  if (diff <= 0) return null;
  const totalHours = Math.floor(diff / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `Closes ${days}d ${hours}h`;
  if (totalHours > 0) return `Closes ${totalHours}h ${mins}m`;
  const secs = Math.floor((diff % 60_000) / 1000);
  if (mins > 0) return `Closes ${mins}m ${String(secs).padStart(2, '0')}s`;
  return `Closes ${Math.max(secs, 1)}s`;
}

/** Bare countdown "2d 4h" / "3h 12m" / "8m 30s" / "0s". */
export function countdown(targetMs: number | null, now = Date.now()): string {
  if (!targetMs) return '';
  const diff = Math.max(0, targetMs - now);
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** "Tue 8 Sep, 20:00" in the device locale. */
export function eventDate(ms: number | null): string | null {
  if (!ms) return null;
  const d = new Date(ms);
  return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * How long ago something happened, in the shortest form that is still exact
 * enough to act on: "just now", "4m", "3h", "2d", then a date once the day
 * itself is what matters more than the gap.
 */
export function ago(ms: number | null, now = Date.now()): string {
  if (ms === null) return '';
  const seconds = Math.max(0, Math.floor((now - ms) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
