// Which names get the Seeker mark. The mark sits beside a name wherever names
// are listed (Ranks, profiles, chat, team members), and those lists already
// hold each person's wallet, so the app asks the website about wallets in
// batches (web: app/api/seeker/verified) and remembers the answers.
//
// The rules of that memory are here, tested; src/store/seeker-verified.ts
// only holds it and makes the request.

/** The most wallets the route answers for in one request. */
export const BADGE_BATCH_MAX = 200;

/**
 * A "no" is asked again after this long: someone can link their Seeker at any
 * time. A "yes" is kept for the session, since a link is never undone.
 */
export const BADGE_RECHECK_MS = 10 * 60_000;

export type BadgeAnswer = { verified: boolean; at: number };
export type BadgeMemory = Readonly<Record<string, BadgeAnswer>>;

/** Whether this wallet still has to be asked about. */
export function needsBadgeCheck(memory: BadgeMemory, wallet: string, now: number): boolean {
  const known = memory[wallet];
  if (!known) return true;
  return !known.verified && now - known.at >= BADGE_RECHECK_MS;
}

/** The next request's wallets, each once, and whatever has to wait for the one after. */
export function takeBadgeBatch(queue: readonly string[], max = BADGE_BATCH_MAX): { batch: string[]; rest: string[] } {
  const distinct = [...new Set(queue)];
  return { batch: distinct.slice(0, max), rest: distinct.slice(max) };
}

/** The memory after an answer: every wallet asked about is now known, yes or no. */
export function recordBadges(memory: BadgeMemory, asked: readonly string[], verified: readonly string[], now: number): BadgeMemory {
  const yes = new Set(verified);
  const next: Record<string, BadgeAnswer> = { ...memory };
  for (const wallet of asked) {
    // A yes is never downgraded by a later answer that leaves it out.
    if (next[wallet]?.verified) continue;
    next[wallet] = { verified: yes.has(wallet), at: now };
  }
  return next;
}

/**
 * The memory after a request that failed: the wallets read as "no" for now,
 * and come up for asking again after a minute, not after the full wait and
 * not on the very next render.
 */
export function recordBadgeFailure(memory: BadgeMemory, asked: readonly string[], now: number): BadgeMemory {
  return recordBadges(memory, asked, [], now - BADGE_RECHECK_MS + 60_000);
}
