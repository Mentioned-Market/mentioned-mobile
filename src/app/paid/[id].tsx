// Paid YES/NO market. Each word shows what a Yes and a No pay, as multipliers;
// tapping one opens the trade sheet as a full screen on that side. AMM markets
// show multipliers and dollars only, never cents, shares or percentages (see
// src/trade/amm-display.ts). Quotes use the ported AMM maths against the
// decoded account.
import * as Haptics from 'expo-haptics';
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import {
  keys,
  useIsScreenFocused,
  usePaidMarket,
  usePaidMarketChart,
  usePaidMarketMetadata,
  usePaidMarketTrades,
  usePaidMarketUserPositions,
  usePaidMarketWordSpend,
  useSolBalance,
  useUsdcBalance,
} from '@/api/queries';
import { chatEventId } from '@/chat/rules';
import { deserializeMarketAccount, estimateBuyCost, estimateSellReturn, impliedYesPrice, MarketStatus, sharesForUsdc } from '@/chain/amm';
import { base64ToBytes } from '@/lib/bytes';
import { shortAddress, usd, usdc } from '@/lib/format';
import { toBaseUnits } from '@/lib/units';
import { prepareSeries } from '@/lib/chart';
import { useNow } from '@/lib/use-now';
import { findWordParam } from '@/markets/merge';
import { useSession } from '@/store/session';
import { useActiveWallet } from '@/store/active-wallet';
import { planBuy, planSell, TradeInputError } from '@/trade/amm';
import { buyPreview, payoutFor, payoutText, sellPreview, sellShares, sideQuote, type AmmFees } from '@/trade/amm-display';
import { MIN_SOL_FOR_FEES } from '@/trade/majority';
import { fundsShortfall } from '@/trade/funds';
import {
  buyLimitError,
  buyPresets,
  effectiveSpend,
  isPositionFull,
  MAX_POSITION_LABEL,
  MAX_POSITION_USDC,
  MIN_BUY_USDC,
  remainingAllowance,
  spendKey,
  useSessionSpend,
} from '@/trade/spend';
import { useTrade } from '@/trade/use-trade';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { Card, SectionTitle, rowStyle } from '@/ui/card';
import { Chip } from '@/ui/chip';
import { DepositSheet } from '@/ui/fund-sheet';
import { PAUSED_NOTE, useFeatures } from '@/ui/config-gate';
import { LineChart } from '@/ui/line-chart';
import { MarketHeader, statusFromLock } from '@/ui/market-header';
import { FeaturedWords } from '@/ui/featured-words';
import { Screen } from '@/ui/screen';
import { SimilarMarkets } from '@/ui/similar-markets';
import { CardSkeleton, ErrorState } from '@/ui/states';
import { SwipeButton } from '@/ui/swipe-button';
import { colors, fonts, spacing, type } from '@/ui/theme';
import { TradeProgress } from '@/ui/trade-progress';
import { TradeSheet, TradeSheetHeader, type Preset, type SheetChip, type SheetWord, type Side, type TradeMode } from '@/ui/trade-sheet';
import { WordList } from '@/ui/word-list';
import { YourPositions, type HeldRow } from '@/ui/your-positions';
import { ChatPreview } from '@/ui/chat-preview';

/** Dollars, rounded DOWN to the cent, so a preset can never land a cent over the cap. */
const centsDown = (usd: number) => (Math.floor(usd * 100) / 100).toFixed(2);

