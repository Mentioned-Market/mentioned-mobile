# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Working in this repo

## Commits

One concern per commit, with a conventional prefix: `feat:`, `fix:`, `ui:`,
`ci:`, `docs:`, `test:`, `chore:`. Scope it when it helps (`fix(ci):`).

The subject says what changed. The body says why, and is expected on anything
that is not trivial: the constraint, the alternative that was rejected, the
trap that the change avoids. Someone reading the history should be able to see
the engineering, not just the milestone.

Commits named after a version (`feat: v4 markets live`) are how this repo
started and are no longer the pattern. A version is a branch and a pull
request; the commits inside it are the individual changes. If a change touches
more than a couple of thousand lines and cannot be described in one sentence,
it is more than one commit.

Never commit, push, rebase or otherwise write to git on the user's behalf. Ask,
and let them run it.

## Where code goes

- Anything that is a rule rather than a layout belongs in a pure module under
  `src/lib/`, `src/markets/`, `src/trade/`, `src/free/` or `src/arena/`, with
  unit tests. Countdowns, labels, validation, derivations and money maths are
  rules.
- Screens in `src/app/` stay about layout, data wiring and state. They are not
  unit tested, so logic left in a screen is logic that ships untested.
- `src/lib/arena-view.ts` and `src/markets/merge.ts` are the pattern to follow.

## Ported files

Any file taken from the `mentioned` web repo starts with:

```
// PORTED_FROM mentioned/lib/<file> @ <sha>
// Keep byte-identical to the web copy. If <the contract> changes, change both.
// Mobile edits: <what changed, or none>.
```

Nothing else in a ported file changes. Adapt around it instead, the way
`src/trade/send.ts` sits beside the ported `sendInstructions` rather than
editing it. Record the edit in the port table in `docs/V0_GUIDE.md` section 5.

## Money and chain code

- Simulate before signing. Never ask for a signature for a transaction that has
  not been checked.
- A confirmation timeout means the transaction may still land. Never present it
  as a failure.
- Never retry a write to the website. Re-broadcasting signed bytes is safe;
  posting a trade again is not.
- Never pass a `Uint8Array` to Openfort's `signMessage` from this app. Go
  through the provider's `signTransaction` (see `src/trade/openfort-signer.ts`).
- Nothing secret goes in `src/config.ts` or anywhere else in `src/`. Everything
  in the build is readable by anyone who has the build.

## Before committing

```bash
npm test && npm run typecheck && npm run lint
```

All three must pass. `test.yml` is the only gate on a merge, so a red suite on
a branch is a red gate on the pull request.

When a route changes shape, re-capture with `npm run fixtures` and say so in
the commit body. `npm run contract` is what tells you it changed.

## Documentation to keep current

- `README.md` when behaviour, configuration, flavours or commands change.
- `docs/ENGINEERING.md` when a decision is made that a reviewer would otherwise
  have to reverse engineer, and per version as it lands.
- `docs/SPEC.md` for the plan; `docs/V0_GUIDE.md` for the port table.

## Writing style

No em dashes anywhere. In user-facing copy, never the word "bet" or "betting":
use pick, position or stake.
