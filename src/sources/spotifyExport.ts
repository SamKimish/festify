import { unzipSync, strFromU8 } from 'fflate';
import type { ListeningProfile, Progress, TimeRange } from '../spotify/profile';
import { saveProfile } from '../spotify/profile';
import { ProfileBuilder } from './builder';

/**
 * Reads a Spotify data export (Account privacy settings → "Download your
 * data"): either the quick "Account data" export (StreamingHistory_music_*.json,
 * the last year) or "Extended streaming history" (Streaming_History_Audio_*.json,
 * your whole account), as the .zip or the JSON files themselves.
 * Everything happens in the browser; nothing is uploaded anywhere.
 */

const TOP_SIZE = 200;
/** A stream only counts as a play after 30 seconds, like Spotify's own stats. */
const MIN_MS = 30_000;
const DAY = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<TimeRange, number> = { short_term: 28, medium_term: 182, long_term: Infinity };
const HISTORY_FILE = /(Streaming_History_Audio|StreamingHistory_music|StreamingHistory)[^/]*\.json$/i;

interface Play {
  at: number;
  artist: string;
  track: string;
  album?: string;
  trackId?: string;
}

type ExtendedRecord = {
  ts: string;
  ms_played: number;
  master_metadata_track_name: string | null;
  master_metadata_album_artist_name: string | null;
  master_metadata_album_album_name?: string | null;
  spotify_track_uri?: string | null;
};
type BasicRecord = { endTime: string; artistName: string; trackName: string; msPlayed: number };

export class ExportError extends Error {
  name = 'ExportError';
}

function parseRecords(records: unknown[], plays: Play[]) {
  for (const r of records) {
    if (r && typeof r === 'object' && 'ms_played' in r) {
      const e = r as ExtendedRecord;
      if (e.ms_played < MIN_MS || !e.master_metadata_album_artist_name || !e.master_metadata_track_name) continue;
      plays.push({
        at: Date.parse(e.ts),
        artist: e.master_metadata_album_artist_name,
        track: e.master_metadata_track_name,
        album: e.master_metadata_album_album_name ?? undefined,
        trackId: e.spotify_track_uri?.startsWith('spotify:track:') ? e.spotify_track_uri.slice(14) : undefined,
      });
    } else if (r && typeof r === 'object' && 'msPlayed' in r) {
      const b = r as BasicRecord;
      if (b.msPlayed < MIN_MS || !b.artistName || !b.trackName) continue;
      plays.push({ at: Date.parse(b.endTime.replace(' ', 'T') + 'Z'), artist: b.artistName, track: b.trackName });
    }
  }
}

/** Collects every streaming-history JSON from the chosen files (zips included). */
async function readFiles(files: File[]): Promise<{ plays: Play[]; username?: string }> {
  const plays: Play[] = [];
  let username: string | undefined;
  const readJson = (name: string, text: string) => {
    if (/Userdata\.json$/i.test(name)) {
      try {
        username = JSON.parse(text).username;
      } catch {
        /* not essential */
      }
    }
    if (!HISTORY_FILE.test(name)) return;
    const data = JSON.parse(text);
    if (Array.isArray(data)) parseRecords(data, plays);
  };
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
        filter: (f) => HISTORY_FILE.test(f.name) || /Userdata\.json$/i.test(f.name),
      });
      for (const [name, data] of Object.entries(entries)) readJson(name, strFromU8(data));
    } else if (/\.json$/i.test(file.name)) {
      readJson(file.name, await file.text());
    }
  }
  return { plays, username };
}

/** Turns a Spotify data export into a listening profile with real play counts. */
export async function importSpotifyExport(files: File[], onProgress: Progress): Promise<ListeningProfile> {
  onProgress('Unpacking your Spotify data…', 0.1);
  const { plays, username } = await readFiles(files);
  if (!plays.length) {
    throw new ExportError(
      "Couldn't find any listening history in that file. Choose the .zip Spotify emailed you, or the StreamingHistory / Streaming_History_Audio JSON files inside it.",
    );
  }
  onProgress(`Counting ${plays.length.toLocaleString()} plays…`, 0.5);

  const b = new ProfileBuilder('export', username ?? 'spotify-export', username ?? 'Spotify listener', TOP_SIZE);
  // (A loop, not Math.max(...), which overflows the stack on big histories.)
  let latest = 0;
  for (const p of plays) if (p.at > latest) latest = p.at;
  const trackUrl = (p: Play) => (p.trackId ? `https://open.spotify.com/track/${p.trackId}` : undefined);

  for (const [range, days] of Object.entries(RANGE_DAYS) as [TimeRange, number][]) {
    const since = latest - days * DAY;
    const artistPlays = new Map<string, number>();
    const trackPlays = new Map<string, { play: Play; count: number }>();
    for (const p of plays) {
      if (!(p.at >= since)) continue;
      artistPlays.set(p.artist, (artistPlays.get(p.artist) ?? 0) + 1);
      const key = `${p.artist}\u0000${p.track}`;
      const t = trackPlays.get(key);
      if (t) t.count++;
      else trackPlays.set(key, { play: p, count: 1 });
    }
    [...artistPlays]
      .sort((a, b2) => b2[1] - a[1])
      .slice(0, TOP_SIZE)
      .forEach(([name, count], i) => b.topArtist(name, range, i, count));
    [...trackPlays.values()]
      .sort((a, b2) => b2.count - a.count)
      .slice(0, TOP_SIZE)
      .forEach(({ play, count }, i) =>
        b.topTrack(play.artist, play.track, range, i, {
          album: play.album,
          url: trackUrl(play),
          plays: range === 'long_term' ? count : undefined,
        }),
      );
  }

  // Last 50 plays, for the "recently played" signal.
  for (const p of [...plays].sort((a, b2) => b2.at - a.at).slice(0, 50)) b.artist(p.artist).recent++;

  onProgress('Building your lineup…', 1);
  saveProfile(b.profile);
  return b.profile;
}
