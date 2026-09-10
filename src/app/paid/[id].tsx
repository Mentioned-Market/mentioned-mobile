// Paid YES/NO market. Words list vertically with YES and NO prices; tapping a
// side opens the trade sheet from the bottom. Your positions sit under the
// rules. Quotes use the ported AMM maths against the decoded account.
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useIsScreenFocused, usePaidMarket, usePaidMarketChart, usePaidMarketMetadata, usePaidMarketTrades, usePaidMarketUserPositions } from '@/api/queries';
import { deserializeMarketAccount, estimateBuyCost, estimateSellReturn, impliedYesPrice, MarketStatus, sharesForUsdc } from '@/chain/amm';
import { base64ToBytes } from '@/lib/bytes';
import { shares as fmtShares, shortAddress, usd, usdc } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { useWallet } from '@/store/wallet';
import { BottomSheet } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { LineChart, type ChartSeries } from '@/ui/line-chart';
import { MarketHeader, statusFromLock } from '@/ui/market-header';
import { Screen } from '@/ui/screen';
import { CardSkeleton, ErrorState } from '@/ui/states';
import { colors, spacing, type } from '@/ui/theme';
import { TradeSheet, type Preset, type QuoteLine, type SheetWord, type Side, type TradeMode } from '@/ui/trade-sheet';
import { WordList } from '@/ui/word-list';
import { YourPositions, type HeldRow } from '@/ui/your-positions';

const BUY_PRESETS: Preset[] = [
  { label: '$1', value: '1' },
  { label: '$2', value: '2' },
  { label: '$5', value: '5' },
  { label: '$10', value: '10' },
];

