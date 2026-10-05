import { useEffect, useRef, useState } from 'react';
import { reasonsFor, songsFor, type CuratedAct, type ScoredArtist } from '../curate';
import type { Festival } from '../festivals';
import { fetchArtist, pickImage, RANGE_LABEL, type ListeningProfile } from '../spotify/profile';

interface Props {
  curated: CuratedAct;
  festival: Festival;
  profile: ListeningProfile;
  demo: boolean;
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

export function ArtistModal({ curated, festival, profile, demo, onClose }: Props) {
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
        {curated.artists.map((artist) => {
          const songs = songsFor(artist.stats, profile);
          return (
            <section key={artist.stats.id} className="artist">
              <div className="artist-head">
                <ArtistImage artist={artist} festival={festival} demo={demo} />
                <div>
                  <h2 className="artist-name">{artist.stats.name}</h2>
                  <ul className="artist-reasons">
                    {reasonsFor(artist.stats).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  {artist.stats.url && (
                    <a className="spotify-link" href={artist.stats.url} target="_blank" rel="noreferrer">
                      Open in Spotify ↗
                    </a>
                  )}
                </div>
              </div>

              <h3 className="songs-title">Your most-played</h3>
              {songs.length === 0 ? (
                <p className="songs-empty">No individual songs to show. Spotify only shares your top 100 tracks.</p>
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
                        {top && (
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
