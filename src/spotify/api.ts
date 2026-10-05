import { getAccessToken } from './auth';

const API = 'https://api.spotify.com/v1';

export class SpotifyError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET a Spotify Web API path, retrying when rate-limited (429). */
export async function spotifyGet<T>(path: string, attempt = 0): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429 && attempt < 5) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? '1');
    await wait((retryAfter + 0.5) * 1000);
    return spotifyGet<T>(path, attempt + 1);
  }
  if (res.status >= 500 && attempt < 2) {
    await wait(1000);
    return spotifyGet<T>(path, attempt + 1);
  }
  if (!res.ok) {
    let message = `Spotify request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = `${message}: ${body.error.message}`;
    } catch {
      /* body wasn't JSON */
    }
    throw new SpotifyError(message, res.status);
  }
  return res.json() as Promise<T>;
}

/** Runs `tasks` with at most `limit` in flight at once. */
export async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// --- Response shapes (only the fields Festify uses) ---

export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface SimpleArtist {
  id: string | null;
  name: string;
  external_urls?: { spotify?: string };
}

export interface FullArtist extends SimpleArtist {
  id: string;
  images?: SpotifyImage[];
  genres?: string[];
}

export interface Track {
  id: string | null;
  name: string;
  artists: SimpleArtist[];
  album: { name: string; images?: SpotifyImage[] };
  external_urls?: { spotify?: string };
  is_local?: boolean;
}

export interface Paging<T> {
  items: T[];
  total: number;
  next: string | null;
}

export interface User {
  id: string;
  display_name: string | null;
}