export default function PaidYesNoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const focused = useIsScreenFocused();
  const now = useNow(1000);
  const viewed = useWallet((s) => s.viewedAddress);
  const market = usePaidMarket(id, focused);
  const meta = usePaidMarketMetadata(id);
  const chart = usePaidMarketChart(id, focused);
  const trades = usePaidMarketTrades(id, focused);
  const positions = usePaidMarketUserPositions(viewed, focused);
  const [pick, setPick] = useState<{ idx: number; side: Side } | null>(null);
  const [modeChoice, setMode] = useState<TradeMode>('buy');
  const [amount, setAmount] = useState('1');

  const acct = useMemo(() => (market.data ? deserializeMarketAccount(base64ToBytes(market.data.account)) : null), [market.data]);

  if (market.isPending) {
    return (
      <Screen title="Loading" back>
        <CardSkeleton />
      </Screen>
    );
  }
  if (market.isError || !acct) {
    return (
      <Screen title="Paid YES/NO" back>
        <ErrorState error={market.error ?? new Error('Could not decode the market account')} onRetry={() => market.refetch()} />
      </Screen>
    );
  }

  const b = acct.liquidityParamB;
  const lockAt = Number(acct.locksAt) * 1000;
  const status = statusFromLock(lockAt, acct.status === MarketStatus.Resolved ? 'resolved' : null, now);
  const open = status === 'open';
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
    if (yes > 0n) rows.push({ key: `${p.wordIndex}y`, word: p.wordLabel, side: 'YES', amount: `${fmtShares(yes)} shares · cost ${usd(cost)}`, value: `Worth ${usd(value)}`, tone: value > cost ? 'up' : value < cost ? 'down' : undefined });
    if (no > 0n) rows.push({ key: `${p.wordIndex}n`, word: p.wordLabel, side: 'NO', amount: `${fmtShares(no)} shares · cost ${usd(cost)}`, value: `Worth ${usd(value)}`, tone: value > cost ? 'up' : value < cost ? 'down' : undefined });
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

  // Sell is offered only against something you actually hold. Deriving the mode
  // rather than trusting the stored choice means a position that empties while
  // the sheet is open cannot strand the user in a Sell tab that no longer has a
  // control to leave it.
  const canSell = heldYes > 0n || heldNo > 0n;
  const mode: TradeMode = canSell ? modeChoice : 'buy';

  const amountNum = Number(amount) || 0;
  const feeBps = BigInt(acct.tradeFeeBps);
  let headline = { label: 'Est. shares', value: '0' };
  let lines: QuoteLine[] = [];
  let warning: string | null = null;
  let presets = BUY_PRESETS;
  let actionLabel = `Buy ${side}`;
  if (word && mode === 'buy') {
    const usdcUnits = BigInt(Math.floor(amountNum * 1e6));
    const sharesOut = usdcUnits > 0n ? sharesForUsdc(word, b, side, usdcUnits) : 0n;
    const cost = sharesOut > 0n ? estimateBuyCost(word, b, side, sharesOut) : 0n;
    const fee = (cost * feeBps) / 10000n;
    const avg = sharesOut > 0n ? Number(cost + fee) / Number(sharesOut) : 0;
    headline = { label: 'Est. shares', value: fmtShares(sharesOut) };
    lines = [
      { label: 'Average price', value: sharesOut > 0n ? `${Math.round(avg * 100)}c` : '–' },
      { label: `Fee (${acct.tradeFeeBps / 100}%)`, value: usdc(fee) },
      { label: 'Total cost', value: usdc(cost + fee) },
      { label: `If ${word.label} resolves ${side}`, value: usdc(sharesOut), strong: true },
    ];
    actionLabel = sharesOut > 0n ? `Buy ${side} for ${usdc(cost + fee)}` : `Buy ${side}`;
  } else if (word) {
    const sharesIn = BigInt(Math.floor(amountNum * 1e6));
    const capped = sharesIn > heldSide ? heldSide : sharesIn;
    const gross = capped > 0n ? estimateSellReturn(word, b, side, capped) : 0n;
    const fee = (gross * feeBps) / 10000n;
    const net = gross - fee;
    const avg = capped > 0n ? Number(net) / Number(capped) : 0;
    headline = { label: 'You receive', value: usdc(net) };
    lines = [
      { label: 'Average price', value: capped > 0n ? `${Math.round(avg * 100)}c` : '–' },
      { label: `Fee (${acct.tradeFeeBps / 100}%)`, value: usdc(fee) },
      { label: `${side} shares held`, value: fmtShares(heldSide) },
    ];
    if (!viewed) warning = 'Connect a wallet to see what you hold.';
    else if (sharesIn > heldSide) warning = `You hold ${fmtShares(heldSide)} ${side} shares on this word.`;
    const pct = (n: number) => fmtShares((heldSide * BigInt(n)) / 100n).replace(/,/g, '');
    presets = [25, 50, 75, 100].map((n) => ({ label: n === 100 ? 'Max' : `${n}%`, value: pct(n) }));
    actionLabel = capped > 0n ? `Sell ${side} for ${usdc(net)}` : `Sell ${side}`;
  }

  const series: ChartSeries[] = (chart.data?.words ?? []).map((s) => ({
    key: String(s.wordIndex),
    label: acct.words[s.wordIndex]?.label ?? `#${s.wordIndex}`,
    points: s.history.map((h) => ({ x: h.t, y: h.p })),
    highlight: pick ? s.wordIndex === word?.wordIndex : false,
  }));

  const openSheet = (key: string, s: Side) => {
    setPick({ idx: Number(key), side: s });
    setMode('buy');
    setAmount('1');
  };

  return (
    <Screen title="" back>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MarketHeader
          title={meta.data?.title ?? `Market ${id}`}
          cover={meta.data?.cover_image_url ?? null}
          status={status}
          paid
          majority={false}
          lockAt={lockAt}
          eventAt={meta.data?.event_start_time ? Date.parse(meta.data.event_start_time) : null}
          traderCount={null}
          now={now}
          description={meta.data?.description}
        />
        <YourPositions connected={!!viewed} rows={heldRows} loading={!!viewed && positions.isPending} />
        {status === 'resolved' ? (
          <Link href={`/result/paid/${id}` as Href} asChild>
            <Button label="See results" tone="neutral" />
          </Link>
        ) : null}
        <View style={styles.stats}>
          <Stat label="Vault" value={usdc(market.data?.vaultAmount ?? '0')} />
          <Stat label="Volume" value={chart.data ? usd(chart.data.totalVolume / 1e6) : '–'} />
          <Stat label="Words" value={String(acct.numWords)} />
        </View>
        <Text style={type.heading}>{open ? 'Pick a side' : 'Words'}</Text>
        <WordList words={words} onPick={openSheet} open={open} held={heldBadges} />
        <Text style={type.heading}>Price history</Text>
        <LineChart series={series} />
        <Text style={type.heading}>Recent trades</Text>
        {(trades.data ?? []).slice(0, 8).map((t) => (
          <Link key={t.signature} href={(t.username ? `/u/${encodeURIComponent(t.username)}` : `/positions?wallet=${t.trader}`) as Href} asChild>
            <Pressable style={styles.trade} accessibilityRole="button">
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                <Text style={{ color: colors.gold }}>{t.username ?? shortAddress(t.trader)}</Text> {t.isBuy ? 'bought' : 'sold'}{' '}
                <Text style={{ color: t.direction === 'YES' ? colors.yes : colors.no }}>{t.direction}</Text> {acct.words[t.wordIndex]?.label ?? ''}
              </Text>
              <Text style={type.money}>{usdc(t.cost)}</Text>
            </Pressable>
          </Link>
        ))}
        {trades.data && trades.data.length === 0 ? <Text style={type.muted}>No trades yet</Text> : null}
      </ScrollView>

      <BottomSheet
        visible={!!pick && !!word}
        onClose={() => setPick(null)}
        title={word?.label ?? ''}
        subtitle={meta.data?.title}
        footer={
          <Button
            label={open ? actionLabel : 'Market closed'}
            tone={side === 'YES' ? 'yes' : 'no'}
            disabled
            note={open ? 'Trading arrives soon' : undefined}
          />
        }
      >
        {word && pick ? (
          <TradeSheet
            word={words[pick.idx]}
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
            onAmount={setAmount}
            unit={mode === 'buy' ? '$' : 'shares'}
            maxDecimals={2}
            presets={presets}
            headline={headline}
            lines={lines}
            holdings={viewed ? { yes: fmtShares(heldYes), no: fmtShares(heldNo) } : null}
            warning={warning}
            open={open}
          />
        ) : null}
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
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 2 },
  trade: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
});
