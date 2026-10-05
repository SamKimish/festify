import { useEffect, useRef, useState } from 'react';
import { reasonsFor, songsFor, type CuratedAct, type ScoredArtist } from '../curate';
import type { Festival } from '../festivals';
import { ActLabel } from './ActLabel';

const listFormat = (names: string[]) => new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(names);
import { fetchArtist, pickImage, RANGE_LABEL, type ListeningProfile } from '../spotify/profile';

interface Props {
  curated: CuratedAct;
  festival: Festival;
  profile: ListeningProfile;
  /** False when the artists aren't Spotify artists (demo, Last.fm, data export). */
  spotifyLookups: boolean;
  onClose: () => void;
}

function hashColor(id: string, colors: string[]) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}

function ArtistImage({ artist, festival, demo }: { artist: ScoredArtist; festival: Festival; demo: boolean }) {
  const [src, setSrc] = useState(artist.stats.image);
  useEffect(() => {
    setSrc(artist.stats.image);
    if (artist.stats.image || demo) return;
    // Artists only seen via liked songs come without images; look them up.
    let cancelled = false;
    fetchArtist(artist.stats.id)
      .then((full) => {
        const url = pickImage(full.images);
        if (!cancelled && url) {
          artist.stats.image = url;
          setSrc(url);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [artist, demo]);

  const color = hashColor(artist.stats.id, festival.theme.dotColors);
  return src ? (
    <img className="artist-image" src={src} alt="" style={{ background: color }} />
  ) : (
    <div className="artist-image artist-image-empty" style={{ background: color }} aria-hidden>
      {artist.stats.name.charAt(0)}
    </div>
  );
}

export function ArtistModal({ curated, festival, profile, spotifyLookups, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={curated.act.display}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {curated.artists.length > 1 && <p className="modal-act">{curated.act.display}</p>}
        {curated.artists.length === 0 && (
          <section className="artist">
            <div className="artist-head">
              <div
                className="artist-image artist-image-empty"
                style={{ background: hashColor(curated.act.display, festival.theme.dotColors) }}
                aria-hidden
              >
                {curated.act.display.charAt(0)}
              </div>
              <div>
                <h2 className="artist-name">
                  <ActLabel act={curated} />
                </h2>
                <p className="artist-reasons">
                  {curated.origin === 'suggested'
                    ? `You might like them: they're similar to ${listFormat(curated.because ?? [])}, who you listen to.`
                    : 'You added this act to your poster.'}
                </p>
                <a
                  className="spotify-link"
                  href={`https://open.spotify.com/search/${encodeURIComponent(curated.act.members[0]?.name ?? curated.act.display)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Find on Spotify ↗
                </a>
              </div>
            </div>
          </section>
        )}
        {curated.artists.map((artist) => {
          const songs = songsFor(artist.stats, profile);
          return (
            <section key={artist.stats.id} className="artist">
              <div className="artist-head">
                <ArtistImage artist={artist} festival={festival} demo={!spotifyLookups} />
                <div>
                  <h2 className="artist-name">{artist.stats.name}</h2>
                  <ul className="artist-reasons">
                    {reasonsFor(artist.stats, profile.source).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  {artist.stats.url && (
                    <a className="spotify-link" href={artist.stats.url} target="_blank" rel="noreferrer">
                      {artist.stats.url.includes('/search/') ? 'Find on Spotify ↗' : 'Open in Spotify ↗'}
                    </a>
                  )}
                </div>
              </div>

              <h3 className="songs-title">Your most-played</h3>
              {songs.length === 0 ? (
                <p className="songs-empty">
                  No individual songs to show: only your top {profile.topSize} tracks are counted.
                </p>
              ) : (
                <ol className="songs">
                  {songs.map(({ track, top, liked }) => (
                    <li key={track.id}>
                      {track.image ? <img src={track.image} alt="" /> : <span className="song-art" />}
                      <div className="song-text">
                        {track.url ? (
                          <a href={track.url} target="_blank" rel="noreferrer">
                            {track.name}
                          </a>
                        ) : (
                          <span>{track.name}</span>
                        )}
                        <small>{track.album}</small>
                      </div>
                      <div className="song-tags">
                        {track.plays ? (
                          <span className="tag">
                            {track.plays.toLocaleString()} play{track.plays === 1 ? '' : 's'}
                          </span>
                        ) : top && (
                          <span className="tag" title={`#${top.rank + 1} in your top tracks, ${RANGE_LABEL[top.range]}`}>
                            #{top.rank + 1} · {RANGE_LABEL[top.range]}
                          </span>
                        )}
                        {liked && (
                          <span className="tag tag-liked" title="In your Liked Songs">
                            ♥
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
