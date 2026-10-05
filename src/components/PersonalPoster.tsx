import { forwardRef, useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { CuratedAct } from '../curate';
import type { PersonalFestival } from '../festivals';
import { useFontEpoch } from '../useFontEpoch';
import { ActLabel } from './ActLabel';

interface Props {
  festival: PersonalFestival;
  acts: CuratedAct[];
  /** e.g. "SamFest" */
  festName: string;
  curatedVia: string;
  onSelect: (act: CuratedAct) => void;
}

const DAYS = ['Fri', 'Sat', 'Sun'];
/** Headliner size cap, and the base size of everyone else (cqw, before fitting). */
const HEAD_MAX = 6.4;
const LIST_BASE = 2.5;

/**
 * "{Name}Fest": a made-up festival printed like a two-ink risograph poster
 * (fluoro pink + cobalt blue on warm paper, slightly off-register), with your
 * three favourite artists headlining a day each.
 */
export const PersonalPoster = forwardRef<HTMLDivElement, Props>(function PersonalPoster(
  { festival, acts, festName, curatedVia, onSelect },
  ref,
) {
  const posterRef = useRef<HTMLDivElement | null>(null);
  const fontEpoch = useFontEpoch(festival.theme.fontFamily, 900);
  const [fit, setFit] = useState<{ key: string; word: number; heads: number[]; list: number } | null>(null);

  // Day i gets your #i favourite as headliner, then everyone else dealt round-robin.
  const days = DAYS.map((_, d) => acts.filter((_, i) => i % DAYS.length === d));
  const name = festName.replace(/Fest$/, '').toUpperCase();
  const key = `${festName}|${acts.map((a) => a.act.display).join(',')}`;

  const runLayout = useCallback(() => {
    const poster = posterRef.current;
    if (!poster) return;
    const W = poster.clientWidth;
    if (!W) return;
    const cqw = W / 100;

    // Wordmark: as big as fits the width (two lines: NAME / FEST).
    const word = poster.querySelector<HTMLElement>('.pf-word-measure');
    const wordSize = word ? Math.min(30, (88 * cqw * 10) / Math.max(1, word.scrollWidth)) : 20;
    poster.style.setProperty('--pf-word', `${wordSize}cqw`);

    // The lineup starts just below the header, so short names leave more room for it.
    const header = poster.querySelector<HTMLElement>('.pf-top');
    const H = poster.clientHeight;
    if (header && H) {
      const top = ((header.offsetTop + header.offsetHeight) / H) * 100 + (4 * cqw * 100) / H;
      poster.style.setProperty('--pf-days-top', `${Math.max(34, top)}%`);
    }

    // Headliners: one line each, as big as fits their column.
    const cols = [...poster.querySelectorAll<HTMLElement>('.pf-day')];
    const heads = cols.map((col) => {
      const h = col.querySelector<HTMLElement>('.pf-head-measure');
      if (!h) return HEAD_MAX;
      return Math.min(HEAD_MAX, ((col.clientWidth * 0.98) / Math.max(1, h.scrollWidth)) * 10);
    });

    // Everyone else: the biggest size at which every day's list fits.
    const lists = [...poster.querySelectorAll<HTMLElement>('.pf-list')];
    let lo = 0.3;
    let hi = 1.2;
    const fits = (s: number) => {
      poster.style.setProperty('--pf-list', `${LIST_BASE * s}cqw`);
      return lists.every((l) => l.scrollHeight <= l.clientHeight + 1);
    };
    if (!fits(hi)) {
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
    } else lo = hi;
    poster.style.setProperty('--pf-list', `${LIST_BASE * lo}cqw`);
    setFit({ key, word: wordSize, heads, list: LIST_BASE * lo });
  }, [key]);

  useLayoutEffect(runLayout, [runLayout, fontEpoch]);

  const setRefs = (el: HTMLDivElement | null) => {
    posterRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  const layout = fit?.key === key ? fit : null;

  return (
    <div
      ref={setRefs}
      className="poster pf"
      style={
        {
          aspectRatio: `${festival.width} / ${festival.height}`,
          fontFamily: festival.theme.fontFamily,

        } as CSSProperties
      }
    >
      {/* Ink layers: a pink sun, overprinted with blue halftone, and a few blobs. */}
      <div className="pf-sun" aria-hidden />
      <div className="pf-halftone" aria-hidden />
      <div className="pf-blob" aria-hidden />

      <header className="pf-top">
        <p className="pf-kicker">Festify presents</p>
        <h2 className="pf-word" aria-label={festName}>
          <span className="pf-word-line pf-ink-blue">{name}</span>
          <span className="pf-word-line pf-ink-pink">FEST</span>
        </h2>
        <p className="pf-meta">
          <span>{festival.location}</span>
          <span>{festival.dates}</span>
          <span>No clashes. Ever.</span>
        </p>
      </header>

      <div className="pf-days">
        {days.map((list, d) => (
          <section key={DAYS[d]} className="pf-day" aria-label={DAYS[d]}>
            <p className="pf-day-label">{DAYS[d]}</p>
            {list[0] && (
              <button
                type="button"
                className="pf-head"
                style={{ fontSize: `${layout?.heads[d] ?? HEAD_MAX}cqw` }}
                onClick={() => onSelect(list[0])}
              >
                <ActLabel act={list[0]} />
              </button>
            )}
            <ol className="pf-list">
              {list.slice(1).map((a) => (
                <li key={a.act.display}>
                  <button type="button" className="pf-name" onClick={() => onSelect(a)}>
                    <ActLabel act={a} />
                  </button>
                </li>
              ))}
            </ol>
            {/* Measuring copy: headliner at 10cqw, unwrapped. */}
            <span className="pf-head pf-head-measure" aria-hidden>
              {list[0] ? list[0].act.display + (list[0].origin === 'suggested' ? '*' : '') : ''}
            </span>
          </section>
        ))}
      </div>

      {acts.length === 0 && <p className="pf-empty">The stage is set. Go listen to something.</p>}

      <footer className="pf-foot">
        <span>
          curated by festify<span className="pf-ink-pink">*</span> from your {curatedVia}
        </span>
        <span>Admit one · You</span>
      </footer>

      <div className="pf-grain" aria-hidden />
      <span className="pf-word pf-word-measure" aria-hidden>
        {name.length > 4 ? name : 'FEST'}
      </span>
    </div>
  );
});
