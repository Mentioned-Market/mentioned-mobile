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
import { findWordParam } from '@/markets/merge';
import { useActiveWallet } from '@/store/active-wallet';
import { useSession } from '@/store/session';
import { achievementLines, checkFreeCoinedWord, useApiTrade, type FreePick } from '@/trade/free';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { Card, Row, SectionTitle, rowStyle } from '@/ui/card';
import { Chip } from '@/ui/chip';
import { useFeatures } from '@/ui/config-gate';
import { MarketHeader } from '@/ui/market-header';
import { Pill } from '@/ui/pill';
import { PINNED_BAR_HEIGHT, PinnedBar } from '@/ui/pinned-bar';
import { FeaturedWords } from '@/ui/featured-words';
import { Screen } from '@/ui/screen';
import { SimilarMarkets } from '@/ui/similar-markets';
import { CardSkeleton, ErrorState } from '@/ui/states';
import { SwipeButton } from '@/ui/swipe-button';
import { colors, fonts, spacing, type } from '@/ui/theme';
import { TradeProgress } from '@/ui/trade-progress';
import { WordBoard, type BoardWord } from '@/ui/word-board';

export default function FreeMajorityScreen() {
  // `word` names a word to pick, from a tap on a market card.
  const { id: idParam, word: wordParam } = useLocalSearchParams<{ id: string; word?: string }>();
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
  // The `word` param already acted on, so the word is picked once.
  const [handledWord, setHandledWord] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; detail: string } | null>(null);
  // See the paid majority screen: the add-word card is scrolled into view on
  // focus, because the edge-to-edge window does not shrink for the keyboard.
  const scrollRef = useRef<ScrollView>(null);

  if (board.isPending) {
    return (
      <Screen back>
        <CardSkeleton />
      </Screen>
    );
  }
  if (board.isError || !board.data) {
    return (
      <Screen back>
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

  // Arriving from a tap on one word of a market card: that word starts picked,
  // once. Done while rendering, like the YES/NO screens.
  if (wordParam && handledWord !== wordParam) {
    setHandledWord(wordParam);
    const i = findWordParam(
      d.board.map((w) => w.word),
      wordParam,
    );
    const target = i >= 0 ? d.board[i] : null;
    if (target && canEnter && !picks.some((p) => p.kind === 'word' && p.wordId === target.word_id)) toggle(String(target.word_id));
  }

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
  const newPicks = picks.filter((p) => p.kind === 'new');
  const recent = d.recentBets.slice(0, 6);

  return (
    <Screen back>
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
            lockAt={toMs(m.lock_time)}
            eventAt={toMs(m.event_start_time)}
            now={now}
            description={m.description}
          />
          <View style={styles.chips}>
            <Chip value={`${tokens(pool)} tokens`} caption="pool" />
            <Chip value={`${tokens(pickSize)} tokens`} caption="per pick" />
          </View>
          {status === 'resolved' || status === 'cancelled' ? (
            <Link href={`/result/free-majority/${id}` as Href} asChild>
              <Button label="See results" tone="neutral" />
            </Link>
          ) : null}

          <SectionTitle title={canEnter ? `Pick ${required} words` : 'Board'} />
          {d.board.length === 0 && canEnter ? <Text style={type.muted}>No words yet. Add the first below.</Text> : null}
          <WordBoard words={words} selected={selectedKeys} onToggle={toggle} selectable={canEnter} />
          {entered ? <Text style={type.muted}>You are in with {(d.userEntry ?? []).map((e) => e.word).join(' and ')}.</Text> : null}

          {canEnter ? (
            <Card style={{ gap: spacing.sm }}>
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
                <Button label="Add" tone="neutral" size="sm" onPress={addDraft} disabled={!draft.trim() || full} />
              </View>
              {draftError ? <Text style={[type.muted, { color: colors.no }]}>{draftError}</Text> : null}
              {newPicks.length > 0 ? (
                <View style={styles.wordChips}>
                  {newPicks.map((p) => (
                    <Pressable key={p.word} onPress={() => removePick(p.word)} style={styles.wordChip} accessibilityRole="button" accessibilityLabel={`Remove ${p.word}`}>
                      <Text style={styles.wordChipLabel}>{p.word}</Text>
                      <Text style={styles.wordChipX}>×</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Card>
          ) : null}

          {recent.length > 0 ? (
            <>
              <SectionTitle title="Recent picks" />
              <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
                {recent.map((r, i) => (
                  <Link key={r.id} href={(r.username ? `/u/${encodeURIComponent(r.username)}` : `/positions?wallet=${r.wallet}`) as Href} asChild>
                    <Pressable style={rowStyle(i === 0)} accessibilityRole="button">
                      <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                        <Text style={{ fontFamily: fonts.semibold }}>{r.username ?? `${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)}`}</Text> picked {r.word}
                      </Text>
                      <Text style={type.money}>{tokens(r.tokens)}</Text>
                    </Pressable>
                  </Link>
                ))}
              </Card>
            </>
          ) : null}
        <SimilarMarkets currentKey={`free-majority:${id}`} />
        <FeaturedWords />
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
        locked={api.state.status === 'working'}
        footer={
          api.state.status === 'working' ? (
            <View style={{ height: 64 }} />
          ) : api.state.status === 'done' ? (
            <Button label="Done" tone="gold" onPress={() => sheetRef.current?.close()} />
          ) : api.state.status === 'failed' && !api.state.retryable ? (
            <Button label="Close" tone="neutral" onPress={() => sheetRef.current?.close()} />
          ) : api.state.status === 'failed' ? (
            <Button label="Try again" tone="gold" onPress={api.reset} />
          ) : (
            <SwipeButton
              tone="gold"
              label={`Swipe to enter with ${tokens(m.play_tokens)} tokens`}
              disabled={!features.freeTrading || picks.length !== required || !sessionWallet}
              onConfirm={() => void submit()}
            />
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
            <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
              {picks.map((p, i) => (
                <Row key={p.word} first={i === 0}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.pickWord}>{p.word}</Text>
                      {p.kind === 'new' ? <Pill label="NEW" tone="gold" /> : null}
                    </View>
                    <Text style={[type.muted, { color: colors.yes }]}>Wins {tokens(winFor(stakedFor(p)))} tokens if said most</Text>
                  </View>
                  <Text style={type.money}>{tokens(pickSize)}</Text>
                </Row>
              ))}
            </Card>
            <Text style={type.muted}>One entry per market. Once you are in, these picks are locked.</Text>
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  wordChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  wordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  wordChipLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gold },
  wordChipX: { fontFamily: fonts.semibold, fontSize: 18, color: colors.textMuted, paddingHorizontal: 4 },
  pickWord: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
});
