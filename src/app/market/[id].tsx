// `/market/<id>` is the website's path for a paid YES/NO market (SPEC section
// 11). App Links land here and go straight to the app's own screen.
import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

export default function MarketLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={(/^\d+$/.test(id ?? '') ? `/paid/${id}` : '/markets') as Href} />;
}
