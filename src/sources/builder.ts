import { normalizeName } from '../curate';
import {
  PROFILE_VERSION,
  type ArtistStats,
  type ListeningProfile,
  type ProfileSource,
  type TimeRange,
} from '../spotify/profile';

/**
 * Builds a ListeningProfile from sources that identify artists by name
 * (Last.fm, Spotify data exports) rather than by Spotify ID.
 */
export class ProfileBuilder {
  readonly profile: ListeningProfile;

  constructor(source: ProfileSource, userId: string, displayName: string, topSize: number) {
    this.profile = {
      version: PROFILE_VERSION,
      source,
      topSize,
      userId,
      displayName,
      fetchedAt: Date.now(),
      likedTotal: 0,
      tracks: {},
      artists: {},
      warnings: [],
    };
  }

  artist(name: string): ArtistStats {
    const id = `${this.profile.source}:${normalizeName(name)}`;
    return (this.profile.artists[id] ??= {
      id,
      name,
      // No Spotify artist ID, so link to a Spotify search instead.
      url: `https://open.spotify.com/search/${encodeURIComponent(name)}`,
      topRanks: {},
      topTracks: [],
      liked: [],
      recent: 0,
      followed: false,
    });
  }

  track(artist: string, name: string, extra: { album?: string; url?: string; plays?: number } = {}): string {
    const id = `${normalizeName(artist)}|${normalizeName(name)}`;
    const existing = this.profile.tracks[id];
    if (existing) {
      if (extra.plays !== undefined) existing.plays = Math.max(existing.plays ?? 0, extra.plays);
      return id;
    }
    this.profile.tracks[id] = {
      id,
      name,
      album: extra.album ?? '',
      url: extra.url ?? `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${name}`)}`,
      plays: extra.plays,
    };
    return id;
  }

  topArtist(name: string, range: TimeRange, rank: number, plays?: number) {
    const a = this.artist(name);
    a.topRanks[range] = Math.min(rank, a.topRanks[range] ?? Infinity);
    if (plays !== undefined && range === 'long_term') a.plays = plays;
  }

  topTrack(artist: string, name: string, range: TimeRange, rank: number, extra?: Parameters<ProfileBuilder['track']>[2]) {
    const trackId = this.track(artist, name, extra);
    this.artist(artist).topTracks.push({ trackId, range, rank });
  }

  liked(artist: string, name: string, addedAt: string) {
    const trackId = this.track(artist, name);
    this.artist(artist).liked.push({ trackId, addedAt });
    this.profile.likedTotal++;
  }
}
