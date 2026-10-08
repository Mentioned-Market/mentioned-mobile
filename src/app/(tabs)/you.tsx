// Me: who is signed in, what the wallet is worth and how to add to it or take
// from it, then the places that belong to the account. The emoji is changed by
// tapping it.
import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFreeUserActivity, useIsScreenFocused, usePaidMajorityUserPositions, usePaidMarketUserPositions, useProfile, useSeekerStatus, useSolBalance, useUsdcBalance } from '@/api/queries';
import { FLAVOR } from '@/config';
import { formatSol } from '@/chain/amm';
import { shortAddress, usd } from '@/lib/format';
import { fromFree, fromPaidMajority, fromPaidYesNo, groupPositions } from '@/markets/positions';
import { useActiveWallet } from '@/store/active-wallet';
import { useSession } from '@/store/session';
import { useWalletLink } from '@/store/wallet-link';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { Card, Stat, rowStyle } from '@/ui/card';
import { useFeatures } from '@/ui/config-gate';
import { EmojiPicker } from '@/ui/emoji-picker';
import { DepositSheet, WithdrawSheet } from '@/ui/fund-sheet';
import { Screen } from '@/ui/screen';
import { SeekerCard } from '@/ui/seeker-card';
import { SignInCard } from '@/ui/sign-in-card';
import { ErrorState, Skeleton } from '@/ui/states';
import { SeekerBadge } from '@/ui/seeker-badge';
import { colors, fonts, spacing, type } from '@/ui/theme';
import { UsernameForm } from '@/ui/username-form';

