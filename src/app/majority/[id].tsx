// Paid majority board (V0_GUIDE section 7 step 3). Read-only: the board comes
// from the route, market state from the decoded on-chain account.
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useIsScreenFocused, usePaidMajorityMarket, usePaidMajorityMetadata, usePaidMajorityPositions } from '@/api/queries';
import { deserializeMajorityMarket, MajorityStatus, WordOutcome } from '@/chain/majority';
import { base64ToBytes } from '@/lib/bytes';
import { usd, usdc } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { useWallet } from '@/store/wallet';
import { Button } from '@/ui/button';
import { PINNED_BAR_HEIGHT, PinnedBar } from '@/ui/pinned-bar';
import { MarketHeader, statusFromLock } from '@/ui/market-header';
import { Screen } from '@/ui/screen';
import { CardSkeleton, ErrorState } from '@/ui/states';
import { colors, spacing, type } from '@/ui/theme';
import { WordBoard, type BoardWord } from '@/ui/word-board';

export default function PaidMajorityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const focused = useIsScreenFocused();
  const now = useNow(1000);
  const viewed = useWallet((s) => s.viewedAddress);
  const market = usePaidMajorityMarket(id, focused);
  const meta = usePaidMajorityMetadata();
  const mine = usePaidMajorityPositions(id, viewed, focused);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const acct = useMemo(() => (market.data ? deserializeMajorityMarket(base64ToBytes(market.data.account)) : null), [market.data]);
  const info = meta.data?.find((m) => m.market_id === id);

  if (market.isPending) {
    return (
      <Screen title="Loading" back>
        <CardSkeleton />
      </Screen>
    );
  }
  if (market.isError || !market.data || !acct) {
    return (
      <Screen title="Paid majority" back>
        <ErrorState error={market.error ?? new Error('Could not decode the market account')} onRetry={() => market.refetch()} />
      </Screen>
    );
  }

  const lockAt = Number(acct.lockTs) * 1000;
  const finished = acct.status === MajorityStatus.Resolved ? 'resolved' : acct.status === MajorityStatus.Cancelled ? 'cancelled' : null;
  const status = statusFromLock(lockAt, finished, now);
  const open = status === 'open';
  const unitUsd = Number(acct.unitPrice) / 1e6;
  const myHashes = new Set((mine.data ?? []).map((p) => p.wordHash));
  // Payout preview for a fresh unit on a word if it wins: pro-rata share of the
  // pool after the fee, same estimate the website shows. Floor is 1.0x on-chain.
  const feeRate = acct.feeBps / 10_000;
  const totalUnits = Number(market.data.totalUnits);
  const winIfSaidMost = (wordUnits: number) => ((totalUnits + 1) * unitUsd * (1 - feeRate)) / (wordUnits + 1);

  const words: BoardWord[] = [...market.data.board]
    .sort((a, b) => Number(b.units) - Number(a.units))
    .map((w) => ({
      key: w.wordHash,
      label: w.word,
      share: w.oddsPct / 100,
      countLabel: `${w.units} ${Number(w.units) === 1 ? 'unit' : 'units'} · ${usd(Number(w.units) * unitUsd)}`,
      outcome: finished === 'resolved' ? (w.outcome === WordOutcome.Winner ? 'winner' : 'loser') : null,
      yours: myHashes.has(w.wordHash),
      winLabel: `Wins ${usd(winIfSaidMost(Number(w.units)))} if said most`,
    }));

  const toggle = (key: string) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const total = selected.size * unitUsd;
  const picked = words.filter((w) => selected.has(w.key));
  const wins = picked.map((w) => winIfSaidMost(Number(market.data.board.find((b) => b.wordHash === w.key)?.units ?? 0)));
  const winRange = wins.length === 0 ? '' : wins.length === 1 ? `wins ${usd(wins[0])}` : `wins ${usd(Math.min(...wins))} to ${usd(Math.max(...wins))}`;

  return (
    <Screen title="" back>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: PINNED_BAR_HEIGHT + spacing.md }]} showsVerticalScrollIndicator={false}>
        <MarketHeader
          title={info?.title ?? `Market ${id}`}
          cover={info?.cover_image_url ?? null}
          status={status}
          paid
          majority
          lockAt={lockAt}
          eventAt={info?.event_start_time ? Date.parse(info.event_start_time) : null}
          traderCount={market.data.traderCount}
          now={now}
          description={info?.description}
        />
        {finished ? (
          <Link href={`/result/majority/${id}` as Href} asChild>
            <Button label="See results" tone="neutral" />
          </Link>
        ) : null}
        <View style={styles.stats}>
          <Stat label="Pool" value={usdc(market.data.vaultAmount)} />
          <Stat label="Per word" value={usd(unitUsd)} />
          <Stat label="Units" value={market.data.totalUnits} />
        </View>
        <Text style={type.heading}>{open ? 'Pick the word said the most' : 'Board'}</Text>
        <WordBoard words={words} selected={selected} onToggle={toggle} selectable={open} />
        {viewed && mine.data && mine.data.length > 0 ? (
          <Text style={type.muted}>
            Your picks: {mine.data.map((p) => `${p.word} ×${p.units}`).join(', ')}
          </Text>
        ) : null}
      </ScrollView>
      {open ? (
        <PinnedBar
          title={selected.size === 0 ? 'Tap words to pick' : `${selected.size} ${selected.size === 1 ? 'word' : 'words'} · ${usd(total)}`}
          subtitle={selected.size === 0 ? `${usd(unitUsd)} each, paid in USDC` : `${picked.map((w) => w.label).join(', ')} · ${winRange}`}
          button={{ label: selected.size === 0 ? 'Buy' : `Buy for ${usd(total)}`, disabled: true }}
          note="Trading arrives soon"
        />
      ) : null}
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
});
