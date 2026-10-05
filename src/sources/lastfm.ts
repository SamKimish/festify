import type { ListeningProfile, Progress, TimeRange } from '../spotify/profile';
import { saveProfile } from '../spotify/profile';
import { ProfileBuilder } from './builder';

const KEY = import.meta.env.VITE_LASTFM_API_KEY as string | undefined;
const API = 'https://ws.audioscrobbler.com/2.0/';
const USER_KEY = 'festify.lastfm';
/** How many top artists / tracks to read per period. */
const TOP_SIZE = 200;
/** Last.fm periods standing in for Spotify's short / medium / long term. */
const PERIODS: Record<TimeRange, string> = { short_term: '1month', medium_term: '6month', long_term: 'overall' };

export const lastfmConfigured = Boolean(KEY);

export class LastfmError extends Error {
  constructor(
    message: string,
    public code: number,
  ) {
    super(message);
  }
}

/** Calls a Last.fm API method, retrying briefly on rate limits. */
export async function lastfm<T>(method: string, params: Record<string, string | number>, attempt = 0): Promise<T> {
  if (!KEY) throw new LastfmError('Last.fm is not configured', 0);
  const query = new URLSearchParams({ method, api_key: KEY, format: 'json' });
  for (const [k, v] of Object.entries(params)) query.set(k, String(v));
  const res = await fetch(`${API}?${query}`);
  const body = await res.json().catch(() => null);
  if (body?.error) {
    // 29 = rate limit exceeded, 8/16 = temporary errors.
    if ([8, 16, 29].includes(body.error) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return lastfm<T>(method, params, attempt + 1);
    }
    throw new LastfmError(body.message ?? 'Last.fm error', body.error);
  }
  if (!res.ok || !body) throw new LastfmError(`Last.fm request failed (${res.status})`, res.status);
  return body as T;
}

type Named = { name: string; playcount?: string; '@attr'?: { rank?: string } };
type TrackItem = Named & { artist: { name?: string; '#text'?: string } };
const list = <T,>(x: T | T[] | undefined): T[] => (Array.isArray(x) ? x : x ? [x] : []);
const artistName = (t: TrackItem) => t.artist.name ?? t.artist['#text'] ?? '';

export function savedLastfmUser(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

export function forgetLastfmUser() {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Builds a listening profile from a public Last.fm account (no login needed). */
export async function fetchLastfmProfile(username: string, onProgress: Progress): Promise<ListeningProfile> {
  onProgress('Finding your Last.fm profile…', 0);
  const info = await lastfm<{ user: { name: string; realname?: string } }>('user.getinfo', { user: username });
  const b = new ProfileBuilder('lastfm', info.user.name, info.user.realname || info.user.name, TOP_SIZE);
  try {
    localStorage.setItem(USER_KEY, info.user.name);
  } catch {
    /* storage unavailable */
  }

  const ranges = Object.entries(PERIODS) as [TimeRange, string][];
  let step = 0;
  const total = ranges.length * 2 + 2;
  const tick = (message: string) => onProgress(message, ++step / total);

  for (const [range, period] of ranges) {
    const res = await lastfm<{ topartists: { artist: Named | Named[] } }>('user.gettopartists', {
      user: info.user.name,
      period,
      limit: TOP_SIZE,
    });
    list(res.topartists.artist).forEach((a, i) => b.topArtist(a.name, range, i, Number(a.playcount) || undefined));
    tick('Reading your top artists…');
  }
  for (const [range, period] of ranges) {
    const res = await lastfm<{ toptracks: { track: TrackItem | TrackItem[] } }>('user.gettoptracks', {
      user: info.user.name,
      period,
      limit: TOP_SIZE,
    });
    list(res.toptracks.track).forEach((t, i) =>
      b.topTrack(artistName(t), t.name, range, i, range === 'long_term' ? { plays: Number(t.playcount) || undefined } : {}),
    );
    tick('Reading your top tracks…');
  }

  try {
    const loved = await lastfm<{ lovedtracks: { track: (TrackItem & { date?: { uts: string } })[] } }>(
      'user.getlovedtracks',
      { user: info.user.name, limit: 1000 },
    );
    for (const t of list(loved.lovedtracks.track)) {
      b.liked(artistName(t), t.name, t.date ? new Date(Number(t.date.uts) * 1000).toISOString() : '');
    }
  } catch {
    b.profile.warnings.push('loved tracks');
  }
  tick('Reading your loved tracks…');

  try {
    const recent = await lastfm<{ recenttracks: { track: TrackItem[] } }>('user.getrecenttracks', {
      user: info.user.name,
      limit: 50,
    });
    for (const t of list(recent.recenttracks.track)) b.artist(artistName(t)).recent++;
  } catch {
    b.profile.warnings.push('recent scrobbles');
  }
  tick('Building your lineup…');

  if (!Object.keys(b.profile.artists).length) {
    throw new LastfmError("That Last.fm account hasn't scrobbled anything yet.", -1);
  }
  saveProfile(b.profile);
  return b.profile;
}

/** Artists similar to `name`, with Last.fm's 0–1 match score. */
export async function similarArtists(name: string): Promise<{ name: string; match: number }[]> {
  const res = await lastfm<{ similarartists?: { artist: { name: string; match: string }[] } }>('artist.getsimilar', {
    artist: name,
    limit: 100,
    autocorrect: 1,
  });
  return list(res.similarartists?.artist).map((a) => ({ name: a.name, match: Number(a.match) || 0 }));
}
