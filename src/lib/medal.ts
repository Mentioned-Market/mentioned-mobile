// The Fair's medals, as the website strikes them: an irregular disc of matte
// metal, gold, silver or bronze by purse.
//
// The tier thresholds and the seal's wobble are the web's
// (`components/ArenaBountyBoard.tsx`), reproduced rather than ported, because
// the web draws with SVG attributes this app does not share. The numbers are
// what has to match, so they are what is tested.

export type MedalTier = 'gold' | 'silver' | 'bronze';

/** Richest medals are gold, then silver, then bronze. */
export function medalTier(amount: string): MedalTier {
  const n = Number(amount.replace(/[^0-9.]/g, '')) || 0;
  return n >= 65 ? 'gold' : n >= 50 ? 'silver' : 'bronze';
}

export const METAL: Record<MedalTier, { light: string; mid: string; dark: string; deep: string }> = {
  gold: { light: '#fff3c4', mid: '#f0be3c', dark: '#b8861f', deep: '#6a4a0e' },
  silver: { light: '#ffffff', mid: '#d5dbe2', dark: '#98a2ad', deep: '#4f5761' },
  bronze: { light: '#f7d2b0', mid: '#cf8b4e', dark: '#9a5d2a', deep: '#4f2e10' },
};

/**
 * A wobbly circle for the seal's edge, in a 100 by 100 box. The wobble is
 * seeded, so a medal keeps the same shape between renders rather than
 * shimmering as the list re-renders.
 */
export function sealPath(seed: number): string {
  const N = 28;
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 44 + Math.sin(a * 3 + seed) * 0.7 + Math.sin(a * 7 + seed * 1.7) * 0.4 + Math.sin(a * 11 + seed * 0.4) * 0.2;
    pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]);
  }
  let d = '';
  for (let i = 0; i < N; i++) {
    const [x1, y1] = pts[(i + 1) % N];
    const [x0, y0] = pts[i];
    const [x2, y2] = pts[(i + 2) % N];
    if (i === 0) d += `M${((x0 + x1) / 2).toFixed(2)},${((y0 + y1) / 2).toFixed(2)}`;
    d += ` Q${x1.toFixed(2)},${y1.toFixed(2)} ${((x1 + x2) / 2).toFixed(2)},${((y1 + y2) / 2).toFixed(2)}`;
  }
  return `${d} Z`;
}

/** A stable seed per medal, so each keeps its own shape. */
export function medalSeed(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) % 997;
  return n / 100;
}
