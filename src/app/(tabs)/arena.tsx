// The Arena: Mentioned's team competition, as mentioned.market/arena shows it.
//
// One season at a time is open for entry (the highest-id one); earlier seasons
// stay viewable as final standings. The seasons, their prizes and their medals
// are the website's, fetched from it and kept in the persisted cache, with the
// registry bundled in the build as the fallback, so the hero still renders on
// the first frame. The standings, the medal holders and the viewer's team are
// fetched live.
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Link, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { createTeam, joinTeam, type MyTeam, type TeamLeaderboardEntry } from '@/api/arena';
import { keys, useIsScreenFocused, useMedalBoard, useMyTeam, useTeamLeaderboard } from '@/api/queries';
import { seasonBySlug, seasonStatus, type Season } from '@/arena/seasons';
import { useSeasons } from '@/arena/use-seasons';
import {
  MEDALS,
  canEnter,
  formatCountdown,
  friendlyTeamError,
  joinCodeError,
  placeLabel,
  seasonCountdown,
  seasonPhase,
  teamNameError,
  teamSizeCopy,
  leaderboardPool,
  appCopy,
} from '@/lib/arena-view';
import { ARENA_EXISTING_MEMBER_COPY } from '@/lib/attestation';
import { medalTable, medalViews, standingDetail, winningsLabel, type MedalTableRow, type MedalView } from '@/lib/medal-board';
import { useNow } from '@/lib/use-now';
import { useSession } from '@/store/session';
import { useAttestationGate } from '@/trade/use-attestation-gate';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { Card, SectionTitle, Stat, rowStyle } from '@/ui/card';
import { EarnRules } from '@/ui/earn-rules';
import { Medallion } from '@/ui/medallion';
import { Pill } from '@/ui/pill';
import { Screen } from '@/ui/screen';
import { Segmented } from '@/ui/segmented';
import { EmptyState, ErrorState, RowsSkeleton } from '@/ui/states';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

const PLACES = ['1st', '2nd', '3rd'];

type SheetKind = 'prizes' | 'earn' | 'create' | 'join' | 'medal';

