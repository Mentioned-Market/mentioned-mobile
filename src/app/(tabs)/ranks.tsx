import { Placeholder, Screen } from '@/ui/screen';

export default function RanksScreen() {
  return (
    <Screen title="Ranks" subtitle="Weekly points and prize pool">
      <Placeholder step={8} label="Leaderboard" />
    </Screen>
  );
}
