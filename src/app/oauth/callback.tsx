// `mentioned://oauth/callback` is where Openfort's browser login returns. The
// SDK reads the token off that URL itself; this route exists so expo-router,
// which also receives it as a deep link, lands on the sign-in screen rather
// than an unmatched-route page. The sign-in screen then sees the SDK as
// authenticated and offers the wallet step.
import { Redirect } from 'expo-router';

export default function OAuthCallback() {
  return <Redirect href="/sign-in" />;
}
