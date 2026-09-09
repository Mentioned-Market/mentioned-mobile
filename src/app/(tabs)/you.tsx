import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useProfile } from '@/api/queries';
import { usd } from '@/lib/format';
import { useWallet } from '@/store/wallet';
import { ConnectWallet } from '@/ui/connect-wallet';
import { Screen } from '@/ui/screen';
import { ErrorState, Skeleton } from '@/ui/states';
import { colors, spacing, type } from '@/ui/theme';

export default function YouScreen() {
  const viewed = useWallet((s) => s.viewedAddress);
  const profile = useProfile(viewed);

  return (
    <Screen title="You">
      <View style={{ gap: spacing.md }}>
        <ConnectWallet />
        {viewed ? (
          profile.isPending ? (
            <View style={styles.card}>
              <Skeleton height={24} width="50%" />
              <Skeleton height={16} width="70%" />
            </View>
          ) : profile.isError ? (
            <ErrorState error={profile.error} onRetry={() => profile.refetch()} title="Could not load profile" />
          ) : (
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ fontSize: 32 }}>{profile.data.pfpEmoji ?? '🙂'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={type.heading}>{profile.data.username ?? 'No username yet'}</Text>
                  <Text style={type.muted}>{profile.data.username ? `mentioned.market/u/${profile.data.username}` : 'Set one on the website'}</Text>
                </View>
              </View>
              <View style={styles.stats}>
                <Stat label="Earnings" value={usd(profile.data.earningsUsd)} />
                <Stat label="Bonus points" value={String(profile.data.bonusPointsEarned)} />
                <Stat label="Referrals" value={String(profile.data.referralCount)} />
              </View>
            </View>
          )
        ) : null}
        <View style={styles.card}>
          <Text style={type.heading}>Sign in</Text>
          <Text style={type.muted}>Trading, funding and profile edits arrive with sign-in in a later build.</Text>
        </View>
        {__DEV__ ? (
          <Link href="/dev" style={{ marginTop: spacing.sm }}>
            <Text style={[type.muted, { color: colors.gold }]}>Dev: smoke tests</Text>
          </Link>
        ) : null}
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={type.muted}>{label}</Text>
      <Text style={type.money}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
});
