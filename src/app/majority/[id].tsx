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
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { chatEventId } from '@/chat/rules';
import { recordMajorityBuys } from '@/api/paidMajority';
import { keys, useIsScreenFocused, usePaidMajorityMarket, usePaidMajorityMetadata, usePaidMajorityPositions, useSeekerStatus, useSolBalance, useUsdcBalance } from '@/api/queries';
import { deserializeMajorityMarket, MajorityStatus, normalizeWord, WordOutcome } from '@/chain/majority';
import { placeLabel } from '@/chain/majorityWords';
import { base64ToBytes } from '@/lib/bytes';
import { findWordParam } from '@/markets/merge';
import { boardTitle, freshPickWin, heldPickWin, paidResult, paidWeights, paysPlaces, ticketNote, winLine, type PoolState } from '@/markets/top3';
import { usd, usdc } from '@/lib/format';
import { FREE_PICK_BAR_TITLE, freePickUse } from '@/lib/seeker-perk';
import { useNow } from '@/lib/use-now';
import { useActiveWallet } from '@/store/active-wallet';
import { useSession } from '@/store/session';
import { TradeInputError } from '@/trade/amm';
import { BUYS_PER_TX, checkCoinedWord, friendlyMajorityError, MIN_SOL_FOR_FEES, planMajorityBuy } from '@/trade/majority';
import { fundsShortfall } from '@/trade/funds';
import { friendlyPickError, sendSeekerPick } from '@/trade/seeker-pick';
import { useAttestationGate } from '@/trade/use-attestation-gate';
import { useTrade } from '@/trade/use-trade';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { DepositSheet } from '@/ui/fund-sheet';
import { Card, Row, SectionTitle } from '@/ui/card';
import { Chip } from '@/ui/chip';
import { PAUSED_NOTE, useFeatures } from '@/ui/config-gate';
import { MarketHeader, statusFromLock } from '@/ui/market-header';
import { Pill } from '@/ui/pill';
import { Podium } from '@/ui/podium';
import { PINNED_BAR_HEIGHT, PinnedBar } from '@/ui/pinned-bar';
import { FeaturedWords } from '@/ui/featured-words';
import { Screen } from '@/ui/screen';
import { SimilarMarkets } from '@/ui/similar-markets';
import { CardSkeleton, ErrorState } from '@/ui/states';
import { SwipeButton } from '@/ui/swipe-button';
import { colors, fonts, spacing, type } from '@/ui/theme';
import { TradeProgress } from '@/ui/trade-progress';
import { WordBoard, type BoardWord } from '@/ui/word-board';
import { ChatPreview } from '@/ui/chat-preview';

/** Shown for a board word whose text the server does not know yet. */
const UNNAMED = 'Word not shown yet';

