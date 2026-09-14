// Every script in scripts/ runs under plain Node (tsx), not the app bundler.
// Node cannot load React Native or Expo's native modules: react-native's own
// entry file is Flow, and the transform fails before a single line runs.
//
// That is how the daily contract check broke on Sep 12 2026 and stayed broken
// for three days: the API client started importing the session store, which
// persists to expo-secure-store, and every script that touched the client died
// on start. This walks each script's import graph and fails the ordinary test
// run the moment a script can reach native code again, instead of the next
// morning's scheduled job.
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const EXTENSIONS = ['.ts', '.tsx', '.js', '/index.ts', '/index.tsx', '/index.js'];

/** Packages that only load inside the React Native runtime. */
const NATIVE = /^(react-native($|\/)|react-native-|expo($|-|\/)|@expo\/|@react-native|@openfort\/react-native)/;

/** A local import resolved to a file, or null for a package (or anything unresolvable). */
function resolveLocal(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(ROOT, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

/** Runtime imports only: `import type` and `export type` are erased and load nothing. */
function importsOf(file: string): string[] {
  const out: string[] = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (/^\s*(import|export)\s+type\s/.test(line)) continue;
    for (const m of line.matchAll(/from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      out.push(m[1] ?? m[2] ?? m[3]);
    }
  }
  return out;
}

/** The first chain from `entry` to a native package, e.g. ["expo-secure-store", "src/store/session.ts", ...]. */
function nativeChain(entry: string): string[] | null {
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift() as string;
    for (const spec of importsOf(file)) {
      if (NATIVE.test(spec)) {
        const chain = [spec];
        for (let cur: string | null = file; cur; cur = parent.get(cur) ?? null) chain.push(path.relative(ROOT, cur));
        return chain;
      }
      const next = resolveLocal(spec, file);
      if (next && !parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return null;
}

const scripts = fs
  .readdirSync(path.join(ROOT, 'scripts'))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => path.join(ROOT, 'scripts', f));

describe('scripts run under plain Node', () => {
  it('finds the scripts to check', () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  it.each(scripts.map((s) => [path.basename(s), s]))('%s reaches no native module', (_name, script) => {
    const chain = nativeChain(script);
    // Printed as the import path, so the fix is obvious from the failure alone.
    expect(chain ? chain.join(' <- ') : null).toBeNull();
  });

  it('would catch the Sep 12 break', () => {
    // Guards the guard: a store that imports expo-secure-store is exactly what
    // must be reported when something under scripts/ imports it.
    expect(importsOf(path.join(ROOT, 'src/store/session.ts'))).toContain('expo-secure-store');
    expect(NATIVE.test('expo-secure-store')).toBe(true);
  });
});
