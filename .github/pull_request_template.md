<!-- Keep this short. The point is that a reviewer can see the reasoning without
     reading the diff twice. Delete any section that does not apply. -->

## What this changes

## Why

<!-- The constraint, the alternative rejected, or the trap avoided. -->

## Risk

<!-- What could break, and what happens if it does. Money and chain paths:
     say explicitly what was simulated and on which flavour. -->

## Checks

- [ ] `npm test`, `npm run typecheck`, `npm run lint` pass
- [ ] Tested on a Seeker, or explained why not
- [ ] Fixtures re-captured if a route shape changed (`npm run fixtures`)
- [ ] `README.md` / `docs/ENGINEERING.md` updated if behaviour or a decision changed
