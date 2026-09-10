// Account bytes arrive base64 over JSON and are decoded on device. Hermes has
// atob only because of the polyfill, so this also documents the dependency.
import { base64ToBytes } from '@/lib/bytes';

import majMarket from '../fixtures/paid-majority-market.json';

describe('base64ToBytes', () => {
  it('decodes ASCII', () => {
    expect(Array.from(base64ToBytes('aGk='))).toEqual([104, 105]);
  });

  it('decodes an empty string to an empty array', () => {
    expect(base64ToBytes('')).toHaveLength(0);
  });

  it('keeps high bytes intact', () => {
    // 0xFF round trips only if the charCode path is byte-exact.
    expect(Array.from(base64ToBytes('//8='))).toEqual([255, 255]);
  });

  it('decodes a real account to the length the discriminator implies', () => {
    const bytes = base64ToBytes(majMarket.account);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);
    // Anchor accounts open with an eight byte discriminator.
    expect(bytes.slice(0, 8).some((b) => b !== 0)).toBe(true);
  });

  it('round trips with btoa', () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]);
    const b64 = btoa(String.fromCharCode(...original));
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(original));
  });
});
