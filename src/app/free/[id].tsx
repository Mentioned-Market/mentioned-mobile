// Free YES/NO market. Same structure as the paid one: each word with its
// chance, the trade sheet as a full screen, your picks under the header.
//
// Trading here is a server call against the play-token ledger, not a chain
// transaction, but it uses the same progress and completion screens so the two
// kinds of market feel like one app.
import * as Haptics from 'expo-haptics';
import { Link, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { chatEventId } from '@/chat/rules';
import { getFreeMarket, getFreeMarketIdBySlug, tradeFree } from '@/api/free';
import { useFreeChart, useFreeMarket, useFreePositions, useIsScreenFocused } from '@/api/queries';
import { freeBuyMultiplier, freeQuote } from '@/free/display';
import { sharesForTokens, virtualBuyCost, virtualSellReturn } from '@/free/lmsr';
import { VIRTUAL_MARKET_POINTS_CAP, VIRTUAL_MARKET_POINTS_MULTIPLIER, getDisplayStatus } from '@/free/marketUtils';
import { tokens } from '@/lib/format';
import { toMs } from '@/lib/time';
import { prepareSeries } from '@/lib/chart';
import { useNow } from '@/lib/use-now';
import { findWordParam } from '@/markets/merge';
import { useActiveWallet } from '@/store/active-wallet';
import { useSession } from '@/store/session';
import { achievementLines, useApiTrade } from '@/trade/free';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { Card, SectionTitle } from '@/ui/card';
import { PAUSED_NOTE, useFeatures } from '@/ui/config-gate';
import { LineChart } from '@/ui/line-chart';
import { MarketHeader } from '@/ui/market-header';
import { FeaturedWords } from '@/ui/featured-words';
import { Screen } from '@/ui/screen';
import { SimilarMarkets } from '@/ui/similar-markets';
import { CardSkeleton, ErrorState } from '@/ui/states';
import { Loader } from '@/ui/loader';
import { SwipeButton } from '@/ui/swipe-button';
import { spacing, type } from '@/ui/theme';
import { TradeProgress } from '@/ui/trade-progress';
import { TradeSheet, TradeSheetHeader, type Preset, type SheetChip, type SheetWord, type Side, type TradeMode } from '@/ui/trade-sheet';
import { WordList } from '@/ui/word-list';
import { YourPositions, type HeldRow } from '@/ui/your-positions';
import { showAchievements } from '@/ui/toast';
import { ChatPreview } from '@/ui/chat-preview';

// From the ported scoring constants rather than typed out: a hardcoded copy
// still said 0.5x with no cap after the website moved to 0.2x capped at 100.
const POINTS_NOTE = `Free markets pay out in play tokens. Profit converts to points at ${VIRTUAL_MARKET_POINTS_MULTIPLIER}x, up to ${VIRTUAL_MARKET_POINTS_CAP} points a market.`;

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * `/free/<id>` inside the app, but `/free/<slug>` from the website's links
 * (App Links and notifications both arrive that way). A slug is looked up,
 * then sent to this screen or the majority one by the market's type.
 */
export default function FreeRoute() {
  // `word` names a word to go straight to, from a tap on a market card.
  const { id: idParam, word } = useLocalSearchParams<{ id: string; word?: string }>();
  if (/^\d+$/.test(idParam ?? '')) return <FreeYesNoScreen id={Number(idParam)} wordParam={word} />;
  return <FreeSlugRedirect slug={idParam ?? ''} />;
}

function FreeSlugRedirect({ slug }: { slug: string }) {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getFreeMarketIdBySlug(slug);
        const market = await getFreeMarket(id);
        if (!cancelled) router.replace((market.market.market_type === 'majority' ? `/free-majority/${id}` : `/free/${id}`) as Href);
      } catch (e) {
        if (!cancelled) setError(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, router]);
  return <Screen back>{error ? <ErrorState error={error} title="Could not find that market" /> : <Loader style={{ paddingTop: spacing.xl }} />}</Screen>;
}

