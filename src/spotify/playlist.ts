import { songsFor, type CuratedAct } from '../curate';
import { spotifyGet, spotifyPost, type Track } from './api';
import type { ListeningProfile } from './profile';

/** Songs per act, by position on the poster: headliners get more. */
const songsForPosition = (i: number) => (i < 4 ? 3 : i < 14 ? 2 : 1);

/** Your own top / liked songs by the act, or Spotify search for acts you added or were suggested. */
async function urisFor(a: CuratedAct, count: number, profile: ListeningProfile): Promise<string[]> {
  const own = a.artists
    .flatMap((artist) => songsFor(artist.stats, profile, count))
    .map((s) => s.track.id)
    // Spotify track IDs are 22 base-62 characters (other sources use made-up keys).
    .filter((id) => /^[0-9A-Za-z]{22}$/.test(id));
  if (own.length) return [...new Set(own)].slice(0, count).map((id) => `spotify:track:${id}`);

  // Artist top-tracks was removed for development-mode apps, so search instead.
  const name = a.act.members[0]?.name ?? a.act.display;
  try {
    const res = await spotifyGet<{ tracks: { items: Track[] } }>(
      `/search?type=track&limit=10&q=${encodeURIComponent(`artist:"${name}"`)}`,
    );
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    return res.tracks.items
      .filter((t) => t.id && t.artists.some((ar) => norm(ar.name) === norm(name)))
      .slice(0, count)
      .map((t) => `spotify:track:${t.id}`);
  } catch {
    return [];
  }
}

/**
 * Creates a private playlist of the poster, in billing order, and returns its
 * Spotify link.
 */
export async function createPosterPlaylist(
  acts: CuratedAct[],
  profile: ListeningProfile,
  title: string,
  onProgress: (done: number, total: number) => void,
): Promise<{ url: string; tracks: number }> {
  const uris: string[] = [];
  for (const [i, a] of acts.entries()) {
    onProgress(i, acts.length);
    for (const uri of await urisFor(a, songsForPosition(i), profile)) if (!uris.includes(uri)) uris.push(uri);
  }
  if (!uris.length) throw new Error("Couldn't find any songs for this lineup on Spotify.");

  const playlist = await spotifyPost<{ id: string; external_urls: { spotify: string } }>('/me/playlists', {
    name: title,
    description: 'Your festival lineup, made with Festify (samkimish.github.io/festify).',
    public: false,
  });
  for (let i = 0; i < uris.length; i += 100) {
    await spotifyPost(`/playlists/${playlist.id}/items`, { uris: uris.slice(i, i + 100) });
  }
  onProgress(acts.length, acts.length);
  return { url: playlist.external_urls.spotify, tracks: uris.length };
}
