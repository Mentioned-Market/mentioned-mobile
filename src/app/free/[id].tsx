// Free YES/NO market. Same structure as the paid one: word list with YES and
// NO prices, trade sheet from the bottom, positions under the rules.
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFreeChart, useFreeMarket, useFreePositions, useIsScreenFocused } from '@/api/queries';
import { sharesForTokens, virtualBuyCost, virtualSellReturn } from '@/free/lmsr';
import { getDisplayStatus } from '@/free/marketUtils';
import { tokens } from '@/lib/format';
import { toMs, useNow } from '@/lib/time';
import { useWallet } from '@/store/wallet';
import { BottomSheet } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { LineChart, type ChartSeries } from '@/ui/line-chart';
import { MarketHeader } from '@/ui/market-header';
import { Screen } from '@/ui/screen';
import { CardSkeleton, ErrorState } from '@/ui/states';
import { colors, spacing, type } from '@/ui/theme';
import { TradeSheet, type Preset, type QuoteLine, type SheetWord, type Side, type TradeMode } from '@/ui/trade-sheet';
import { WordList } from '@/ui/word-list';
import { YourPositions, type HeldRow } from '@/ui/your-positions';

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function FreeYesNoScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const focused = useIsScreenFocused();
  const now = useNow(1000);
  const viewed = useWallet((s) => s.viewedAddress);
  const market = useFreeMarket(id, focused);
  const positions = useFreePositions(id, viewed, focused);
  const chart = useFreeChart(id, focused);
  const [pick, setPick] = useState<{ wordId: number; side: Side } | null>(null);
  const [mode, setMode] = useState<TradeMode>('buy');
  const [amount, setAmount] = useState('50');

  if (market.isPending) {
    return (
      <Screen title="Loading" back>
        <CardSkeleton />
      </Screen>
    );
  }
  if (market.isError || !market.data) {
    return (
      <Screen title="Free YES/NO" back>
        <ErrorState error={market.error} onRetry={() => market.refetch()} />
      </Screen>
    );
  }

  const m = market.data.market;
  const ds = getDisplayStatus(m);
  const status = ds === 'cancelled' ? 'cancelled' : ds === 'resolved' || ds === 'closed' ? 'resolved' : ds === 'pending_resolution' ? 'pending' : 'open';
  const open = status === 'open';
  const b = Number(m.b_parameter);
  const words: SheetWord[] = market.data.words.map((w) => ({ key: String(w.id), label: w.word, yesPrice: w.yes_price, noPrice: w.no_price, outcome: w.resolved_outcome }));

  const balance = positions.data?.balance ?? (viewed ? 0 : m.play_tokens);
  const heldRows: HeldRow[] = (positions.data?.positions ?? []).flatMap((p) => {
    const rows: HeldRow[] = [];
    const w = market.data.words.find((x) => x.id === p.word_id);
    const net = p.tokens_received - p.tokens_spent;
    const amountLine = `${tokens(p.tokens_spent)} tokens in`;
    if (p.yes_shares > 0.005) rows.push({ key: `${p.word_id}y`, word: p.word, side: 'YES', amount: amountLine, value: `${fmt(p.yes_shares)} shares · worth ${tokens(p.yes_shares * (w?.yes_price ?? 0))}`, tone: net > 0 ? 'up' : undefined });
    if (p.no_shares > 0.005) rows.push({ key: `${p.word_id}n`, word: p.word, side: 'NO', amount: amountLine, value: `${fmt(p.no_shares)} shares · worth ${tokens(p.no_shares * (w?.no_price ?? 0))}`, tone: net > 0 ? 'up' : undefined });
    return rows;
  });
  const heldBadges: Record<string, string> = {};
  for (const p of positions.data?.positions ?? []) {
    const parts = [p.yes_shares > 0.005 ? `${fmt(p.yes_shares)} YES` : null, p.no_shares > 0.005 ? `${fmt(p.no_shares)} NO` : null].filter(Boolean);
    if (parts.length) heldBadges[String(p.word_id)] = parts.join(' · ');
  }

  const word = pick ? market.data.words.find((w) => w.id === pick.wordId) : null;
  const side: Side = pick?.side ?? 'YES';
  const held = word ? positions.data?.positions.find((p) => p.word_id === word.id) : undefined;
  const heldYes = held?.yes_shares ?? 0;
  const heldNo = held?.no_shares ?? 0;
  const heldSide = side === 'YES' ? heldYes : heldNo;
  const amountNum = Number(amount) || 0;
  let headline = { label: 'Est. shares', value: '0' };
  let lines: QuoteLine[] = [];
  let warning: string | null = null;
  let presets: Preset[] = [];
  let actionLabel = `Buy ${side}`;
  if (word && mode === 'buy') {
    const tokensIn = Math.min(amountNum, Math.max(0, balance));
    const sharesOut = tokensIn > 0 ? sharesForTokens(word.yes_qty, word.no_qty, side, tokensIn, b) : 0;
    const cost = sharesOut > 0 ? virtualBuyCost(word.yes_qty, word.no_qty, side, sharesOut, b) : 0;
    const avg = sharesOut > 0 ? cost / sharesOut : 0;
    headline = { label: 'Est. shares', value: fmt(sharesOut) };
    lines = [
      { label: 'Average price', value: sharesOut > 0 ? `${Math.round(avg * 100)}c` : '–' },
      { label: 'Cost', value: `${tokens(cost)} tokens` },
      { label: `If ${word.word} resolves ${side}`, value: `${tokens(sharesOut)} tokens`, strong: true },
    ];
    if (amountNum > balance) warning = `You have ${tokens(balance)} tokens on this market.`;
    presets = [25, 50, 75, 100].map((n) => ({ label: n === 100 ? 'Max' : `${n}%`, value: String(Math.floor((balance * n) / 100)) }));
    actionLabel = sharesOut > 0 ? `Buy ${side} for ${tokens(cost)} tokens` : `Buy ${side}`;
  } else if (word) {
    const capped = Math.min(amountNum, heldSide);
    const ret = capped > 0 ? virtualSellReturn(word.yes_qty, word.no_qty, side, capped, b) : 0;
    const avg = capped > 0 ? ret / capped : 0;
    headline = { label: 'You receive', value: `${tokens(ret)} tokens` };
    lines = [
      { label: 'Average price', value: capped > 0 ? `${Math.round(avg * 100)}c` : '–' },
      { label: `${side} shares held`, value: fmt(heldSide) },
    ];
    if (!viewed) warning = 'Connect a wallet to see what you hold.';
    else if (amountNum > heldSide) warning = `You hold ${fmt(heldSide)} ${side} shares on this word.`;
    presets = [25, 50, 75, 100].map((n) => ({ label: n === 100 ? 'Max' : `${n}%`, value: (Math.floor(((heldSide * n) / 100) * 100) / 100).toString() }));
    actionLabel = capped > 0 ? `Sell ${side} for ${tokens(ret)} tokens` : `Sell ${side}`;
  }

  const series: ChartSeries[] = (chart.data?.words ?? []).map((s) => ({
    key: String(s.word_id),
    label: s.word,
    points: s.history.map((h) => ({ x: Date.parse(h.t), y: h.yes })),
    highlight: pick ? s.word_id === word?.id : false,
  }));

  const openSheet = (key: string, s: Side) => {
    setPick({ wordId: Number(key), side: s });
    setMode('buy');
    setAmount('50');
  };

  return (
    <Screen title="" back>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MarketHeader
          title={m.title}
          cover={m.cover_image_url}
          status={status}
          paid={false}
          majority={false}
          lockAt={toMs(m.lock_time)}
          eventAt={toMs(m.event_start_time)}
          traderCount={market.data.traderCount}
          now={now}
          description={m.description}
        />
        <YourPositions
          connected={!!viewed}
          rows={heldRows}
          loading={!!viewed && positions.isPending}
          balanceLine={viewed ? `${tokens(balance)} tokens left` : `${tokens(m.play_tokens)} tokens to start`}
        />
        {status === 'resolved' || status === 'cancelled' ? (
          <Link href={`/result/free/${id}` as Href} asChild>
            <Button label="See results" tone="neutral" />
          </Link>
        ) : null}
        <Text style={type.heading}>{open ? 'Pick a side' : 'Words'}</Text>
        <WordList words={words} onPick={openSheet} open={open} held={heldBadges} />
        <Text style={type.heading}>Price history</Text>
        <LineChart series={series} />
        <View style={styles.footnote}>
          <Text style={type.muted}>Free markets pay out in play tokens. Profit converts to points at 0.5x.</Text>
        </View>
      </ScrollView>

      <BottomSheet visible={!!pick && !!word} onClose={() => setPick(null)} title={word?.word ?? ''} subtitle={m.title}>
        {word && pick ? (
          <TradeSheet
            word={{ key: String(word.id), label: word.word, yesPrice: word.yes_price, noPrice: word.no_price, outcome: word.resolved_outcome }}
            mode={mode}
            onMode={(mm) => {
              setMode(mm);
              setAmount(mm === 'buy' ? '50' : '');
            }}
            canSell
            side={side}
            onSide={(s) => {
              setPick({ wordId: pick.wordId, side: s });
              if (mode === 'sell') setAmount('');
            }}
            amount={amount}
            onAmount={setAmount}
            unit={mode === 'buy' ? 'tokens' : 'shares'}
            maxDecimals={mode === 'buy' ? 0 : 2}
            presets={presets}
            headline={headline}
            lines={lines}
            balanceLine={viewed ? `${tokens(balance)} tokens available` : `Every player starts with ${tokens(m.play_tokens)} tokens`}
            holdings={viewed ? { yes: fmt(heldYes), no: fmt(heldNo) } : null}
            warning={warning}
            open={open}
            action={{ label: open ? actionLabel : 'Market closed', tone: side === 'YES' ? 'yes' : 'no', disabled: true, note: open ? 'Trading arrives soon' : undefined }}
          />
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  footnote: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
