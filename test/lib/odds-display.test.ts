// PORTED_FROM mentioned/scripts/test-odds-display.ts @ 2b5b452
// The web's assertions for src/lib/oddsDisplay.ts, line for line, run under
// Jest. Only the harness differs: `ok` and `eq` report through expect, so a
// failure names the case exactly as the web script would.
import {
  effectiveMultiplier,
  formatMultiplier,
  formatQuote,
  formatTradeQuote,
  isOddsMode,
  marginalMultiplier,
  sellSharesFromInput,
  sellUnitsFromInput,
  sideCents,
} from '@/lib/oddsDisplay';

const failures: string[] = [];
function ok(name: string, cond: boolean, detail?: string) {
  if (!cond) failures.push(`${name}${detail ? ` - ${detail}` : ''}`);
}
function eq<T>(name: string, got: T, want: T) {
  ok(name, got === want, `got ${String(got)}, want ${String(want)}`);
}

it('passes every case in the web odds-display script', () => {
  // formatMultiplier
  eq('floors, never rounds (2.3809 -> 2.38x)', formatMultiplier(1 / 0.42), '2.38x')
  eq('2.999 stays 2.99x', formatMultiplier(2.999), '2.99x')
  eq('exact 2.30 is not dragged down by float noise', formatMultiplier(2.3), '2.30x')
  eq('even money drops the decimals', formatMultiplier(2), '2x')
  eq('whole numbers drop the decimals', formatMultiplier(5), '5x')
  eq('a floored whole number counts too (3.004 -> 3x)', formatMultiplier(3.004), '3x')
  eq('non-whole keeps both decimals (2.50x, not 2.5x)', formatMultiplier(2.5), '2.50x')
  eq('just under a whole number is not rounded up', formatMultiplier(1.999), '1.99x')
  eq('near certainty keeps 2dp', formatMultiplier(1 / 0.99), '1.01x')
  eq('10 to 100 uses 1dp', formatMultiplier(12.57), '12.5x')
  eq('boundary 10 exactly', formatMultiplier(10), '10x')
  eq('whole number in the 1dp tier', formatMultiplier(25.04), '25x')
  eq('9.999 floors to 9.99x, not 10.00x', formatMultiplier(9.999), '9.99x')
  eq('100 and up caps', formatMultiplier(100), '100x+')
  eq('huge caps', formatMultiplier(5000), '100x+')
  eq('NaN -> empty', formatMultiplier(NaN), '')
  eq('Infinity -> empty', formatMultiplier(Infinity), '')
  eq('zero -> empty', formatMultiplier(0), '')

  // marginalMultiplier
  ok('1 / price', Math.abs(marginalMultiplier(0.5) - 2) < 1e-12)
  ok('clamps a zero price to 100x', Math.abs(marginalMultiplier(0) - 100) < 1e-9)
  ok('clamps a certain price to 1/0.99', Math.abs(marginalMultiplier(1) - 1 / 0.99) < 1e-12)
  ok('net of fee: 1% fee at 50% is 2/1.01', Math.abs(marginalMultiplier(0.5, 100) - 2 / 1.01) < 1e-12)
  ok('fee only ever lowers the quote', marginalMultiplier(0.3, 250) < marginalMultiplier(0.3))
  ok('negative fee is ignored', marginalMultiplier(0.5, -100) === marginalMultiplier(0.5))
  ok('NaN price -> NaN', Number.isNaN(marginalMultiplier(NaN)))

  // effectiveMultiplier
  ok('payout / paid', Math.abs(effectiveMultiplier(11.9, 5) - 2.38) < 1e-12)
  ok('zero paid -> NaN', Number.isNaN(effectiveMultiplier(5, 0)))
  ok('zero payout -> NaN', Number.isNaN(effectiveMultiplier(0, 5)))
  ok('slippage: effective is below marginal for a real fill', effectiveMultiplier(11.5, 5) < marginalMultiplier(0.42))

  // cents parity (must match the pre-toggle UI exactly)
  let parityOk = true
  let complementOk = true
  for (let i = 0; i <= 1000; i++) {
    const p = i / 1000
    const legacyYes = Math.round(p * 100)
    const legacyNo = 100 - legacyYes
    if (formatQuote('cents', p, 'YES') !== `${legacyYes}¢`) parityOk = false
    if (formatQuote('cents', p, 'NO') !== `${legacyNo}¢`) parityOk = false
    if (sideCents(p, 'YES') + sideCents(p, 'NO') !== 100) complementOk = false
  }
  ok('YES and NO match Math.round(p*100) / its complement for p in 0..1', parityOk)
  ok('YES + NO always sums to 100', complementOk)
  eq('41.5% reads 42 / 58, never 42 / 59', `${sideCents(0.415, 'YES')}/${sideCents(0.415, 'NO')}`, '42/58')
  eq('resolved YES forces 100¢', formatQuote('cents', 0.37, 'YES', { outcome: true }), '100¢')
  eq('resolved YES forces NO to 0¢', formatQuote('cents', 0.37, 'NO', { outcome: true }), '0¢')
  eq('resolved NO forces NO to 100¢', formatQuote('cents', 0.37, 'NO', { outcome: false }), '100¢')
  eq('cents ignore the fee', formatQuote('cents', 0.42, 'YES', { feeBps: 500 }), '42¢')

  // formatQuote (multiplier)
  eq('YES at 42%', formatQuote('multiplier', 0.42, 'YES'), '2.38x')
  eq('NO at 42% uses the exact complement', formatQuote('multiplier', 0.42, 'NO'), '1.72x')
  eq('net of a 2% fee', formatQuote('multiplier', 0.5, 'YES', { feeBps: 200 }), '1.96x')
  eq('resolved has no quote', formatQuote('multiplier', 0.42, 'YES', { outcome: true }), '')
  eq('null outcome is live', formatQuote('multiplier', 0.5, 'YES', { outcome: null }), '2x')
  eq('longshot caps', formatQuote('multiplier', 0.001, 'YES'), '100x+')

  // formatTradeQuote
  eq('cents shows the YES price whatever the side', formatTradeQuote('cents', 0.42, 'NO'), '42¢')
  eq('multiplier is side-aware (YES)', formatTradeQuote('multiplier', 0.42, 'YES'), '2.38x')
  eq('multiplier is side-aware (NO)', formatTradeQuote('multiplier', 0.42, 'NO'), '1.72x')

  // sellSharesFromInput (free, float)
  eq('100% sells the exact held value', sellSharesFromInput(11.904761, 100, true), 11.904761)
  eq('over 100% clamps to all', sellSharesFromInput(11.904761, 250, true), 11.904761)
  ok('50% is half', Math.abs(sellSharesFromInput(10, 50, true) - 5) < 1e-12)
  eq('percent that leaves dust snaps to all', sellSharesFromInput(0.5, 99, true), 0.5)
  eq('the old Max (2dp truncation) now snaps to all', sellSharesFromInput(11.904761, 11.9, false), 11.904761)
  eq('a normal partial share sell is untouched', sellSharesFromInput(11.904761, 5, false), 5)
  eq('an over-ask is passed through for the API to reject', sellSharesFromInput(5, 6, false), 6)
  eq('nothing held -> 0', sellSharesFromInput(0, 100, true), 0)
  eq('zero input -> 0', sellSharesFromInput(10, 0, true), 0)
  eq('NaN input -> 0', sellSharesFromInput(10, NaN, false), 0)

  // sellUnitsFromInput (AMM, bigint)
  eq('100% sells every base unit', sellUnitsFromInput(11_904_761n, 100, true), 11_904_761n)
  eq('50% floors in bigint', sellUnitsFromInput(11_904_761n, 50, true), 5_952_380n)
  eq('12.5% keeps its fraction', sellUnitsFromInput(8_000_000n, 12.5, true), 1_000_000n)
  eq('percent that leaves dust snaps to all', sellUnitsFromInput(500_000n, 99, true), 500_000n)
  eq('the old Max (2dp truncation) now snaps to all', sellUnitsFromInput(11_904_761n, 11.9, false), 11_904_761n)
  eq('a normal partial sell is untouched', sellUnitsFromInput(11_904_761n, 5, false), 5_000_000n)
  eq('an over-ask is capped at held, as before', sellUnitsFromInput(5_000_000n, 6, false), 5_000_000n)
  eq('nothing held -> 0', sellUnitsFromInput(0n, 100, true), 0n)
  ok('never returns more than held', sellUnitsFromInput(1_234_567n, 99.99, true) <= 1_234_567n)

  // isOddsMode
  ok('accepts both modes', isOddsMode('multiplier') && isOddsMode('cents'))
  ok('rejects junk from storage', !isOddsMode('percent') && !isOddsMode(null) && !isOddsMode(undefined))


  expect(failures).toEqual([]);
});