function FreeYesNoScreen({ id, wordParam }: { id: number; wordParam?: string }) {
  const focused = useIsScreenFocused();
  const now = useNow(1000);
  const viewed = useActiveWallet();
  const market = useFreeMarket(id, focused);
  const positions = useFreePositions(id, viewed, focused);
  const chart = useFreeChart(id, focused);
  const [pick, setPick] = useState<{ wordId: number; side: Side } | null>(null);
  const [modeChoice, setMode] = useState<TradeMode>('buy');
  const [amount, setAmount] = useState('50');
  const sessionWallet = useSession((st) => st.wallet);
  const api = useApiTrade();
  const sheetRef = useRef<BottomSheetHandle>(null);
  // The server can pause trading; claims elsewhere are never paused.
  const features = useFeatures();
  const [result, setResult] = useState<{ title: string; detail: string } | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [formHeight, setFormHeight] = useState(0);
  // The `word` param already acted on, so it opens the sheet once.
  const [handledWord, setHandledWord] = useState<string | null>(null);

  if (market.isPending) {
    return (
      <Screen back>
        <CardSkeleton />
      </Screen>
    );
  }
  if (market.isError || !market.data) {
    return (
      <Screen back>
        <ErrorState error={market.error} onRetry={() => market.refetch()} />
      </Screen>
    );
  }

  const m = market.data.market;
  const ds = getDisplayStatus(m);
  const status = ds === 'cancelled' ? 'cancelled' : ds === 'resolved' || ds === 'closed' ? 'resolved' : ds === 'pending_resolution' ? 'pending' : 'open';
  const open = status === 'open';
  const b = Number(m.b_parameter);
  const words: SheetWord[] = market.data.words.map((w) => ({
    key: String(w.id),
    label: w.word,
    yesPrice: w.yes_price,
    noPrice: w.no_price,
    outcome: w.resolved_outcome,
  }));

  const balance = positions.data?.balance ?? (viewed ? 0 : m.play_tokens);
  const heldRows: HeldRow[] = (positions.data?.positions ?? []).flatMap((p) => {
    const rows: HeldRow[] = [];
    const w = market.data.words.find((x) => x.id === p.word_id);
    const net = p.tokens_received - p.tokens_spent;
    const amountLine = `${tokens(p.tokens_spent)} tokens in`;
    if (p.yes_shares > 0.005)
      rows.push({ key: `${p.word_id}y`, word: p.word, side: 'YES', amount: amountLine, value: `${fmt(p.yes_shares)} shares · worth ${tokens(p.yes_shares * (w?.yes_price ?? 0))}`, tone: net > 0 ? 'up' : undefined });
    if (p.no_shares > 0.005)
      rows.push({ key: `${p.word_id}n`, word: p.word, side: 'NO', amount: amountLine, value: `${fmt(p.no_shares)} shares · worth ${tokens(p.no_shares * (w?.no_price ?? 0))}`, tone: net > 0 ? 'up' : undefined });
    return rows;
  });
  const heldBadges: Record<string, string> = {};
  for (const p of positions.data?.positions ?? []) {
    // A share pays one token if its side wins, so a holding reads as what it pays.
    const parts = [p.yes_shares > 0.005 ? `Yes pays ${tokens(p.yes_shares)} tokens` : null, p.no_shares > 0.005 ? `No pays ${tokens(p.no_shares)} tokens` : null].filter(Boolean);
    if (parts.length) heldBadges[String(p.word_id)] = parts.join(' · ');
  }

  const word = pick ? market.data.words.find((w) => w.id === pick.wordId) : null;
  const side: Side = pick?.side ?? 'YES';
  const held = word ? positions.data?.positions.find((p) => p.word_id === word.id) : undefined;
  const heldYes = held?.yes_shares ?? 0;
  const heldNo = held?.no_shares ?? 0;
  const heldSide = side === 'YES' ? heldYes : heldNo;

  // See the paid screen: the mode is derived so an emptied position cannot
  // leave the sheet stuck in Sell with the Buy/Sell control hidden.
  const canSell = heldYes > 0 || heldNo > 0;
  const mode: TradeMode = canSell ? modeChoice : 'buy';
  const amountNum = Number(amount) || 0;
  // What one token on this side pays right now, as on a paid market.
  const oddsChip: SheetChip | null = word ? { value: freeQuote(word.yes_price, side), caption: 'odds now', tone: side === 'YES' ? 'yes' : 'no' } : null;
  let headline = { label: 'Payout', value: '0 tokens' };
  let detail: string | null = null;
  let chips: SheetChip[] = [];
  let warning: string | null = null;
  let presets: Preset[] = [];
  let actionLabel = `Swipe to Predict ${side === 'YES' ? 'Yes' : 'No'}`;
  if (word && mode === 'buy') {
    const tokensIn = Math.min(amountNum, Math.max(0, balance));
    const sharesOut = tokensIn > 0 ? sharesForTokens(word.yes_qty, word.no_qty, side, tokensIn, b) : 0;
    const cost = sharesOut > 0 ? virtualBuyCost(word.yes_qty, word.no_qty, side, sharesOut, b) : 0;
    const multiplier = freeBuyMultiplier(sharesOut, cost);
    headline = { label: `Payout if ${side === 'YES' ? 'Yes' : 'No'}`, value: `${tokens(sharesOut)} tokens` };
    detail = multiplier ? `${multiplier} on your pick · costs ${tokens(cost)} tokens` : null;
    chips = [
      ...(oddsChip ? [oddsChip] : []),
      { value: viewed ? tokens(balance) : tokens(m.play_tokens), caption: viewed ? 'tokens available' : 'tokens to start' },
    ];
    if (amountNum > balance) warning = `You have ${tokens(balance)} tokens on this market.`;
    presets = [25, 50, 75, 100].map((n) => ({ label: n === 100 ? 'Max' : `${n}%`, value: String(Math.floor((balance * n) / 100)) }));
  } else if (word) {
    const capped = Math.min(amountNum, heldSide);
    const ret = capped > 0 ? virtualSellReturn(word.yes_qty, word.no_qty, side, capped, b) : 0;
    const kept = Math.max(0, heldSide - capped);
    headline = { label: 'You receive', value: `${tokens(ret)} tokens` };
    // What is left still pays a token a share if the side wins.
    detail = capped > 0 && kept > 0.005 ? `Keeps ${tokens(kept)} tokens if ${side === 'YES' ? 'Yes' : 'No'}` : null;
    chips = [
      ...(oddsChip ? [oddsChip] : []),
      { value: fmt(heldSide), caption: `${side} held` },
    ];
    if (!viewed) warning = 'Connect a wallet to see what you hold.';
    else if (amountNum > heldSide) warning = `You hold ${fmt(heldSide)} ${side} shares on this word.`;
    presets = [25, 50, 75, 100].map((n) => ({ label: n === 100 ? 'Max' : `${n}%`, value: (Math.floor(((heldSide * n) / 100) * 100) / 100).toString() }));
    actionLabel = `Swipe to Sell ${side === 'YES' ? 'Yes' : 'No'}`;
  }

  // Every word on the chart, traded or not, ending at its live price while
  // the market is open (see prepareSeries). Times in seconds.
  const series = prepareSeries(
    market.data.words.map((w) => ({
      key: String(w.id),
      label: w.word,
      history: (chart.data?.words.find((c) => c.word_id === w.id)?.history ?? []).map((h) => ({ t: Math.floor(Date.parse(h.t) / 1000), p: h.yes })),
    })),
    {
      initial: 0.5,
      now: Math.floor(now / 1000),
      current: Object.fromEntries(words.map((w) => [w.key, w.yesPrice])),
      live: open,
    },
  );

  const openSheet = (key: string, s: Side) => {
    setPick({ wordId: Number(key), side: s });
    setMode('buy');
    setAmount('50');
    api.reset();
    setResult(null);
    setInputError(null);
  };

  const closeSheet = () => {
    setPick(null);
    setResult(null);
    setInputError(null);
    api.reset();
  };

  // Arriving from a tap on one word of a market card: open that word's sheet,
  // once. See the paid screen for why this is done while rendering.
  if (wordParam && handledWord !== wordParam) {
    setHandledWord(wordParam);
    const i = findWordParam(
      words.map((w) => w.label),
      wordParam,
    );
    if (i >= 0 && open) openSheet(words[i].key, 'YES');
  }

  const submit = async () => {
    if (!word) return;
    setInputError(null);
    if (mode === 'buy' && amountNum < 1) {
      setInputError('The minimum is 1 token.');
      return;
    }
    if (mode === 'buy' && amountNum > balance) {
      setInputError(`Not enough play tokens. You have ${tokens(balance)}.`);
      return;
    }
    // Never ask to sell more than is held; the server would refuse it.
    const amountToSend = mode === 'sell' ? Math.min(amountNum, heldSide) : amountNum;
    if (amountToSend <= 0) return;

    const res = await api.run(() =>
      tradeFree(id, {
        word_id: word.id,
        action: mode,
        side,
        amount: amountToSend,
        amount_type: mode === 'buy' ? 'tokens' : 'shares',
      }),
    );
    if (!res) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const verb = mode === 'buy' ? 'bought' : 'sold';
    const money = mode === 'buy' ? `${word.word} for ${tokens(Math.abs(res.cost))} tokens` : `${tokens(Math.abs(res.cost))} tokens back`;
    const extras = achievementLines(res.newAchievements);
    showAchievements(res.newAchievements);
    setResult({ title: `You ${verb} ${fmt(res.shares)} ${side}`, detail: extras ? `${money}\n${extras}` : money });
    void market.refetch();
    void positions.refetch();
    void chart.refetch();
  };

  return (
    <Screen back>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MarketHeader title={m.title} cover={m.cover_image_url} status={status} lockAt={toMs(m.lock_time)} eventAt={toMs(m.event_start_time)} now={now} description={m.description} kind="free-yesno" />
        <YourPositions
          connected={!!viewed}
          rows={heldRows}
          loading={!!viewed && positions.isPending}
          balanceLine={viewed ? `${tokens(balance)} tokens left` : undefined}
        />
        {status === 'resolved' || status === 'cancelled' ? (
          <Link href={`/result/free/${id}` as Href} asChild>
            <Button label="See results" tone="neutral" />
          </Link>
        ) : null}
        <WordList words={words} onPick={openSheet} open={open} held={heldBadges} quote={(w, sd) => freeQuote(w.yesPrice, sd)} />
        <SectionTitle title="Odds over time" />
        <Card>
          {/* Lines read as what a Yes pays, like the buttons above. */}
          <LineChart series={series} selectedKey={pick ? String(pick.wordId) : null} format={(p) => freeQuote(p, 'YES')} />
        </Card>
        <Text style={[type.muted, { textAlign: 'center' }]}>{POINTS_NOTE}</Text>
        <ChatPreview eventId={chatEventId('free-yesno', id)} title={m.title} focused={focused} now={now} />
        <SimilarMarkets currentKey={`free-yesno:${id}`} />
        <FeaturedWords />
      </ScrollView>

      <BottomSheet
        ref={sheetRef}
        visible={!!pick && !!word}
        onClose={closeSheet}
        full
        header={<TradeSheetHeader cover={m.cover_image_url} word={word?.word ?? ''} market={m.title} />}
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
              label={open ? actionLabel : 'Market closed'}
              tone={side === 'YES' ? 'yes' : 'no'}
              disabled={!features.freeTrading || !open || !sessionWallet || amountNum <= 0}
              note={inputError ?? (!features.freeTrading ? PAUSED_NOTE : !open ? undefined : !sessionWallet ? 'Sign in to trade' : undefined)}
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
            minHeight={formHeight || undefined}
          />
        ) : word && pick ? (
          <View style={{ flexGrow: 1 }} onLayout={(e) => setFormHeight(e.nativeEvent.layout.height)}>
            <TradeSheet
              word={{ key: String(word.id), label: word.word, yesPrice: word.yes_price, noPrice: word.no_price, outcome: word.resolved_outcome }}
              mode={mode}
              onMode={(mm) => {
                setMode(mm);
                setAmount(mm === 'buy' ? '50' : '');
              }}
              canSell={canSell}
              side={side}
              onSide={(s) => {
                setPick({ wordId: pick.wordId, side: s });
                if (mode === 'sell') setAmount('');
              }}
              amount={amount}
              onAmount={(v) => {
                setAmount(v);
                setInputError(null);
              }}
              unit={mode === 'buy' ? 'tokens' : 'shares'}
              maxDecimals={mode === 'buy' ? 0 : 2}
              presets={presets}
              headline={headline}
              chips={chips}
              detail={detail}
              warning={warning}
              open={open}
            />
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
});
