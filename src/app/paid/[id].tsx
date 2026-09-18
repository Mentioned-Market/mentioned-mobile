// Paid YES/NO market. Each word shows the chance it happens; tapping one opens
// the trade sheet as a full screen, where the side and the amount are chosen.
// Quotes use the ported AMM maths against the decoded account.
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
import { deserializeMarketAccount, estimateBuyCost, estimateSellReturn, impliedYesPrice, MarketStatus, sharesForUsdc } from '@/chain/amm';
import { base64ToBytes } from '@/lib/bytes';
import { pct, shares as fmtShares, shortAddress, usd, usdc } from '@/lib/format';
import { fromBaseUnits, fromBaseUnitsFloor2, toBaseUnits } from '@/lib/units';
import { useNow } from '@/lib/use-now';
import { useSession } from '@/store/session';
import { useActiveWallet } from '@/store/active-wallet';
import { planBuy, planSell, TradeInputError } from '@/trade/amm';
import { MIN_SOL_FOR_FEES } from '@/trade/majority';
import { fundsShortfall } from '@/trade/funds';
import { effectiveSpend, MAX_POSITION_USDC, remainingAllowance, spendKey, useSessionSpend } from '@/trade/spend';
import { useTrade } from '@/trade/use-trade';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { Card, SectionTitle, rowStyle } from '@/ui/card';
import { Chip } from '@/ui/chip';
import { DepositSheet } from '@/ui/fund-sheet';
import { PAUSED_NOTE, useFeatures } from '@/ui/config-gate';
import { LineChart, type ChartSeries } from '@/ui/line-chart';
import { MarketHeader, statusFromLock } from '@/ui/market-header';
import { Screen } from '@/ui/screen';
import { CardSkeleton, ErrorState } from '@/ui/states';
import { SwipeButton } from '@/ui/swipe-button';
import { colors, fonts, spacing, type } from '@/ui/theme';
import { TradeProgress } from '@/ui/trade-progress';
import { TradeSheet, TradeSheetHeader, type Preset, type SheetChip, type SheetWord, type Side, type TradeMode } from '@/ui/trade-sheet';
import { WordList } from '@/ui/word-list';
import { YourPositions, type HeldRow } from '@/ui/your-positions';

/** Dollars, rounded DOWN to the cent, so a preset can never land a cent over the cap. */
const centsDown = (usd: number) => (Math.floor(usd * 100) / 100).toFixed(2);

