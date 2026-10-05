import { normalizeName, type CuratedAct } from './curate';
import { fetchArtist, pickImage, type ListeningProfile } from './spotify/profile';

/**
 * Artist photos for photo-led posters. Spotify logins use Spotify's artist
 * images; everyone else (and added / suggested acts) gets TheAudioDB's photo,
 * or Deezer's, looked up by name. Images must be served with CORS headers or the PNG export
 * can't include them: Spotify's CDN does, TheAudioDB's image host doesn't, so
 * those go through the images.weserv.nl proxy (which also crops to the face).
 */

const AUDIODB = 'https://www.theaudiodb.com/api/v1/json/123/search.php?s=';

/** A portrait crop of the photo, served with CORS headers. */
export function posterPhoto(url: string): string {
  if (url.includes('scdn.co')) return url; // Spotify's CDN already allows CORS
  const bare = url.replace(/^https?:\/\//, '');
  return `https://images.weserv.nl/?url=${encodeURIComponent(bare)}&w=400&h=560&fit=cover&a=attention&output=jpg&q=82`;
}

const CACHE_DAYS = 30;
// (v2: v1 only tried TheAudioDB, so its "no photo" answers are stale.)
const cacheKey = (name: string) => `festify.photo2.${normalizeName(name)}`;

function cached(name: string): string | null | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(name));
    if (!raw) return undefined;
    const { at, url } = JSON.parse(raw);
    return Date.now() - at < CACHE_DAYS * 864e5 ? url : undefined;
  } catch {
    return undefined;
  }
}

function remember(name: string, url: string | null) {
  try {
    localStorage.setItem(cacheKey(name), JSON.stringify({ at: Date.now(), url }));
  } catch {
    /* cache is optional */
  }
}

async function audioDbPhoto(name: string): Promise<string | null> {
  try {
    const res = await fetch(AUDIODB + encodeURIComponent(name));
    const json = await res.json();
    const artist = (json?.artists ?? []).find(
      (a: { strArtist: string }) => normalizeName(a.strArtist) === normalizeName(name),
    );
    return artist?.strArtistThumb ?? null;
  } catch {
    return null;
  }
}

/** Deezer's API has no CORS headers but supports JSONP, so load it as a script. */
function jsonp<T>(url: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__festifyDeezer${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const w = window as unknown as Record<string, unknown>;
    const done = () => {
      delete w[name];
      script.remove();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('timeout'));
    }, timeoutMs);
    w[name] = (data: T) => {
      done();
      resolve(data);
    };
    script.onerror = () => {
      done();
      reject(new Error('failed'));
    };
    script.src = `${url}&output=jsonp&callback=${name}`;
    document.head.appendChild(script);
  });
}

/** Deezer covers smaller artists TheAudioDB doesn't. */
async function deezerPhoto(name: string): Promise<string | null> {
  try {
    const res = await jsonp<{ data?: { name: string; picture_xl?: string }[] }>(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`,
    );
    const artist = res.data?.find((a) => normalizeName(a.name) === normalizeName(name));
    // Artists without a photo get a generic placeholder with an empty image ID.
    return artist?.picture_xl && !artist.picture_xl.includes('/artist//') ? artist.picture_xl : null;
  } catch {
    return null;
  }
}

/** TheAudioDB first (press shots), then Deezer; the answer is cached either way. */
async function lookupPhoto(name: string): Promise<string | null> {
  const hit = cached(name);
  if (hit !== undefined) return hit;
  const url = (await audioDbPhoto(name)) ?? (await deezerPhoto(name));
  remember(name, url);
  return url;
}

/** Best photo URL for an act, or null if none can be found. */
export async function photoFor(a: CuratedAct, profile: ListeningProfile): Promise<string | null> {
  const artist = a.artists[0]?.stats;
  if (artist?.image) return artist.image;
  if (artist && profile.source === 'spotify') {
    try {
      const url = pickImage((await fetchArtist(artist.id)).images, 300);
      if (url) {
        artist.image = url;
        return url;
      }
    } catch {
      /* fall back to TheAudioDB / Deezer */
    }
  }
  return lookupPhoto(a.act.members[0]?.name ?? a.act.display);
}
