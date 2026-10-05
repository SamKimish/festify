import { normalizeName } from './curate';
import type { Festival } from './festivals';
import { TIME_RANGES, type ArtistStats, type ListeningProfile } from './spotify/profile';

/** Deterministic PRNG so the demo poster is stable between reloads. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SONG_WORDS = [
  'Midnight', 'Glass', 'Summer', 'Static', 'Velvet', 'Neon', 'Paper', 'Ocean', 'Wire',
  'Honey', 'Ghost', 'Signal', 'Gold', 'Echo', 'Fever', 'Satellite', 'Parade', 'Silver',
];

/**
 * A made-up listener who likes a random ~45 acts from the lineup, with a
 * deliberately undercard-heavy taste so the reshuffled poster is obvious.
 */
export function demoProfile(festival: Festival): ListeningProfile {
  const rand = mulberry32(2027);
  const pickWord = () => SONG_WORDS[Math.floor(rand() * SONG_WORDS.length)];
  const members = festival.lineup.flatMap((a) => a.members.map((m) => ({ m, billing: a.billing })));
  const chosen = members.filter(({ billing }) => rand() < ([0.45, 0.35, 0.3, 0.12][billing] ?? 0.1));

  const profile: ListeningProfile = {
    version: 1,
    userId: 'demo',
    displayName: 'Demo listener',
    fetchedAt: Date.now(),
    likedTotal: 0,
    tracks: {},
    artists: {},
    warnings: [],
  };

  // Shuffle, so ranking ignores the official billing.
  const order = [...chosen].sort(() => rand() - 0.5);
  let trackRank = 0;
  order.forEach(({ m }, i) => {
    const id = `demo-${normalizeName(m.name)}`;
    const stats: ArtistStats = {
      id,
      name: m.name.replace(/\b\w+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase()),
      topRanks: {},
      topTracks: [],
      liked: [],
      recent: rand() < 0.15 ? 1 + Math.floor(rand() * 5) : 0,
      followed: rand() < 0.3,
    };
    for (const range of TIME_RANGES) {
      if (rand() < 0.75 - i * 0.012) stats.topRanks[range] = Math.min(99, i + Math.floor(rand() * 8));
    }
    // "Wave" listeners: lots of likes but not in current rotation.
    const likes = rand() < 0.25 ? Math.floor(rand() * 40) : Math.floor(rand() * 6);
    const songCount = Math.max(2, Math.min(10, likes + 2));
    for (let s = 0; s < songCount; s++) {
      const trackId = `${id}-t${s}`;
      profile.tracks[trackId] = {
        id: trackId,
        name: `${pickWord()} ${pickWord()}`,
        album: `${pickWord()} (Demo)`,
      };
      if (s < 3 && Object.keys(stats.topRanks).length && trackRank < 100) {
        stats.topTracks.push({ trackId, range: 'medium_term', rank: trackRank++ });
      }
      if (s < likes) {
        stats.liked.push({ trackId, addedAt: new Date(Date.now() - s * 864e5 * 9).toISOString() });
      }
    }
    profile.likedTotal += stats.liked.length;
    profile.artists[id] = stats;
  });
  return profile;
}
