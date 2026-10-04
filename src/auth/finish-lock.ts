// One sign-in finish at a time, across every copy of the sign-in screen.
//
// The sign-in screen finishes by itself once the SDK reports someone signed
// in. More than one copy of that screen can be mounted at that moment: a
// browser login returns through a deep link that opens a second copy, and a
// legacy (Privy) login can leave a third. Each copy guarded itself with a ref,
// which is per copy, so each one ran the finish: three sessions were made on
// the server, three "Signed in" toasts were shown, and for a brand new account
// three runs raced to create its wallet.
//
// The lock lives at module level, so it is the same lock for every copy. A
// copy that cannot take it does nothing; the copy that holds it takes everyone
// Home when it is done.
let held = false;

/** Take the lock. False when a finish is already running somewhere. */
export function tryStartFinish(): boolean {
  if (held) return false;
  held = true;
  return true;
}

/** Release it, whether the finish worked or not, so a failure can be retried. */
export function endFinish(): void {
  held = false;
}

/** True while a finish is running. */
export const finishRunning = (): boolean => held;
