import {
  reconcile,
  EDGE_RESISTANCE,
  SETTLE_MAX_MS,
  SETTLE_MIN_MS,
  SWIPE_ACTIVATE,
  SWIPE_COMMIT_FRACTION,
  SWIPE_COMMIT_VELOCITY,
  SWIPE_FLICK_MIN_DISTANCE,
  dragOffset,
  dragPeer,
  pageTranslate,
  settleDuration,
  settleTarget,
} from '@/lib/swipe-nav';

const W = 400;
const TABS = 5;

describe('dragPeer', () => {
  it('reveals the next tab on a leftward drag and the previous on a rightward one', () => {
    expect(dragPeer(-10, 2, TABS)).toBe(3);
    expect(dragPeer(10, 2, TABS)).toBe(1);
  });

  it('reveals nothing past the first or last tab', () => {
    expect(dragPeer(10, 0, TABS)).toBe(-1);
    expect(dragPeer(-10, TABS - 1, TABS)).toBe(-1);
  });

  it('reveals nothing before the finger has moved', () => {
    expect(dragPeer(0, 2, TABS)).toBe(-1);
  });
});

describe('dragOffset', () => {
  it('follows the finger one to one when there is a tab to reveal', () => {
    expect(dragOffset(-120, 3)).toBe(-120);
  });

  it('gives only a little at the ends', () => {
    expect(dragOffset(100, -1)).toBe(100 * EDGE_RESISTANCE);
  });
});

describe('pageTranslate', () => {
  it('puts the tab at rest at the offset and its neighbour beside it', () => {
    expect(pageTranslate(2, 2, 3, -100, W)).toBe(-100);
    expect(pageTranslate(3, 2, 3, -100, W)).toBe(W - 100);
    expect(pageTranslate(1, 2, 1, 100, W)).toBe(-W + 100);
  });

  it('keeps every other tab off screen', () => {
    expect(pageTranslate(0, 2, 3, -100, W)).toBeNull();
    expect(pageTranslate(4, 2, -1, 0, W)).toBeNull();
  });

  // A tap on a tab two away slides the two pages as if they were neighbours,
  // rather than scrolling past everything in between.
  it('places a distant tab beside the current one while it slides in', () => {
    expect(pageTranslate(4, 0, 4, 0, W)).toBe(W);
    expect(pageTranslate(0, 4, 0, 0, W)).toBe(-W);
  });
});

describe('settleTarget', () => {
  it('changes tab after a long enough slow drag', () => {
    expect(settleTarget(-W * SWIPE_COMMIT_FRACTION, 0, W, 1, TABS)).toBe(2);
    expect(settleTarget(W * SWIPE_COMMIT_FRACTION, 0, W, 1, TABS)).toBe(0);
    expect(settleTarget(-W * SWIPE_COMMIT_FRACTION + 1, 0, W, 1, TABS)).toBe(1);
  });

  it('changes tab after a short flick, but not a twitch', () => {
    expect(settleTarget(-SWIPE_FLICK_MIN_DISTANCE, -SWIPE_COMMIT_VELOCITY, W, 1, TABS)).toBe(2);
    expect(settleTarget(-SWIPE_FLICK_MIN_DISTANCE + 1, -5000, W, 1, TABS)).toBe(1);
  });

  it('stays put when the flick has turned back', () => {
    expect(settleTarget(-100, 900, W, 1, TABS)).toBe(1);
  });

  it('never goes past the first or last tab', () => {
    expect(settleTarget(W, 3000, W, 0, TABS)).toBe(0);
    expect(settleTarget(-W, -3000, W, TABS - 1, TABS)).toBe(TABS - 1);
  });
});

describe('settleDuration', () => {
  it('finishes a fast flick quickly and a slow release at the ceiling', () => {
    expect(settleDuration(W, 4000)).toBe(Math.max((W / 4000) * 1000, SETTLE_MIN_MS));
    expect(settleDuration(W, 0)).toBe(SETTLE_MAX_MS);
  });

  it('stays within bounds', () => {
    expect(settleDuration(1, 100000)).toBe(SETTLE_MIN_MS);
    expect(settleDuration(10000, 10)).toBe(SETTLE_MAX_MS);
  });
});

describe('thresholds', () => {
  // A horizontal ScrollView claims the touch at Android's 8dp slop. The swipe
  // must start after that or it would steal swipes meant for a rail.
  it('activates after a native scroll view would', () => {
    expect(SWIPE_ACTIVATE).toBeGreaterThan(8);
  });

  it('can only commit a flick after it has activated', () => {
    expect(SWIPE_FLICK_MIN_DISTANCE).toBeGreaterThan(SWIPE_ACTIVATE);
  });
});

describe('reconcile', () => {
  it('slides when the router names a tab other than the one at rest', () => {
    expect(reconcile(2, 0, false)).toBe('slide');
    // Even mid-slide: tap Ranks, then Arena before it arrives.
    expect(reconcile(3, 0, true)).toBe('slide');
  });

  it('comes back when the tab named is at rest but a slide away from it is in flight', () => {
    // Tap Ranks from Home, then Home again before the slide lands. Treating
    // this as "already there" left the pager on Ranks, frozen and black.
    expect(reconcile(0, 0, true)).toBe('return');
  });

  it('stays put after a swipe, which moves the pages before it tells the router', () => {
    expect(reconcile(1, 1, false)).toBe('stay');
  });
});
