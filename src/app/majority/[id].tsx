// Paid majority board (SPEC section 7.1). Pick words from the board or add your
// own, review them in a sheet, then buy: one flat unit per word, on chain, in
// batches of three because a fourth overruns Solana's transaction size.
//
// The rules are the website's. One pick per word per account, so a word you
// already hold cannot be picked again. A new word is validated before it can go
// in the basket, because every check the program would make is otherwise a
// failed transaction after the user has signed. Each confirmed batch is then
// recorded with the web, which is what feeds the leaderboard and points.
import * as Haptics from 'expo-haptics';
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { recordMajorityBuys } from '@/api/paidMajority';
import { useIsScreenFocused, usePaidMajorityMarket, usePaidMajorityMetadata, usePaidMajorityPositions, useSolBalance, useUsdcBalance } from '@/api/queries';
import { deserializeMajorityMarket, MajorityStatus, normalizeWord, WordOutcome } from '@/chain/majority';
import { base64ToBytes } from '@/lib/bytes';
import { usd, usdc } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { useActiveWallet } from '@/store/active-wallet';
import { useSession } from '@/store/session';
import { TradeInputError } from '@/trade/amm';
import { BUYS_PER_TX, checkCoinedWord, friendlyMajorityError, MIN_SOL_FOR_FEES, planMajorityBuy } from '@/trade/majority';
import { fundsShortfall } from '@/trade/funds';
import { useTrade } from '@/trade/use-trade';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { DepositSheet } from '@/ui/fund-sheet';
import { Card, Row, SectionTitle } from '@/ui/card';
import { Chip } from '@/ui/chip';
import { PAUSED_NOTE, useFeatures } from '@/ui/config-gate';
import { MarketHeader, statusFromLock } from '@/ui/market-header';
import { Pill } from '@/ui/pill';
import { PINNED_BAR_HEIGHT, PinnedBar } from '@/ui/pinned-bar';
import { Screen } from '@/ui/screen';
import { CardSkeleton, ErrorState } from '@/ui/states';
import { SwipeButton } from '@/ui/swipe-button';
import { colors, fonts, spacing, type } from '@/ui/theme';
import { TradeProgress } from '@/ui/trade-progress';
import { WordBoard, type BoardWord } from '@/ui/word-board';

/** Shown for a board word whose text the server does not know yet. */
const UNNAMED = 'Word not shown yet';

