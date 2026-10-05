import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArtistModal } from './components/ArtistModal';
import { Poster } from './components/Poster';
import { Sidebar } from './components/Sidebar';
import { Welcome } from './components/Welcome';
import { curate, type CuratedAct } from './curate';
import { demoProfile } from './demo';
import {
  comingSoon,
  festivals,
  festivalsByEdition,
  lineupOf,
  loadLineup,
  menuId,
  DEFAULT_FESTIVAL_ID,
  festName,
  personalLineup,
  sitesOf,
  type Act,
} from './festivals';
import { buildPoster, loadEdits, saveEdits, type PosterEdits } from './posterEdits';
import { exportWindow, forgetExport } from './sources/exportWindows';
import { fetchLastfmProfile, forgetLastfmUser, LastfmError, lastfmConfigured, savedLastfmUser } from './sources/lastfm';
import { isListeningPeriod, type ListeningPeriod } from './sources/periods';
import { SpotifyError } from './spotify/api';
import { handleRedirect, isConfigured, isLoggedIn, login, logout, redirectUri } from './spotify/auth';
import {
  clearCachedProfile,
  fetchProfile,
  saveProfile,
  loadCachedProfile,
  type ListeningProfile,
  type Progress,
} from './spotify/profile';
import { suggestActs } from './suggest';

type State =
  | { kind: 'starting' }
  | { kind: 'signedOut'; error?: string }
  | { kind: 'loading'; message: string; fraction?: number }
  | { kind: 'ready'; profile: ListeningProfile }
  | { kind: 'error'; error: string };

const FESTIVAL_KEY = 'festify.festival';
const SUGGEST_KEY = 'festify.suggest';
const DEFAULT_TITLE = 'Festify · Your festival lineup, built from your Spotify';
const SOURCE_LABEL: Record<ListeningProfile['source'], string> = {
  spotify: 'Spotify',
  lastfm: 'Last.fm',
  export: 'Spotify data',
  demo: 'Demo',
};

/** Lower-case, as printed in Primavera's "curated from your … for" line. */
const CREDIT_VIA: Record<ListeningProfile['source'], string> = {
  spotify: 'spotify',
  lastfm: 'last.fm',
  export: 'spotify history',
  demo: 'demo listening',
};

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
};

function storedFestival(): string {
  const id = read(FESTIVAL_KEY);
  return id && festivals.some((f) => f.id === id) ? id : DEFAULT_FESTIVAL_ID;
}

/** Turns errors into something a person can act on. */
function friendlyError(e: unknown): string {
  if (e instanceof SpotifyError) {
    if (e.status === 403) {
      return "Spotify won't share this account's listening with Festify yet. While Festify is in Spotify's testing mode, only invited accounts can log in, so ask whoever sent you the link to add your Spotify email, or use Last.fm or your Spotify data below.";
    }
    if (e.status === 401) return 'Your Spotify session expired. Please log in again.';
    if (e.status === 429) return 'Spotify is getting a lot of requests right now. Wait a minute, then try again.';
    if (e.status >= 500) return 'Spotify is having trouble right now. Try again in a minute.';
  }
  if (e instanceof LastfmError) {
    if (e.code === 6) return "We couldn't find that Last.fm username. Check the spelling and try again.";
    if (e.code === 17) return 'That Last.fm profile is private. Make your listening public in Last.fm settings, then try again.';
    if (e.code === -1) return e.message;
    return 'Last.fm is having trouble right now. Try again in a minute.';
  }
  // (Checked by name: the export reader is loaded on demand.)
  if (e instanceof Error && e.name === 'ExportError') return e.message;
  if (e instanceof SyntaxError) return "That file doesn't look like a Spotify data export. Choose the .zip Spotify emailed you.";
  if (e instanceof TypeError) return "Couldn't connect. Check your internet connection and try again.";
  const message = e instanceof Error ? e.message : String(e);
  if (/token request failed/i.test(message)) return "Spotify sign-in didn't finish. Please try logging in again.";
  return message;
}

/** e.g. "Primavera Sound Barcelona, Slam Dunk Festival and Glastonbury Festival". */
const festivalList = new Intl.ListFormat('en-GB', { type: 'conjunction' }).format([
  ...new Set(festivals.filter((f) => f.layout !== 'personal').map((f) => f.name)),
]);
const SITE_KEY = 'festify.site';
const PERIOD_KEY = 'festify.period';

