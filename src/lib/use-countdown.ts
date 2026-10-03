// A market's closing countdown that ticks every second in its last hour and
// every thirty seconds before that. Lives apart from lib/time.ts for the same
// reason use-now.ts does: this one depends on navigation.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { closesIn, isUrgent } from '@/lib/time';

/**
 * `text` is `closesIn` at the current second; `urgent` is the last hour, when
 * the text carries seconds and is worth drawing the eye to.
 *
 * Each caller runs its own timer rather than taking a shared clock from its
 * screen, so only a card that is actually in its last hour re-renders every
 * second. Focus-gated like `useNow`: a card on a screen you have left stops.
 */
export function useCountdown(lockMs: number | null): { text: string | null; urgent: boolean } {
  const [now, setNow] = useState(() => Date.now());
  const urgent = isUrgent(lockMs, now);
  const everyMs = urgent ? 1000 : 30_000;

  useFocusEffect(
    useCallback(() => {
      if (!lockMs) return;
      setNow(Date.now());
      const id = setInterval(() => setNow(Date.now()), everyMs);
      return () => clearInterval(id);
    }, [lockMs, everyMs]),
  );

  return { text: closesIn(lockMs, now), urgent };
}
