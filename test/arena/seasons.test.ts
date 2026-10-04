// The seasons the app shows are the server's, with the bundled registry as the
// fallback. What matters is that a bad or missing answer never leaves the Arena
// without a season, and that the server's word replaces the build's.
import type { ArenaWire } from '@/api/arena';
import { ARENAS, CURRENT_ARENA } from '@/arena/arenas';
import { BUNDLED_SEASONS, bundledDrift, currentSeason, resolveSeasons, seasonBySlug, seasonStatus, toSeason, type Season } from '@/arena/seasons';

/** A bundled season as the route would send it: JSON, so its dates are strings. */
const wire = (s: Season, over: Partial<ArenaWire> = {}): ArenaWire => ({ ...(JSON.parse(JSON.stringify(s)) as ArenaWire), ...over });
const served = () => BUNDLED_SEASONS.map((s) => wire(s));

describe('the bundled fallback', () => {
  it('is the ported registry, with the highest id current', () => {
    expect(BUNDLED_SEASONS).toBe(ARENAS);
    expect(currentSeason(BUNDLED_SEASONS).slug).toBe(CURRENT_ARENA.slug);
  });

  it('is what the app shows with no answer, a missing route or an empty list', () => {
    for (const nothing of [undefined, null, []]) {
      expect(resolveSeasons(nothing).map((s) => s.slug)).toEqual(ARENAS.map((s) => s.slug));
    }
  });

  it('is never handed out as the same array, so a caller sorting it cannot reorder the registry', () => {
    expect(resolveSeasons(null)).not.toBe(BUNDLED_SEASONS);
  });
});

describe('seasons from the server', () => {
  it('reads the window back into dates', () => {
    const season = toSeason(wire(CURRENT_ARENA));
    expect(season?.start.getTime()).toBe(CURRENT_ARENA.start.getTime());
    expect(season?.end.getTime()).toBe(CURRENT_ARENA.end.getTime());
  });

  it('replace the bundled ones, so a season the build has never heard of becomes current', () => {
    const next = wire(CURRENT_ARENA, { id: CURRENT_ARENA.id + 1, slug: 'next-season', name: 'Next', start: '2027-01-04T00:00:00.000Z', end: '2027-01-18T00:00:00.000Z' });
    const seasons = resolveSeasons([...served(), next]);
    expect(currentSeason(seasons).slug).toBe('next-season');
    expect(seasonBySlug(seasons, 'next-season')?.name).toBe('Next');
  });

  it('carry the server version of a season the build also has: a swapped medal, an edited purse', () => {
    const edited = served().map((s) =>
      s.bounty ? { ...s, bounty: { ...s.bounty, bounties: [{ id: 'brand_new', name: 'A New Medal', emoji: '🆕', amount: '$10', blurb: 'New.', rules: 'New rules.' }] } } : s,
    );
    const medals = resolveSeasons(edited).find((s) => s.bounty)?.bounty?.bounties;
    expect(medals?.map((m) => m.id)).toEqual(['brand_new']);
  });

  it('drop a season the web has withdrawn, rather than keeping the bundled copy of it', () => {
    const seasons = resolveSeasons(served().slice(0, 1));
    expect(seasons).toHaveLength(1);
  });

  it('come back oldest first whatever order they were sent in', () => {
    expect(resolveSeasons(served().reverse()).map((s) => s.id)).toEqual([...ARENAS].map((s) => s.id).sort((a, b) => a - b));
  });

  it('skip a season with a window that is not one, and a repeated id', () => {
    const broken = wire(CURRENT_ARENA, { id: 90, slug: 'broken', start: 'soon' });
    const backwards = wire(CURRENT_ARENA, { id: 91, slug: 'backwards', start: '2027-02-01T00:00:00.000Z', end: '2027-01-01T00:00:00.000Z' });
    const repeat = wire(CURRENT_ARENA, { slug: 'impostor' });
    const slugs = resolveSeasons([...served(), broken, backwards, repeat]).map((s) => s.slug);
    expect(slugs).toEqual(ARENAS.map((s) => s.slug));
  });

  it('fall back to the bundled registry when nothing sent is usable', () => {
    const seasons = resolveSeasons([wire(CURRENT_ARENA, { start: 'never' })]);
    expect(seasons.map((s) => s.slug)).toEqual(ARENAS.map((s) => s.slug));
  });

  it('treat a season without medals the same whether the key is absent or null', () => {
    const plain = ARENAS.find((a) => !a.bounty) ?? CURRENT_ARENA;
    expect(toSeason(wire(plain, { bounty: null }))?.bounty).toBeUndefined();
  });
});

describe('seasonStatus', () => {
  it('is upcoming before the window, active inside it, and ended from the exclusive end', () => {
    const s = CURRENT_ARENA;
    expect(seasonStatus(s, new Date(s.start.getTime() - 1))).toBe('upcoming');
    expect(seasonStatus(s, s.start)).toBe('active');
    expect(seasonStatus(s, new Date(s.end.getTime() - 1))).toBe('active');
    expect(seasonStatus(s, s.end)).toBe('ended');
  });
});

describe('bundledDrift', () => {
  it('is silent when the fallback matches the server', () => {
    expect(bundledDrift(served())).toEqual([]);
  });

  it('names a new season, a moved window, changed prizes and changed medals', () => {
    const withMedals = ARENAS.find((a) => a.bounty) ?? CURRENT_ARENA;
    const list = served().map((s) =>
      s.id === withMedals.id && s.bounty
        ? { ...s, end: '2030-01-01T00:00:00.000Z', prizePool: '$9', bounty: { ...s.bounty, bounties: s.bounty.bounties.slice(1) } }
        : s,
    );
    list.push(wire(CURRENT_ARENA, { id: 99, slug: 'unheard-of' }));
    const drift = bundledDrift(list).join('\n');
    expect(drift).toContain(`"${withMedals.slug}": the window differs`);
    expect(drift).toContain(`"${withMedals.slug}": the prizes differ`);
    expect(drift).toContain(`"${withMedals.slug}": the medals differ`);
    expect(drift).toContain('season "unheard-of" is not in the bundled registry');
  });
});
