// Swiping between tabs: which page sits where while a finger drags, and where
// the pager settles when it lets go.
//
// Everything here runs on the UI thread inside gesture and animation
// callbacks, hence the 'worklet' directives. They are plain functions
// otherwise, so they are unit tested.

/**
 * Horizontal travel (dp) before the swipe claims the touch. It has to be
 * larger than Android's touch slop (8dp): a horizontal ScrollView grabs the
 * touch at the slop, and gesture-handler cancels every gesture when a native
 * view does that. Starting later is what lets a rail keep its own swipes.
 */
export const SWIPE_ACTIVATE = 16;

/**
 * Vertical travel (dp) that rules the swipe out, so a scroll that drifts
 * sideways stays a scroll.
 */
export const SWIPE_FAIL_Y = 14;

/** Share of the screen width a slow drag has to cover to change tab. */
export const SWIPE_COMMIT_FRACTION = 0.35;

/** A flick this fast (dp/s) changes tab once it has covered `SWIPE_FLICK_MIN_DISTANCE`. */
export const SWIPE_COMMIT_VELOCITY = 500;
export const SWIPE_FLICK_MIN_DISTANCE = 40;

/** How much of a drag past the first or last tab moves the page. */
export const EDGE_RESISTANCE = 0.15;

/** Settle animation bounds (ms). */
export const SETTLE_MIN_MS = 140;
export const SETTLE_MAX_MS = 300;

/**
 * The tab a drag is revealing: the next one for a leftward drag, the previous
 * one for a rightward drag, or -1 past either end.
 */
export function dragPeer(translationX: number, index: number, count: number): number {
  'worklet';
  if (translationX < 0 && index < count - 1) return index + 1;
  if (translationX > 0 && index > 0) return index - 1;
  return -1;
}

/**
 * How far the pages move for a drag. They follow the finger one to one, and
 * only give a little past the first or last tab, so the edge reads as an edge.
 */
export function dragOffset(translationX: number, peer: number): number {
  'worklet';
  return peer === -1 ? translationX * EDGE_RESISTANCE : translationX;
}

/**
 * Where a page sits (translateX), given the tab at rest, the tab being
 * revealed and the current offset. Null for a page that is not on screen.
 */
export function pageTranslate(page: number, index: number, peer: number, offset: number, width: number): number | null {
  'worklet';
  if (page === index) return offset;
  if (page === peer) return (peer > index ? width : -width) + offset;
  return null;
}

/**
 * The tab a released drag settles on: the neighbour it was revealing if it
 * went far enough, or was flicked that way, otherwise back where it started.
 */
export function settleTarget(translationX: number, velocityX: number, width: number, index: number, count: number): number {
  'worklet';
  const peer = dragPeer(translationX, index, count);
  if (peer === -1) return index;
  const distance = Math.abs(translationX);
  if (distance >= width * SWIPE_COMMIT_FRACTION) return peer;
  // A flick counts only in the direction of the drag: one that has turned
  // back towards where it started is a change of mind.
  const sameWay = Math.sign(velocityX) === Math.sign(translationX);
  if (sameWay && distance >= SWIPE_FLICK_MIN_DISTANCE && Math.abs(velocityX) >= SWIPE_COMMIT_VELOCITY) return peer;
  return index;
}

/**
 * How long the rest of the move takes: the remaining distance at the speed
 * of the flick, so a fast swipe finishes fast, within sane bounds.
 */
export function settleDuration(remaining: number, velocityX: number): number {
  'worklet';
  const speed = Math.abs(velocityX);
  if (speed < 1) return SETTLE_MAX_MS;
  const ms = (Math.abs(remaining) / speed) * 1000;
  return Math.min(Math.max(ms, SETTLE_MIN_MS), SETTLE_MAX_MS);
}

/**
 * What the pager does when the router names a tab, from wherever the pages
 * are at that instant:
 *
 *  - `slide`: another tab is at rest, so slide from it to the one named.
 *  - `return`: the tab named is the one at rest, but a slide away from it is
 *    in flight (tap a tab, then tap back before it arrives). Bring it back.
 *    Leaving that slide to finish is what parked the pager on a tab the router
 *    had already left, and that tab was frozen, which drew as a black screen.
 *  - `stay`: the tab named is at rest and nothing is moving, which is how a
 *    finished swipe looks, because a swipe moves the pages before it tells the
 *    router.
 */
export function reconcile(to: number, atRest: number, settling: boolean): 'slide' | 'return' | 'stay' {
  'worklet';
  if (to !== atRest) return 'slide';
  return settling ? 'return' : 'stay';
}
