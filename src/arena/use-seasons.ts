// The seasons the screens show: the server's once it has answered, the bundled
// registry until then. All the judgement is in `./seasons`; this only joins it
// to the query.
import { useMemo } from 'react';

import { useArenas } from '@/api/queries';
import { currentSeason, resolveSeasons, type Season } from './seasons';

export function useSeasons(): { seasons: Season[]; current: Season } {
  const { data } = useArenas();
  return useMemo(() => {
    const seasons = resolveSeasons(data?.arenas);
    return { seasons, current: currentSeason(seasons) };
  }, [data]);
}