export default function PaidMajorityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const focused = useIsScreenFocused();
  const now = useNow(1000);
  const viewed = useActiveWallet();
  const sessionWallet = useSession((st) => st.wallet);
  const market = usePaidMajorityMarket(id, focused);
  const meta = usePaidMajorityMetadata();
  const mine = usePaidMajorityPositions(id, viewed, focused);
  const usdcBalance = useUsdcBalance(viewed, focused);
  const sol = useSolBalance(viewed, focused);
  const trade = useTrade();
  const sheetRef = useRef<BottomSheetHandle>(null);
  // The server can pause trading; claims elsewhere are never paused.
  const features = useFeatures();

  // The basket: normalised words, in the order they were picked.
  const [basket, setBasket] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fund, setFund] = useState<'USDC' | 'SOL' | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; detail: string } | null>(null);
  // The add-word card sits at the bottom of a long page. On Android the app is
  // edge to edge, so the window does not shrink for the keyboard and the card
  // would be typed into blind; the ScrollView is scrolled to it on focus.
  const scrollRef = useRef<ScrollView>(null);

  const acct = useMemo(() => (market.data?.account ? deserializeMajorityMarket(base64ToBytes(market.data.account)) : null), [market.data]);
  const info = meta.data?.find((m) => m.market_id === id);

  if (market.isPending) {
    return (
      <Screen back>
        <CardSkeleton />
      </Screen>
    );
  }
  if (market.isError || !market.data || !acct) {
    return (
      <Screen back>
        <ErrorState error={market.error ?? new Error('Could not decode the market account')} onRetry={() => market.refetch()} />
      </Screen>
    );
  }

  const board = market.data.board;
  // Words whose text the server knows. One without text cannot be picked by
  // tapping, since picking means sending its text, so it shows on the board
  // as not shown yet and stays locked until the text arrives.
  const named = board.filter((b): b is typeof b & { word: string } => b.word !== null);
  const lockAt = Number(acct.lockTs) * 1000;
  const finished = acct.status === MajorityStatus.Resolved ? 'resolved' : acct.status === MajorityStatus.Cancelled ? 'cancelled' : null;
  const status = statusFromLock(lockAt, finished, now);
  const open = status === 'open';
  const unitUsd = Number(acct.unitPrice) / 1e6;

  const ownedHashes = new Set((mine.data ?? []).map((p) => p.wordHash));
  const boardByWord = new Map(named.map((b) => [normalizeWord(b.word), b]));
  const refunding = new Set(named.filter((b) => b.outcome === WordOutcome.Refunding).map((b) => normalizeWord(b.word)));

  // Payout preview for a fresh unit on a word if it wins: pro-rata share of the
  // pool after the fee, the same estimate the website shows.
  const feeRate = acct.feeBps / 10_000;
  const totalUnits = Number(market.data.totalUnits);
  const winIfSaidMost = (wordUnits: number) => ((totalUnits + 1) * unitUsd * (1 - feeRate)) / (wordUnits + 1);
  const winFor = (word: string) => winIfSaidMost(Number(boardByWord.get(word)?.units ?? 0));

  const words: BoardWord[] = [...board]
    .sort((a, b) => Number(b.units) - Number(a.units))
    .map((w) => ({
      key: w.wordHash,
      label: w.word ?? UNNAMED,
      share: w.oddsPct / 100,
      countLabel:
        w.outcome === WordOutcome.Refunding
          ? 'Removed, being refunded'
          : `${w.units} ${Number(w.units) === 1 ? 'unit' : 'units'} · ${usd(Number(w.units) * unitUsd)}`,
      outcome: finished === 'resolved' ? (w.outcome === WordOutcome.Winner ? 'winner' : 'loser') : null,
      yours: ownedHashes.has(w.wordHash),
      winLabel: `Wins ${usd(winIfSaidMost(Number(w.units)))} if said most`,
      locked: w.word === null || ownedHashes.has(w.wordHash) || w.outcome === WordOutcome.Refunding,
    }));

  const selectedKeys = new Set(named.filter((b) => basket.includes(normalizeWord(b.word))).map((b) => b.wordHash));
  const total = basket.length * unitUsd;

  const toggle = (key: string) => {
    const entry = named.find((b) => b.wordHash === key);
    if (!entry) return;
    Haptics.selectionAsync();
    const w = normalizeWord(entry.word);
    setBasket((prev) => (prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]));
  };

  const addDraft = () => {
    const checked = checkCoinedWord(draft, {
      basket,
      ownedHashes,
      refunding,
      banned: info?.banned_words ?? [],
    });
    if ('error' in checked) {
      setDraftError(checked.error);
      return;
    }
    Haptics.selectionAsync();
    setBasket((prev) => [...prev, checked.word]);
    setDraft('');
    setDraftError(null);
  };

  const removeFromBasket = (word: string) => setBasket((prev) => prev.filter((w) => w !== word));

  const openSheet = () => {
    trade.reset();
    setResult(null);
    setInputError(null);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setResult(null);
    setInputError(null);
    trade.reset();
  };

  const refresh = () => {
    void market.refetch();
    void mine.refetch();
    void usdcBalance.refetch();
    void sol.refetch();
  };

  const submit = async () => {
    if (!sessionWallet) return;
    setInputError(null);

    // Never top up a word the wallet already holds: one pick per word.
    const toBuy = basket.filter((w) => !ownedHashes.has(named.find((b) => normalizeWord(b.word) === w)?.wordHash ?? ''));
    const cost = toBuy.length * unitUsd;
    if (usdcBalance.data !== undefined && usdcBalance.data < cost) {
      setInputError(`Not enough USDC. These picks cost ${usd(cost)} and you have ${usd(usdcBalance.data)}.`);
      return;
    }
    if (sol.data !== undefined && sol.data < MIN_SOL_FOR_FEES) {
      setInputError('You need about 0.004 SOL for network fees, and a small refundable deposit for any new word. Add SOL to your wallet to trade.');
      return;
    }

    let plan;
    try {
      plan = await planMajorityBuy({ wallet: sessionWallet, marketId: BigInt(id), words: toBuy, unitPriceUsd: unitUsd });
    } catch (e) {
      if (e instanceof TradeInputError) {
        setInputError(e.message);
        return;
      }
      throw e;
    }

    const onBoardNow = new Set(boardByWord.keys());
    const { confirmed, complete } = await trade.runBatches(plan.batches, {
      explain: friendlyMajorityError,
      // Record each batch as it lands, not at the end: if a later batch fails,
      // the earlier ones still happened and still count.
      onConfirmed: (index, signature) => {
        const chunk = plan.words.slice(index * BUYS_PER_TX, (index + 1) * BUYS_PER_TX);
        void recordMajorityBuys({
          marketId: id,
          wallet: sessionWallet,
          signature,
          words: chunk.map((w) => ({ word: w, isNewWord: !onBoardNow.has(w) })),
        }).catch(() => {
          // Best effort, as on the website. The buy itself is on chain; the
          // record only feeds the feed and points, and is deduplicated.
        });
      },
    });

    const bought = plan.words.slice(0, confirmed.length * BUYS_PER_TX);
    if (bought.length > 0) {
      setBasket((prev) => prev.filter((w) => !bought.includes(w)));
      refresh();
      setTimeout(refresh, 4000);
      // A balance read can trail the confirmation by several seconds; one
      // more pass catches the wallet once the node has caught up.
      setTimeout(refresh, 15000);
    }
    if (complete) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult({
        title: `You picked ${bought.length} ${bought.length === 1 ? 'word' : 'words'}`,
        detail: `${bought.join(', ')} for ${usd(bought.length * unitUsd)}`,
      });
    }
  };

  const signedIn = trade.ready;
  // Short before signing (the basket costs more than the wallet holds) or
  // after a refusal: offer the deposit rather than a retry that fails alike.
  const shortOf: 'USDC' | 'SOL' | null =
    usdcBalance.data !== undefined && total > usdcBalance.data ? 'USDC' : fundsShortfall(inputError ?? (trade.state.status === 'failed' ? trade.state.message : null));
  const openDeposit = (asset: 'USDC' | 'SOL') => {
    sheetRef.current?.close();
    setFund(asset);
  };
  const barTitle = basket.length === 0 ? 'Tap words or add your own' : `${basket.length} ${basket.length === 1 ? 'word' : 'words'} · ${usd(total)}`;
  const barSubtitle = basket.length === 0 ? `${usd(unitUsd)} each, paid in USDC` : basket.join(', ');
  const newWords = basket.filter((w) => !boardByWord.has(w));

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
            title={info?.title ?? `Market ${id}`}
            cover={info?.cover_image_url ?? null}
            status={status}
            lockAt={lockAt}
            eventAt={info?.event_start_time ? Date.parse(info.event_start_time) : null}
            now={now}
            description={info?.description}
          />
          <View style={styles.chips}>
            <Chip value={usdc(market.data.vaultAmount)} caption="pool" />
            <Chip value={usd(unitUsd)} caption="per word" />
          </View>
          {finished ? (
            <Link href={`/result/majority/${id}` as Href} asChild>
              <Button label="See results" tone="neutral" />
            </Link>
          ) : null}

          {viewed && mine.data && mine.data.length > 0 ? (
            <Card style={{ gap: spacing.xs }}>
              <Text style={type.heading}>Your picks</Text>
              <Text style={type.muted}>{mine.data.map((p) => `${p.word} ×${p.units}`).join(', ')}</Text>
            </Card>
          ) : null}

          <SectionTitle title={open ? 'Pick the word said the most' : 'Board'} />
          {board.length === 0 && open ? <Text style={type.muted}>No words yet. Add the first one below.</Text> : null}
          <WordBoard words={words} selected={selectedKeys} onToggle={toggle} selectable={open} />

          {open ? (
            <Card style={{ gap: spacing.sm }}>
              <Text style={type.heading}>Add your own word</Text>
              <Text style={type.muted}>3 to 12 letters or digits. The first person to pick a word adds it to the board.</Text>
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
                  style={styles.input}
                  accessibilityLabel="Add your own word"
                />
                <Button label="Add" tone="neutral" size="sm" onPress={addDraft} disabled={!draft.trim()} />
              </View>
              {draftError ? <Text style={[type.muted, { color: colors.no }]}>{draftError}</Text> : null}
              {newWords.length > 0 ? (
                <View style={styles.wordChips}>
                  {newWords.map((w) => (
                    <Pressable key={w} onPress={() => removeFromBasket(w)} style={styles.wordChip} accessibilityRole="button" accessibilityLabel={`Remove ${w}`}>
                      <Text style={styles.wordChipLabel}>{w}</Text>
                      <Text style={styles.wordChipX}>×</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {open ? (
        <PinnedBar
          title={barTitle}
          subtitle={barSubtitle}
          button={{ label: basket.length === 0 ? 'Review' : `Review ${usd(total)}`, disabled: basket.length === 0 || !signedIn, onPress: openSheet }}
          note={!features.paidTrading ? PAUSED_NOTE : !signedIn ? (trade.connecting ? 'Connecting your wallet' : 'Sign in to pick') : undefined}
        />
      ) : null}

      <BottomSheet
        ref={sheetRef}
        visible={sheetOpen}
        onClose={closeSheet}
        title="Your picks"
        locked={trade.state.status === 'working'}
        footer={
          trade.state.status === 'working' ? (
            <View style={{ height: 64 }} />
          ) : trade.state.status === 'done' ? (
            <Button label="Done" tone="gold" onPress={() => sheetRef.current?.close()} />
          ) : trade.state.status === 'failed' && trade.state.indeterminate ? (
            <Button label="Close" tone="neutral" onPress={() => sheetRef.current?.close()} />
          ) : trade.state.status === 'failed' && shortOf ? (
            <Button label={`Add ${shortOf}`} tone="gold" onPress={() => openDeposit(shortOf)} note={trade.state.message} />
          ) : trade.state.status === 'failed' ? (
            <Button label="Try again" tone="gold" onPress={trade.reset} />
          ) : shortOf ? (
            <Button label={`Add ${shortOf}`} tone="gold" onPress={() => openDeposit(shortOf)} note={inputError ?? `These picks cost ${usd(total)} and you have ${usd(usdcBalance.data ?? 0, { dp: 2 })}.`} />
          ) : (
            <SwipeButton
              tone="gold"
              label={`Swipe to buy for ${usd(total)}`}
              disabled={!features.paidTrading || basket.length === 0 || !signedIn}
              note={inputError ?? (!features.paidTrading ? PAUSED_NOTE : undefined)}
              onConfirm={() => void submit()}
            />
          )
        }
      >
        {trade.state.status !== 'idle' ? (
          <TradeProgress
            phase={trade.state.status === 'working' ? 'working' : trade.state.status === 'done' ? 'done' : trade.state.indeterminate ? 'pending' : 'failed'}
            batch={trade.state.status === 'working' ? trade.state.batch : undefined}
            title={trade.state.status === 'done' ? result?.title : undefined}
            detail={trade.state.status === 'done' ? result?.detail : trade.state.status === 'failed' ? trade.state.message : undefined}
            minHeight={280}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
              {basket.map((w, i) => (
                <Row key={w} first={i === 0}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.pickWord}>{w}</Text>
                      {!boardByWord.has(w) ? <Pill label="NEW" tone="gold" /> : null}
                    </View>
                    <Text style={[type.muted, { color: colors.yes }]}>Wins {usd(winFor(w))} if said most</Text>
                  </View>
                  <Text style={type.money}>{usd(unitUsd)}</Text>
                  <Pressable onPress={() => removeFromBasket(w)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${w}`}>
                    <Text style={styles.wordChipX}>×</Text>
                  </Pressable>
                </Row>
              ))}
              <Row first={basket.length === 0}>
                <Text style={[type.muted, { flex: 1 }]}>Total</Text>
                <Text style={type.money}>{usd(total)}</Text>
              </Row>
            </Card>
            {newWords.length > 0 ? <Text style={type.muted}>A new word also pays a small SOL deposit for its record on chain.</Text> : null}
            {basket.length > BUYS_PER_TX ? (
              <Text style={type.muted}>
                This goes through as {Math.ceil(basket.length / BUYS_PER_TX)} transactions, {BUYS_PER_TX} words at a time.
              </Text>
            ) : null}
          </View>
        )}
      </BottomSheet>

      {sessionWallet ? <DepositSheet key={fund ?? 'USDC'} visible={fund !== null} onClose={() => setFund(null)} wallet={sessionWallet} initialAsset={fund ?? 'USDC'} /> : null}
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
