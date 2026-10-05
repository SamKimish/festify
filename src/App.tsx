import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArtistModal } from './components/ArtistModal';
import { Poster } from './components/Poster';
import { PosterActions } from './components/PosterActions';
import { curate, reasonsFor, type CuratedAct } from './curate';
import { demoProfile } from './demo';
import { festivals } from './festivals';
import { handleRedirect, isConfigured, isLoggedIn, login, logout, redirectUri } from './spotify/auth';
import {
  clearCachedProfile,
  fetchProfile,
  loadCachedProfile,
  type ListeningProfile,
} from './spotify/profile';

type State =
  | { kind: 'starting' }
  | { kind: 'signedOut'; error?: string }
  | { kind: 'loading'; message: string; fraction?: number }
  | { kind: 'ready'; profile: ListeningProfile; demo: boolean }
  | { kind: 'error'; error: string };

const FESTIVAL_KEY = 'festify.festival';

function storedFestival(): string {
  try {
    const id = localStorage.getItem(FESTIVAL_KEY);
    if (id && festivals.some((f) => f.id === id)) return id;
  } catch {
    /* storage unavailable */
  }
  return festivals[0].id;
}

/** e.g. "Primavera Sound Barcelona 2027 and Slam Dunk Festival 2027". */
const festivalList = new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(festivals.map((f) => f.name));

export default function App() {
  const [state, setState] = useState<State>({ kind: 'starting' });
  const [festivalId, setFestivalId] = useState(storedFestival);
  const [selected, setSelected] = useState<CuratedAct | null>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const festival = festivals.find((f) => f.id === festivalId) ?? festivals[0];

  const load = useCallback(async (force = false) => {
    const cached = force ? null : loadCachedProfile();
    if (cached) {
      setState({ kind: 'ready', profile: cached, demo: false });
      return;
    }
    setState({ kind: 'loading', message: 'Connecting to Spotify…', fraction: 0 });
    try {
      const profile = await fetchProfile((message, fraction) =>
        setState({ kind: 'loading', message, fraction }),
      );
      setState({ kind: 'ready', profile, demo: false });
    } catch (e) {
      console.error(e);
      if (!isLoggedIn()) setState({ kind: 'signedOut', error: 'Your Spotify session expired. Please log in again.' });
      else setState({ kind: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    (async () => {
      let error: string | null = null;
      try {
        error = await handleRedirect();
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      if (isLoggedIn()) await load();
      else setState({ kind: 'signedOut', error: error ?? undefined });
    })();
  }, [load]);

  useEffect(() => {
    try {
      localStorage.setItem(FESTIVAL_KEY, festivalId);
    } catch {
      /* storage unavailable */
    }
  }, [festivalId]);

  // The demo listener is invented per festival, so make a new one on switching.
  const isDemo = state.kind === 'ready' && state.demo;
  useEffect(() => {
    if (isDemo) setState({ kind: 'ready', profile: demoProfile(festival), demo: true });
  }, [festival, isDemo]);

  const profile = state.kind === 'ready' ? state.profile : null;
  const acts = useMemo(() => (profile ? curate(festival, profile) : []), [festival, profile]);

  const signOut = () => {
    logout();
    clearCachedProfile();
    setState({ kind: 'signedOut' });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          festify<span className="brand-star">*</span>
        </div>
        <label className="festival-picker">
          <span className="visually-hidden">Festival</span>
          <select value={festivalId} onChange={(e) => setFestivalId(e.target.value)}>
            {festivals.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        {state.kind === 'ready' && (
          <div className="user">
            <span className="user-name">{state.profile.displayName}</span>
            {!state.demo && (
              <button type="button" className="link-button" onClick={() => load(true)}>
                Refresh
              </button>
            )}
            <button type="button" className="link-button" onClick={signOut}>
              {state.demo ? 'Exit demo' : 'Log out'}
            </button>
          </div>
        )}
      </header>

      <main>
        {state.kind === 'starting' && <p className="status">Loading…</p>}

        {state.kind === 'signedOut' && (
          <section className="welcome">
            <h1>
              Your lineup<span className="brand-star">*</span>
              <br />
              your headliners
            </h1>
            <p>
              Log in with Spotify, pick a festival and we'll rebuild its official lineup poster around the
              artists you actually listen to. Your favourite act on the small print? They're headlining now.
            </p>
            <p className="welcome-festivals">Now playing: {festivalList}.</p>
            {state.error && <p className="error">{state.error}</p>}
            <div className="welcome-actions">
              {isConfigured ? (
                <button type="button" className="primary" onClick={() => login()}>
                  Log in with Spotify
                </button>
              ) : (
                <p className="error">
                  Spotify isn't configured yet: set <code>VITE_SPOTIFY_CLIENT_ID</code> in{' '}
                  <code>.env.local</code> and register <code>{redirectUri()}</code> as a redirect URI.
                </p>
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => setState({ kind: 'ready', profile: demoProfile(festival), demo: true })}
              >
                Try it with demo data
              </button>
            </div>
            <p className="fine-print">
              Festify reads your top artists, top tracks, liked songs, followed artists and recently played
              tracks. Everything stays in your browser.
            </p>
          </section>
        )}

        {state.kind === 'loading' && (
          <section className="status">
            <p>{state.message}</p>
            <div className="progress">
              <div style={{ width: `${Math.round((state.fraction ?? 0) * 100)}%` }} />
            </div>
          </section>
        )}

        {state.kind === 'error' && (
          <section className="status">
            <p className="error">{state.error}</p>
            <button type="button" className="primary" onClick={() => load(true)}>
              Try again
            </button>{' '}
            <button type="button" className="secondary" onClick={signOut}>
              Log out
            </button>
          </section>
        )}

        {state.kind === 'ready' && (
          <div className="result">
            {state.demo && (
              <p className="demo-banner">Demo data: these are made-up listening stats.</p>
            )}
            <div className="poster-wrap">
              <Poster
                ref={posterRef}
                festival={festival}
                acts={acts}
                curatedFor={state.profile.displayName}
                onSelect={setSelected}
              />
            </div>

            <aside className="sidebar">
              <div className="summary">
                <strong>{acts.length}</strong> of {festival.lineup.length} acts on your poster
                <PosterActions
                  posterRef={posterRef}
                  version={`${festival.id}|${state.profile.userId}|${state.profile.fetchedAt}`}
                  filename={`my-${festival.id}-lineup.png`}
                  width={festival.width}
                  shareText={`My personal ${festival.name} lineup, made with Festify:`}
                />
              </div>
              {state.profile.warnings.length > 0 && (
                <p className="warning">
                  Spotify didn't share your {state.profile.warnings.join(', ')}, so the lineup may be
                  incomplete.
                </p>
              )}
              <ol className="ranking">
                {acts.map((a, i) => (
                  <li key={a.act.display}>
                    <button type="button" onClick={() => setSelected(a)}>
                      <span className="ranking-pos">{i + 1}</span>
                      <span className="ranking-name">{a.act.display}</span>
                      <span className="ranking-why">{reasonsFor(a.artists[0].stats).slice(0, 2).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        )}
      </main>

      {selected && profile && (
        <ArtistModal
          curated={selected}
          festival={festival}
          profile={profile}
          demo={state.kind === 'ready' && state.demo}
          onClose={() => setSelected(null)}
        />
      )}

      <footer className="footer">
        Unofficial fan project. Not affiliated with any festival or with Spotify. Data from Spotify.
      </footer>
    </div>
  );
}
