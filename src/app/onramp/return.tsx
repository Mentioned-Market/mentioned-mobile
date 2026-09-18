// `/onramp/return`: where a card on-ramp sends the browser back. There is no
// on-ramp in the app yet (SPEC section 6.4), so the link simply lands on Me,
// where the balance is.
import { Redirect } from 'expo-router';

export default function OnrampReturn() {
  return <Redirect href="/you" />;
}
