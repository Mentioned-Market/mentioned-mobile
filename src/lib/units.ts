// Exact conversion between what a user types and 6-decimal base units.
//
// Floating point is not safe here. `0.975523 * 1e6` can come out as
// 975522.9999, and flooring it leaves one base unit behind, so "sell
// everything" quietly leaves dust in the account. Parsing the digits directly
// keeps typed amounts, preset amounts and on-chain amounts identical.

/** "12.5" -> 12_500_000n. Extra decimals are truncated, never rounded up. Junk parses as 0n. */
export function toBaseUnits(text: string, decimals = 6): bigint {
  const match = /^\s*(\d*)(?:\.(\d*))?\s*$/.exec(text);
  if (!match) return 0n;
  const whole = match[1] || '0';
  const frac = (match[2] ?? '').slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || '0');
}

/**
 * 975_523n -> "0.975523". Exact, with trailing zeros trimmed and no thousands
 * separators, so the result can be fed straight back into `toBaseUnits`.
 */
export function fromBaseUnits(units: bigint, decimals = 6): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const scale = 10n ** BigInt(decimals);
  const whole = (abs / scale).toString();
  const frac = (abs % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** Truncate base units to a whole number of cents' worth (2 decimals), as a string. */
export function fromBaseUnitsFloor2(units: bigint, decimals = 6): string {
  const step = 10n ** BigInt(decimals - 2);
  return fromBaseUnits((units / step) * step, decimals);
}