export default function PaidYesNoScreen() {
  // `word` names a word to go straight to, from a tap on a market card.
  const { id, word: wordParam } = useLocalSearchParams<{ id: string; word?: string }>();
  const focused = useIsScreenFocused();
  const now = useNow(1000);
  const viewed = useActiveWallet();
  const market = usePaidMarket(id, focused);
  const meta = usePaidMarketMetadata(id);
  const chart = usePaidMarketChart(id, focused);
  const trades = usePaidMarketTrades(id, focused);
  const positions = usePaidMarketUserPositions(viewed, focused);
  // What this wallet has already put into each (word, side), for the $15 cap,
  // and its SOL, for fees. See src/trade/spend.ts.
  const wordSpend = usePaidMarketWordSpend(viewed, id, focused);
  const sol = useSolBalance(viewed, focused);
  const usdcBalance = useUsdcBalance(viewed, focused);
  const spendEntries = useSessionSpend((st) => st.entries);
  const recordSpend = useSessionSpend((st) => st.record);
  const [pick, setPick] = useState<{ idx: number; side: Side } | null>(null);
  const [modeChoice, setMode] = useState<TradeMode>('buy');
  const [amount, setAmount] = useState('1');
  // What the completion screen says, fixed at the moment of submitting so it
  // describes the trade that was made rather than the quote that is now live.
  const [result, setResult] = useState<{ title: string; detail: string } | null>(null);
  // The `word` param already acted on, so it opens the sheet once, not again
  // every time the sheet is closed.
  const [handledWord, setHandledWord] = useState<string | null>(null);
  // A problem with the input itself, found before anything is built. Shown on
  // the button rather than as a failed trade, because nothing was attempted.
  const [inputError, setInputError] = useState<string | null>(null);
  // Height of the trade form, so the progress view can hold it (see TradeProgress).
  const [formHeight, setFormHeight] = useState(0);
  // "Add funds" from a trade that is short: closes the trade sheet, opens the
  // deposit sheet on the asset that ran out.
  const [fund, setFund] = useState<'USDC' | 'SOL' | null>(null);
  const trade = useTrade();
  const sheetRef = useRef<BottomSheetHandle>(null);
  // The server can pause trading; claims elsewhere are never paused.
  const features = useFeatures();
  const queryClient = useQueryClient();
  const sessionWallet = useSession((st) => st.wallet);

  const acct = useMemo(() => (market.data ? deserializeMarketAccount(base64ToBytes(market.data.account)) : null), [market.data]);
  if (market.isPending) {
    return (
      <Screen back>
        <CardSkeleton />
      </Screen>
    );
  }
  if (market.isError || !acct) {
    return (
      <Screen back>
        <ErrorState error={market.error ?? new Error('Could not decode the market account')} onRetry={() => market.refetch()} />
      </Screen>
    );
  }

  const b = acct.liquidityParamB;
  const fees: AmmFees = { feeBps: acct.tradeFeeBps, rakeBps: acct.redeemRakeBps };
  const lockAt = Number(acct.locksAt) * 1000;
  const status = statusFromLock(lockAt, acct.status === MarketStatus.Resolved ? 'resolved' : null, now);
  const open = status === 'open';
  const title = meta.data?.title ?? `Market ${id}`;
  const cover = meta.data?.cover_image_url ?? null;
  const words: SheetWord[] = acct.words.map((w) => {
    const yes = impliedYesPrice(w, b);
    return { key: String(w.wordIndex), label: w.label, yesPrice: yes, noPrice: 1 - yes, outcome: w.outcome };
  });

  // Held positions on this market from the wallet-keyed route.
  const mine = (positions.data ?? []).filter((p) => p.marketId === id);
  const heldRows: HeldRow[] = mine.flatMap((p) => {
    const rows: HeldRow[] = [];
    const yes = BigInt(p.yesShares);
    const no = BigInt(p.noShares);
    const cost = Number(p.costBasisUsdc) / 1e6;
    const value = Number(p.estValueUsdc) / 1e6;
    // The cost comes from the trade indexer and can trail the chain; see
    // fromPaidYesNo in src/markets/positions.ts. With no cost yet, up or down
    // against it means nothing, so the row is left untoned.
    const costText = cost > 0 ? `cost ${usd(cost)}` : 'cost updating';
    const tone: HeldRow['tone'] = cost <= 0 ? undefined : value > cost ? 'up' : value < cost ? 'down' : undefined;
    if (yes > 0n)
      rows.push({ key: `${p.wordIndex}y`, word: p.wordLabel, side: 'YES', amount: `Pays ${payoutText(payoutFor(yes, fees.rakeBps))} if YES · ${costText}`, value: `Worth ${usd(value)}`, tone });
    if (no > 0n)
      rows.push({ key: `${p.wordIndex}n`, word: p.wordLabel, side: 'NO', amount: `Pays ${payoutText(payoutFor(no, fees.rakeBps))} if NO · ${costText}`, value: `Worth ${usd(value)}`, tone });
    return rows;
  });
  const heldBadges: Record<string, string> = {};
  for (const p of mine) {
    const parts = [
      BigInt(p.yesShares) > 0n ? `Yes pays ${payoutText(payoutFor(BigInt(p.yesShares), fees.rakeBps))}` : null,
      BigInt(p.noShares) > 0n ? `No pays ${payoutText(payoutFor(BigInt(p.noShares), fees.rakeBps))}` : null,
    ].filter(Boolean);
    if (parts.length) heldBadges[String(p.wordIndex)] = parts.join(' · ');
  }

  // Quote for the open sheet.
  const word = pick ? acct.words[pick.idx] : null;
  const side: Side = pick?.side ?? 'YES';
  const held = word ? mine.find((p) => p.wordIndex === word.wordIndex) : undefined;
  const heldYes = held ? BigInt(held.yesShares) : 0n;
  const heldNo = held ? BigInt(held.noShares) : 0n;
  const heldSide = side === 'YES' ? heldYes : heldNo;

  // Room left under the $2-per-position cap, in base units and dollars.
  const remainingFor = (wordIndex: number, s: Side) => {
    const k = spendKey(wordIndex, s);
    return remainingAllowance(effectiveSpend(wordSpend.data?.[k], spendEntries[`${id}:${k}`]));
  };
  const currentKey = word ? spendKey(word.wordIndex, side) : '';
  const remaining = word ? remainingFor(word.wordIndex, side) : MAX_POSITION_USDC;
  const remainingUsd = remaining / 1e6;

  // Sell is offered only against something you actually hold. Deriving the mode
  // rather than trusting the stored choice means a position that empties while
  // the sheet is open cannot strand the user in a Sell tab that no longer has a
  // control to leave it.
  const canSell = heldYes > 0n || heldNo > 0n;
  const mode: TradeMode = canSell ? modeChoice : 'buy';

  const amountNum = Number(amount) || 0;
  const feeBps = BigInt(acct.tradeFeeBps);
  const sheetWord = pick ? words[pick.idx] : null;
  // What $1 on this side pays right now, net of fee and rake.
  const oddsChip: SheetChip | null = sheetWord
    ? { value: sideQuote(sheetWord.yesPrice, side, fees), caption: 'odds now', tone: side === 'YES' ? 'yes' : 'no' }
    : null;
  let headline = { label: 'Payout', value: '$0.00' };
  let detail: string | null = null;
  let chips: SheetChip[] = [];
  let warning: string | null = null;
  let presets: Preset[] = [];
  let actionLabel = `Swipe to Predict ${side === 'YES' ? 'Yes' : 'No'}`;
  if (word && mode === 'buy') {
    // +$0.5, +$1, +$5 add to what is typed; Max is the most that can go in,
    // the wallet's USDC or the room under the cap, whichever is smaller.
    presets = buyPresets(Number(toBaseUnits(amount)), remaining, usdcBalance.data === undefined ? undefined : Math.floor(usdcBalance.data * 1e6));
    const usdcUnits = toBaseUnits(amount);
    const sharesOut = usdcUnits > 0n ? sharesForUsdc(word, b, side, usdcUnits) : 0n;
    const cost = sharesOut > 0n ? estimateBuyCost(word, b, side, sharesOut) : 0n;
    const fee = (cost * feeBps) / 10000n;
    const preview = buyPreview(sharesOut, cost, fee, fees);
    headline = { label: `Payout if ${side === 'YES' ? 'Yes' : 'No'}`, value: payoutText(preview.payout) };
    detail = preview.multiplier ? `${preview.multiplier} on your pick · ${preview.fee}` : preview.fee;
    chips = [
      ...(oddsChip ? [oddsChip] : []),
      { value: `$${centsDown(Math.max(0, remainingUsd - amountNum))}`, caption: `left of ${MAX_POSITION_LABEL} max` },
    ];
    const limit = isPositionFull(remaining) ? `Position full. ${MAX_POSITION_LABEL} is the most on ${side}.` : buyLimitError(Number(usdcUnits), remaining, side);
    if (limit) warning = limit;
    else if (usdcBalance.data !== undefined && amountNum > usdcBalance.data) warning = `Not enough USDC. You have ${usd(usdcBalance.data, { dp: 2 })}.`;
  } else if (word) {
    // Selling is by percent of the position: nobody here sees a share.
    const shares = sellShares(heldSide, amount);
    const gross = shares > 0n ? estimateSellReturn(word, b, side, shares) : 0n;
    const fee = (gross * feeBps) / 10000n;
    const preview = sellPreview(heldSide, shares, gross - fee, fee, fees);
    headline = { label: 'You get now', value: payoutText(preview.receive) };
    detail = shares > 0n ? (preview.keeps > 0n ? `Keeps ${payoutText(preview.keeps)} riding on ${side} · ${preview.fee}` : `Your whole ${side} position · ${preview.fee}`) : preview.fee;
    chips = [...(oddsChip ? [oddsChip] : []), { value: payoutText(payoutFor(heldSide, fees.rakeBps)), caption: `pays if ${side === 'YES' ? 'Yes' : 'No'}` }];
    if (!viewed) warning = 'Connect a wallet to see what you hold.';
    else if (heldSide === 0n) warning = `You hold no ${side} on this word.`;
    presets = [25, 50, 75, 100].map((n) => ({ label: n === 100 ? 'All' : `${n}%`, value: String(n) }));
    actionLabel = `Swipe to Sell ${side === 'YES' ? 'Yes' : 'No'}`;
  }

  // Put the trade on chain. The plan is built here so a bad input is named
  // before anything is signed; everything after that is the shared pipeline.
  const submit = async () => {
    if (!sessionWallet || !word || !acct) return;
    setInputError(null);

    // Fees and a first-time token account are paid in SOL, and an embedded
    // wallet often holds only USDC. Say so plainly rather than let simulation
    // fail with "ResultWithNegativeLamports".
    if (sol.data !== undefined && sol.data < MIN_SOL_FOR_FEES) {
      setInputError(
        heldSide === 0n
          ? 'You need about 0.004 SOL for network fees and a refundable account deposit. Add SOL to your wallet to trade.'
          : 'You need about 0.004 SOL for network fees. Add SOL to your wallet to trade.',
      );
      return;
    }
    // The input is already held under the cap; this is the backstop.
    const limit = mode === 'buy' ? buyLimitError(Number(toBaseUnits(amount)), remaining, side) : null;
    if (limit) {
      setInputError(limit);
      return;
    }

    let instructions;
    let summary: { title: string; detail: string };
    let spendDelta: number;
    try {
      if (mode === 'buy') {
        const plan = await planBuy({ wallet: sessionWallet, market: acct, word, side, usdcUnits: toBaseUnits(amount) });
        instructions = plan.instructions;
        summary = {
          title: `You picked ${side === 'YES' ? 'Yes' : 'No'} on ${word.label}`,
          detail: `${usdc(plan.cost + plan.fee)} in, pays ${payoutText(payoutFor(plan.shares, fees.rakeBps))} if it wins`,
        };
        spendDelta = Number(plan.cost + plan.fee);
      } else {
        // A percent of what is held, so it can never ask for more than that:
        // the program would reject it, after the user had already signed.
        const shares = sellShares(heldSide, amount);
        if (shares <= 0n) throw new TradeInputError(`You hold no ${side} on this word.`);
        const plan = await planSell({ wallet: sessionWallet, market: acct, word, side, shares });
        instructions = plan.instructions;
        summary = {
          title: shares === heldSide ? `You sold all your ${side}` : `You sold ${amount}% of your ${side}`,
          detail: `${usdc(plan.net)} back to your wallet`,
        };
        spendDelta = -Number(plan.net);
      }
    } catch (e) {
      if (e instanceof TradeInputError) {
        setInputError(e.message);
        return;
      }
      throw e;
    }

    setResult(summary);
    const signature = await trade.run(instructions);
    if (!signature) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    recordSpend(id, currentKey, spendDelta, wordSpend.data?.[currentKey]);
    // The on-chain account and the positions route read the chain and update at
    // once; trades and the chart come through the indexer, so ask again shortly.
    const refresh = () => {
      void market.refetch();
      void positions.refetch();
      void trades.refetch();
      void wordSpend.refetch();
      void sol.refetch();
      void usdcBalance.refetch();
      void queryClient.invalidateQueries({ queryKey: keys.paidMarketChart(id) });
    };
    refresh();
    setTimeout(refresh, 4000);
    // A balance read can trail the confirmation by several seconds.
    setTimeout(refresh, 15000);
  };

  const closeSheet = () => {
    setPick(null);
    setResult(null);
    setInputError(null);
    trade.reset();
  };

  // Every word on the chart, traded or not, ending at its live price while
  // the market is open (see prepareSeries).
  const series = prepareSeries(
    acct.words.map((w) => ({
      key: String(w.wordIndex),
      label: w.label,
      history: chart.data?.words.find((c) => c.wordIndex === w.wordIndex)?.history ?? [],
    })),
    {
      initial: 0.5,
      now: Math.floor(now / 1000),
      current: Object.fromEntries(words.map((w) => [w.key, w.yesPrice])),
      live: status !== 'resolved',
    },
  );

  const openSheet = (key: string, s: Side) => {
    setPick({ idx: Number(key), side: s });
    setMode('buy');
    // $1 by default, or whatever is left under the cap if that is less.
    const target = acct.words[Number(key)];
    const room = target ? remainingFor(target.wordIndex, s) / 1e6 : 1;
    setAmount(room >= 1 ? '1' : room * 1e6 >= MIN_BUY_USDC ? centsDown(room) : '');
    // A failure from a previous word should not greet the next one.
    trade.reset();
    setResult(null);
    setInputError(null);
  };

  // Arriving from a tap on one word of a market card: open that word's sheet,
  // once. Done while rendering rather than in an effect because the market
  // account only arrives after mount, and this is React's own pattern for
  // state that follows a changed input.
  if (wordParam && handledWord !== wordParam) {
    setHandledWord(wordParam);
    const i = findWordParam(
      acct.words.map((w) => w.label),
      wordParam,
    );
    if (i >= 0 && open) openSheet(String(acct.words[i].wordIndex), 'YES');
  }

  const recent = (trades.data ?? []).slice(0, 8);

  // What the trade is short of, if anything: from the balance while typing,
  // or from the refusal after an attempt.
  const shortOf: 'USDC' | 'SOL' | null =
    mode === 'buy' && usdcBalance.data !== undefined && amountNum > usdcBalance.data
      ? 'USDC'
      : fundsShortfall(inputError ?? (trade.state.status === 'failed' ? trade.state.message : null));
  const openDeposit = (asset: 'USDC' | 'SOL') => {
    sheetRef.current?.close();
    setFund(asset);
  };

  return (
    <Screen back>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MarketHeader
          title={title}
          cover={cover}
          status={status}
          lockAt={lockAt}
          eventAt={meta.data?.event_start_time ? Date.parse(meta.data.event_start_time) : null}
          now={now}
          description={meta.data?.description}
          kind="paid-yesno"
        />
        <YourPositions connected={!!viewed} rows={heldRows} loading={!!viewed && positions.isPending} />
        {status === 'resolved' ? (
          <Link href={`/result/paid/${id}` as Href} asChild>
            <Button label="See results" tone="neutral" />
          </Link>
        ) : null}
        <WordList words={words} onPick={openSheet} open={open} held={heldBadges} quote={(w, s) => sideQuote(w.yesPrice, s, fees)} />

        <SectionTitle title="Odds over time" right={chart.data ? <Chip value={usd(chart.data.totalVolume / 1e6)} caption="volume" /> : undefined} />
        <Card>
          {/* Lines read as what a Yes pays, like everything else on an AMM market. */}
          <LineChart series={series} selectedKey={pick ? String(word?.wordIndex) : null} format={(p) => sideQuote(p, 'YES', fees)} />
        </Card>

        {recent.length > 0 ? (
          <>
            <SectionTitle title="Recent trades" />
            <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
              {recent.map((t, i) => (
                <Link key={t.signature} href={(t.username ? `/u/${encodeURIComponent(t.username)}` : `/positions?wallet=${t.trader}`) as Href} asChild>
                  <Pressable style={rowStyle(i === 0)} accessibilityRole="button">
                    <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                      <Text style={{ fontFamily: fonts.semibold }}>{t.username ?? shortAddress(t.trader)}</Text> {t.isBuy ? 'bought' : 'sold'}{' '}
                      <Text style={{ color: t.direction === 'YES' ? colors.yes : colors.no, fontFamily: fonts.semibold }}>{t.direction}</Text> {acct.words[t.wordIndex]?.label ?? ''}
                    </Text>
                    <Text style={type.money}>{usdc(t.cost)}</Text>
                  </Pressable>
                </Link>
              ))}
            </Card>
          </>
        ) : null}
        <ChatPreview eventId={chatEventId('paid-yesno', id)} title={title} focused={focused} now={now} />
        <SimilarMarkets currentKey={`paid-yesno:${id}`} />
        <FeaturedWords />
      </ScrollView>

      <BottomSheet
        ref={sheetRef}
        visible={!!pick && !!word}
        onClose={closeSheet}
        full
        header={<TradeSheetHeader cover={cover} word={word?.label ?? ''} market={title} />}
        // Once a transaction is in flight, closing the sheet would hide its
        // outcome without stopping it, so every way out is refused until then.
        locked={trade.state.status === 'working'}
        footer={
          trade.state.status === 'working' ? (
            // Same height as the control it stands in for, so the sheet does
            // not drop while the trade runs and rise again when it lands.
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
          ) : shortOf && open ? (
            <Button label={`Add ${shortOf}`} tone="gold" onPress={() => openDeposit(shortOf)} note={inputError ?? warning ?? undefined} />
          ) : (
            <SwipeButton
              label={open ? actionLabel : 'Market closed'}
              tone={side === 'YES' ? 'yes' : 'no'}
              disabled={!features.paidTrading || !open || !trade.ready || amountNum <= 0 || (mode === 'buy' && (isPositionFull(remaining) || buyLimitError(Number(toBaseUnits(amount)), remaining, side) !== null))}
              note={inputError ?? (!features.paidTrading ? PAUSED_NOTE : !open ? undefined : !trade.ready ? (trade.connecting ? 'Connecting your wallet' : 'Sign in to trade') : undefined)}
              onConfirm={() => void submit()}
            />
          )
        }
      >
        {trade.state.status !== 'idle' ? (
          <TradeProgress
            phase={trade.state.status === 'working' ? 'working' : trade.state.status === 'done' ? 'done' : trade.state.indeterminate ? 'pending' : 'failed'}
            minHeight={formHeight || undefined}
            title={trade.state.status === 'done' ? result?.title : undefined}
            detail={trade.state.status === 'done' ? result?.detail : trade.state.status === 'failed' ? trade.state.message : undefined}
          />
        ) : word && pick && sheetWord ? (
          <View style={{ flexGrow: 1 }} onLayout={(e) => setFormHeight(e.nativeEvent.layout.height)}>
            <TradeSheet
              word={sheetWord}
              mode={mode}
              onMode={(m) => {
                setMode(m);
                setAmount(m === 'buy' ? '1' : '');
              }}
              canSell={canSell}
              side={side}
              onSide={(s) => {
                setPick({ idx: pick.idx, side: s });
                if (mode === 'sell') setAmount('');
              }}
              amount={amount}
              onAmount={(v) => {
                // Like the website: a buy cannot be typed past the cap at all,
                // and a sell is a percent, so it stops at 100.
                if (mode === 'buy' && toBaseUnits(v) > BigInt(remaining)) return;
                if (mode === 'sell' && Number(v) > 100) return;
                setAmount(v);
                setInputError(null);
              }}
              unit={mode === 'buy' ? '$' : '%'}
              maxDecimals={2}
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

      {sessionWallet ? <DepositSheet key={fund ?? 'USDC'} visible={fund !== null} onClose={() => setFund(null)} wallet={sessionWallet} initialAsset={fund ?? 'USDC'} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
});
