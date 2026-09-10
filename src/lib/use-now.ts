// The shared clock for countdowns.
//
// Lives apart from lib/time.ts so that module stays pure and testable: this one
// depends on navigation, that one does not.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * A `Date.now()` that advances every `everyMs` while the screen is focused.
 *
 * Focus-gated on purpose. A screen you navigated away from stays mounted, and
 * the market screens tick once a second, so an ungated interval means several
 * full screen trees re-rendering every second behind whatever you are actually
 * looking at. That is paid for in dropped frames on the screen in front of you,
 * and it was a large part of why switching tabs felt slow.
 *
 * The clock is re-read on focus as well as on each tick, so a screen returned to
 * after minutes away shows the right countdown on its first frame rather than
 * the stale one it was frozen at.
 *
 * Must be called from a screen; there is no navigation context outside one.
 */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const id = setInterval(() => setNow(Date.now()), everyMs);
      return () => clearInterval(id);
    }, [everyMs]),
  );

  return now;
}
