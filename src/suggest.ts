import { normalizeName, scoreArtists, type CuratedAct } from './curate';
import type { Act } from './festivals';
import { similarArtists } from './sources/lastfm';
import type { ListeningProfile } from './spotify/profile';

/**
 * "You might like": lineup acts you don't listen to that Last.fm says are
 * similar to your favourite artists. Each act scores the sum of
 * (how much you like artist X) × (how similar the act is to X).
 */

const SEED_ARTISTS = 25;
const CACHE_DAYS = 14;
const cacheKey = (name: string) => `festify.similar.${normalizeName(name)}`;

async function similarCached(name: string) {
  try {
    const raw = localStorage.getItem(cacheKey(name));
    if (raw) {
      const { at, list } = JSON.parse(raw);
      if (Date.now() - at < CACHE_DAYS * 864e5) return list as { name: string; match: number }[];
    }
  } catch {
    /* fall through to the API */
  }
  const list = await similarArtists(name).catch(() => []);
  try {
    localStorage.setItem(cacheKey(name), JSON.stringify({ at: Date.now(), list }));
  } catch {
    /* cache is optional */
  }
  return list;
}

/**
 * `anyArtist`: for your own festival there's no real bill, so suggest any
 * similar artist you don't listen to yet, not just acts on the lineup.
 */
export async function suggestActs(
  lineup: Act[],
  profile: ListeningProfile,
  listened: CuratedAct[],
  { anyArtist = false }: { anyArtist?: boolean } = {},
): Promise<CuratedAct[]> {
  const seeds = [...scoreArtists(profile).values()].sort((a, b) => b.score - a.score).slice(0, SEED_ARTISTS);
  if (!seeds.length) return [];

  // Fetch similar artists for your top artists, a few at a time.
  const results: { seed: string; seedScore: number; list: { name: string; match: number }[] }[] = [];
  for (let i = 0; i < seeds.length; i += 5) {
    const batch = seeds.slice(i, i + 5);
    const lists = await Promise.all(batch.map((s) => similarCached(s.stats.name)));
    batch.forEach((s, j) => results.push({ seed: s.stats.name, seedScore: s.score, list: lists[j] }));
  }

  const affinity = new Map<string, { name: string; score: number; because: Map<string, number> }>();
  for (const { seed, seedScore, list } of results) {
    for (const sim of list) {
      const k = normalizeName(sim.name);
      const entry = affinity.get(k) ?? { name: sim.name, score: 0, because: new Map() };
      entry.score += seedScore * sim.match;
      entry.because.set(seed, (entry.because.get(seed) ?? 0) + seedScore * sim.match);
      affinity.set(k, entry);
    }
  }

  const onPoster = new Set(listened.map((a) => a.act.display));
  const youListen = new Set(Object.values(profile.artists).map((a) => normalizeName(a.name)));
  const ranked = (because: Map<string, number>) => [...because].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const candidates = anyArtist
    ? [...affinity.entries()]
        .filter(([k]) => !youListen.has(k))
        .map(([, e]) => ({
          act: { display: e.name.toUpperCase(), billing: 99, members: [{ name: e.name }] } as Act,
          raw: e.score,
          because: ranked(e.because),
        }))
    : lineup.flatMap((act) => {
    if (onPoster.has(act.display)) return [];
    if (act.members.some((m) => youListen.has(normalizeName(m.name)))) return [];
    const hits = act.members.map((m) => affinity.get(normalizeName(m.name))).filter(Boolean);
    if (!hits.length) return [];
    const best = hits.sort((a, b) => b!.score - a!.score)[0]!;
    return [{ act, raw: best.score, because: ranked(best.because) }];
  });
  if (!candidates.length) return [];

  // About a third as many suggestions as acts you listen to (3–12), slotted in
  // around the middle of the bill rather than at the top.
  // (Your own festival: three per day.)
  const count = anyArtist ? 9 : Math.max(3, Math.min(12, Math.round(listened.length * 0.35)));
  const top = candidates.sort((a, b) => b.raw - a.raw).slice(0, count);
  const ceiling = (listened[Math.floor(listened.length / 3)]?.score ?? 1) * 0.95;
  const maxRaw = top[0].raw;
  return top.map((c) => ({
    act: c.act,
    score: ceiling * (0.5 + 0.5 * (c.raw / maxRaw)),
    artists: [],
    origin: 'suggested' as const,
    because: c.because.slice(0, 3),
  }));
}