export default function App() {
  const [state, setState] = useState<State>({ kind: 'starting' });
  const [festivalId, setFestivalId] = useState(storedFestival);
  const [selected, setSelected] = useState<CuratedAct | null>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const festival = festivals.find((f) => f.id === festivalId) ?? festivals[0];

  /** Runs a profile loader with progress, landing in 'ready' or a friendly error. */
  const run = useCallback(async (loader: (progress: Progress) => Promise<ListeningProfile>, onFailSignOut = false) => {
    setState({ kind: 'loading', message: 'Getting started…', fraction: 0 });
    try {
      const profile = await loader((message, fraction) => setState({ kind: 'loading', message, fraction }));
      setState({ kind: 'ready', profile });
    } catch (e) {
      console.error(e);
      if (e instanceof SpotifyError && e.status === 401) logout();
      if (onFailSignOut || (e instanceof SpotifyError && !isLoggedIn())) {
        setState({ kind: 'signedOut', error: friendlyError(e) });
      } else {
        setState({ kind: 'error', error: friendlyError(e) });
      }
    }
  }, []);

  const loadSpotify = useCallback(
    (force = false) => {
      const cached = force ? null : loadCachedProfile();
      if (cached?.source === 'spotify') return setState({ kind: 'ready', profile: cached });
      return run(fetchProfile);
    },
    [run],
  );

  // Last.fm users can choose how far back to look (all time by default).
  // Last.fm and data-upload users can choose how far back to look (all time by default).
  const [listeningPeriod, setListeningPeriod] = useState<ListeningPeriod>(() => {
    const saved = read(PERIOD_KEY) ?? read('festify.lastfm.period'); // (older key)
    return isListeningPeriod(saved) ? saved : 'overall';
  });

  // Read through a ref so Refresh / retry always use the current choice.
  const periodRef = useRef(listeningPeriod);
  periodRef.current = listeningPeriod;

  const loadLastfm = useCallback(
    (username: string, force = false, period: ListeningPeriod = periodRef.current) => {
      const cached = force ? null : loadCachedProfile();
      if (
        cached?.source === 'lastfm' &&
        cached.userId.toLowerCase() === username.toLowerCase() &&
        (cached.period ?? 'overall') === period
      ) {
        return setState({ kind: 'ready', profile: cached });
      }
      return run((p) => fetchLastfmProfile(username, period, p), !savedLastfmUser());
    },
    [run],
  );

  // Pick up where the visitor left off: Spotify login, Last.fm user or uploaded data.
  useEffect(() => {
    (async () => {
      let error: string | null = null;
      try {
        error = await handleRedirect();
      } catch (e) {
        console.error(e);
        error = friendlyError(e);
      }
      const cached = loadCachedProfile();
      const lastfmUser = savedLastfmUser();
      if (isLoggedIn()) await loadSpotify();
      else if (cached?.source === 'export') setState({ kind: 'ready', profile: cached });
      else if (lastfmUser && lastfmConfigured) await loadLastfm(lastfmUser);
      else setState({ kind: 'signedOut', error: error ?? undefined });
    })();
  }, [loadSpotify, loadLastfm]);

  useEffect(() => write(FESTIVAL_KEY, festivalId), [festivalId]);

  // Big lineups (Glastonbury) download separately when picked.
  const [loaded, setLoaded] = useState<{ id: string; acts: Act[] | null; failed?: boolean }>(() => ({
    id: festival.id,
    acts: lineupOf(festival),
  }));
  const realLineup = loaded.id === festival.id ? loaded.acts : lineupOf(festival);
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

  const profile = state.kind === 'ready' ? state.profile : null;
  const isDemo = profile?.source === 'demo';
  // {Name}Fest's lineup is your own favourite artists.
  const personal = festival.layout === 'personal';
  const lineup = useMemo(
    () => (personal ? (profile ? personalLineup(profile) : null) : realLineup),
    [personal, profile, realLineup],
  );
  /** A real festival's lineup, for inventing a demo listener (yours has no lineup until you listen). */
  const demoSource = () => (personal ? festivals.find((f) => f.id === DEFAULT_FESTIVAL_ID)!.lineup : (lineup ?? []));

  // The demo listener is invented per festival, so make a new one on switching.
  useEffect(() => {
    // (Not for your own festival: its lineup comes from the demo listener itself.)
    if (isDemo && lineup && !personal) setState({ kind: 'ready', profile: demoProfile(lineup) });
  }, [lineup, isDemo]);

  // Your edits (hide / headline / add), per festival.
  const [editState, setEditState] = useState(() => ({ id: festival.id, edits: loadEdits(festival.id) }));
  const edits = editState.id === festival.id ? editState.edits : loadEdits(festival.id);
  const setEdits = (next: PosterEdits) => {
    saveEdits(festival.id, next);
    setEditState({ id: festival.id, edits: next });
  };

  // "You might like" suggestions (needs Last.fm).
  const [suggestOn, setSuggestOn] = useState(() => read(SUGGEST_KEY) === '1');
  const [suggested, setSuggested] = useState<{ key: string; acts: CuratedAct[]; loading: boolean; failed: boolean }>({
    key: '',
    acts: [],
    loading: false,
    failed: false,
  });
  const listened = useMemo(() => (profile && lineup ? curate(lineup, profile) : []), [lineup, profile]);
  const suggestKey = profile && lineup ? `${festival.id}|${profile.source}|${profile.userId}|${profile.fetchedAt}` : '';
  useEffect(() => {
    if (!suggestOn || !profile || !lineup || !lastfmConfigured || isDemo) return;
    let live = true;
    setSuggested({ key: suggestKey, acts: [], loading: true, failed: false });
    suggestActs(lineup, profile, listened, { anyArtist: personal })
      .then((acts) => live && setSuggested({ key: suggestKey, acts, loading: false, failed: false }))
      .catch((e) => {
        console.error(e);
        if (live) setSuggested({ key: suggestKey, acts: [], loading: false, failed: true });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestOn, suggestKey]);
  const activeSuggestions = useMemo(
    () => (suggestOn && suggested.key === suggestKey ? suggested.acts : []),
    [suggestOn, suggested, suggestKey],
  );

  const poster = useMemo(
    () => (lineup ? buildPoster(listened, activeSuggestions, lineup, edits) : { acts: [], hidden: [] }),
    [listened, activeSuggestions, lineup, edits],
  );
  const editionName = personal ? festName(profile) : `${festival.name} ${festival.edition}`;

  useEffect(() => {
    document.title = !profile
      ? DEFAULT_TITLE
      : personal
        ? `${editionName} · Festify`
        : `${isDemo ? 'Demo' : 'Your'} ${editionName} lineup · Festify`;
  }, [profile, isDemo, editionName, personal]);

  const signOut = () => {
    logout();
    forgetLastfmUser();
    forgetExport();
    clearCachedProfile();
    setState({ kind: 'signedOut' });
  };

  const refresh = () => {
    if (profile?.source === 'spotify') loadSpotify(true);
    else if (profile?.source === 'lastfm') loadLastfm(profile.userId, true);
  };

  return (
    <div className="app">
      <header className="topbar" inert={selected ? true : undefined}>
        <a className="brand" href={import.meta.env.BASE_URL}>
          festify<span className="brand-star">*</span>
        </a>
        <label className="festival-picker">
          <span className="visually-hidden">Festival</span>
          <select
            value={menuId(festival)}
            onChange={(e) => {
              // Multi-site festivals reopen on the site you last picked.
              const chosen = festivals.find((f) => f.id === e.target.value)!;
              const lastSite = read(`${SITE_KEY}.${chosen.site?.group}`);
              setFestivalId(sitesOf(chosen).find((f) => f.id === lastSite)?.id ?? chosen.id);
            }}
          >
            {festivalsByEdition.map(([edition, list]) => (
              <optgroup key={edition} label={edition}>
                {list.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.layout === 'personal' ? festName(profile) : f.name}
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
        {profile && (
          <div className="user">
            <span className="user-name" title={`${profile.displayName} (${SOURCE_LABEL[profile.source]})`}>
              {profile.displayName}
            </span>
            {(profile.source === 'spotify' || profile.source === 'lastfm') && (
              <button type="button" className="link-button" onClick={refresh}>
                Refresh
              </button>
            )}
            <button type="button" className="link-button" onClick={signOut}>
              {isDemo ? 'Exit demo' : profile.source === 'spotify' ? 'Log out' : 'Start over'}
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
          <Welcome
            festivalList={festivalList}
            error={state.error}
            spotifyConfigured={isConfigured}
            lastfmConfigured={lastfmConfigured}
            configHint={`Spotify isn't configured yet: set VITE_SPOTIFY_CLIENT_ID in .env.local and register ${redirectUri()} as a redirect URI.`}
            onSpotify={() => login()}
            onLastfm={(username) => loadLastfm(username)}
            onUpload={(files) =>
              run(async (p) => {
                p('Opening your file…', 0.05);
                const { importSpotifyExport } = await import('./sources/spotifyExport');
                return importSpotifyExport(files, periodRef.current, p);
              }, true)
            }
            onDemo={() => setState({ kind: 'ready', profile: demoProfile(demoSource()) })}
          />
        )}

        {state.kind === 'loading' && (
          <section className="status" aria-busy="true">
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
              <button type="button" className="primary" onClick={() => (savedLastfmUser() ? loadLastfm(savedLastfmUser()!, true) : loadSpotify(true))}>
                Try again
              </button>
              <button type="button" className="secondary" onClick={signOut}>
                Start over
              </button>
            </div>
          </section>
        )}

        {state.kind === 'ready' && (
          <div className="result">
            <h1 className="visually-hidden">
              {isDemo ? 'Demo' : 'Your'} {editionName} lineup
            </h1>
            {isDemo && <p className="demo-banner">Demo data: these are made-up listening stats.</p>}
            <div className="poster-column">
            {festival.site && (
              <div className="site-toggle" role="radiogroup" aria-label="Festival site">
                {sitesOf(festival).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={f.id === festival.id}
                    className={f.id === festival.id ? 'active' : ''}
                    onClick={() => {
                      setFestivalId(f.id);
                      write(`${SITE_KEY}.${f.site!.group}`, f.id);
                    }}
                  >
                    {f.site!.label}
                  </button>
                ))}
                <span className="site-toggle-note">Different bill, days and set times</span>
              </div>
            )}
            <div className="poster-wrap">
              {lineup ? (
                <Poster
                  ref={posterRef}
                  festival={festival}
                  acts={poster.acts}
                  curatedFor={state.profile.displayName}
                  curatedVia={CREDIT_VIA[state.profile.source]}
                  profile={state.profile}
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

            </div>
            <Sidebar
              festival={festival}
              lineup={lineup}
              acts={poster.acts}
              hidden={poster.hidden}
              profile={state.profile}
              edits={edits}
              onEdits={setEdits}
              suggestions={{
                available: lastfmConfigured && !isDemo,
                hint: personal
                  ? "Similar artists you don't listen to yet"
                  : 'Acts on the lineup similar to your favourites',
                enabled: suggestOn,
                loading: suggested.loading && suggested.key === suggestKey,
                failed: suggested.failed && suggested.key === suggestKey,
                count: activeSuggestions.filter((s) => poster.acts.includes(s)).length,
              }}
              period={
                profile?.source === 'lastfm' || profile?.source === 'export'
                  ? isListeningPeriod(profile.period)
                    ? profile.period
                    : 'overall'
                  : undefined
              }
              onPeriod={(period) => {
                setListeningPeriod(period);
                write(PERIOD_KEY, period);
                if (profile?.source === 'lastfm') loadLastfm(profile.userId, true, period);
                if (profile?.source === 'export') {
                  // Every window was built at upload, so this is instant.
                  const chosen = exportWindow(period);
                  if (chosen) {
                    saveProfile(chosen);
                    setState({ kind: 'ready', profile: chosen });
                  } else {
                    setState({
                      kind: 'signedOut',
                      error: 'To change the listening window, upload your Spotify data again.',
                    });
                  }
                }
              }}
              onToggleSuggestions={(on) => {
                setSuggestOn(on);
                write(SUGGEST_KEY, on ? '1' : '0');
              }}
              posterRef={posterRef}
              onSelect={setSelected}
            />
          </div>
        )}
      </main>

      {selected && profile && (
        <ArtistModal
          curated={selected}
          festival={festival}
          profile={profile}
          spotifyLookups={profile.source === 'spotify'}
          onClose={() => setSelected(null)}
        />
      )}

      <footer className="footer" inert={selected ? true : undefined}>
        Unofficial fan project. Not affiliated with any festival, Spotify or Last.fm.
      </footer>
    </div>
  );
}
