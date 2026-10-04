// Turning the server's mobile config into what the app actually does.
//
// The one rule that shapes everything here: a bad or missing config must never
// lock anyone out. An unparseable version compares as equal, an absent flag is
// on, and no config at all is "carry on". The only things that can stop the app
// are an explicit kill switch and an explicit minimum version this build is
// provably below.
import type { MobileConfig } from '@/api/mobileConfig';

export type Features = {
  paidTrading: boolean;
  freeTrading: boolean;
  seekerPerk: boolean;
  onramp: boolean;
};

export type Gate =
  | { kind: 'ok' }
  | { kind: 'update'; minVersion: string; updateUrl: string | null; message: string | null }
  | { kind: 'maintenance'; message: string | null };

export const DEFAULT_FEATURES: Features = { paidTrading: true, freeTrading: true, seekerPerk: true, onramp: true };

/** Numeric segments of a version, or null when it is not a plain dotted number. */
function parseVersion(v: string): number[] | null {
  // Build metadata and prerelease tags ("1.2.0-beta", "1.2.0+42") compare on
  // the release part only.
  const core = v.trim().split(/[-+]/)[0];
  if (!/^\d+(\.\d+)*$/.test(core)) return null;
  return core.split('.').map(Number);
}

/**
 * -1 when a is older than b, 1 when newer, 0 when equal. A missing segment
 * counts as 0, so "1.2" equals "1.2.0". Anything unparseable compares as equal,
 * which is what keeps a typo in the server's minimum from locking every user out.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * This app's page in the Solana dApp Store, which is where an update comes
 * from on a Seeker. Used when the server names no update link of its own, so
 * "update to keep going" always has a button rather than only an instruction.
 */
export function storeListingUrl(applicationId: string | null | undefined): string | null {
  const id = applicationId?.trim();
  return id ? `solanadappstore://details?id=${encodeURIComponent(id)}` : null;
}

/** Only the flags this app knows, and only real booleans; everything else keeps its default. */
function readFeatures(config: MobileConfig): Features {
  const out = { ...DEFAULT_FEATURES };
  const given = config.features ?? {};
  for (const key of Object.keys(DEFAULT_FEATURES) as (keyof Features)[]) {
    if (typeof given[key] === 'boolean') out[key] = given[key];
  }
  return out;
}

/** What the app should do with this config, running as `appVersion`. */
export function evaluateMobileConfig(config: MobileConfig | null | undefined, appVersion: string | null): { gate: Gate; features: Features } {
  if (!config) return { gate: { kind: 'ok' }, features: DEFAULT_FEATURES };
  const features = readFeatures(config);
  const message = config.message?.trim() || null;

  // The kill switch outranks the version check: there is nothing to update to
  // while the service itself is down.
  if (config.killSwitch === true) return { gate: { kind: 'maintenance', message }, features };

  const minVersion = config.minVersion?.trim();
  if (minVersion && appVersion && compareVersions(appVersion, minVersion) < 0) {
    return { gate: { kind: 'update', minVersion, updateUrl: config.updateUrl?.trim() || null, message }, features };
  }
  return { gate: { kind: 'ok' }, features };
}
