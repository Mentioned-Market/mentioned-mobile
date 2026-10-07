// The Seeker mark: a very small phone beside the name of someone who has
// proved they own a Seeker. Meant to be noticed on a second look, not a first:
// it sits on the name's line at about the height of a lowercase letter, and
// takes no room at all for everyone else.
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';

import { useSeekerVerified, wantSeekerBadge } from '@/store/seeker-verified';
import { useFeatures } from '@/ui/config-gate';
import { colors } from '@/ui/theme';

export function SeekerBadge({ wallet, size = 11 }: { wallet: string | null | undefined; size?: number }) {
  const enabled = useFeatures().seekerPerk;
  const verified = useSeekerVerified((s) => (wallet ? s.memory[wallet]?.verified === true : false));

  useEffect(() => {
    if (enabled && wallet) wantSeekerBadge(wallet);
  }, [enabled, wallet]);

  if (!enabled || !verified) return null;
  return <Ionicons name="phone-portrait" size={size} color={colors.gold} style={{ opacity: 0.8 }} accessibilityLabel="Verified Seeker" />;
}