export default function YouScreen() {
  const focused = useIsScreenFocused();
  const active = useActiveWallet();
  const profile = useProfile(active);
  const balance = useUsdcBalance(active, focused);
  // SOL pays every network fee until trading is gasless (v2), so the person
  // needs to see it: a wallet with cash and no SOL cannot place a pick.
  const sol = useSolBalance(active, focused);
  // Cash is read from the chain and polled slowly; a trade on another screen
  // must show here on arrival, so the tab refetches it each time it is opened.
  const refetchBalance = balance.refetch;
  useEffect(() => {
    if (focused && active) void refetchBalance();
  }, [focused, active, refetchBalance]);
  const refetchSol = sol.refetch;
  useEffect(() => {
    if (focused && active) void refetchSol();
  }, [focused, active, refetchSol]);
  const pm = usePaidMajorityUserPositions(active, focused);
  const pa = usePaidMarketUserPositions(active, focused);
  const fr = useFreeUserActivity(active, focused);
  const positions = useMemo(() => {
    const rows = [...(pm.data ?? []).map(fromPaidMajority), ...(pa.data ?? []).map(fromPaidYesNo), ...(fr.data ? fromFree(fr.data) : [])];
    return groupPositions(rows).summary;
  }, [pm.data, pa.data, fr.data]);
  const sessionWallet = useSession((s) => s.wallet);
  const own = !!sessionWallet && sessionWallet === active;
  // An account signed in with the Seeker is the Seeker's own wallet: there is
  // no second wallet to add funds from. (Nothing to link either, which
  // useSeekerStatus handles by having no data for it.)
  const isSeekerAccount = useSession((s) => s.provider) === 'seeker';
  // Only the signed-in account can set its own name; a wallet being viewed is
  // someone looking, not someone signed in.
  const needsName = own && profile.isSuccess && !profile.data.username;
  const emojiSheet = useRef<BottomSheetHandle>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [fund, setFund] = useState<'deposit' | 'withdraw' | null>(null);
  const nameSheet = useRef<BottomSheetHandle>(null);
  const [nameOpen, setNameOpen] = useState(false);
  // The app's session can outlive Openfort's: reads keep working, so nothing
  // else on this screen would say anything, and the trade screens would be
  // the first place the person found out.
  const needsSignIn = useWalletLink((s) => s.status) === 'needs-sign-in';
  // The Seeker perk is for the signed-in account only. A server without the
  // route (404) leaves no data, and no data means no card.
  const seekerPerk = useFeatures().seekerPerk;
  const seeker = useSeekerStatus(sessionWallet, seekerPerk);
  const [refreshing, setRefreshing] = useState(false);
  const refetchAll = () => {
    setRefreshing(true);
    Promise.all([profile.refetch(), balance.refetch(), sol.refetch(), pm.refetch(), pa.refetch(), fr.refetch(), seekerPerk && sessionWallet ? seeker.refetch() : null]).finally(() => setRefreshing(false));
  };

  // Balances always show cents: a $0.50 withdrawal must be visible on a $988
  // wallet, and usd() rounds anything over $100 to whole dollars by default.
  // Cash comes from the chain and the stakes from the API, so they can fail
  // apart. When the chain read fails, cash reads "—" and the total silently
  // omits it rather than showing a confident wrong number.
  const cash = balance.data;
  const total = (cash ?? 0) + positions.stakedUsd + positions.claimableUsd;

  return (
    <Screen title="Me">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.gold} />}
      >
        {/* Signed out shows the sign-in card whatever else is known: a Seeker
            wallet remembered from a deposit or withdrawal is a wallet to look
            at, not a way in. */}
        {!sessionWallet ? <SignInCard /> : null}

        {sessionWallet && needsSignIn ? (
          <Card style={{ gap: spacing.sm }}>
            <Text style={type.heading}>Sign in again to trade</Text>
            <Text style={type.muted}>
              Your sign-in has expired, so your wallet cannot sign. Everything you hold is safe and still shown below.
            </Text>
            <Link href="/sign-in" asChild>
              <Button label="Sign in again" />
            </Link>
          </Card>
        ) : null}

        {needsName && sessionWallet ? <UsernameForm wallet={sessionWallet} /> : null}

        {active ? (
          profile.isPending ? (
            <Card style={styles.identity}>
              <Skeleton height={64} width={64} radius={32} style={{ backgroundColor: colors.surfaceRaised }} />
              <Skeleton height={24} width="50%" style={{ backgroundColor: colors.surfaceRaised }} />
            </Card>
          ) : profile.isError ? (
            <ErrorState error={profile.error} onRetry={() => profile.refetch()} title="Could not load profile" />
          ) : (
            <Card style={styles.identity}>
              <Pressable
                onPress={own ? () => setEmojiOpen(true) : undefined}
                disabled={!own}
                accessibilityRole={own ? 'button' : undefined}
                accessibilityLabel={own ? 'Change your emoji' : undefined}
                style={styles.avatar}
              >
                <Text style={{ fontSize: 34 }}>{profile.data.pfpEmoji ?? '🙂'}</Text>
              </Pressable>
              {/* Tapping the name changes it; the address is not for tapping. */}
              <Pressable
                onPress={own ? () => setNameOpen(true) : undefined}
                disabled={!own}
                accessibilityRole={own ? 'button' : undefined}
                accessibilityLabel={own ? 'Change your username' : undefined}
                style={{ flex: 1, gap: 2 }}
              >
                <View style={styles.nameRow}>
                  <Text style={[styles.name, { flexShrink: 1 }]} numberOfLines={1}>
                    {profile.data.username ?? 'No username yet'}
                  </Text>
                  <SeekerBadge wallet={active} size={13} />
                </View>
                <Text style={type.muted}>{shortAddress(active)}</Text>
              </Pressable>
            </Card>
          )
        ) : null}

        {active ? (
          <Card>
            <Text style={type.label}>Portfolio</Text>
            {balance.isPending && cash === undefined ? (
              <Skeleton height={48} width="55%" radius={10} style={{ backgroundColor: colors.surfaceRaised, marginVertical: 4 }} />
            ) : (
              <Text style={styles.total}>{usd(total, { dp: 2 })}</Text>
            )}
            <View style={styles.stats}>
              <Stat label="Cash" value={balance.isError ? '–' : usd(cash ?? 0, { dp: 2 })} />
              <Stat label="At stake" value={usd(positions.stakedUsd)} align={positions.claimableUsd > 0 ? 'center' : 'right'} />
              {positions.claimableUsd > 0 ? <Stat label="To claim" value={usd(positions.claimableUsd)} tone="up" align="right" /> : null}
            </View>
            {/* Replaced when trading goes gasless (v2): then SOL is no longer the person's concern. */}
            <View style={styles.gasRow}>
              <Ionicons name="flash-outline" size={14} color={colors.textMuted} />
              <Text style={type.muted}>
                {sol.data !== undefined ? `${formatSol(BigInt(Math.round(sol.data * 1e9)))} SOL for network fees` : sol.isError ? 'SOL balance unavailable' : 'Checking SOL for network fees'}
              </Text>
            </View>
            {own ? (
              <View style={styles.fundRow}>
                {!isSeekerAccount ? <Button label="Add funds" onPress={() => setFund('deposit')} style={{ flex: 1 }} /> : null}
                <Button label="Withdraw" tone="neutral" onPress={() => setFund('withdraw')} style={{ flex: 1 }} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {own && seekerPerk && sessionWallet && seeker.data ? <SeekerCard sessionWallet={sessionWallet} status={seeker.data} /> : null}

        {active ? (
          <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
            <MenuRow href="/positions" icon="layers-outline" label="Positions" first />
            {own ? <MenuRow href="/transactions" icon="swap-vertical-outline" label="Transactions" /> : null}
            {own ? <MenuRow href="/referrals" icon="people-outline" label="Referrals" /> : null}
            {own ? <MenuRow href="/bug-report" icon="bug-outline" label="Report a bug" /> : null}
          </Card>
        ) : null}

        {sessionWallet ? <SignInCard /> : null}

        {FLAVOR !== 'production' ? (
          <View style={styles.devRow}>
            <Link href="/intro" asChild>
              <Pressable accessibilityRole="button" hitSlop={8}>
                <Text style={type.muted}>Replay intro</Text>
              </Pressable>
            </Link>
            {__DEV__ ? (
              <Link href="/dev" asChild>
                <Pressable accessibilityRole="button" hitSlop={8}>
                  <Text style={type.muted}>Dev: smoke tests</Text>
                </Pressable>
              </Link>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {sessionWallet ? (
        <>
          <DepositSheet visible={fund === 'deposit'} onClose={() => setFund(null)} wallet={sessionWallet} />
          <WithdrawSheet visible={fund === 'withdraw'} onClose={() => setFund(null)} wallet={sessionWallet} />
          <BottomSheet ref={nameSheet} visible={nameOpen} onClose={() => setNameOpen(false)} title="Change username">
            <UsernameForm wallet={sessionWallet} compact onSaved={() => nameSheet.current?.close()} />
          </BottomSheet>
          <BottomSheet
            ref={emojiSheet}
            visible={emojiOpen}
            onClose={() => setEmojiOpen(false)}
            title="Your emoji"
            footer={<Button label="Done" tone="neutral" onPress={() => emojiSheet.current?.close()} />}
          >
            <EmojiPicker wallet={sessionWallet} current={profile.data?.pfpEmoji ?? null} />
          </BottomSheet>
        </>
      ) : null}
    </Screen>
  );
}

function MenuRow({ href, icon, label, first = false }: { href: string; icon: keyof typeof Ionicons.glyphMap; label: string; first?: boolean }) {
  return (
    <Link href={href as Href} asChild>
      <Pressable style={rowStyle(first)} accessibilityRole="link" accessibilityLabel={label}>
        <Ionicons name={icon} size={20} color={colors.text} />
        <Text style={styles.rowLabel}>{label}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: colors.text },
  total: { fontFamily: fonts.bold, fontSize: 44, lineHeight: 52, color: colors.text, fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  stats: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm },
  fundRow: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
  gasRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.sm },
  rowLabel: { ...type.body, flex: 1, fontFamily: fonts.semibold },
  devRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
});
