// Contract test: parse every v0 read route against production (`npm run
// contract`). A web change that breaks a shape fails here, not in a shipped APK.
import { address as toAddress } from '@solana/kit';

import * as arena from '../src/api/arena';
import * as chat from '../src/api/chat';
import { chatEventId } from '../src/chat/rules';
import * as free from '../src/api/free';
import * as paidMajority from '../src/api/paidMajority';
import * as paidMarkets from '../src/api/paidMarkets';
import * as referral from '../src/api/referral';
import { CURRENT_ARENA } from '../src/arena/arenas';
import * as results from '../src/api/results';
import * as user from '../src/api/user';
import { getAssociatedTokenAddress } from '../src/chain/amm';
import { getUsdcBalance } from '../src/chain/balance';
import { RPC_URL, USDC_MINT } from '../src/config';

// A wallet with activity across all three market families (public data).
const WALLET = '49GT1N8mRLp4Q9JYJDRR3YopGtfHFGTrwg6cmbm3u2fY';

/**
 * Ask the chain which USDC token account a wallet actually owns.
 *
 * The balance read derives that address locally instead, which is faster and
 * needs no extra call, but a silent drift in the derivation would report every
 * wallet as empty. Cross-checking the two here is what makes that loud.
 */
async function chainUsdcAccount(wallet: string): Promise<string | null> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountsByOwner',
      params: [wallet, { mint: USDC_MINT }, { encoding: 'jsonParsed' }],
    }),
  });
  const json = (await res.json()) as { result?: { value?: { pubkey: string }[] }; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? 'getTokenAccountsByOwner failed');
  return json.result?.value?.[0]?.pubkey ?? null;
}

type Check = { name: string; fn: () => Promise<string> };

