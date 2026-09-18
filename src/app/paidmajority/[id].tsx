// `/paidmajority/<id>` is the website's path for a paid majority market.
import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

export default function PaidMajorityLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={(/^\d+$/.test(id ?? '') ? `/majority/${id}` : '/markets') as Href} />;
}
