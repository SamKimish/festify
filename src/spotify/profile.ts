import {
  pool,
  spotifyGet,
  type FullArtist,
  type Paging,
  type SpotifyImage,
  type Track,
  type User,
} from './api';

export type TimeRange = 'short_term' | 'medium_term' | 'long_term';
export const TIME_RANGES: TimeRange[] = ['short_term', 'medium_term', 'long_term'];
export const RANGE_LABEL: Record<TimeRange, string> = {
  short_term: 'last 4 weeks',
  medium_term: 'last 6 months',
  long_term: 'last year',
};

export interface TrackLite {
  id: string;
  name: string;
  album: string;
  image?: string;
  url?: string;
}

export interface ArtistStats {
  id: string;
  name: string;
  image?: string;
  url?: string;
  /** 0-based position in the user's top artists, per time range. */
  topRanks: Partial<Record<TimeRange, number>>;
  /** The user's top tracks by this artist. */
  topTracks: { trackId: string; range: TimeRange; rank: number }[];
  /** Liked songs by this artist, newest first. */
  liked: { trackId: string; addedAt: string }[];
  /** Plays among the last 50 played tracks. */
  recent: number;
  followed: boolean;
}

export interface ListeningProfile {
  version: number;
  userId: string;
  displayName: string;
  fetchedAt: number;
  likedTotal: number;
  tracks: Record<string, TrackLite>;
  artists: Record<string, ArtistStats>;
  /** Parts of the data Spotify refused to return (e.g. endpoint restricted). */
  warnings: string[];
}

const PROFILE_VERSION = 1;
const CACHE_KEY = 'festify.profile';
const CACHE_MAX_AGE = 12 * 60 * 60 * 1000;

export type Progress = (message: string, fraction?: number) => void;

/** Picks the smallest image that is at least `min` px wide. */
export function pickImage(images: SpotifyImage[] | undefined, min = 160): string | undefined {
  if (!images?.length) return undefined;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= min) ?? sorted[sorted.length - 1]).url;
}

export function loadCachedProfile(): ListeningProfile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw) as ListeningProfile;
    if (profile.version !== PROFILE_VERSION) return null;
    if (Date.now() - profile.fetchedAt > CACHE_MAX_AGE) return null;
    return profile;
  } catch {
    return null;
  }
}

export function clearCachedProfile(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* storage unavailable */
  }
}

function saveProfile(profile: ListeningProfile) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
  } catch {
    // Very large libraries can exceed the storage quota; just skip caching.
  }
}