async function main() {
  const checks: Check[] = [];
  const add = (name: string, fn: () => Promise<string>) => checks.push({ name, fn });

  const majList = await paidMajority.listPaidMajority();
  const ammList = await paidMarkets.listPaidMarkets();
  const freeList = await free.listFreeMarkets();
  const maj = majList[0];
  const amm = ammList.find((m) => m.status === 0) ?? ammList[0];
  const freeSheet = freeList.find((m) => m.market_type !== 'majority') ?? freeList[0];
  const freeBoard = freeList.find((m) => m.market_type === 'majority') ?? freeList[0];

  add('paid-majority/list', async () => `${majList.length} markets`);

  // Arena. The season list is a port of the website's lib/arenas.ts, so this is
  // also where a new season on the web shows up before the app knows about it.
  add('teams/leaderboard: ported season is the current one', async () => {
    const current = await arena.getTeamLeaderboard();
    if (current.arena !== CURRENT_ARENA.slug) {
      throw new Error(`the web's current season is "${current.arena}" but the app's is "${CURRENT_ARENA.slug}": re-port lib/arenas.ts`);
    }
    return `${current.arena}, ${current.data.length} teams`;
  });
  add('teams/[slug] and my-team', async () => {
    const standings = await arena.getTeamLeaderboard(CURRENT_ARENA.slug);
    const top = standings.data[0];
    if (!top) return 'no teams this season, nothing to check';
    const profile = await arena.getTeam(top.team_slug);
    const member = profile.members[0];
    const mine = member ? await arena.getMyTeam(member.wallet, CURRENT_ARENA.slug) : null;
    return `${profile.team.name}: ${profile.members.length} members, my-team ${mine ? 'found' : 'null'}`;
  });
  add('referral', async () => {
    const r = await referral.getReferral(WALLET);
    return `code ${r.referralCode ? 'present' : 'missing'}, ${r.referralCount} referrals, $${r.earningsUsd.toFixed(2)} earned`;
  });
  add('paid-majority/market/[id]', async () => `${(await paidMajority.getPaidMajorityMarket(maj.marketId)).board.length} board words`);
  add('paid-majority/metadata', async () => `${(await paidMajority.getPaidMajorityMetadata()).length} rows`);
  add('paid-majority/my-positions', async () => `${(await paidMajority.getPaidMajorityPositions(maj.marketId, WALLET)).length} positions`);
  add('paid-majority/user-positions', async () => `${(await paidMajority.getPaidMajorityUserPositions(WALLET)).length} positions`);
  add('paid-markets/list', async () => `${ammList.length} markets`);
  add('paid-markets/market/[id]', async () => `${(await paidMarkets.getPaidMarket(amm.marketId)).account.length} b64 chars`);
  add('paid-markets/metadata', async () => (await paidMarkets.getPaidMarketMetadata(amm.marketId)).title);
  add('paid-markets/chart', async () => `${(await paidMarkets.getPaidMarketChart(amm.marketId)).words.length} series`);
  add('paid-markets/trades', async () => `${(await paidMarkets.getPaidMarketTrades(amm.marketId)).length} trades`);
  add('paid-markets/user-positions', async () => `${(await paidMarkets.getPaidMarketUserPositions(WALLET)).length} positions`);
  add('custom', async () => `${freeList.length} markets`);
  add('custom/[id]', async () => `${(await free.getFreeMarket(freeSheet.id)).words.length} words`);
  add('custom/[id]/positions', async () => `balance ${(await free.getFreePositions(freeSheet.id, WALLET)).balance}`);
  add('custom/[id]/board', async () => `${(await free.getFreeBoard(freeBoard.id, WALLET)).board.length} board words`);
  add('custom/[id]/board (no wallet)', async () => `${(await free.getFreeBoard(freeBoard.id)).board.length} board words`);
  add('custom/[id]/chart', async () => `${(await free.getFreeChart(freeSheet.id)).words.length} series`);
  add('custom/user-activity', async () => `${(await free.getFreeUserActivity(WALLET)).positions.length} positions`);
  add('profile', async () => `username ${(await user.getProfile(WALLET)).username}`);
  add('leaderboard', async () => `${(await user.getLeaderboard()).data.length} entries`);
  add('leaderboard (last week, wallet)', async () => { const r = await user.getLeaderboard('last', WALLET); return `${r.data.length} entries, userEntry ${r.userEntry ? 'set' : 'null'}`; });
  add('raffle/tickets', async () => { const r = await user.getRaffle(WALLET); return `${r.totalTickets} tickets, me ${r.me?.tickets ?? 'n/a'}`; });
  add('prize-pool', async () => `pool $${(await user.getPrizePool()).poolUsd.toFixed(2)}`);
  const resolvedMaj = majList.find((m) => m.status === 1) ?? maj;
  const resolvedFree = freeList.find((m) => m.status === 'resolved') ?? freeList[0];
  add('paid-majority/[id]/results', async () => `${(await results.getPaidMajorityResults(resolvedMaj.marketId)).leaderboard.length} rows`);
  add('custom/[id]/results', async () => `${(await results.getFreeResults(resolvedFree.id)).leaderboard.length} rows`);
  add('profile/[username]', async () => `${(await user.getPublicProfile('Michael_Donnn')).stats.allTimePoints} points`);
  add('search', async () => { const r = await user.search('mich'); return `${r.results.length} players, ${r.markets.length} markets`; });

  // Chat. The event ids are the website's (src/chat/rules.ts chatEventId);
  // an empty market room is fine, a shape change is not.
  add('chat (global)', async () => `${(await chat.getChat(null)).length} messages`);
  add('chat/latest-id', async () => `latest ${(await chat.getGlobalChatLatest()).latestId}`);
  add('chat/event (free market room)', async () => `${(await chat.getChat(chatEventId('free-yesno', freeSheet.id))).length} messages`);
  add('chat/event (paid market room, paged)', async () => {
    const room = chatEventId('paid-yesno', amm.marketId);
    const rows = await chat.getChat(room);
    if (rows.length === 0) return 'empty room, nothing to page';
    const older = await chat.getChatBefore(room, rows[0].id);
    return `${rows.length} newest, ${older.messages.length} older, hasMore ${older.hasMore}`;
  });

  // The wallet balance is read from the chain rather than from an API route, so
  // it fails independently of everything above: the proxy could stop allowing
  // the method, or the associated-token derivation could drift.
  const board = await user.getLeaderboard();
  const holder = board.data.find((e) => e.wallet) ?? null;
  add('paid-rpc getTokenAccountBalance', async () => {
    if (!holder) return 'no wallet on the leaderboard to check';
    const derived = await getAssociatedTokenAddress(toAddress(USDC_MINT), toAddress(holder.wallet));
    const onChain = await chainUsdcAccount(holder.wallet);
    if (onChain && onChain !== derived) {
      throw new Error(`derived USDC account ${derived} but the chain owns ${onChain}`);
    }
    const balance = await getUsdcBalance(holder.wallet);
    if (!Number.isFinite(balance) || balance < 0) throw new Error(`implausible balance ${balance}`);
    return onChain ? `${holder.wallet.slice(0, 6)} holds ${balance} USDC in ${derived.slice(0, 6)}` : `${holder.wallet.slice(0, 6)} has no USDC account, read as ${balance}`;
  });

  let failed = 0;
  for (const c of checks) {
    try {
      console.log(`PASS  ${c.name}: ${await c.fn()}`);
    } catch (e) {
      failed++;
      console.log(`FAIL  ${c.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('contract test could not run:', e);
  process.exit(1);
});
