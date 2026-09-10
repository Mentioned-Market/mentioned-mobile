// Lock and event times arrive in two shapes: unix seconds as a decimal string
// (paid routes) and ISO strings (free routes). Everything here works in ms.

export function toMs(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** "Closes 2d 4h" / "Closes 3h 12m" / "Closes 8m", or null once passed. */
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
  return `Closes ${Math.max(mins, 1)}m`;
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
