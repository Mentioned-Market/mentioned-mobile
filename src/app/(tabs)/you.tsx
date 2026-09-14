import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useProfile } from '@/api/queries';
import { usd } from '@/lib/format';
import { useActiveWallet } from '@/store/active-wallet';
import { useSession } from '@/store/session';
import { useWallet } from '@/store/wallet';
import { BugReport } from '@/ui/bug-report';
import { ConnectWallet } from '@/ui/connect-wallet';
import { EmojiPicker } from '@/ui/emoji-picker';
import { Screen } from '@/ui/screen';
import { SignInCard } from '@/ui/sign-in-card';
import { ErrorState, Skeleton } from '@/ui/states';
import { colors, fonts, spacing, type } from '@/ui/theme';
import { UsernameForm } from '@/ui/username-form';

export default function YouScreen() {
  // The profile follows whoever is signed in; the Seeker card below is about
  // the Seed Vault wallet specifically, so it keeps reading that directly.
  const active = useActiveWallet();
  const seeker = useWallet((s) => s.viewedAddress);
  const profile = useProfile(active);
  const sessionWallet = useSession((s) => s.wallet);
  // Only the signed-in account can set its own name; a Seed Vault wallet being
  // viewed is someone looking, not someone signed in.
  const needsName = !!sessionWallet && sessionWallet === active && profile.isSuccess && !profile.data.username;

  return (
    <Screen title="You">
      {/* Scrolls: the profile, the Seeker card and the bug report together run
          past the bottom of a phone, and a report box nobody can reach is the
          same as no report box. */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SignInCard />

        {needsName && sessionWallet ? <UsernameForm wallet={sessionWallet} /> : null}

        {active ? (
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
                  <Text style={type.muted}>{profile.data.username ? `mentioned.market/u/${profile.data.username}` : 'Choose one above'}</Text>
                </View>
              </View>
              {/* Free markets need a linked Discord account while the gate is
                  on, so say plainly whether this account has one. */}
              {profile.data.discordId !== undefined ? (
                <Text style={type.muted}>
                  {profile.data.discordId
                    ? `Discord linked${profile.data.discordUsername ? ` as ${profile.data.discordUsername}` : ''}`
                    : 'Discord not linked. Free markets need it for now.'}
                </Text>
              ) : null}
              <View style={styles.stats}>
                <Stat label="Earnings" value={usd(profile.data.earningsUsd)} />
                <Stat label="Bonus points" value={String(profile.data.bonusPointsEarned)} />
                <Stat label="Referrals" value={String(profile.data.referralCount)} />
              </View>
              {sessionWallet && sessionWallet === active ? (
                <Link href="/referrals" asChild>
                  <Pressable style={styles.linkRow} accessibilityRole="link" accessibilityLabel="Referrals">
                    <Text style={{ fontSize: 20 }}>🤝</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { fontFamily: fonts.semibold }]}>Referrals</Text>
                      <Text style={type.muted}>Earned {usd(profile.data.earningsUsd)} · share your link</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                </Link>
              ) : null}
              {/* Only the signed-in account can change its own profile. */}
              {sessionWallet && sessionWallet === active ? <EmojiPicker wallet={sessionWallet} current={profile.data.pfpEmoji} /> : null}
            </View>
          )
        ) : null}

        {/* The Seed Vault wallet is not how you sign in. It funds the app
            wallet, receives withdrawals, and proves you hold a Seeker. Until
            trading lands it also lets you look at a wallet's positions. */}
        <View style={styles.secondary}>
          <Text style={type.muted}>Seeker wallet</Text>
          <ConnectWallet compact={!!seeker} />
        </View>

        <View style={styles.secondary}>
          <Text style={type.muted}>Report a bug</Text>
          <BugReport wallet={active} />
        </View>

        {__DEV__ ? (
          <Link href="/dev" style={{ marginTop: spacing.sm }}>
            <Text style={[type.muted, { color: colors.gold }]}>Dev: smoke tests</Text>
          </Link>
        ) : null}
      </ScrollView>
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
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  secondary: { gap: spacing.sm, marginTop: spacing.sm },
});
