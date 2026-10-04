// A season's medals joined to who holds them, as the Arena tab shows it.
//
// The medals themselves (name, purse, rule) come from the season; who is
// winning each one comes from the server's live board, which it works out on
// read. This is the join, and the wording of every state a medal can be in.
// The wording is the website's (components/ArenaBountyBoard.tsx).
import type { MedalBoard, MedalResult, MedalStanding } from '@/api/arena';
import type { Medal, Season } from '@/arena/seasons';
import { appCopy } from '@/lib/arena-view';
import { usd } from '@/lib/format';

export type MedalView = {
  medal: Medal;
  /**
   * One line for the list: who holds it, or why nobody does yet. Null when
   * there are no standings to speak of (the board has not loaded, or failed),
   * and the row then shows the medal alone.
   */
  status: string | null;
  /** True when a team holds it or has been awarded it; the list sets these apart. */
  held: boolean;
  /** "Held by", "Awarded to" or "Shared by 2 teams"; null with nobody on it. */
  heldLabel: string | null;
  holders: MedalStanding[];
  /** "Next in line" behind a holder, "Closest" when the medal is unclaimed. */
  contendersLabel: string;
  contenders: MedalStanding[];
  note: string | null;
};

/** A team's place in the medal table: what it holds and what that is worth. */
export type MedalTableRow = {
  team: MedalStanding['team'];
  /** The medals it holds or shares, in the season's order. */
  medals: Medal[];
  /** Its share of those purses in dollars; a shared medal counts for its split. */
  winnings: number;
};

/** "Oct 9", in UTC, because the season's days are UTC days. */
const utcDay = (iso: string | Date) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function heldLabel(result: MedalResult): string | null {
  const n = result.holders.length;
  if (n === 0) return null;
  if (n > 1) return `Shared by ${n} teams`;
  return result.state === 'final' ? 'Awarded to' : 'Held by';
}

/** Why a medal has nobody on it. */
function openLine(result: MedalResult, season: Season): string {
  if (result.state === 'upcoming') return `Opens ${utcDay(season.start)}`;
  if (result.state === 'waiting') return result.opensAt ? `Opens ${utcDay(result.opensAt)}` : 'Not open yet';
  if (result.state === 'final') return 'Not awarded';
  return 'Unclaimed';
}

/** A team and what it did, on one line: "Boss · 14 markets". */
export function standingLine(s: MedalStanding): string {
  return `${s.team.name} · ${s.display}`;
}

/** The smaller line under a standing: who on the team, and on which market. */
export function standingDetail(s: MedalStanding): string | null {
  const parts = [s.detail, s.context].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function view(medal: Medal, result: MedalResult | undefined, season: Season): MedalView {
  if (!result) {
    return { medal, status: null, held: false, heldLabel: null, holders: [], contendersLabel: 'Closest', contenders: [], note: null };
  }
  const label = heldLabel(result);
  const lead = result.holders[0];
  const status = lead
    ? result.holders.length > 1
      ? `${label} · ${lead.display}`
      : `${label} ${lead.team.name} · ${lead.display}`
    : openLine(result, season);
  return {
    medal,
    status,
    held: !!lead,
    heldLabel: label,
    holders: result.holders,
    contendersLabel: lead ? 'Next in line' : 'Closest',
    contenders: result.contenders,
    // The server writes for the website, which says "bettors"; the app does not.
    note: result.note ? appCopy(result.note) : null,
  };
}

/**
 * Every medal of a season, in the season's own order, each with its standing.
 * A board for a different season is ignored: while the season switcher's next
 * fetch is in the air, the last season's holders must not sit under this
 * season's medals.
 */
export function medalViews(season: Season, board: MedalBoard | null | undefined): MedalView[] {
  const results = board && board.arena === season.slug ? board.bounties : [];
  return (season.bounty?.bounties ?? []).map((medal) => view(medal, results.find((r) => r.id === medal.id), season));
}

/** "$80" as 80. A purse that is not a number counts for nothing rather than breaking the sum. */
const purse = (amount: string) => Number(amount.replace(/[^0-9.]/g, '')) || 0;

/**
 * The medal table: every team holding at least one medal, best first.
 *
 * Ranked by money, not by count, because the medals are not worth the same and
 * the money is what a team actually takes home. A tie splits a medal, as the
 * season's rules say, so each of two teams sharing an $80 medal is credited
 * $40. Equal money is broken by more medals, then by name so the order does
 * not shuffle between polls.
 *
 * While the season is live this is "if it ended now"; once the board is final
 * it is what was won.
 */
export function medalTable(views: MedalView[]): MedalTableRow[] {
  const rows = new Map<number, MedalTableRow>();
  for (const v of views) {
    if (v.holders.length === 0) continue;
    const share = purse(v.medal.amount) / v.holders.length;
    for (const { team } of v.holders) {
      const row = rows.get(team.id) ?? { team, medals: [], winnings: 0 };
      // A team listed twice on one medal still holds it once.
      if (!row.medals.includes(v.medal)) {
        row.medals.push(v.medal);
        row.winnings += share;
      }
      rows.set(team.id, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.winnings - a.winnings || b.medals.length - a.medals.length || a.team.name.localeCompare(b.team.name));
}

/**
 * A table row's money: whole dollars when it is whole, cents only when a split
 * left some. The general formatter drops cents at $100, which put "$115" above
 * "$55.00" in the same column.
 */
export function winningsLabel(n: number): string {
  return usd(n, { dp: Number.isInteger(n) ? 0 : 2 });
}