/** Fetches everything Festify needs from Spotify and folds it into per-artist stats. */
export async function fetchProfile(onProgress: Progress): Promise<ListeningProfile> {
  onProgress('Saying hello to Spotify…', 0);
  const me = await spotifyGet<User>('/me');

  const profile: ListeningProfile = {
    version: PROFILE_VERSION,
    userId: me.id,
    displayName: me.display_name || me.id,
    fetchedAt: Date.now(),
    likedTotal: 0,
    tracks: {},
    artists: {},
    warnings: [],
  };

  const artist = (id: string, name: string): ArtistStats =>
    (profile.artists[id] ??= {
      id,
      name,
      topRanks: {},
      topTracks: [],
      liked: [],
      recent: 0,
      followed: false,
    });

  const addTrack = (t: Track): string | null => {
    if (!t.id || t.is_local) return null;
    profile.tracks[t.id] ??= {
      id: t.id,
      name: t.name,
      album: t.album?.name ?? '',
      image: pickImage(t.album?.images, 64),
      url: t.external_urls?.spotify,
    };
    return t.id;
  };

  // Each source is optional: if Spotify refuses one, carry on with the rest.
  const attempt = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      console.warn(`Festify: couldn't load ${label}`, e);
      profile.warnings.push(label);
    }
  };

  // Top artists & tracks: up to 100 per time range (two pages of 50).
  onProgress('Reading your top artists…', 0.05);
  await attempt('top artists', async () => {
    const pages = await pool(
      TIME_RANGES.flatMap((range) =>
        [0, 50].map((offset) => async () => ({
          range,
          offset,
          page: await spotifyGet<Paging<FullArtist>>(
            `/me/top/artists?time_range=${range}&limit=50&offset=${offset}`,
          ),
        })),
      ),
      3,
    );
    for (const { range, offset, page } of pages) {
      page.items.forEach((a, i) => {
        const stats = artist(a.id, a.name);
        stats.topRanks[range] = offset + i;
        stats.image ??= pickImage(a.images);
        stats.url ??= a.external_urls?.spotify;
      });
    }
  });

  onProgress('Reading your top tracks…', 0.15);
  await attempt('top tracks', async () => {
    const pages = await pool(
      TIME_RANGES.flatMap((range) =>
        [0, 50].map((offset) => async () => ({
          range,
          offset,
          page: await spotifyGet<Paging<Track>>(
            `/me/top/tracks?time_range=${range}&limit=50&offset=${offset}`,
          ),
        })),
      ),
      3,
    );
    for (const { range, offset, page } of pages) {
      page.items.forEach((t, i) => {
        const trackId = addTrack(t);
        if (!trackId) return;
        for (const a of t.artists) {
          if (!a.id) continue;
          const stats = artist(a.id, a.name);
          stats.url ??= a.external_urls?.spotify;
          stats.topTracks.push({ trackId, range, rank: offset + i });
        }
      });
    }
  });

  onProgress('Checking what you played recently…', 0.25);
  await attempt('recently played', async () => {
    const page = await spotifyGet<Paging<{ track: Track }>>('/me/player/recently-played?limit=50');
    for (const { track } of page.items) {
      if (!addTrack(track)) continue;
      for (const a of track.artists) if (a.id) artist(a.id, a.name).recent++;
    }
  });

  onProgress('Checking who you follow…', 0.3);
  await attempt('followed artists', async () => {
    let url: string | null = '/me/following?type=artist&limit=50';
    while (url) {
      const res: { artists: Paging<FullArtist> } = await spotifyGet(url);
      for (const a of res.artists.items) {
        const stats = artist(a.id, a.name);
        stats.followed = true;
        stats.image ??= pickImage(a.images);
        stats.url ??= a.external_urls?.spotify;
      }
      url = res.artists.next;
    }
  });

  // Liked songs: first page tells us the total, then fetch the rest in parallel.
  onProgress('Reading your liked songs…', 0.35);
  await attempt('liked songs', async () => {
    type Saved = { added_at: string; track: Track };
    const first = await spotifyGet<Paging<Saved>>('/me/tracks?limit=50&offset=0');
    profile.likedTotal = first.total;
    const offsets: number[] = [];
    for (let o = 50; o < first.total; o += 50) offsets.push(o);
    let done = first.items.length;
    const rest = await pool(
      offsets.map((offset) => async () => {
        const page = await spotifyGet<Paging<Saved>>(`/me/tracks?limit=50&offset=${offset}`);
        done += page.items.length;
        onProgress(
          `Reading your liked songs… ${done.toLocaleString()} / ${first.total.toLocaleString()}`,
          0.35 + 0.6 * (done / Math.max(first.total, 1)),
        );
        return page;
      }),
      4,
    );
    for (const page of [first, ...rest]) {
      for (const { added_at, track } of page.items) {
        const trackId = addTrack(track);
        if (!trackId) continue;
        for (const a of track.artists) {
          if (!a.id) continue;
          const stats = artist(a.id, a.name);
          stats.url ??= a.external_urls?.spotify;
          stats.liked.push({ trackId, addedAt: added_at });
        }
      }
    }
  });

  if (profile.warnings.length === 5) {
    throw new Error(
      "Spotify didn't return any listening data. If the app is in development mode, check that this account is added under User Management in the Spotify dashboard.",
    );
  }

  onProgress('Building your lineup…', 1);
  saveProfile(profile);
  return profile;
}

/** Fetches one artist's full profile (for images of artists only seen via liked songs). */
export async function fetchArtist(id: string): Promise<FullArtist> {
  return spotifyGet<FullArtist>(`/artists/${id}`);
}
