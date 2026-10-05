import { useRef, useState, type FormEvent } from 'react';

interface Props {
  festivalList: string;
  error?: string;
  spotifyConfigured: boolean;
  lastfmConfigured: boolean;
  configHint: string;
  onSpotify: () => void;
  onLastfm: (username: string) => void;
  onUpload: (files: File[]) => void;
  onDemo: () => void;
}

export function Welcome(props: Props) {
  const [username, setUsername] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const submitLastfm = (e: FormEvent) => {
    e.preventDefault();
    if (username.trim()) props.onLastfm(username.trim());
  };

  return (
    <section className="welcome">
      <h1>
        Your lineup<span className="brand-star">*</span>
        <br />
        your headliners
      </h1>
      <p>
        Log in with Spotify, pick a festival and we'll rebuild its official lineup poster around the artists you
        actually listen to. Your favourite act on the small print? They're headlining now.
      </p>
      <p className="welcome-festivals">Now playing: {props.festivalList}.</p>
      {props.error && (
        <p className="error" role="alert">
          {props.error}
        </p>
      )}

      <div className="welcome-actions">
        {props.spotifyConfigured ? (
          <button type="button" className="primary" onClick={props.onSpotify}>
            Log in with Spotify
          </button>
        ) : (
          <p className="error">{props.configHint}</p>
        )}
        <button type="button" className="secondary" onClick={props.onDemo}>
          Try it with demo data
        </button>
      </div>

      <div className="other-ways">
        <h2>Other ways in</h2>
        <p className="other-ways-note">
          Spotify login is invite-only while Festify is in Spotify's testing mode. These work for everyone.
        </p>

        {props.lastfmConfigured && (
          <form className="way" onSubmit={submitLastfm}>
            <label htmlFor="lastfm-user" className="way-title">
              Use your Last.fm
            </label>
            <p className="way-help">If you scrobble to Last.fm, we'll use your real play counts. No login needed.</p>
            <div className="way-row">
              <input
                id="lastfm-user"
                type="text"
                placeholder="Last.fm username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <button type="submit" className="secondary" disabled={!username.trim()}>
                Build my poster
              </button>
            </div>
          </form>
        )}

        <div className="way">
          <p className="way-title">Upload your Spotify data</p>
          <p className="way-help">
            Request it in Spotify under Account → Privacy settings → Download your data. "Account data" covers the last
            year; "Extended streaming history" goes back to day one. Drop in the .zip Spotify emails you. It's read in
            your browser and never uploaded anywhere.
          </p>
          <div className="way-row">
            <input
              ref={fileRef}
              type="file"
              accept=".zip,.json,application/zip,application/json"
              multiple
              className="visually-hidden"
              id="spotify-export"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                if (files.length) props.onUpload(files);
                e.target.value = '';
              }}
            />
            <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
              Choose file…
            </button>
          </div>
        </div>
      </div>

      <p className="fine-print">
        With Spotify, Festify reads your top artists, top tracks, liked songs, followed artists and recently played
        tracks. Everything stays in your browser.
      </p>
    </section>
  );
}
