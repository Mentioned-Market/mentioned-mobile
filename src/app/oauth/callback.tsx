// `mentioned://oauth/callback` is where Openfort's and Privy's browser logins
// return. The SDK reads the token off that URL itself; this route exists so
// expo-router, which also receives it as a deep link, lands on the sign-in
// screen rather than an unmatched-route page. The sign-in screen then sees
// the SDK as authenticated and runs the wallet step.
//
// It goes BACK to the sign-in screen the login was started from. It used to
// redirect, which opened a second copy on top of the first, and a legacy
// login's second browser trip a third. Every copy then finished the sign-in on
// its own: three sessions, three "Signed in" toasts, and a handoff to Privy
// that happened in a copy nobody could see while the one in front showed an
// error. Only when there is no sign-in screen underneath (the app was started
// by this link) is one opened, which is what `dismissTo` does when the route
// is not in the stack.
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function OAuthCallback() {
  const router = useRouter();
  useEffect(() => {
    router.dismissTo('/sign-in');
  }, [router]);
  return null;
}
