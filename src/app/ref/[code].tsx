// `/ref/<code>`: a referral link. The code is kept until the next sign-in,
// which sends it once (see sign-in.tsx), and the link itself opens Home. A
// signed-in user keeps their code too: it only ever reaches the server with a
// sign-in, so it does nothing for them, and nothing is the right answer.
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { cleanReferralCode } from '@/lib/referral-code';
import { usePrefs } from '@/store/prefs';

export default function ReferralLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const setPendingRef = usePrefs((s) => s.setPendingRef);
  useEffect(() => {
    const clean = cleanReferralCode(code);
    if (clean) setPendingRef(clean);
  }, [code, setPendingRef]);
  return <Redirect href="/" />;
}
