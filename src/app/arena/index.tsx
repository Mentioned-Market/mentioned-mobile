// The Arena: Mentioned's team competition, as mentioned.market/arena shows it.
//
// One season at a time is open for entry (the highest-id one in the ported
// registry); earlier seasons stay viewable as final standings. The season's
// shape (dates, prizes, team size) is local data, ported from the website, so
// the hero renders instantly; only the standings and the viewer's team are
// fetched.
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Link, type Href } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { createTeam, joinTeam, type MyTeam, type TeamLeaderboardEntry } from '@/api/arena';
import { keys, useIsScreenFocused, useMyTeam, useTeamLeaderboard } from '@/api/queries';
import { ARENAS, CURRENT_ARENA, arenaStatus, type Arena } from '@/arena/arenas';
import {
  MEDALS,
  canEnter,
  formatCountdown,
  friendlyTeamError,
  joinCodeError,
  placeLabel,
  seasonCountdown,
  statusLabel,
  teamNameError,
  teamSizeCopy,
} from '@/lib/arena-view';
import { useNow } from '@/lib/use-now';
import { useSession } from '@/store/session';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { Pill } from '@/ui/pill';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, Skeleton } from '@/ui/states';
import { colors, fonts, spacing, type } from '@/ui/theme';

/** Newest season first, as the website's switcher lists them. */
const SEASONS = [...ARENAS].sort((a, b) => b.id - a.id);

type SheetKind = 'prizes' | 'earn' | 'create' | 'join';