export default function PaidMajorityScreen() {
  // `word` names a word to put in the basket, from a tap on a market card.
  const { id, word: wordParam } = useLocalSearchParams<{ id: string; word?: string }>();
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
  const attestation = useAttestationGate();
  const sheetRef = useRef<BottomSheetHandle>(null);
  // The server can pause trading; claims elsewhere are never paused.
  const features = useFeatures();
  // A linked Seeker's first pick here can be paid for (src/trade/seeker-pick.ts).
  const queryClient = useQueryClient();
  const seeker = useSeekerStatus(sessionWallet, features.seekerPerk);

  // The basket: normalised words, in the order they were picked.
  const [basket, setBasket] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fund, setFund] = useState<'USDC' | 'SOL' | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; detail: string } | null>(null);
  // The `word` param already acted on, so the word goes in the basket once.
  const [handledWord, setHandledWord] = useState<string | null>(null);
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

  // Most markets pay the one word said the most. A market can instead pay the
  // top three from one pool (docs/MM_V2_SPEC.md); it says so in its account,
  // and everything below that differs for it hangs off `places`.
  const weights = paidWeights(acct.payoutWeights);
  const places = paysPlaces(weights);

  // Payout preview for a fresh unit on a word, the same estimate the website
  // shows: on a market with one winner, its share of the pool after the fee if
  // it wins; on a top 3 market, the least it pays if it finishes 1st.
  const pool: PoolState = {
    weights,
    pool: Number(market.data.totalUnits),
    stakes: board.map((b) => Number(b.units)),
    fee: acct.feeBps / 10_000,
    // The guaranteed multiple is a free market's; a paid pool pays what it holds.
    floor: 0,
  };
  const indexOfHash = new Map(board.map((b, i) => [b.wordHash, i]));
  /** Dollars a fresh pick on the word at `index` pays (-1 for a word not on the board yet). */
  const winAt = (index: number) => freshPickWin(pool, index, 1) * unitUsd;
  const winFor = (word: string) => winAt(indexOfHash.get(boardByWord.get(word)?.wordHash ?? '') ?? -1);

  // Once resolved, a top 3 market shows its podium. Right after a resolve the
  // account can say Resolved before the words carry their places (they come
  // from a slower index), so there may be nothing to draw for a moment; the
  // market query keeps polling and the podium appears when the places do.
  const { podium, picks: myResults } = paidResult(board, mine.data ?? [], acct, finished === 'resolved');

  const words: BoardWord[] = [...board]
    .sort((a, b) => Number(b.units) - Number(a.units))
    .map((w) => ({
      key: w.wordHash,
      label: w.word ?? UNNAMED,
      share: w.oddsPct / 100,
      // On chain a unit is one $1 pick, and "units" meant nothing to a reader.
      countLabel:
        w.outcome === WordOutcome.Refunding
          ? 'Removed, being refunded'
          : `${w.units} ${Number(w.units) === 1 ? 'pick' : 'picks'} · ${usd(Number(w.units) * unitUsd)}`,
      outcome: finished === 'resolved' ? (w.outcome === WordOutcome.Winner ? 'winner' : 'loser') : null,
      // Every placed word is a winner on a top 3 market, so each says which place.
      place: places && (w.place ?? 0) >= 1 ? placeLabel(w.place ?? 0) : undefined,
      yours: ownedHashes.has(w.wordHash),
      winLabel: winLine(places, usd(winAt(indexOfHash.get(w.wordHash) ?? -1))),
      locked: w.word === null || ownedHashes.has(w.wordHash) || w.outcome === WordOutcome.Refunding,
    }));

  const selectedKeys = new Set(named.filter((b) => basket.includes(normalizeWord(b.word))).map((b) => b.wordHash));
  // The Seeker's free pick, when this account has one and this market takes
  // it. A basket of exactly one word is that pick and costs nothing.
  const freePick = open && features.paidTrading ? freePickUse(seeker.data, basket.length, acct.unitPrice) : null;
  const free = freePick?.free === true;
  const total = free ? 0 : basket.length * unitUsd;

  const toggle = (key: string) => {
    const entry = named.find((b) => b.wordHash === key);
    if (!entry) return;
    Haptics.selectionAsync();
    const w = normalizeWord(entry.word);
    setBasket((prev) => (prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]));
  };

  // Arriving from a tap on one word of a market card: that word starts in the
  // basket, once. Done while rendering, like the YES/NO screens, because the
  // board only arrives after mount.
  if (wordParam && handledWord !== wordParam) {
    setHandledWord(wordParam);
    const i = findWordParam(
      named.map((b) => b.word),
      wordParam,
    );
    if (i >= 0 && open && !basket.includes(normalizeWord(named[i].word))) toggle(named[i].wordHash);
  }

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

  // The one word in the basket, paid for by the Seeker funder. No balance is
  // needed for it: the same transaction brings the dollar and the SOL its
  // rent takes. Everything else is as for a pick the wallet pays for.
  const submitFree = async () => {
    if (!sessionWallet || basket.length !== 1) return;
    setInputError(null);
    const word = basket[0];

    const gate = await attestation.requireTrade('majority', id);
    if (!gate.ok) {
      if (gate.error) setInputError(gate.error);
      return;
    }

    const isNewWord = !boardByWord.has(word);
    const signature = await trade.runCustom(
      (signer) =>
        sendSeekerPick({
          ...signer,
          marketId: id,
          word,
          onStatus: (next) => queryClient.setQueryData(keys.seekerStatus(sessionWallet), next),
        }),
      { explain: friendlyPickError },
    );
    // Whatever happened, the server's view of the perk may have moved (used,
    // in flight, or free again), and the sheet must not offer it on a guess.
    void queryClient.invalidateQueries({ queryKey: keys.seekerStatus(sessionWallet) });
    if (!signature) return;

    void recordMajorityBuys({ marketId: id, wallet: sessionWallet, signature, words: [{ word, isNewWord }] }).catch(() => {
      // Best effort, as for any other pick.
    });
    setBasket([]);
    refresh();
    setTimeout(refresh, 4000);
    setTimeout(refresh, 15000);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setResult({ title: 'Your free pick is in', detail: `${word}, on us. If it wins, the winnings are yours.` });
  };

  const submit = async () => {
    if (!sessionWallet) return;
    if (free) return submitFree();
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

    // Asked before the plan is built, for the reason given in paid/[id].tsx.
    const gate = await attestation.requireTrade('majority', id);
    if (!gate.ok) {
      if (gate.error) setInputError(gate.error);
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
  // A free pick needs no funds of the wallet's own, so it is never short.
  const shortOf: 'USDC' | 'SOL' | null = free
    ? null
    : usdcBalance.data !== undefined && total > usdcBalance.data
      ? 'USDC'
      : fundsShortfall(inputError ?? (trade.state.status === 'failed' ? trade.state.message : null));
  const openDeposit = (asset: 'USDC' | 'SOL') => {
    sheetRef.current?.close();
    setFund(asset);
  };
  const barTitle = basket.length === 0 ? (freePick ? FREE_PICK_BAR_TITLE : 'Tap words or add your own') : free ? '1 word · Free' : `${basket.length} ${basket.length === 1 ? 'word' : 'words'} · ${usd(total)}`;
  const barSubtitle = basket.length === 0 ? (freePick && !freePick.free ? freePick.note : `${usd(unitUsd)} each, paid in USDC`) : basket.join(', ');
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
            kind='paid-majority'
            paidPlaces={weights.length}
          />
          <View style={styles.chips}>
            <Chip value={usdc(market.data.vaultAmount)} caption="pool" />
            <Chip value={usd(unitUsd)} caption="per word" />
          </View>
          {/* A market with a podium shows its result right here, so the button
              above it would promise the same thing twice; it moves under the
              podium and names what the next screen adds. */}
          {finished && !podium ? (
            <Link href={`/result/majority/${id}` as Href} asChild>
              <Button label="See results" tone="neutral" />
            </Link>
          ) : null}

          {podium ? (
            <>
              <Podium tiers={podium} paidPlaces={weights.length} picks={viewed ? myResults : []} unit="usd" />
              <Link href={`/result/majority/${id}` as Href} asChild>
                <Button label="Payouts and claims" tone="neutral" />
              </Link>
            </>
          ) : places && finished === 'resolved' ? (
            <Text style={type.muted}>The final places are being confirmed. This updates on its own.</Text>
          ) : null}

          {/* The podium carries the viewer's picks once it is up; until then, and on every other market, this card does. */}
          {viewed && mine.data && mine.data.length > 0 && !podium ? (
            <Card style={{ gap: spacing.xs }}>
              <Text style={type.heading}>Your picks</Text>
              {places && !finished ? (
                mine.data.map((p) => (
                  <Text key={p.wordHash} style={type.muted}>
                    {p.word} · if 1st ~{usd(heldPickWin(pool, indexOfHash.get(p.wordHash) ?? -1, Number(p.units)) * unitUsd)}
                  </Text>
                ))
              ) : (
                <Text style={type.muted}>{mine.data.map((p) => `${p.word} ×${p.units}`).join(', ')}</Text>
              )}
            </Card>
          ) : null}

          <SectionTitle title={boardTitle(places, open, weights.length)} />
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
        <ChatPreview eventId={chatEventId('paid-majority', id)} title={info?.title ?? `Market ${id}`} focused={focused} now={now} />
        <SimilarMarkets currentKey={`paid-majority:${id}`} />
        <FeaturedWords />
        </ScrollView>
      </KeyboardAvoidingView>

      {open ? (
        <PinnedBar
          title={barTitle}
          subtitle={barSubtitle}
          button={{ label: basket.length === 0 ? 'Review' : free ? 'Review free pick' : `Review ${usd(total)}`, disabled: basket.length === 0 || !signedIn, onPress: openSheet }}
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
          ) : trade.needsSignIn ? (
            <Link href="/sign-in" asChild>
              <Button label="Sign in again" tone="gold" note="Your sign-in has expired. Nothing is lost." />
            </Link>
          ) : trade.walletFailed ? (
            <Button label="Reconnect wallet" tone="neutral" onPress={trade.retryWallet} note="Your wallet did not come back. Nothing is lost." />
          ) : trade.state.status === 'failed' && shortOf ? (
            <Button label={`Add ${shortOf}`} tone="gold" onPress={() => openDeposit(shortOf)} note={trade.state.message} />
          ) : trade.state.status === 'failed' ? (
            <Button label="Try again" tone="gold" onPress={trade.reset} />
          ) : shortOf ? (
            <Button label={`Add ${shortOf}`} tone="gold" onPress={() => openDeposit(shortOf)} note={inputError ?? `These picks cost ${usd(total)} and you have ${usd(usdcBalance.data ?? 0, { dp: 2 })}.`} />
          ) : (
            <SwipeButton
              tone="gold"
              label={free ? 'Swipe to place your free pick' : `Swipe to buy for ${usd(total)}`}
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
                    <Text style={[type.muted, { color: colors.yes }]}>{winLine(places, usd(winFor(w)))}</Text>
                  </View>
                  <Text style={type.money}>{free ? 'Free' : usd(unitUsd)}</Text>
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
            {free ? (
              <Text style={[type.muted, { color: colors.gold }]}>Free with your Seeker. We cover this pick, and if it wins the winnings are yours.</Text>
            ) : freePick && basket.length > 1 ? (
              <Text style={type.muted}>{freePick.note}</Text>
            ) : null}
            {places ? <Text style={type.muted}>{ticketNote(weights.length)}</Text> : null}
            {newWords.length > 0 && !free ? <Text style={type.muted}>A new word also pays a small SOL deposit for its record on chain.</Text> : null}
            {basket.length > BUYS_PER_TX ? (
              <Text style={type.muted}>
                This goes through as {Math.ceil(basket.length / BUYS_PER_TX)} transactions, {BUYS_PER_TX} words at a time.
              </Text>
            ) : null}
          </View>
        )}
      </BottomSheet>

      {attestation.sheet}
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
