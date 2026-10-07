// What the app knows about who owns a Seeker, for the mark beside a name
// (src/ui/seeker-badge.tsx). In memory only: it is a few bytes per wallet and
// cheap to ask again on the next launch.
//
// Every badge on a screen asks for its own wallet as it mounts. The asks are
// gathered for a moment and sent as one request, so a leaderboard of fifty
// rows costs one round trip, not fifty.
import { create } from 'zustand';

import { getSeekerVerified } from '@/api/seeker';
import { needsBadgeCheck, recordBadgeFailure, recordBadges, takeBadgeBatch, type BadgeMemory } from '@/lib/seeker-badge';

type State = { memory: BadgeMemory };

export const useSeekerVerified = create<State>(() => ({ memory: {} }));

/** Long enough for a screenful of rows to mount, short enough not to be seen. */
const GATHER_MS = 60;

let queue: string[] = [];
const inFlight = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const { batch, rest } = takeBadgeBatch(queue);
  queue = rest;
  if (batch.length === 0) return;
  batch.forEach((w) => inFlight.add(w));
  try {
    const verified = await getSeekerVerified(batch);
    useSeekerVerified.setState((s) => ({ memory: recordBadges(s.memory, batch, verified, Date.now()) }));
  } catch {
    // No mark is the right thing to show when nobody could be asked.
    useSeekerVerified.setState((s) => ({ memory: recordBadgeFailure(s.memory, batch, Date.now()) }));
  } finally {
    batch.forEach((w) => inFlight.delete(w));
    if (queue.length > 0 && !timer) timer = setTimeout(flush, GATHER_MS);
  }
}

/** Ask about a wallet, unless the answer is already known or on its way. */
export function wantSeekerBadge(wallet: string) {
  if (inFlight.has(wallet) || queue.includes(wallet)) return;
  if (!needsBadgeCheck(useSeekerVerified.getState().memory, wallet, Date.now())) return;
  queue.push(wallet);
  if (!timer) timer = setTimeout(flush, GATHER_MS);
}

/** The signed-in account just linked its Seeker: no need to ask the server what the app was just told. */
export function markSeekerVerified(wallet: string) {
  useSeekerVerified.setState((s) => ({ memory: { ...s.memory, [wallet]: { verified: true, at: Date.now() } } }));
}
