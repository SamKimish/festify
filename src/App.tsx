import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArtistModal } from './components/ArtistModal';
import { Poster } from './components/Poster';
import { PosterActions } from './components/PosterActions';
import { curate, reasonsFor, type CuratedAct } from './curate';
import { demoProfile } from './demo';
import { comingSoon, festivals, festivalsByEdition, lineupOf, loadLineup, type Act } from './festivals';
import { SpotifyError } from './spotify/api';
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

const DEFAULT_TITLE = 'Festify · Your festival lineup, built from your Spotify';

/** Turns errors into something a person can act on. */
function friendlyError(e: unknown): string {
  if (e instanceof SpotifyError) {
    if (e.status === 403) {
      return "Spotify won't share this account's listening with Festify yet. While Festify is in Spotify's testing mode, only invited accounts can log in, so ask whoever sent you the link to add your Spotify email.";
    }
    if (e.status === 401) return 'Your Spotify session expired. Please log in again.';
    if (e.status === 429) return 'Spotify is getting a lot of requests right now. Wait a minute, then try again.';
    if (e.status >= 500) return 'Spotify is having trouble right now. Try again in a minute.';
  }
  if (e instanceof TypeError) return "Couldn't reach Spotify. Check your internet connection and try again.";
  const message = e instanceof Error ? e.message : String(e);
  if (/token request failed/i.test(message)) return "Spotify sign-in didn't finish. Please try logging in again.";
  return message;
}

/** e.g. "Primavera Sound Barcelona, Slam Dunk Festival and Glastonbury Festival". */
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
      if (e instanceof SpotifyError && e.status === 401) logout();
      if (!isLoggedIn()) setState({ kind: 'signedOut', error: 'Your Spotify session expired. Please log in again.' });
      else setState({ kind: 'error', error: friendlyError(e) });
    }
  }, []);

  useEffect(() => {
    (async () => {
      let error: string | null = null;
      try {
        error = await handleRedirect();
      } catch (e) {
        console.error(e);
        error = friendlyError(e);
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

  // Big lineups (Glastonbury) download separately when picked.
  const [loaded, setLoaded] = useState<{ id: string; acts: Act[] | null; failed?: boolean }>(() => ({
    id: festival.id,
    acts: lineupOf(festival),
  }));
  const lineup = loaded.id === festival.id ? loaded.acts : lineupOf(festival);
  const lineupFailed = loaded.id === festival.id && Boolean(loaded.failed);
  const fetchLineup = useCallback(() => {
    setLoaded({ id: festival.id, acts: lineupOf(festival) });
    if (lineupOf(festival)) return undefined;
    let live = true;
    loadLineup(festival)
      .then((acts) => live && setLoaded({ id: festival.id, acts }))
      .catch((e) => {
        console.error(e);
        if (live) setLoaded({ id: festival.id, acts: null, failed: true });
      });
    return () => {
      live = false;
    };
  }, [festival]);
  useEffect(fetchLineup, [fetchLineup]);

  // The demo listener is invented per festival, so make a new one on switching.
  const isDemo = state.kind === 'ready' && state.demo;
  useEffect(() => {
    if (isDemo && lineup) setState({ kind: 'ready', profile: demoProfile(lineup), demo: true });
  }, [lineup, isDemo]);

  const profile = state.kind === 'ready' ? state.profile : null;
  const acts = useMemo(() => (profile && lineup ? curate(lineup, profile) : []), [lineup, profile]);
  const editionName = `${festival.name} ${festival.edition}`;

  useEffect(() => {
    document.title =
      state.kind === 'ready' ? `${state.demo ? 'Demo' : 'Your'} ${editionName} lineup · Festify` : DEFAULT_TITLE;
  }, [state, editionName]);

  const signOut = () => {
    logout();
    clearCachedProfile();
    setState({ kind: 'signedOut' });
  };

  return (
    <div className="app">
      <header className="topbar" inert={selected ? true : undefined}>
        <a className="brand" href={import.meta.env.BASE_URL}>
          festify<span className="brand-star">*</span>
        </a>
        <label className="festival-picker">
          <span className="visually-hidden">Festival</span>
          <select value={festivalId} onChange={(e) => setFestivalId(e.target.value)}>
            {festivalsByEdition.map(([edition, list]) => (
              <optgroup key={edition} label={edition}>
                {list.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            ))}
            {comingSoon.length > 0 && (
              <optgroup label="Coming soon" className="coming-soon">
                {comingSoon.map((name) => (
                  <option key={name} disabled>
                    {name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {state.kind === 'ready' && (
          <div className="user">
            <span className="user-name" title={state.profile.displayName}>
              {state.profile.displayName}
            </span>
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

      <main inert={selected ? true : undefined}>
        {state.kind === 'starting' && (
          <section className="status" aria-busy="true">
            <p>Loading…</p>
            <div className="progress progress-indeterminate">
              <div />
            </div>
          </section>
        )}

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
                onClick={() => setState({ kind: 'ready', profile: demoProfile(lineup ?? []), demo: true })}
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
          <section className="status" role="alert">
            <h1 className="status-title">Couldn't build your poster</h1>
            <p className="error">{state.error}</p>
            <div className="status-actions">
              <button type="button" className="primary" onClick={() => load(true)}>
                Try again
              </button>
              <button type="button" className="secondary" onClick={signOut}>
                Log out
              </button>
            </div>
          </section>
        )}

        {state.kind === 'ready' && (
          <div className="result">
            <h1 className="visually-hidden">
              {state.demo ? 'Demo' : 'Your'} {editionName} lineup
            </h1>
            {state.demo && (
              <p className="demo-banner">Demo data: these are made-up listening stats.</p>
            )}
            <div className="poster-wrap">
              {lineup ? (
                <Poster
                  ref={posterRef}
                  festival={festival}
                  acts={acts}
                  curatedFor={state.profile.displayName}
                  onSelect={setSelected}
                />
              ) : (
                <div
                  className="poster-placeholder"
                  style={{ aspectRatio: `${festival.width} / ${festival.height}` }}
                  aria-busy={!lineupFailed}
                >
                  {lineupFailed ? (
                    <>
                      <p>Couldn't load the {festival.name} lineup.</p>
                      <button type="button" className="secondary" onClick={fetchLineup}>
                        Try again
                      </button>
                    </>
                  ) : (
                    <p>Loading the {festival.name} lineup…</p>
                  )}
                </div>
              )}
            </div>

            <aside className="sidebar">
              <div className="summary">
                <p className="summary-count">
                  {lineup ? (
                    <>
                      <strong>{acts.length}</strong> of {lineup.length.toLocaleString()} acts on your poster
                    </>
                  ) : (
                    'Loading lineup…'
                  )}
                </p>
                {lineup && acts.length > 0 && (
                  <PosterActions
                    posterRef={posterRef}
                    version={`${festival.id}|${state.profile.userId}|${state.profile.fetchedAt}`}
                    filename={`my-${festival.id}-lineup.png`}
                    width={festival.width}
                    shareText={`My personal ${editionName} lineup, made with Festify:`}
                  />
                )}
              </div>
              {lineup && acts.length === 0 && (
                <p className="empty-note">
                  None of your artists are on this lineup. Try another festival from the menu
                  {state.demo ? '' : ', or press Refresh if you’ve been listening to new music lately'}.
                </p>
              )}
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

      <footer className="footer" inert={selected ? true : undefined}>
        Unofficial fan project. Not affiliated with any festival or with Spotify. Data from Spotify.
      </footer>
    </div>
  );
}
