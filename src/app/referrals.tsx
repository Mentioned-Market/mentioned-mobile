// Referrals, as mentioned.market/referrals shows them: what this wallet has
// earned from the people it brought in, the link that brings more, and who
// joined through it.
//
// Signed in only. The figures are public by wallet, but the link is the point of
// the screen, and a link is only worth sharing by the person it pays.
import { Image } from 'expo-image';
import { useState } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { useProfile, useReferral } from '@/api/queries';
import { REVSHARE_AMM_FEE_PCT, REVSHARE_MAJORITY_PCT, referralCardUrl, referralLink } from '@/api/referral';
import { referralShareText } from '@/lib/arena-view';
import { shortAddress, usd } from '@/lib/format';
import { useSession } from '@/store/session';
import { Button } from '@/ui/button';
import { Card, Row, SectionTitle, Stat } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { SignInCard } from '@/ui/sign-in-card';
import { CardSkeleton, EmptyState, ErrorState } from '@/ui/states';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

/** The website's referral card is rendered at 1200 by 630. */
const CARD_ASPECT = 1200 / 630;

export default function ReferralsScreen() {
  const wallet = useSession((s) => s.wallet);
  const referral = useReferral(wallet);
  const profile = useProfile(wallet);
  const [refreshing, setRefreshing] = useState(false);
  const [cardFailed, setCardFailed] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const refresh = () => {
    setRefreshing(true);
    referral.refetch().finally(() => setRefreshing(false));
  };

  if (!wallet) {
    return (
      <Screen title="Referrals" back>
        <SignInCard />
      </Screen>
    );
  }

  const code = referral.data?.referralCode ?? null;
  const link = code ? referralLink(code) : null;

  const share = async () => {
    if (!link) return;
    setShareError(null);
    try {
      await Share.share({ message: `${referralShareText(profile.data?.username ?? null)}\n\n${link}` });
    } catch {
      setShareError('That did not open. Try again.');
    }
  };

  return (
    <Screen title="Referrals" back>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
      >
        {referral.isPending ? (
          <CardSkeleton />
        ) : referral.isError ? (
          <ErrorState error={referral.error} onRetry={() => referral.refetch()} title="Could not load your referrals" />
        ) : (
          <>
            <Card style={{ gap: spacing.xs }}>
              <Text style={type.label}>Earned</Text>
              <Text style={styles.amount}>{usd(referral.data.earningsUsd)}</Text>
              <Text style={type.muted}>
                {REVSHARE_MAJORITY_PCT}% of your referrals&apos; majority volume and {REVSHARE_AMM_FEE_PCT}% of their AMM fees, paid out weekly.
              </Text>
              <View style={styles.statRow}>
                <Stat label="Referrals" value={String(referral.data.referralCount)} />
              </View>
            </Card>

            {code && link ? (
              <Card style={{ gap: spacing.sm }}>
                {cardFailed ? null : (
                  <Image source={{ uri: referralCardUrl(code) }} style={styles.cardImage} contentFit="cover" onError={() => setCardFailed(true)} accessibilityLabel="Your referral card" />
                )}
                <Text style={type.label}>Your link</Text>
                <Text style={styles.link} selectable>
                  {link.replace(/^https?:\/\//, '')}
                </Text>
                <Button label="Share your link" onPress={share} style={{ paddingTop: spacing.xs }} />
                {shareError ? <Text style={[type.muted, { color: colors.no }]}>{shareError}</Text> : null}
              </Card>
            ) : (
              <Card>
                <Text style={type.muted}>Your referral link is not ready yet. Pull down to try again.</Text>
              </Card>
            )}

            <View style={styles.section}>
              <SectionTitle title="Your referrals" />
              {referral.data.referredUsers.length === 0 ? (
                <EmptyState title="No referrals yet" body="Share your link to start earning." />
              ) : (
                <Card padded={false} style={styles.listCard}>
                  {referral.data.referredUsers.map((u, i) => (
                    <Row key={u.wallet} first={i === 0}>
                      <Text style={styles.name} numberOfLines={1}>
                        {u.username ?? shortAddress(u.wallet)}
                      </Text>
                      <Text style={type.muted}>Joined {new Date(u.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                    </Row>
                  ))}
                </Card>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  amount: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 48, color: colors.gold, fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  statRow: { flexDirection: 'row', paddingTop: spacing.sm },
  cardImage: { width: '100%', aspectRatio: CARD_ASPECT, borderRadius: radius.thumb, backgroundColor: colors.surfaceRaised },
  link: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.gold },
  section: { gap: spacing.sm },
  listCard: { paddingHorizontal: spacing.md },
  name: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text, flex: 1 },
});
