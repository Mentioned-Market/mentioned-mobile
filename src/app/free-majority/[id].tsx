// Free majority board (SPEC section 7.4). One entry per wallet per market:
// exactly `bets_per_user` distinct words, each an existing board word or a new
// one, placed with play tokens. The entry is a server call, not a transaction.
//
// The rules are the website's: a word being resolved or checked cannot be
// picked, a new word must pass the same checks, and the entry submits only at
// exactly the required count. Once in, the picks are locked.
import * as Haptics from 'expo-haptics';
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { enterFreeMajority } from '@/api/free';
import { useFreeBoard, useIsScreenFocused } from '@/api/queries';
import { potentialWin } from '@/chain/majorityWords';
import { getDisplayStatus } from '@/free/marketUtils';
import { tokens } from '@/lib/format';
import { toMs } from '@/lib/time';
import { useNow } from '@/lib/use-now';
import { useActiveWallet } from '@/store/active-wallet';
import { useSession } from '@/store/session';
import { achievementLines, checkFreeCoinedWord, useApiTrade, type FreePick } from '@/trade/free';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { useFeatures } from '@/ui/config-gate';
import { Button } from '@/ui/button';
import { MarketHeader } from '@/ui/market-header';
import { Pill } from '@/ui/pill';
import { PINNED_BAR_HEIGHT, PinnedBar } from '@/ui/pinned-bar';
import { Screen } from '@/ui/screen';
import { CardSkeleton, ErrorState } from '@/ui/states';
import { colors, fonts, spacing, type } from '@/ui/theme';
import { TradeProgress } from '@/ui/trade-progress';
import { WordBoard, type BoardWord } from '@/ui/word-board';

