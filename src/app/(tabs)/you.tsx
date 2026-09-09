import { Placeholder, Screen } from '@/ui/screen';

export default function YouScreen() {
  return (
    <Screen title="You" subtitle="View as your Seeker wallet">
      <Placeholder step={8} label="Profile card" />
    </Screen>
  );
}
