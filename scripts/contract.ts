// Contract test: parse every v0 read route against production (`npm run
// contract`). A web change that breaks a shape fails here, not in a shipped APK.
import * as free from '../src/api/free';
import * as paidMajority from '../src/api/paidMajority';
import * as paidMarkets from '../src/api/paidMarkets';
import * as results from '../src/api/results';
import * as user from '../src/api/user';

// A wallet with activity across all three market families (public data).
const WALLET = '49GT1N8mRLp4Q9JYJDRR3YopGtfHFGTrwg6cmbm3u2fY';

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