export default function FreeMajorityScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const focused = useIsScreenFocused();
  const now = useNow(1000);
  const viewed = useActiveWallet();
  const sessionWallet = useSession((st) => st.wallet);
  const board = useFreeBoard(id, viewed, focused);
  const api = useApiTrade();
  const sheetRef = useRef<BottomSheetHandle>(null);
  // The server can pause trading; claims elsewhere are never paused.
  const features = useFeatures();

  const [picks, setPicks] = useState<FreePick[]>([]);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [result, setResult] = useState<{ title: string; detail: string } | null>(null);
  // See the paid majority screen: the add-word card is scrolled into view on
  // focus, because the edge-to-edge window does not shrink for the keyboard.
  const scrollRef = useRef<ScrollView>(null);

  if (board.isPending) {
    return (
      <Screen title="Loading" back>
        <CardSkeleton />
      </Screen>
    );
  }
  if (board.isError || !board.data) {
    return (
      <Screen title="Free majority" back>
        <ErrorState error={board.error} onRetry={() => board.refetch()} />
      </Screen>
    );
  }

  const d = board.data;
  const m = d.market;
  const ds = getDisplayStatus(m);
  const status = ds === 'cancelled' ? 'cancelled' : ds === 'resolved' || ds === 'closed' ? 'resolved' : ds === 'pending_resolution' ? 'pending' : 'open';
  const open = status === 'open';
  const required = m.bets_per_user;
  const pickSize = m.play_tokens / Math.max(1, required);
  const pool = d.board.reduce((s, w) => s + w.staked, 0);
  // Same preview the website shows: your pick joins the pool and the word's stake.
  const takeout = Number(m.takeout_pct) || 0;
  const floor = Number(m.floor_multiple) || 1.5;
  const winFor = (staked: number) => potentialWin(staked, pool, pickSize, takeout, floor);
  const stakedFor = (pick: FreePick) => (pick.kind === 'word' ? (d.board.find((b) => b.word_id === pick.wordId)?.staked ?? 0) : 0);
  const mine = new Set((d.userEntry ?? []).map((e) => e.word_id));
  const entered = !!(d.hasEntered && viewed);
  const canEnter = open && !entered;

  const words: BoardWord[] = [...d.board]
    .sort((a, b) => b.staked - a.staked)
    .map((w) => ({
      key: String(w.word_id),
      label: w.word,
      share: w.implied_prob,
      countLabel: w.pending_resolution
        ? 'Being checked'
        : `${w.bet_count} ${w.bet_count === 1 ? 'pick' : 'picks'} · ${tokens(w.staked)} tokens`,
      outcome: status === 'resolved' ? (w.resolved_outcome ? 'winner' : 'loser') : null,
      yours: mine.has(w.word_id),
      winLabel: `Wins ${tokens(winFor(w.staked))} tokens if said most`,
      locked: w.resolved_outcome !== null || w.pending_resolution,
    }));

  const selectedKeys = new Set(picks.filter((p): p is Extract<FreePick, { kind: 'word' }> => p.kind === 'word').map((p) => String(p.wordId)));
  const full = picks.length >= required;

  const toggle = (key: string) => {
    const wordId = Number(key);
    const bw = d.board.find((w) => w.word_id === wordId);
    if (!bw) return;
    Haptics.selectionAsync();
    setPicks((prev) => {
      if (prev.some((p) => p.kind === 'word' && p.wordId === wordId)) return prev.filter((p) => !(p.kind === 'word' && p.wordId === wordId));
      if (prev.length >= required) return prev;
      return [...prev, { kind: 'word', wordId, word: bw.word }];
    });
  };

  const addDraft = () => {
    const checked = checkFreeCoinedWord(draft, {
      boardWords: d.board.map((w) => w.word),
      picks,
      banned: m.banned_words,
      required,
    });
    if ('error' in checked) {
      setDraftError(checked.error);
      return;
    }
    Haptics.selectionAsync();
    setPicks((prev) => [...prev, { kind: 'new', word: checked.word }]);
    setDraft('');
    setDraftError(null);
  };

  const removePick = (word: string) => setPicks((prev) => prev.filter((p) => p.word !== word));

  const openSheet = () => {
    api.reset();
    setResult(null);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setResult(null);
    api.reset();
  };

  const submit = async () => {
    if (picks.length !== required) return;
    const res = await api.run(() => enterFreeMajority(id, picks.map((p) => (p.kind === 'word' ? { wordId: p.wordId } : { newWord: p.word }))));
    if (!res) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const extras = achievementLines(res.newAchievements);
    const detail = `${picks.map((p) => p.word).join(' and ')}, ${tokens(pickSize)} tokens each`;
    setResult({ title: 'You are in', detail: extras ? `${detail}\n${extras}` : detail });
    setPicks([]);
    void board.refetch();
  };

  const barSubtitle =
    picks.length === 0
      ? `${tokens(pickSize)} tokens on each`
      : picks.map((p) => `${p.word} wins ${tokens(winFor(stakedFor(p)))}`).join(' · ');

  return (
    <Screen title="" back>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingBottom: PINNED_BAR_HEIGHT + spacing.md }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <MarketHeader
            title={m.title}
            cover={m.cover_image_url}
            status={status}
            paid={false}
            majority
            lockAt={toMs(m.lock_time)}
            eventAt={toMs(m.event_start_time)}
            traderCount={d.traderCount}
            now={now}
            description={m.description}
          />
          {status === 'resolved' || status === 'cancelled' ? (
            <Link href={`/result/free-majority/${id}` as Href} asChild>
              <Button label="See results" tone="neutral" />
            </Link>
          ) : null}
          <View style={styles.stats}>
            <Stat label="Pool" value={`${tokens(pool)} tokens`} />
            <Stat label="Per pick" value={`${tokens(pickSize)} tokens`} />
            <Stat label="Picks" value={`${required} each`} />
          </View>
          <Text style={type.heading}>{canEnter ? `Pick ${required} words` : 'Board'}</Text>
          {d.board.length === 0 && canEnter ? <Text style={type.muted}>No words yet. Add the first below.</Text> : null}
          <WordBoard words={words} selected={selectedKeys} onToggle={toggle} selectable={canEnter} />
          {entered ? <Text style={type.muted}>You are in with {(d.userEntry ?? []).map((e) => e.word).join(' and ')}.</Text> : null}

          {canEnter ? (
            <View style={styles.card}>
              <Text style={type.heading}>Add your own word</Text>
              <Text style={type.muted}>3 to 12 letters, or 3 to 12 numbers. It goes on the board with your pick.</Text>
              <View style={styles.addRow}>
                <TextInput
                  value={draft}
                  onChangeText={(v) => {
                    setDraft(v);
                    setDraftError(null);
                  }}
                  onSubmitEditing={addDraft}
                  onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
                  blurOnSubmit={false}
                  placeholder="e.g. penalty"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  maxLength={24}
                  editable={!full}
                  style={[styles.input, full && { opacity: 0.5 }]}
                  accessibilityLabel="Add your own word"
                />
                <Button label="Add" tone="neutral" onPress={addDraft} disabled={!draft.trim() || full} style={{ minWidth: 88 }} />
              </View>
              {draftError ? <Text style={[type.muted, { color: colors.no }]}>{draftError}</Text> : null}
              {picks.some((p) => p.kind === 'new') ? (
                <View style={styles.chips}>
                  {picks
                    .filter((p) => p.kind === 'new')
                    .map((p) => (
                      <Pressable key={p.word} onPress={() => removePick(p.word)} style={styles.chip} accessibilityRole="button" accessibilityLabel={`Remove ${p.word}`}>
                        <Text style={styles.chipLabel}>{p.word}</Text>
                        <Text style={styles.chipX}>×</Text>
                      </Pressable>
                    ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {d.recentBets.length > 0 ? (
            <>
              <Text style={type.heading}>Recent picks</Text>
              {d.recentBets.slice(0, 6).map((r) => (
                <Link key={r.id} href={(r.username ? `/u/${encodeURIComponent(r.username)}` : `/positions?wallet=${r.wallet}`) as Href} asChild>
                  <Pressable style={styles.recent} accessibilityRole="button">
                    <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                      <Text style={{ color: colors.gold }}>{r.username ?? `${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)}`}</Text> picked {r.word}
                    </Text>
                    <Text style={type.muted}>{tokens(r.tokens)}</Text>
                  </Pressable>
                </Link>
              ))}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {canEnter ? (
        <PinnedBar
          title={`${picks.length} of ${required} picked`}
          subtitle={barSubtitle}
          button={{ label: full ? 'Review' : `Pick ${required - picks.length} more`, disabled: !full || !sessionWallet, onPress: openSheet }}
          note={!features.freeTrading ? 'Entries are paused right now' : !sessionWallet ? 'Sign in to enter' : undefined}
        />
      ) : null}

      <BottomSheet
        ref={sheetRef}
        visible={sheetOpen}
        onClose={closeSheet}
        title="Your entry"
        subtitle={m.title}
        locked={api.state.status === 'working'}
        footer={
          api.state.status === 'working' ? (
            <View style={{ height: 52 }} />
          ) : api.state.status === 'done' ? (
            <Button label="Done" tone="gold" onPress={() => sheetRef.current?.close()} />
          ) : api.state.status === 'failed' && !api.state.retryable ? (
            <Button label="Close" tone="neutral" onPress={() => sheetRef.current?.close()} />
          ) : api.state.status === 'failed' ? (
            <Button label="Try again" tone="gold" onPress={api.reset} />
          ) : (
            <Button label={`Enter with ${tokens(m.play_tokens)} tokens`} tone="gold" disabled={!features.freeTrading || picks.length !== required || !sessionWallet} onPress={submit} />
          )
        }
      >
        {api.state.status !== 'idle' ? (
          <TradeProgress
            phase={api.state.status === 'working' ? 'working' : api.state.status === 'done' ? 'done' : 'failed'}
            title={api.state.status === 'done' ? result?.title : undefined}
            detail={api.state.status === 'done' ? result?.detail : api.state.status === 'failed' ? api.state.message : undefined}
            minHeight={280}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {picks.map((p) => (
              <View key={p.word} style={styles.pickRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.pickWord}>{p.word}</Text>
                    {p.kind === 'new' ? <Pill label="NEW" tone="gold" /> : null}
                  </View>
                  <Text style={[type.muted, { color: colors.yes }]}>Wins {tokens(winFor(stakedFor(p)))} tokens if said most</Text>
                </View>
                <Text style={type.money}>{tokens(pickSize)}</Text>
              </View>
            ))}
            <Text style={type.muted}>One entry per market. Once you are in, these picks are locked.</Text>
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={type.muted}>{label}</Text>
      <Text style={type.money}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 2 },
  card: { padding: spacing.md, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(242,183,31,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(242,183,31,0.4)',
  },
  chipLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gold },
  chipX: { fontFamily: fonts.semibold, fontSize: 18, color: colors.textMuted, paddingHorizontal: 4 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm + 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickWord: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  recent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
});
