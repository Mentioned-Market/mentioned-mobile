// Number formatting for money, prices and counts. Tabular numerals are set in
// the text style (src/ui/theme.ts type.money); this file only makes strings.

/** USDC base units (6 dp) to a dollar string. Whole dollars when >= 100. */
export function usdc(baseUnits: bigint | string | number, opts: { dp?: number } = {}): string {
  const n = typeof baseUnits === 'bigint' ? Number(baseUnits) / 1e6 : Number(baseUnits) / 1e6;
  return usd(n, opts);
}

export function usd(n: number, opts: { dp?: number } = {}): string {
  const dp = opts.dp ?? (Math.abs(n) >= 100 ? 0 : 2);
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

/** 0.4601 -> "46%" */
export function pct(p: number, dp = 0): string {
  return `${(p * 100).toFixed(dp)}%`;
}

/** 0.4601 -> "46c", the website's YES/NO price notation. */
export function cents(p: number): string {
  return `${Math.round(p * 100)}c`;
}

/** Play tokens: whole numbers, thousands separators. */
export function tokens(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** 1234 -> "1.2k" for counts in tight spaces. */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

/** Shares in 6dp base units to a plain count. */
export function shares(baseUnits: bigint | string | number): string {
  const n = Number(baseUnits) / 1e6;
  return n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 });
}

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}
