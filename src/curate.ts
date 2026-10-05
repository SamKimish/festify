import type { Act } from './festivals';
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
 *   listening = √( Σ ranges 3·(1 − topArtistRank/N)
 *                + Σ top tracks (1 − trackRank/N)
 *                + 0.25 · plays in the last 50 tracks )   (N = list length: 100 Spotify, 200 Last.fm)
 *   liked     = √(liked songs)                             (diminishing returns)
 *
 * Each is divided by the user's maximum across their whole library (liked by at
 * least √30, so a handful of likes can't max it out), so both run from 0 to 1,
 * then summed. Following the artist adds a small tiebreak.
 */
const TOP_ARTIST_WEIGHT = 3;
const TOP_TRACK_WEIGHT = 1;
const RECENT_WEIGHT = 0.25;
const FOLLOW_BONUS = 0.05;
const LIKED_FULL_MARKS = 30;

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
  /** Matched artists from your listening, best first (empty for added / suggested acts). */
  artists: ScoredArtist[];
  /** Not from your listening: you added it, or it's a "you might like" suggestion. */
  origin?: 'added' | 'suggested';
  /** For suggestions: the artists you listen to that it's similar to. */
  because?: string[];
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

function listeningRaw(a: ArtistStats, topSize: number): number {
  let total = 0;
  for (const range of TIME_RANGES) {
    const rank = a.topRanks[range];
    if (rank !== undefined) total += TOP_ARTIST_WEIGHT * (1 - rank / topSize);
  }
  for (const t of a.topTracks) total += TOP_TRACK_WEIGHT * (1 - t.rank / topSize);
  return total + RECENT_WEIGHT * a.recent;
}

const likedRaw = (a: ArtistStats) => Math.sqrt(a.liked.length);

export function scoreArtists(profile: ListeningProfile): Map<string, ScoredArtist> {
  const all = Object.values(profile.artists);
  // Square-rooted like likes, so a solid mid-table favourite isn't dwarfed by your
  // very top artist (whose dozens of top tracks inflate the maximum).
  const listen = (a: ArtistStats) => Math.sqrt(listeningRaw(a, profile.topSize));
  const maxListening = Math.max(1e-9, ...all.map(listen));
  // At least ~30 liked songs for full marks, so one like can't outrank real listening
  // when someone only likes a few songs per artist.
  const maxLiked = Math.max(Math.sqrt(LIKED_FULL_MARKS), ...all.map(likedRaw));
  const scored = new Map<string, ScoredArtist>();
  for (const stats of all) {
    const listening = listen(stats) / maxListening;
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
export function curate(lineup: Act[], profile: ListeningProfile): CuratedAct[] {
  const scored = scoreArtists(profile);
  const byName = new Map<string, ScoredArtist[]>();
  for (const s of scored.values()) {
    const key = normalizeName(s.stats.name);
    byName.set(key, [...(byName.get(key) ?? []), s]);
  }

  const order = new Map(lineup.map((act, i) => [act, i]));
  const useIds = profile.source === 'spotify';
  const candidates: (CuratedAct & { direct: boolean })[] = [];
  lineup.forEach((act) => {
    const matched = new Map<string, ScoredArtist>();
    for (const m of act.members) {
      // Spotify IDs only mean something for Spotify logins; other sources match by name.
      const hits =
        m.spotifyId && useIds
          ? [scored.get(m.spotifyId)].filter((s): s is ScoredArtist => Boolean(s))
          : (byName.get(normalizeName(m.name)) ?? []);
      for (const h of hits) matched.set(h.stats.id, h);
    }
    if (!matched.size) return;
    const artists = [...matched.values()].sort((a, b) => b.score - a.score);
    // A B2B is as strong as its best artist, plus a little for the others.
    const score = artists[0].score + 0.1 * artists.slice(1).reduce((t, a) => t + a.score, 0);
    // "Direct" = the act is the artist's own billing rather than a collaboration they're part of.
    const direct = act.members.length === 1 || artists.some((a) => normalizeName(a.stats.name) === normalizeName(act.members[0].name));
    candidates.push({ act, score, artists, direct });
  });

  // Big lineups list some artists more than once (solo set, DJ set, B2B…).
  // Each artist claims one act: their own billing first, then the best billed.
  // Acts whose artists have all been claimed elsewhere are dropped.
  const claimed = new Set<string>();
  const results: CuratedAct[] = [];
  candidates
    .sort((a, b) => Number(b.direct) - Number(a.direct) || a.act.billing - b.act.billing || order.get(a.act)! - order.get(b.act)!)
    .forEach(({ direct: _, ...c }) => {
      const fresh = c.artists.filter((a) => !claimed.has(a.stats.id));
      if (!fresh.length) return;
      fresh.forEach((a) => claimed.add(a.stats.id));
      results.push(c);
    });

  results.sort(
    (a, b) => b.score - a.score || a.act.billing - b.act.billing || order.get(a.act)! - order.get(b.act)!,
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

/** What each time range covers, per source (Spotify's "long term" is about a year). */
const RANGE_LABELS: Partial<Record<ListeningProfile['source'], Record<TimeRange, string>>> = {
  lastfm: { short_term: 'last month', medium_term: 'last 6 months', long_term: 'all time' },
  export: { short_term: 'last 4 weeks', medium_term: 'last 6 months', long_term: 'all time' },
};

/** Short human-readable reasons, e.g. "#3 in your top artists (last 6 months)". */
export function reasonsFor(stats: ArtistStats, source?: ListeningProfile['source']): string[] {
  const reasons: string[] = [];
  if (stats.plays) reasons.push(`${stats.plays.toLocaleString()} play${stats.plays === 1 ? '' : 's'}`);
  const best = TIME_RANGES.filter((r) => stats.topRanks[r] !== undefined).sort(
    (a, b) => stats.topRanks[a]! - stats.topRanks[b]!,
  )[0];
  const label = (source && RANGE_LABELS[source]) || RANGE_LABEL;
  if (best) reasons.push(`#${stats.topRanks[best]! + 1} in your top artists (${label[best]})`);
  const topTrackCount = new Set(stats.topTracks.map((t) => t.trackId)).size;
  if (topTrackCount) reasons.push(`${topTrackCount} of your top tracks`);
  if (stats.liked.length) {
    const noun = source === 'lastfm' ? 'loved track' : 'liked song';
    reasons.push(`${stats.liked.length} ${noun}${stats.liked.length === 1 ? '' : 's'}`);
  }
  if (stats.recent) reasons.push(`${stats.recent} of your last 50 plays`);
  if (stats.followed) reasons.push('You follow them');
  return reasons;
}
