// Freezes real production responses into test/fixtures so the unit tests run
// offline and deterministically. Re-run with `npm run fixtures` when a route
// shape changes; the contract test is what tells you it has.
//
// Large arrays are trimmed: the tests care about shape and about the maths,
// not about having every row.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { API_BASE } from '../src/config';

const DIR = join(__dirname, '..', 'test', 'fixtures');
// A wallet with positions across all three market families (public data).
const WALLET = '49GT1N8mRLp4Q9JYJDRR3YopGtfHFGTrwg6cmbm3u2fY';
const USERNAME = 'Michael_Donnn';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

function write(name: string, data: unknown) {
  writeFileSync(join(DIR, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`  ${name}.json`);
}

/** Keep the first n entries of an array field so fixtures stay readable. */
function trim<T extends Record<string, unknown>>(obj: T, field: keyof T, n: number): T {
  const v = obj[field];
  return Array.isArray(v) ? { ...obj, [field]: v.slice(0, n) } : obj;
}

type ListEntry = { marketId: string; status: number; words: unknown[] };

async function main() {
  mkdirSync(DIR, { recursive: true });
  console.log('capturing fixtures from', API_BASE);

  // ── Paid YES/NO (AMM) ─────────────────────────────────────────────
  const ammList = await get<{ markets: ListEntry[] }>('/api/paid-markets/list');
  const amm = ammList.markets[0];
  write('paid-markets-list', { markets: ammList.markets.slice(0, 4) });
  const ammAccount = await get<{ account: string; vaultAmount: string }>(`/api/paid-markets/market/${amm.marketId}`);
  // The list route's prices are the website's own numbers: the decoder and
  // impliedYesPrice must reproduce them from the raw bytes alone.
  write('paid-market-account', { marketId: amm.marketId, ...ammAccount, listEntry: amm });
  write('paid-market-metadata', await get(`/api/paid-markets/metadata?id=${amm.marketId}`));
  const chart = await get<{ words: { history: unknown[] }[]; totalVolume: number }>(`/api/paid-markets/chart?id=${amm.marketId}`);
  write('paid-market-chart', { ...chart, words: chart.words.map((w) => trim(w as Record<string, unknown>, 'history', 5)) });
  const trades = await get<{ trades: unknown[] }>(`/api/paid-markets/trades?id=${amm.marketId}`);
  write('paid-market-trades', { trades: trades.trades.slice(0, 5) });

  // ── Paid majority ─────────────────────────────────────────────────
  const majList = await get<{ markets: ListEntry[] }>('/api/paid-majority/list');
  const maj = majList.markets[0];
  const resolvedMaj = majList.markets.find((m) => m.status === 1) ?? maj;
  write('paid-majority-list', { markets: majList.markets.slice(0, 4) });
  const majAccount = await get<{ account: string; board: unknown[]; totalUnits: string }>(`/api/paid-majority/market/${maj.marketId}`);
  write('paid-majority-market', { marketId: maj.marketId, ...majAccount });
  write('paid-majority-metadata', (await get<unknown[]>('/api/paid-majority/metadata')).slice(0, 3));
  write('paid-majority-results', await get(`/api/paid-majority/${resolvedMaj.marketId}/results`));
  write('paid-majority-my-positions', await get(`/api/paid-majority/my-positions?id=${maj.marketId}&wallet=${WALLET}`));

  // ── Free markets ──────────────────────────────────────────────────
  const freeList = await get<{ markets: { id: number; market_type: string; status: string }[] }>('/api/custom');
  const sheet = freeList.markets.find((m) => m.market_type !== 'majority') ?? freeList.markets[0];
  const board = freeList.markets.find((m) => m.market_type === 'majority') ?? freeList.markets[0];
  const resolvedFree = freeList.markets.find((m) => m.status === 'resolved') ?? freeList.markets[0];
  write('custom-list', { markets: freeList.markets.slice(0, 4) });
  write('custom-market', await get(`/api/custom/${sheet.id}`));
  write('custom-positions', await get(`/api/custom/${sheet.id}/positions?wallet=${WALLET}`));
  const boardData = await get<Record<string, unknown>>(`/api/custom/${board.id}/board?wallet=${WALLET}`);
  write('custom-board', trim(boardData, 'recentBets', 5));
  const freeChart = await get<{ words: { history: unknown[] }[] }>(`/api/custom/${sheet.id}/chart`);
  write('custom-chart', { words: freeChart.words.map((w) => trim(w as Record<string, unknown>, 'history', 5)) });
  const results = await get<{ leaderboard: unknown[] }>(`/api/custom/${resolvedFree.id}/results`);
  write('custom-results', { leaderboard: results.leaderboard.slice(0, 5) });
  const activity = await get<Record<string, unknown>>(`/api/custom/user-activity?wallet=${WALLET}`);
  write('custom-user-activity', trim(trim(activity, 'positions', 5), 'trades', 5));

  // ── Positions and user ────────────────────────────────────────────
  write('paid-majority-user-positions', await get(`/api/paid-majority/user-positions?wallet=${WALLET}`));
  write('paid-markets-user-positions', await get(`/api/paid-markets/user-positions?wallet=${WALLET}`));
  write('profile', await get(`/api/profile?wallet=${WALLET}`));

  // Arena and referrals. The team avatar is a data URL of up to a megabyte, and
  // the app never reads it from this route, so it is not stored.
  const teams = await get<{ data: { team_slug: string }[] }>('/api/teams/leaderboard?arena=world-cup');
  write('teams-leaderboard', { ...teams, data: teams.data.slice(0, 4) });
  const teamSlug = teams.data[0]?.team_slug;
  if (teamSlug) {
    const profile = await get<{ team: Record<string, unknown>; members: { wallet: string }[] }>(`/api/teams/${teamSlug}`);
    write('team-profile', { ...profile, team: { ...profile.team, pfp_data: null } });
    const member = profile.members[0]?.wallet;
    if (member) {
      const mine = await get<{ team: Record<string, unknown> | null }>(`/api/teams/my-team?wallet=${member}&arena=world-cup`);
      write('team-my-team', { team: mine.team ? { ...mine.team, pfp_data: null } : null });
    }
  }
  // The medal board is captured from the season that has one. Three contenders
  // a medal is all the route sends, so nothing needs trimming.
  write('teams-bounties', await get('/api/teams/bounties?arena=worlds-fair'));
  // The top3-* fixtures are NOT captured here. They come from staging, where
  // markets that pay the top three exist (docs/MM_V2_SPEC.md): two paid market
  // routes, two free boards (one with a tie for 1st) and the two list entries.
  // Re-capture them by hand from mentioned-staging.up.railway.app if the shapes change.
  write('referral', trim(await get(`/api/referral?wallet=${WALLET}`), 'referredUsers', 5));
  const publicProfile = await get<Record<string, unknown>>(`/api/profile/${USERNAME}`);
  const { pointHistory, freeMarket, ...restProfile } = publicProfile as Record<string, unknown> & { freeMarket: Record<string, unknown> };
  write('public-profile', { ...restProfile, pointHistory: (pointHistory as unknown[]).slice(0, 3), freeMarket: trim(trim(freeMarket, 'positions', 3), 'trades', 3) });
  const board2 = await get<{ data: unknown[] }>('/api/polymarket/leaderboard/points?sort=weekly');
  write('leaderboard', { ...board2, data: board2.data.slice(0, 5) });
  write('prize-pool', await get('/api/prize-pool'));
  write('raffle', await get(`/api/raffle/tickets?wallet=${WALLET}`));
  write('search', await get('/api/search?q=mich'));

  console.log('done');
}

main().catch((e) => {
  console.error('capture failed:', e);
  process.exit(1);
});
