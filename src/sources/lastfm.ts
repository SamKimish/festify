import type { ListeningProfile, Progress, TimeRange } from '../spotify/profile';
import { saveProfile } from '../spotify/profile';
import { ProfileBuilder } from './builder';

const KEY = import.meta.env.VITE_LASTFM_API_KEY as string | undefined;
const API = 'https://ws.audioscrobbler.com/2.0/';
const USER_KEY = 'festify.lastfm';
/** How many top artists / tracks to read per period. */
const TOP_SIZE = 200;
/** How far back to look, as offered in the sidebar. */
export type LastfmPeriod = 'overall' | '12month' | '6month' | '3month' | '1month';
export const LASTFM_PERIODS: { id: LastfmPeriod; label: string }[] = [
  { id: 'overall', label: 'All time' },
  { id: '12month', label: 'Last 12 months' },
  { id: '6month', label: 'Last 6 months' },
  { id: '3month', label: 'Last 3 months' },
  { id: '1month', label: 'Last month' },
];

/**
 * Last.fm periods standing in for Spotify's short / medium / long term, for each
 * choice: the whole window, plus shorter ones inside it so recent listening
 * still counts for a bit more.
 */
const LADDERS: Record<LastfmPeriod, Partial<Record<TimeRange, string>>> = {
  overall: { short_term: '1month', medium_term: '6month', long_term: 'overall' },
  '12month': { short_term: '1month', medium_term: '6month', long_term: '12month' },
  '6month': { short_term: '1month', medium_term: '3month', long_term: '6month' },
  '3month': { short_term: '7day', medium_term: '1month', long_term: '3month' },
  '1month': { short_term: '7day', long_term: '1month' },
};
const PERIOD_LABEL: Record<string, string> = {
  '7day': 'last 7 days',
  '1month': 'last month',
  '3month': 'last 3 months',
  '6month': 'last 6 months',
  '12month': 'last 12 months',
  overall: 'all time',
};
const PERIOD_DAYS: Record<LastfmPeriod, number> = { overall: Infinity, '12month': 365, '6month': 182, '3month': 91, '1month': 30 };

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
export async function fetchLastfmProfile(
  username: string,
  period: LastfmPeriod,
  onProgress: Progress,
): Promise<ListeningProfile> {
  onProgress('Finding your Last.fm profile…', 0);
  const info = await lastfm<{ user: { name: string; realname?: string } }>('user.getinfo', { user: username });
  const b = new ProfileBuilder('lastfm', info.user.name, info.user.realname || info.user.name, TOP_SIZE);
  const ladder = LADDERS[period];
  b.profile.period = period;
  b.profile.rangeLabels = Object.fromEntries(Object.entries(ladder).map(([r, p]) => [r, PERIOD_LABEL[p!]]));
  try {
    localStorage.setItem(USER_KEY, info.user.name);
  } catch {
    /* storage unavailable */
  }

  const ranges = Object.entries(ladder) as [TimeRange, string][];
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
    // Only tracks loved within the chosen window.
    const since = Date.now() - PERIOD_DAYS[period] * 864e5;
    for (const t of list(loved.lovedtracks.track)) {
      const lovedAt = t.date ? Number(t.date.uts) * 1000 : 0;
      if (period !== 'overall' && lovedAt < since) continue;
      b.liked(artistName(t), t.name, lovedAt ? new Date(lovedAt).toISOString() : '');
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
