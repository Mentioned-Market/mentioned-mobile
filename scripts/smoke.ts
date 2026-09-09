// Node runner for the section 5 smoke tests: `npm run smoke`.
import { runSmokeTests } from '../src/dev/smoke';

runSmokeTests()
  .then((results) => {
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`);
    process.exit(results.every((r) => r.ok) ? 0 : 1);
  })
  .catch((e) => {
    console.error('smoke tests could not run:', e);
    process.exit(1);
  });
