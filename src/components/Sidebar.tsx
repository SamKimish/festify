import { useMemo, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { clockTime, findClashes } from '../clashes';
import { reasonsFor, type CuratedAct } from '../curate';
import type { Act, Festival } from '../festivals';
import { hasEdits, type PosterEdits } from '../posterEdits';
import { hasScope, login } from '../spotify/auth';
import { LISTENING_PERIODS, type ListeningPeriod } from '../sources/periods';
import { createPosterPlaylist } from '../spotify/playlist';
import type { ListeningProfile } from '../spotify/profile';
import { ActLabel } from './ActLabel';
import { PosterActions } from './PosterActions';

interface Props {
  festival: Festival;
  lineup: Act[] | null;
  acts: CuratedAct[];
  hidden: CuratedAct[];
  profile: ListeningProfile;
  edits: PosterEdits;
  onEdits: (edits: PosterEdits) => void;
  suggestions: { available: boolean; enabled: boolean; loading: boolean; count: number; failed: boolean; hint: string };
  onToggleSuggestions: (on: boolean) => void;
  /** Last.fm and data uploads only: the listening window, and changing it. */
  period?: ListeningPeriod;
  onPeriod: (period: ListeningPeriod) => void;
  posterRef: RefObject<HTMLDivElement | null>;
  onSelect: (act: CuratedAct) => void;
}

const fmtSlot = (start: number, end: number) => `${clockTime(start)}–${clockTime(end)}`;

export function Sidebar(props: Props) {
  const { festival, lineup, acts, hidden, profile, edits, onEdits } = props;
  const editionName = `${festival.name} ${festival.edition}`;
  const clashes = useMemo(() => findClashes(acts), [acts]);
  const hasTimes = useMemo(() => Boolean(lineup?.some((a) => a.slots?.length)), [lineup]);

  const toggle = (list: keyof PosterEdits, name: string, on: boolean) =>
    onEdits({ ...edits, [list]: on ? [...edits[list].filter((n) => n !== name), name] : edits[list].filter((n) => n !== name) });

  return (
    <aside className="sidebar">
      <div className="summary">
        <p className="summary-count">
          {lineup ? (
            <>
              <strong>{acts.length}</strong>
              {festival.layout === 'personal' ? '' : ` of ${lineup.length.toLocaleString()}`} acts on your poster
            </>
          ) : (
            'Loading lineup…'
          )}
        </p>
        {lineup && acts.length > 0 && (
          <PosterActions
            posterRef={props.posterRef}
            version={`${festival.id}|${profile.userId}|${profile.fetchedAt}|${acts.map((a) => a.act.display).join(',')}`}
            filename={`my-${festival.id}-lineup.png`}
            width={festival.width}
            shareText={`My personal ${editionName} lineup, made with Festify:`}
          />
        )}
        {lineup && acts.length > 0 && profile.source === 'spotify' && (
          <PlaylistButton acts={acts} profile={profile} title={`My ${editionName} lineup`} />
        )}
      </div>

      {props.period && (
        <label className="period-picker">
          <span>Listening from</span>
          <select
            value={props.period}
            onChange={(e) => props.onPeriod(e.target.value as ListeningPeriod)}
          >
            {LISTENING_PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {props.suggestions.available && (
        <label className="switch-row">
          <input
            type="checkbox"
            role="switch"
            checked={props.suggestions.enabled}
            onChange={(e) => props.onToggleSuggestions(e.target.checked)}
          />
          <span className="switch" aria-hidden />
          <span>
            Add artists you might like<span className="suggested-star">*</span>
            <small>
              {!props.suggestions.enabled
                ? props.suggestions.hint
                : props.suggestions.loading
                  ? 'Finding similar artists…'
                  : props.suggestions.failed
                    ? "Couldn't reach Last.fm. Try again later."
                    : props.suggestions.count
                      ? `${props.suggestions.count} added, marked with *`
                      : 'No close matches on this lineup'}
            </small>
          </span>
        </label>
      )}

      {profile.warnings.length > 0 && (
        <p className="warning">
          We couldn't read your {profile.warnings.join(', ')}, so the lineup may be incomplete.
        </p>
      )}

      {hasTimes && acts.length > 1 && (
        <section className="clashes" aria-labelledby="clashes-title">
          <h2 id="clashes-title" className="sidebar-title">
            Your biggest clashes
          </h2>
          {clashes.length === 0 ? (
            <p className="empty-note">No clashes: you can see everyone on your poster. Enjoy the walking.</p>
          ) : (
            <ol className="clash-list">
              {clashes.map((c) => (
                <li key={`${c.a.act.display}|${c.b.act.display}`}>
                  <p className="clash-when">
                    {c.slotA.day} · {c.overlap} min overlap · your #{c.rankA} &amp; #{c.rankB}
                  </p>
                  <ClashAct act={c.a} stage={c.slotA.stage} time={fmtSlot(c.slotA.start, c.slotA.end)} onSelect={props.onSelect} />
                  <span className="clash-vs">vs</span>
                  <ClashAct act={c.b} stage={c.slotB.stage} time={fmtSlot(c.slotB.start, c.slotB.end)} onSelect={props.onSelect} />
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {lineup && (
        <section aria-labelledby="ranking-title">
          <h2 id="ranking-title" className="sidebar-title">
            Running order
          </h2>
          <AddAct lineup={lineup} onPoster={acts} hidden={edits.hidden} onAdd={(name) => {
            // Adding something you'd hidden just un-hides it.
            const next = { ...edits, hidden: edits.hidden.filter((n) => n !== name) };
            onEdits(acts.some((a) => a.act.display === name) || hidden.some((a) => a.act.display === name)
              ? next
              : { ...next, added: [...next.added, name] });
          }} />
          {acts.length === 0 ? (
            <p className="empty-note">
              None of your artists are on this lineup. Add acts you love above, or try another festival from the menu
              {profile.source === 'demo' ? '' : ', or press Refresh if you’ve been listening to new music lately'}.
            </p>
          ) : (
            <ol className="ranking">
              {acts.map((a, i) => {
                const pinned = edits.headliners.includes(a.act.display);
                return (
                  <li key={a.act.display}>
                    <button type="button" className="ranking-main" onClick={() => props.onSelect(a)}>
                      <span className="ranking-pos">{i + 1}</span>
                      <span className="ranking-name">
                        <ActLabel act={a} />
                      </span>
                      <span className="ranking-why">{whyLine(a, profile)}</span>
                    </button>
                    <div className="ranking-actions">
                      <IconButton
                        label={pinned ? `Stop forcing ${a.act.display} to headline` : `Make ${a.act.display} a headliner`}
                        pressed={pinned}
                        onClick={() => toggle('headliners', a.act.display, !pinned)}
                      >
                        ★
                      </IconButton>
                      <IconButton
                        label={a.origin === 'added' ? `Remove ${a.act.display}` : `Hide ${a.act.display}`}
                        onClick={() =>
                          a.origin === 'added'
                            ? onEdits({
                                ...edits,
                                added: edits.added.filter((n) => n !== a.act.display),
                                headliners: edits.headliners.filter((n) => n !== a.act.display),
                              })
                            : onEdits({
                                ...edits,
                                hidden: [...edits.hidden, a.act.display],
                                headliners: edits.headliners.filter((n) => n !== a.act.display),
                              })
                        }
                      >
                        ×
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {hidden.length > 0 && (
            <details className="hidden-acts">
              <summary>
                {hidden.length} hidden act{hidden.length === 1 ? '' : 's'}
              </summary>
              <ul>
                {hidden.map((a) => (
                  <li key={a.act.display}>
                    <span>{a.act.display}</span>
                    <button type="button" className="link-button" onClick={() => toggle('hidden', a.act.display, false)}>
                      Put back
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {hasEdits(edits) && (
            <button
              type="button"
              className="link-button reset-edits"
              onClick={() => onEdits({ hidden: [], headliners: [], added: [] })}
            >
              Reset my changes
            </button>
          )}
        </section>
      )}
    </aside>
  );
}

function whyLine(a: CuratedAct, profile: ListeningProfile): string {
  if (a.origin === 'added') return 'Added by you';
  if (a.origin === 'suggested') return `You might like · similar to ${(a.because ?? []).slice(0, 2).join(' & ')}`;
  return reasonsFor(a.artists[0].stats, profile).slice(0, 2).join(' · ');
}

function ClashAct(props: { act: CuratedAct; stage: string; time: string; onSelect: (a: CuratedAct) => void }) {
  return (
    <button type="button" className="clash-act" onClick={() => props.onSelect(props.act)}>
      <span className="clash-name">
        <ActLabel act={props.act} />
      </span>
      <small>{props.stage}</small>
      <small className="clash-time">{props.time}</small>
    </button>
  );
}

function IconButton(props: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.pressed}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

/** Text box with suggestions from the full lineup, for acts you love but don't stream. */
function AddAct(props: { lineup: Act[]; onPoster: CuratedAct[]; hidden: string[]; onAdd: (name: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const shown = new Set(props.onPoster.map((a) => a.act.display));
  const options = useMemo(
    () => props.lineup.filter((a) => !shown.has(a.display)).map((a) => a.display).sort((a, b) => a.localeCompare(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.lineup, props.onPoster],
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const wanted = value.trim().toLowerCase();
    if (!wanted) return;
    const match = props.lineup.find((a) => a.display.toLowerCase() === wanted);
    if (!match) {
      setError("That act isn't on this lineup. Pick one from the list as you type.");
      return;
    }
    if (shown.has(match.display)) {
      setError(`${match.display} is already on your poster.`);
      return;
    }
    props.onAdd(match.display);
    setValue('');
    setError('');
  };
  return (
    <form className="add-act" onSubmit={submit}>
      <label htmlFor="add-act" className="visually-hidden">
        Add an act from the lineup
      </label>
      <input
        id="add-act"
        list="add-act-options"
        placeholder="Add an act from the lineup…"
        value={value}
        autoComplete="off"
        onChange={(e) => {
          setValue(e.target.value);
          setError('');
        }}
      />
      <datalist id="add-act-options">
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <button type="submit" className="secondary small" disabled={!value.trim()}>
        Add
      </button>
      {error && (
        <p className="error add-act-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

type PlaylistState =
  | { kind: 'idle' }
  | { kind: 'working'; done: number; total: number }
  | { kind: 'done'; url: string; tracks: number }
  | { kind: 'error'; message: string };

function PlaylistButton(props: { acts: CuratedAct[]; profile: ListeningProfile; title: string }) {
  const [state, setState] = useState<PlaylistState>({ kind: 'idle' });
  // Logins from before playlists existed need to grant the new permission once.
  const allowed = hasScope('playlist-modify-private');

  const make = async () => {
    if (!allowed) {
      login();
      return;
    }
    setState({ kind: 'working', done: 0, total: props.acts.length });
    try {
      const res = await createPosterPlaylist(props.acts, props.profile, props.title, (done, total) =>
        setState({ kind: 'working', done, total }),
      );
      setState({ kind: 'done', ...res });
    } catch (e) {
      console.error(e);
      setState({ kind: 'error', message: "Couldn't create the playlist. Please try again." });
    }
  };

  if (state.kind === 'done') {
    return (
      <p className="playlist-done">
        Playlist ready: {state.tracks} songs.{' '}
        <a href={state.url} target="_blank" rel="noreferrer">
          Open in Spotify ↗
        </a>
      </p>
    );
  }
  return (
    <div className="playlist">
      <button type="button" className="spotify-button" onClick={make} disabled={state.kind === 'working'}>
        {state.kind === 'working'
          ? `Finding songs… ${state.done}/${state.total}`
          : allowed
            ? 'Make a Spotify playlist'
            : 'Allow playlists, then make one'}
      </button>
      {!allowed && <p className="way-help">Spotify will ask once for permission to create playlists.</p>}
      {state.kind === 'error' && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}