export default function ArenaScreen() {
  const focused = useIsScreenFocused();
  const queryClient = useQueryClient();
  const wallet = useSession((s) => s.wallet);
  const { seasons, current } = useSeasons();
  // The chosen season is kept by slug, not by value: when the server's seasons
  // replace the bundled ones the screen follows, and until a season is chosen
  // it shows whichever is current.
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = seasonBySlug(seasons, chosen) ?? current;
  /** Newest season first, as the website's switcher lists them. */
  const seasonOptions = useMemo(() => [...seasons].sort((a, b) => b.id - a.id).map((a) => ({ key: a.slug, label: `${a.emoji} ${a.name}` })), [seasons]);
  // A minute is fine for deciding status; the ticking countdown has its own clock.
  const now = new Date(useNow(60_000));
  const status = seasonStatus(selected, now);
  const entryOpen = canEnter(selected, current, now);
  // How hard to keep asking: fast while live, and still asking after the end,
  // so the winners arrive on their own and late results still reach them.
  const phase = seasonPhase(selected, now);
  const board = useTeamLeaderboard(selected.slug, phase, focused);
  const medalBoard = useMedalBoard(selected.slug, !!selected.bounty, phase, focused);
  const mine = useMyTeam(wallet, selected.slug);
  const [refreshing, setRefreshing] = useState(false);

  const sheetRef = useRef<BottomSheetHandle>(null);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [input, setInput] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const attestation = useAttestationGate();

  const rows = useMemo(() => [...(board.data?.data ?? [])].sort((a, b) => b.weekly_points - a.weekly_points), [board.data]);

  const [medal, setMedal] = useState<string | null>(null);
  const openMedal = (id: string) => {
    setMedal(id);
    openSheet('medal');
  };
  const medals = useMemo(() => medalViews(selected, medalBoard.data), [selected, medalBoard.data]);
  const medalInfo = medals.find((m) => m.medal.id === medal) ?? null;
  const table = useMemo(() => medalTable(medals), [medals]);

  const openSheet = (kind: SheetKind) => {
    setInput('');
    setConfirming(false);
    setFormError(null);
    setSheet(kind);
  };

  const refresh = () => {
    setRefreshing(true);
    Promise.all([board.refetch(), selected.bounty ? medalBoard.refetch() : Promise.resolve(), wallet ? mine.refetch() : Promise.resolve()]).finally(() => setRefreshing(false));
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
    // Entering the Arena needs the season's "one account, one player"
    // confirmation; the team routes refuse without it. Asked at the commit,
    // not before, so backing out of the team never leaves a confirmation behind.
    const gate = await attestation.requireArena();
    if (!gate.ok) {
      if (gate.error) setFormError(gate.error);
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

  // Members who entered before the confirmation existed are asked once per
  // visit until they confirm, as on the website. Dismissing it removes nobody
  // from a team, but prizes are only paid to wallets that have confirmed.
  const { requireArena } = attestation;
  const promptedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!focused || !wallet || !myTeam || !entryOpen) return;
    if (promptedFor.current === wallet) return;
    promptedFor.current = wallet;
    void requireArena({ copy: ARENA_EXISTING_MEMBER_COPY });
  }, [focused, wallet, myTeam, entryOpen, requireArena]);

  const switcher =
    seasonOptions.length > 1 ? (
      <Segmented
        options={seasonOptions}
        value={selected.slug}
        onChange={setChosen}
        stretch={false}
        size="sm"
      />
    ) : null;

  return (
    <Screen title="Arena">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
      >
        {seasonOptions.length > 3 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {switcher}
          </ScrollView>
        ) : (
          switcher
        )}

        <Card style={{ gap: spacing.sm }}>
          <View style={styles.heroHead}>
            <Text style={[type.title, { flex: 1 }]} numberOfLines={1}>
              {selected.emoji} {selected.name}
            </Text>
            {status === 'ended' ? <Pill label="Ended" tone="neutral" /> : null}
          </View>
          <Text style={type.muted}>{selected.tagline}</Text>
          <Text style={type.body}>
            {selected.displayRange} · <Text style={{ color: colors.gold }}>Top {selected.prizes.length} share {leaderboardPool(selected)}</Text>
          </Text>
          <Countdown arena={selected} />
          <View style={styles.statRow}>
            {selected.prizes.slice(0, 3).map((p, i) => (
              <Stat key={p.place} label={`${MEDALS[i]} ${PLACES[i]}`} value={p.amount} align={i === 0 ? 'left' : i === 1 ? 'center' : 'right'} />
            ))}
          </View>
          <Pressable onPress={() => openSheet('prizes')} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start' }}>
            <Text style={styles.textButton}>All prizes</Text>
          </Pressable>
        </Card>

        {selected.bounty ? (
          <View style={{ gap: spacing.sm }}>
            <SectionTitle title="Medals" right={<Text style={type.muted}>{selected.bounty.bountyPool} in medals</Text>} />
            <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
              {medals.map(({ medal: b, status: standing, held }, i) => (
                <Pressable
                  key={b.id}
                  onPress={() => openMedal(b.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.name}, ${b.amount}${standing ? `, ${standing}` : ''}`}
                  style={rowStyle(i === 0)}
                >
                  <Medallion id={b.id} amount={b.amount} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.body, { fontFamily: fonts.semibold }]}>{b.name}</Text>
                    <Text style={type.muted} numberOfLines={2}>
                      {appCopy(b.blurb)}
                    </Text>
                    {standing ? (
                      <Text style={[styles.standing, held ? { color: colors.text } : null]} numberOfLines={1}>
                        {standing}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[type.money, { color: colors.gold }]}>{b.amount}</Text>
                </Pressable>
              ))}
            </Card>
            <Text style={[type.muted, { paddingHorizontal: spacing.xs }]}>
              {medalBoard.data?.preview ? 'Sample standings, for preview. ' : ''}
              Awarded once at the close, whatever a team&apos;s rank. Tap a medal for its rule{medalBoard.data ? ' and who is in the running' : ''}.
            </Text>
          </View>
        ) : null}

        {table.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <SectionTitle title="Medal table" right={<Text style={type.muted}>{medalBoard.data?.state === 'final' ? 'Final' : 'If it ended now'}</Text>} />
            <Card padded={false} style={styles.listCard}>
              {table.map((row, i) => (
                <MedalTableLine key={row.team.id} row={row} rank={i} mine={myTeam?.slug === row.team.slug} first={i === 0} />
              ))}
            </Card>
            <Text style={[type.muted, { paddingHorizontal: spacing.xs }]}>Teams ranked by the medal money they hold. A shared medal is split between the teams on it.</Text>
          </View>
        ) : null}

        {wallet && myTeam ? (
          <MyTeamCard team={myTeam} />
        ) : entryOpen ? (
          <Card style={{ gap: spacing.sm }}>
            <Text style={type.heading}>⚔️ Enter the Arena</Text>
            <Text style={type.muted}>{teamSizeCopy(selected)}</Text>
            <Text style={type.muted}>
              Top {selected.prizes.length} teams share the <Text style={{ color: colors.gold }}>{leaderboardPool(selected)} prize pool</Text> ({selected.displayRange}).
            </Text>
            {wallet ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs }}>
                <Button label="Create a team" onPress={() => openSheet('create')} style={{ flex: 1 }} />
                <Button label="Join by code" tone="neutral" onPress={() => openSheet('join')} style={{ flex: 1 }} />
              </View>
            ) : (
              <Text style={type.muted}>Sign in to create or join a team.</Text>
            )}
          </Card>
        ) : null}

        <Card style={{ gap: spacing.sm }}>
          <Text style={type.heading}>⭐ How the Arena works</Text>
          {[
            ['🛡️', 'Create a team or join one with a code'],
            ['📈', 'Trade on free or paid markets to earn points'],
            ['🏆', 'Team score is the sum of every member’s points'],
            ['🎯', `Top ${selected.prizes.length} teams share the ${leaderboardPool(selected)} prize pool`],
          ].map(([emoji, text]) => (
            <View key={text} style={styles.howRow}>
              <Text style={{ fontSize: 18 }}>{emoji}</Text>
              <Text style={[type.body, { flex: 1 }]}>{text}</Text>
            </View>
          ))}
          <Pressable onPress={() => openSheet('earn')} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start' }}>
            <Text style={styles.textButton}>How to earn points</Text>
          </Pressable>
        </Card>

        <View style={styles.section}>
          <SectionTitle title={status === 'ended' ? 'Final standings' : 'Standings'} />
          {board.isPending ? (
            <RowsSkeleton />
          ) : board.isError ? (
            <ErrorState error={board.error} onRetry={() => board.refetch()} title="Could not load the standings" />
          ) : rows.length === 0 ? (
            <EmptyState
              title={status === 'ended' ? 'No teams competed in this season' : 'No teams yet'}
              body={status === 'ended' ? undefined : 'Create the first one.'}
            />
          ) : (
            <Card padded={false} style={styles.listCard}>
              {rows.map((row, i) => (
                <TeamRow key={row.team_id} row={row} rank={i} mine={myTeam?.slug === row.team_slug} first={i === 0} />
              ))}
            </Card>
          )}
        </View>
      </ScrollView>

      <BottomSheet
        ref={sheetRef}
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        title={
          sheet === 'prizes'
            ? `${selected.emoji} ${selected.name} prizes`
            : sheet === 'medal'
              ? (medalInfo?.medal.name ?? 'Medal')
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
        subtitle={sheet === 'prizes' ? `Top ${selected.prizes.length} teams share ${leaderboardPool(selected)} · ${selected.displayRange}` : undefined}
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
          <Card padded={false} style={styles.listCard}>
            {selected.prizes.map((p, i) => (
              <View key={p.place} style={rowStyle(i === 0)}>
                <Text style={styles.rank}>{p.place <= 3 ? MEDALS[p.place - 1] : p.place}</Text>
                <Text style={[type.body, { flex: 1 }]}>{placeLabel(p.place)}</Text>
                <Text style={[type.money, { color: colors.gold }]}>{p.amount}</Text>
              </View>
            ))}
          </Card>
        ) : sheet === 'medal' && medalInfo ? (
          <MedalDetail view={medalInfo} />
        ) : sheet === 'earn' ? (
          <EarnRules intro="Your points add to your team's score." />
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
      {attestation.sheet}
    </Screen>
  );
}

/** A medal's rule, then who holds it and who is closest behind. */
function MedalDetail({ view }: { view: MedalView }) {
  const { medal } = view;
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
        <Medallion id={medal.id} amount={medal.amount} size={72} />
        <Text style={[type.body, { fontFamily: fonts.semibold }]}>
          {medal.amount} · {appCopy(medal.blurb)}
        </Text>
        <Text style={type.muted}>{appCopy(medal.rules)}</Text>
      </View>
      {view.status ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={type.label}>{view.heldLabel ?? view.status}</Text>
          {view.holders.length > 0 ? (
            <Card padded={false} style={styles.listCard}>
              {view.holders.map((s, i) => (
                <StandingRow key={s.team.id} name={s.team.name} value={s.display} detail={standingDetail(s)} first={i === 0} lead />
              ))}
            </Card>
          ) : null}
        </View>
      ) : null}
      {view.contenders.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={type.label}>{view.contendersLabel}</Text>
          <Card padded={false} style={styles.listCard}>
            {view.contenders.map((s, i) => (
              <StandingRow key={s.team.id} name={s.team.name} value={s.display} detail={standingDetail(s)} first={i === 0} />
            ))}
          </Card>
        </View>
      ) : null}
      {view.note ? <Text style={type.muted}>{view.note}</Text> : null}
    </View>
  );
}

function StandingRow({ name, value, detail, first, lead = false }: { name: string; value: string; detail: string | null; first: boolean; lead?: boolean }) {
  return (
    <View style={rowStyle(first)}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {name}
        </Text>
        {detail ? (
          <Text style={type.muted} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text style={[type.money, lead ? { color: colors.gold } : null]}>{value}</Text>
    </View>
  );
}

/** Its own clock, so the seconds ticking over re-render one line, not the standings. */
function Countdown({ arena }: { arena: Season }) {
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
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={type.heading}>🛡️ Your team</Text>
        {captain ? <Pill label="CAPTAIN" tone="gold" /> : null}
      </View>
      <Text style={styles.teamName}>{team.name}</Text>
      {captain && team.join_code ? (
        <View style={styles.codeBox}>
          <View style={{ flex: 1 }}>
            <Text style={type.label}>Join code</Text>
            <Text style={styles.code} selectable>
              {team.join_code}
            </Text>
          </View>
          <Button
            label="Share"
            tone="neutral"
            size="sm"
            onPress={() => Share.share({ message: `Join my team "${team.name}" in the Mentioned Arena. My code is ${team.join_code}.` })}
          />
        </View>
      ) : null}
      <Link href={`/arena/${team.slug}` as Href} asChild>
        <Pressable style={rowStyle(false)} accessibilityRole="link" accessibilityLabel="View team">
          <Text style={styles.rowLabel}>View team</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </Link>
    </Card>
  );
}

function TeamRow({ row, rank, mine, first }: { row: TeamLeaderboardEntry; rank: number; mine: boolean; first: boolean }) {
  return (
    <Link href={`/arena/${row.team_slug}` as Href} asChild>
      <Pressable style={rowStyle(first)} accessibilityRole="link" accessibilityLabel={`${row.team_name}, rank ${rank + 1}`}>
        <Text style={styles.rank}>{MEDALS[rank] ?? rank + 1}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {row.team_name}
            </Text>
            {mine ? <Pill label="YOU" tone="gold" /> : null}
          </View>
          <Text style={type.muted}>
            {row.member_count} {row.member_count === 1 ? 'member' : 'members'}
          </Text>
        </View>
        <Text style={type.money}>{row.weekly_points.toLocaleString()}</Text>
      </Pressable>
    </Link>
  );
}

/** A team in the medal table: its place, the medals it holds and what they are worth. */
function MedalTableLine({ row, rank, mine, first }: { row: MedalTableRow; rank: number; mine: boolean; first: boolean }) {
  const count = row.medals.length;
  return (
    <Link href={`/arena/${row.team.slug}` as Href} asChild>
      <Pressable
        style={rowStyle(first)}
        accessibilityRole="link"
        accessibilityLabel={`${row.team.name}, ${count} ${count === 1 ? 'medal' : 'medals'}, ${winningsLabel(row.winnings)}`}
      >
        <Text style={styles.rank}>{rank + 1}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {row.team.name}
            </Text>
            {mine ? <Pill label="YOU" tone="gold" /> : null}
          </View>
          <Text style={type.muted} numberOfLines={1}>
            {row.medals.map((m) => m.emoji).join(' ')} · {count} {count === 1 ? 'medal' : 'medals'}
          </Text>
        </View>
        <Text style={[type.money, { color: colors.gold }]}>{winningsLabel(row.winnings)}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  countdown: { ...type.body, fontVariant: ['tabular-nums'] },
  standing: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  statRow: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs },
  textButton: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  warnNote: { color: colors.gold },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  teamName: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: colors.text },
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm + 4, borderRadius: radius.key, backgroundColor: colors.surfaceRaised },
  code: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: 3, color: colors.gold },
  rowLabel: { ...type.body, flex: 1, fontFamily: fonts.semibold },
  section: { gap: spacing.sm },
  listCard: { paddingHorizontal: spacing.md },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text, flexShrink: 1 },
  rank: { width: 32, textAlign: 'center', fontFamily: fonts.bold, fontSize: 16, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  input: {
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.key,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
});