export default function ArenaScreen() {
  const focused = useIsScreenFocused();
  const queryClient = useQueryClient();
  const wallet = useSession((s) => s.wallet);
  const [selected, setSelected] = useState<Arena>(CURRENT_ARENA);
  // A minute is fine for deciding status; the ticking countdown has its own clock.
  const now = new Date(useNow(60_000));
  const status = arenaStatus(selected, now);
  const isCurrent = selected.id === CURRENT_ARENA.id;
  const entryOpen = canEnter(selected, CURRENT_ARENA, now);
  const board = useTeamLeaderboard(selected.slug, status === 'active', focused);
  const mine = useMyTeam(wallet, selected.slug);
  const [refreshing, setRefreshing] = useState(false);

  const sheetRef = useRef<BottomSheetHandle>(null);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [input, setInput] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const rows = useMemo(() => [...(board.data?.data ?? [])].sort((a, b) => b.weekly_points - a.weekly_points), [board.data]);

  const openSheet = (kind: SheetKind) => {
    setInput('');
    setConfirming(false);
    setFormError(null);
    setSheet(kind);
  };

  const refresh = () => {
    setRefreshing(true);
    Promise.all([board.refetch(), wallet ? mine.refetch() : Promise.resolve()]).finally(() => setRefreshing(false));
  };

  /** First tap checks the input and asks for confirmation; the second one commits. */
  const submit = async () => {
    if (!wallet || (sheet !== 'create' && sheet !== 'join')) return;
    const problem = sheet === 'create' ? teamNameError(input) : joinCodeError(input);
    if (problem) {
      setFormError(problem);
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      if (sheet === 'create') await createTeam(input.trim(), wallet);
      else await joinTeam(input.trim().toUpperCase(), wallet);
      await queryClient.invalidateQueries({ queryKey: keys.arenaAll });
      sheetRef.current?.close();
    } catch (e) {
      setFormError(friendlyTeamError(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const myTeam = wallet ? mine.data : null;

  return (
    <Screen title="" back backLabel="Back">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
      >
        {SEASONS.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasons}>
            {SEASONS.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setSelected(a)}
                style={[styles.seasonChip, a.id === selected.id && styles.seasonChipOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: a.id === selected.id }}
              >
                <Text style={[styles.seasonChipText, a.id === selected.id && { color: colors.gold }]}>
                  {a.emoji} {a.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.hero}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={styles.eyebrow}>The Arena</Text>
            <Pill label={statusLabel(status, isCurrent)} tone={status === 'active' ? 'green' : status === 'upcoming' ? 'orange' : 'neutral'} />
          </View>
          <Text style={styles.heroTitle}>
            {selected.emoji} {selected.name}
          </Text>
          <Text style={type.muted}>{selected.tagline}</Text>
          <Text style={type.body}>
            {selected.displayRange} · <Text style={{ color: colors.gold }}>Top {selected.prizes.length} share {selected.prizePool}</Text>
          </Text>
          <Countdown arena={selected} />
          <View style={styles.prizeRow}>
            {selected.prizes.slice(0, 3).map((p, i) => (
              <View key={p.place} style={styles.prizeChip}>
                <Text style={type.body}>
                  {MEDALS[i]} {p.amount}
                </Text>
              </View>
            ))}
            <Pressable onPress={() => openSheet('prizes')} style={styles.linkChip} accessibilityRole="button">
              <Text style={styles.linkChipText}>{selected.prizes.length > 3 ? `+${selected.prizes.length - 3} more` : 'All prizes'}</Text>
            </Pressable>
          </View>
        </View>

        {wallet && myTeam ? (
          <MyTeamCard team={myTeam} />
        ) : entryOpen ? (
          <View style={styles.card}>
            <Text style={type.heading}>⚔️ Enter the Arena</Text>
            <Text style={type.muted}>{teamSizeCopy(selected)}</Text>
            <Text style={type.muted}>
              Top {selected.prizes.length} teams share the <Text style={{ color: colors.gold }}>{selected.prizePool} prize pool</Text> ({selected.displayRange}).
            </Text>
            <Text style={[type.muted, styles.discordNote]}>Discord must be linked, and at least 30 days old, to enter the Arena.</Text>
            {wallet ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label="Create a team" onPress={() => openSheet('create')} style={{ flex: 1 }} />
                <Button label="Join with a code" tone="neutral" onPress={() => openSheet('join')} style={{ flex: 1 }} />
              </View>
            ) : (
              <Text style={type.muted}>Sign in to create or join a team.</Text>
            )}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={type.heading}>⭐ How the Arena works</Text>
          {[
            ['🛡️', 'Create a team or join one with a code'],
            ['📈', 'Trade on free or paid markets to earn points'],
            ['🏆', 'Team score is the sum of every member’s points'],
            ['🎯', `Top ${selected.prizes.length} teams share the ${selected.prizePool} prize pool`],
          ].map(([emoji, text]) => (
            <View key={text} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Text>{emoji}</Text>
              <Text style={[type.body, { flex: 1 }]}>{text}</Text>
            </View>
          ))}
          <Pressable onPress={() => openSheet('earn')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.linkChipText}>How to earn points</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.gold} />
          </Pressable>
        </View>

        <Text style={type.heading}>{status === 'ended' ? 'Final standings' : 'Standings'}</Text>
        {board.isPending ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={60} radius={12} />
            <Skeleton height={60} radius={12} />
            <Skeleton height={60} radius={12} />
          </View>
        ) : board.isError ? (
          <ErrorState error={board.error} onRetry={() => board.refetch()} title="Could not load the standings" />
        ) : rows.length === 0 ? (
          <EmptyState
            title={status === 'ended' ? 'No teams competed in this season' : 'No teams yet'}
            body={status === 'ended' ? undefined : 'Create the first one.'}
          />
        ) : (
          rows.map((row, i) => <TeamRow key={row.team_id} row={row} rank={i} mine={myTeam?.slug === row.team_slug} />)
        )}
      </ScrollView>

      <BottomSheet
        ref={sheetRef}
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        title={
          sheet === 'prizes'
            ? `${selected.emoji} ${selected.name} prizes`
            : sheet === 'earn'
              ? '⭐ How to earn points'
              : sheet === 'create'
                ? confirming
                  ? 'Are you sure?'
                  : 'Create a team'
                : confirming
                  ? 'Are you sure?'
                  : 'Join a team'
        }
        subtitle={sheet === 'prizes' ? `Top ${selected.prizes.length} teams share ${selected.prizePool} · ${selected.displayRange}` : undefined}
        locked={busy}
        footer={
          sheet === 'create' || sheet === 'join' ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                label={confirming ? 'Go back' : 'Cancel'}
                tone="neutral"
                onPress={() => (confirming ? setConfirming(false) : sheetRef.current?.close())}
                disabled={busy}
                style={{ flex: 1 }}
              />
              <Button
                label={busy ? (sheet === 'create' ? 'Creating' : 'Joining') : confirming ? (sheet === 'create' ? 'Create team' : 'Join team') : 'Continue'}
                onPress={submit}
                disabled={busy || input.trim().length === 0}
                style={{ flex: 1 }}
              />
            </View>
          ) : (
            <Button label="Got it" tone="neutral" onPress={() => sheetRef.current?.close()} />
          )
        }
      >
        {sheet === 'prizes' ? (
          selected.prizes.map((p) => (
            <View key={p.place} style={styles.prizeLine}>
              <Text style={{ width: 28, textAlign: 'center' }}>{p.place <= 3 ? MEDALS[p.place - 1] : p.place}</Text>
              <Text style={[type.body, { flex: 1 }]}>{placeLabel(p.place)}</Text>
              <Text style={[type.money, { color: colors.gold }]}>{p.amount}</Text>
            </View>
          ))
        ) : sheet === 'earn' ? (
          <EarnRules />
        ) : sheet === 'create' || sheet === 'join' ? (
          confirming ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={type.body}>
                {sheet === 'create' ? (
                  <>
                    You are about to create <Text style={{ fontFamily: fonts.semibold }}>“{input.trim()}”</Text> as your team for {selected.name}.
                  </>
                ) : (
                  <>
                    You are about to join the team with code <Text style={{ fontFamily: fonts.semibold }}>{input.trim().toUpperCase()}</Text> for {selected.name}.
                  </>
                )}
              </Text>
              <Text style={[type.muted, styles.warnNote]}>You cannot switch teams once you have entered. Make sure this is the team you want.</Text>
              {formError ? <Text style={[type.muted, { color: colors.no }]}>{formError}</Text> : null}
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <Text style={type.muted}>
                {sheet === 'create'
                  ? 'Pick a name. You will get a join code to send to your teammates.'
                  : 'Enter the 6 character code your captain shared.'}
              </Text>
              <Text style={[type.muted, styles.discordNote]}>Discord must be linked, and at least 30 days old, to enter the Arena.</Text>
              <TextInput
                value={input}
                onChangeText={(v) => {
                  setInput(sheet === 'join' ? v.toUpperCase() : v);
                  setFormError(null);
                }}
                placeholder={sheet === 'create' ? 'Team name' : 'ABC123'}
                placeholderTextColor={colors.textMuted}
                maxLength={sheet === 'create' ? 30 : 6}
                autoCapitalize={sheet === 'join' ? 'characters' : 'words'}
                autoCorrect={false}
                style={styles.input}
                accessibilityLabel={sheet === 'create' ? 'Team name' : 'Join code'}
              />
              {formError ? <Text style={[type.muted, { color: colors.no }]}>{formError}</Text> : null}
            </View>
          )
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

/** Its own clock, so the seconds ticking over re-render one line, not the standings. */
function Countdown({ arena }: { arena: Arena }) {
  const now = useNow(1000);
  const c = seasonCountdown(arena, now);
  if (!c) return null;
  return (
    <Text style={styles.countdown}>
      {c.label} <Text style={{ color: colors.gold }}>{formatCountdown(c.ms)}</Text>
    </Text>
  );
}

function MyTeamCard({ team }: { team: MyTeam }) {
  const captain = team.role === 'captain';
  return (
    <View style={[styles.card, { borderColor: 'rgba(242,183,31,0.45)' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={type.muted}>🛡️ Your team</Text>
        {captain ? <Pill label="CAPTAIN" tone="gold" /> : null}
      </View>
      <Text style={styles.teamName}>{team.name}</Text>
      {captain && team.join_code ? (
        <View style={styles.codeBox}>
          <View style={{ flex: 1 }}>
            <Text style={type.muted}>Join code</Text>
            <Text style={styles.code} selectable>
              {team.join_code}
            </Text>
          </View>
          <Button
            label="Share"
            tone="neutral"
            onPress={() => Share.share({ message: `Join my team "${team.name}" in the Mentioned Arena. My code is ${team.join_code}.` })}
          />
        </View>
      ) : null}
      <Link href={`/arena/${team.slug}` as Href} asChild>
        <Pressable style={styles.viewTeam} accessibilityRole="link">
          <Text style={styles.linkChipText}>View team</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.gold} />
        </Pressable>
      </Link>
    </View>
  );
}

function TeamRow({ row, rank, mine }: { row: TeamLeaderboardEntry; rank: number; mine: boolean }) {
  return (
    <Link href={`/arena/${row.team_slug}` as Href} asChild>
      <Pressable style={StyleSheet.flatten([styles.row, mine && styles.rowMine])} accessibilityRole="link" accessibilityLabel={`${row.team_name}, rank ${rank + 1}`}>
        <Text style={styles.rank}>{MEDALS[rank] ?? rank + 1}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[type.body, { fontFamily: fonts.semibold, flexShrink: 1 }]} numberOfLines={1}>
              {row.team_name}
            </Text>
            {mine ? <Pill label="YOU" tone="gold" /> : null}
          </View>
          <Text style={type.muted}>
            {row.member_count} {row.member_count === 1 ? 'member' : 'members'}
          </Text>
        </View>
        <Text style={type.money}>{row.weekly_points.toLocaleString()}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>
    </Link>
  );
}

/** One scoring rule: the claim in bold, the detail after it. */
function Rule({ title, body }: { title: string; body: string }) {
  return (
    <Text style={type.body}>
      <Text style={{ fontFamily: fonts.semibold }}>{title}</Text> <Text style={{ color: colors.textMuted }}>{body}</Text>
    </Text>
  );
}

/** The website's scoring rules, in the app's words. */
function EarnRules() {
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={type.muted}>Your points add to your team&apos;s score. Every point counts the same, but paid markets pay out far more than free play.</Text>
      <View style={[styles.card, { borderColor: 'rgba(242,183,31,0.45)' }]}>
        <Text style={[styles.eyebrow, { color: colors.gold }]}>💰 Paid markets · main event</Text>
        <Rule title="+100 just for playing." body="Hold at least $1 to the close and you bank it, win or lose. Once per market." />
        <Rule title="+150 per $1 of profit." body="The more you win, the more you earn." />
        <Rule title="Trades cap at 2 USDC." body="It rewards being right, not staking big, so small traders compete on an even field." />
      </View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>🎮 Free markets · warm up</Text>
        <Rule title="Start with 300 play tokens." body="No real money, just predict and trade." />
        <Rule title="Earn half your token profit as points." body="Turn a profit and half of it converts to points." />
        <Rule title="Capped at 200 points per market." body="Free play is the on-ramp; paid markets are where it adds up." />
      </View>
      <Text style={type.muted}>Points land when a market resolves, so hold your position to the close. Link Discord to earn: points only count for linked wallets.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  seasons: { gap: spacing.sm },
  seasonChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  seasonChipOn: { borderColor: colors.gold, backgroundColor: 'rgba(242,183,31,0.12)' },
  seasonChipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  hero: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(242,183,31,0.45)', gap: spacing.sm },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted },
  heroTitle: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, color: colors.gold },
  countdown: { ...type.body, fontVariant: ['tabular-nums'] },
  prizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 },
  prizeChip: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.surfaceRaised },
  linkChip: { paddingHorizontal: spacing.sm, paddingVertical: 6, justifyContent: 'center' },
  linkChipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gold },
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  discordNote: { color: '#8C95F5' },
  warnNote: { color: colors.gold },
  teamName: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: colors.text },
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  code: { fontFamily: fonts.bold, fontSize: 22, letterSpacing: 3, color: colors.gold },
  viewTeam: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  rowMine: { borderColor: colors.gold },
  rank: { width: 32, textAlign: 'center', fontFamily: fonts.bold, fontSize: 16, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  prizeLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  input: {
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
});