export default function PaidYesNoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const focused = useIsScreenFocused();
  const now = useNow(1000);
  const viewed = useActiveWallet();
  const market = usePaidMarket(id, focused);
  const meta = usePaidMarketMetadata(id);
  const chart = usePaidMarketChart(id, focused);
  const trades = usePaidMarketTrades(id, focused);
  const positions = usePaidMarketUserPositions(viewed, focused);
  // What this wallet has already put into each (word, side), for the $2 cap,
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
    if (yes > 0n) rows.push({ key: `${p.wordIndex}y`, word: p.wordLabel, side: 'YES', amount: `${fmtShares(yes)} shares · ${costText}`, value: `Worth ${usd(value)}`, tone });
    if (no > 0n) rows.push({ key: `${p.wordIndex}n`, word: p.wordLabel, side: 'NO', amount: `${fmtShares(no)} shares · ${costText}`, value: `Worth ${usd(value)}`, tone });
    return rows;
  });
  const heldBadges: Record<string, string> = {};
  for (const p of mine) {
    const parts = [BigInt(p.yesShares) > 0n ? `${fmtShares(p.yesShares)} YES` : null, BigInt(p.noShares) > 0n ? `${fmtShares(p.noShares)} NO` : null].filter(Boolean);
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
  const chance = sheetWord ? (side === 'YES' ? sheetWord.yesPrice : sheetWord.noPrice) : 0;
  let headline = { label: 'Potential return', value: '$0.00' };
  let detail: string | null = null;
  let chips: SheetChip[] = [];
  let warning: string | null = null;
  let presets: Preset[] = [];
  let actionLabel = `Swipe to Predict ${side === 'YES' ? 'Yes' : 'No'}`;
  if (word && mode === 'buy') {
    // Presets are shares of what is left under the cap, as on the website, so
    // no quick amount can be refused by it.
    presets = [25, 50, 75, 100].map((n) => ({ label: n === 100 ? 'Max' : `${n}%`, value: centsDown((remainingUsd * n) / 100) }));
    const usdcUnits = toBaseUnits(amount);
    const sharesOut = usdcUnits > 0n ? sharesForUsdc(word, b, side, usdcUnits) : 0n;
    const cost = sharesOut > 0n ? estimateBuyCost(word, b, side, sharesOut) : 0n;
    const fee = (cost * feeBps) / 10000n;
    const avg = sharesOut > 0n ? Number(cost + fee) / Number(sharesOut) : 0;
    headline = { label: 'Potential return', value: usdc(sharesOut) };
    detail = sharesOut > 0n ? `${fmtShares(sharesOut)} shares · avg ${pct(avg)} · fee ${usdc(fee)} · total ${usdc(cost + fee)}` : null;
    chips = [
      { value: pct(chance), caption: 'chance', tone: side === 'YES' ? 'yes' : 'no' },
      { value: `$${centsDown(Math.max(0, remainingUsd - amountNum))}`, caption: `left of $${(MAX_POSITION_USDC / 1e6).toFixed(0)} max` },
    ];
    if (remaining <= 0) warning = `Position full. $${(MAX_POSITION_USDC / 1e6).toFixed(2)} is the most on ${side} while paid markets are in testing.`;
    else if (usdcBalance.data !== undefined && amountNum > usdcBalance.data) warning = `Not enough USDC. You have ${usd(usdcBalance.data, { dp: 2 })}.`;
  } else if (word) {
    const sharesIn = toBaseUnits(amount);
    const capped = sharesIn > heldSide ? heldSide : sharesIn;
    const gross = capped > 0n ? estimateSellReturn(word, b, side, capped) : 0n;
    const fee = (gross * feeBps) / 10000n;
    const net = gross - fee;
    const avg = capped > 0n ? Number(net) / Number(capped) : 0;
    headline = { label: 'You receive', value: usdc(net) };
    detail = capped > 0n ? `avg ${pct(avg)} · fee ${usdc(fee)}` : null;
    chips = [
      { value: pct(chance), caption: 'chance', tone: side === 'YES' ? 'yes' : 'no' },
      { value: fmtShares(heldSide), caption: `${side} held` },
    ];
    if (!viewed) warning = 'Connect a wallet to see what you hold.';
    else if (sharesIn > heldSide) warning = `You hold ${fmtShares(heldSide)} ${side} shares on this word.`;
    // Fractions round DOWN to the cent so none can ask for more than is held.
    // Max is the exact holding: rounding it to two places could land a hair
    // above it, which showed a false "you hold" warning, or below it, which
    // would leave dust behind in the account.
    presets = [25, 50, 75, 100].map((n) => ({
      label: n === 100 ? 'Max' : `${n}%`,
      value: n === 100 ? fromBaseUnits(heldSide) : fromBaseUnitsFloor2((heldSide * BigInt(n)) / 100n),
    }));
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
    if (mode === 'buy' && toBaseUnits(amount) > BigInt(remaining)) {
      setInputError(`$2 is the most per position while paid markets are in testing. You can add $${centsDown(remainingUsd)} more on ${side}.`);
      return;
    }

    let instructions;
    let summary: { title: string; detail: string };
    let spendDelta: number;
    try {
      if (mode === 'buy') {
        const plan = await planBuy({ wallet: sessionWallet, market: acct, word, side, usdcUnits: toBaseUnits(amount) });
        instructions = plan.instructions;
        summary = { title: `You bought ${fmtShares(plan.shares)} ${side}`, detail: `${word.label} for ${usdc(plan.cost + plan.fee)}` };
        spendDelta = Number(plan.cost + plan.fee);
      } else {
        // Never offer to sell more than is actually held: the program would
        // reject it, after the user had already signed.
        const asked = toBaseUnits(amount);
        const shares = asked > heldSide ? heldSide : asked;
        const plan = await planSell({ wallet: sessionWallet, market: acct, word, side, shares });
        instructions = plan.instructions;
        summary = { title: `You sold ${fmtShares(shares)} ${side}`, detail: `${usdc(plan.net)} back to your wallet` };
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

  const series: ChartSeries[] = (chart.data?.words ?? []).map((s) => ({
    key: String(s.wordIndex),
    label: acct.words[s.wordIndex]?.label ?? `#${s.wordIndex}`,
    points: s.history.map((h) => ({ x: h.t, y: h.p })),
    highlight: pick ? s.wordIndex === word?.wordIndex : false,
  }));

  const openSheet = (key: string, s: Side) => {
    setPick({ idx: Number(key), side: s });
    setMode('buy');
    // $1 by default, or whatever is left under the cap if that is less.
    const target = acct.words[Number(key)];
    const room = target ? remainingFor(target.wordIndex, s) / 1e6 : 1;
    setAmount(room >= 1 ? '1' : room > 0 ? centsDown(room) : '');
    // A failure from a previous word should not greet the next one.
    trade.reset();
    setResult(null);
    setInputError(null);
  };

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
        />
        <YourPositions connected={!!viewed} rows={heldRows} loading={!!viewed && positions.isPending} />
        {status === 'resolved' ? (
          <Link href={`/result/paid/${id}` as Href} asChild>
            <Button label="See results" tone="neutral" />
          </Link>
        ) : null}
        <WordList words={words} onPick={openSheet} open={open} held={heldBadges} />

        <SectionTitle title="Chance over time" right={chart.data ? <Chip value={usd(chart.data.totalVolume / 1e6)} caption="volume" /> : undefined} />
        <Card>
          <LineChart series={series} />
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
              disabled={!features.paidTrading || !open || !trade.ready || amountNum <= 0 || (mode === 'buy' && remaining <= 0)}
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
          <View onLayout={(e) => setFormHeight(e.nativeEvent.layout.height)}>
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
                // Like the website: a buy cannot be typed past the cap at all.
                if (mode === 'buy' && toBaseUnits(v) > BigInt(remaining)) return;
                setAmount(v);
                setInputError(null);
              }}
              unit={mode === 'buy' ? '$' : 'shares'}
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
