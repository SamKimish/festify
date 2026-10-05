import type { Act, Festival } from './festivals';
import {
  RANGE_LABEL,
  TIME_RANGES,
  type ArtistStats,
  type ListeningProfile,
  type TimeRange,
  type TrackLite,
} from './spotify/profile';

/**
 * Scoring. Spotify doesn't expose play counts, so "how much you listen" is
 * built from ranked lists, and liked songs are a second, equally weighted
 * signal (people often listen to an artist in waves, so a big pile of likes
 * counts as much as current heavy rotation).
 *
 *   listening = Σ ranges 3·(1 − topArtistRank/100)
 *             + Σ top tracks (1 − trackRank/100)
 *             + 0.25 · plays in the last 50 tracks
 *   liked     = √(liked songs)          (diminishing returns)
 *
 * Each is divided by the user's maximum across their whole library, so both
 * run from 0 to 1, then summed. Following the artist adds a small tiebreak.
 */
const TOP_ARTIST_WEIGHT = 3;
const TOP_TRACK_WEIGHT = 1;
const RECENT_WEIGHT = 0.25;
const FOLLOW_BONUS = 0.05;

export const HEADLINER_COUNT = 4;

export interface ScoredArtist {
  stats: ArtistStats;
  listening: number;
  liked: number;
  score: number;
}

export interface CuratedAct {
  act: Act;
  score: number;
  /** Matched Spotify artists, best first. */
  artists: ScoredArtist[];
}

export function normalizeName(name: string): string {
  const n = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, '');
  // Names that are pure punctuation (e.g. the band "@") keep their symbols.
  return n || name.trim().toLowerCase();
}

function listeningRaw(a: ArtistStats): number {
  let total = 0;
  for (const range of TIME_RANGES) {
    const rank = a.topRanks[range];
    if (rank !== undefined) total += TOP_ARTIST_WEIGHT * (1 - rank / 100);
  }
  for (const t of a.topTracks) total += TOP_TRACK_WEIGHT * (1 - t.rank / 100);
  return total + RECENT_WEIGHT * a.recent;
}

const likedRaw = (a: ArtistStats) => Math.sqrt(a.liked.length);

export function scoreArtists(profile: ListeningProfile): Map<string, ScoredArtist> {
  const all = Object.values(profile.artists);
  const maxListening = Math.max(1e-9, ...all.map(listeningRaw));
  const maxLiked = Math.max(1e-9, ...all.map(likedRaw));
  const scored = new Map<string, ScoredArtist>();
  for (const stats of all) {
    const listening = listeningRaw(stats) / maxListening;
    const liked = likedRaw(stats) / maxLiked;
    // Only artists you've actually played or liked; following alone isn't enough.
    if (listening === 0 && liked === 0) continue;
    scored.set(stats.id, {
      stats,
      listening,
      liked,
      score: listening + liked + (stats.followed ? FOLLOW_BONUS : 0),
    });
  }
  return scored;
}

/** The user's personal lineup for a festival: only acts they listen to, best first. */
export function curate(festival: Festival, profile: ListeningProfile): CuratedAct[] {
  const scored = scoreArtists(profile);
  const byName = new Map<string, ScoredArtist[]>();
  for (const s of scored.values()) {
    const key = normalizeName(s.stats.name);
    byName.set(key, [...(byName.get(key) ?? []), s]);
  }

  const results: CuratedAct[] = [];
  festival.lineup.forEach((act) => {
    const matched = new Map<string, ScoredArtist>();
    for (const m of act.members) {
      const hits = m.spotifyId
        ? [scored.get(m.spotifyId)].filter((s): s is ScoredArtist => Boolean(s))
        : (byName.get(normalizeName(m.name)) ?? []);
      for (const h of hits) matched.set(h.stats.id, h);
    }
    if (!matched.size) return;
    const artists = [...matched.values()].sort((a, b) => b.score - a.score);
    // A B2B is as strong as its best artist, plus a little for the others.
    const score = artists[0].score + 0.1 * artists.slice(1).reduce((t, a) => t + a.score, 0);
    results.push({ act, score, artists });
  });

  results.sort(
    (a, b) =>
      b.score - a.score ||
      a.act.billing - b.act.billing ||
      festival.lineup.indexOf(a.act) - festival.lineup.indexOf(b.act),
  );
  return results;
}

export interface SongEntry {
  track: TrackLite;
  /** Best (shortest-range, highest) top-track placement, if any. */
  top?: { range: TimeRange; rank: number };
  liked?: string;
}

/** The user's most-played songs by an artist: top tracks first, then liked songs. */
export function songsFor(stats: ArtistStats, profile: ListeningProfile, limit = 10): SongEntry[] {
  const entries = new Map<string, SongEntry>();
  const ordered = [...stats.topTracks].sort(
    (a, b) => a.rank - b.rank || TIME_RANGES.indexOf(a.range) - TIME_RANGES.indexOf(b.range),
  );
  for (const t of ordered) {
    const track = profile.tracks[t.trackId];
    if (track && !entries.has(t.trackId)) {
      entries.set(t.trackId, { track, top: { range: t.range, rank: t.rank } });
    }
  }
  for (const l of stats.liked) {
    const existing = entries.get(l.trackId);
    if (existing) existing.liked = l.addedAt;
    else if (profile.tracks[l.trackId]) {
      entries.set(l.trackId, { track: profile.tracks[l.trackId], liked: l.addedAt });
    }
  }
  return [...entries.values()].slice(0, limit);
}

/** Short human-readable reasons, e.g. "#3 in your top artists (last 6 months)". */
export function reasonsFor(stats: ArtistStats): string[] {
  const reasons: string[] = [];
  const best = TIME_RANGES.filter((r) => stats.topRanks[r] !== undefined).sort(
    (a, b) => stats.topRanks[a]! - stats.topRanks[b]!,
  )[0];
  if (best) reasons.push(`#${stats.topRanks[best]! + 1} in your top artists (${RANGE_LABEL[best]})`);
  const topTrackCount = new Set(stats.topTracks.map((t) => t.trackId)).size;
  if (topTrackCount) reasons.push(`${topTrackCount} of your top tracks`);
  if (stats.liked.length) {
    reasons.push(`${stats.liked.length} liked song${stats.liked.length === 1 ? '' : 's'}`);
  }
  if (stats.recent) reasons.push(`${stats.recent} of your last 50 plays`);
  if (stats.followed) reasons.push('You follow them');
  return reasons;
}
