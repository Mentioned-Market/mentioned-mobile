// Free majority board (V0_GUIDE section 7 step 6). Exactly bets_per_user
// picks; the submit button enables at that count and is disabled in v0.
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFreeBoard, useIsScreenFocused } from '@/api/queries';
import { potentialWin } from '@/chain/majorityWords';
import { getDisplayStatus } from '@/free/marketUtils';
import { tokens } from '@/lib/format';
import { toMs, useNow } from '@/lib/time';
import { useWallet } from '@/store/wallet';
import { Button } from '@/ui/button';
import { PINNED_BAR_HEIGHT, PinnedBar } from '@/ui/pinned-bar';
import { MarketHeader } from '@/ui/market-header';
import { Screen } from '@/ui/screen';
import { CardSkeleton, ErrorState } from '@/ui/states';
import { colors, spacing, type } from '@/ui/theme';
import { WordBoard, type BoardWord } from '@/ui/word-board';

export default function FreeMajorityScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const focused = useIsScreenFocused();
  const now = useNow(1000);
  const viewed = useWallet((s) => s.viewedAddress);
  const board = useFreeBoard(id, viewed, focused);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
  const betSize = m.play_tokens / Math.max(1, required);
  const pool = d.board.reduce((s, w) => s + w.staked, 0);
  // Same preview the website shows: your bet joins the pool and the word's stake.
  const takeout = Number(m.takeout_pct) || 0;
  const floor = Number(m.floor_multiple) || 1.5;
  const winFor = (staked: number) => potentialWin(staked, pool, betSize, takeout, floor);
  const mine = new Set((d.userEntry ?? []).map((e) => e.word_id));
  const entered = d.hasEntered && viewed;

  const words: BoardWord[] = [...d.board]
    .sort((a, b) => b.staked - a.staked)
    .map((w) => ({
      key: String(w.word_id),
      label: w.word,
      share: w.implied_prob,
      countLabel: `${w.bet_count} ${w.bet_count === 1 ? 'pick' : 'picks'} · ${tokens(w.staked)} tokens`,
      outcome: status === 'resolved' ? (w.resolved_outcome ? 'winner' : 'loser') : null,
      yours: mine.has(w.word_id),
      winLabel: `Wins ${tokens(winFor(w.staked))} tokens if said most`,
    }));

  const toggle = (key: string) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < required) next.add(key);
      return next;
    });
  };

  return (
    <Screen title="" back>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: PINNED_BAR_HEIGHT + spacing.md }]} showsVerticalScrollIndicator={false}>
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
          <Stat label="Per pick" value={`${tokens(betSize)} tokens`} />
          <Stat label="Picks" value={`${required} each`} />
        </View>
        <Text style={type.heading}>{open ? `Pick ${required} words` : 'Board'}</Text>
        <WordBoard words={words} selected={selected} onToggle={toggle} selectable={open && !entered} />
        {entered ? <Text style={type.muted}>You are in with {(d.userEntry ?? []).map((e) => e.word).join(' and ')}.</Text> : null}
        {d.recentBets.length > 0 ? (
          <>
            <Text style={type.heading}>Recent picks</Text>
            {d.recentBets.slice(0, 6).map((r) => (
              <Link key={r.id} href={(r.username ? `/u/${encodeURIComponent(r.username)}` : `/positions?wallet=${r.wallet}`) as Href} asChild>
                <Pressable style={styles.bet} accessibilityRole="button">
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
      {open && !entered ? (
        <PinnedBar
          title={`${selected.size} of ${required} picked`}
          subtitle={
            selected.size === 0
              ? `${tokens(betSize)} tokens on each`
              : `${words
                  .filter((w) => selected.has(w.key))
                  .map((w) => `${w.label} wins ${tokens(winFor(d.board.find((b) => String(b.word_id) === w.key)?.staked ?? 0))}`)
                  .join(' · ')}`
          }
          button={{ label: 'Submit picks', disabled: true }}
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
  bet: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
});
