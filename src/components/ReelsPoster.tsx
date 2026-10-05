import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { CuratedAct } from '../curate';
import type { ReelsFestival } from '../festivals';
import { layoutReels, type ReelLayout } from '../reelsLayout';

interface Props {
  festival: ReelsFestival;
  acts: CuratedAct[];
  onSelect: (act: CuratedAct) => void;
}

const MEASURE_PX = 100;
/** Logos may be shown at most this many times their size on the original poster. */
const MAX_LOGO_ENLARGEMENT = 3;

export const ReelsPoster = forwardRef<HTMLDivElement, Props>(function ReelsPoster(
  { festival, acts, onSelect },
  ref,
) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(() => document.fonts.status === 'loaded');
  const [layout, setLayout] = useState<ReelLayout[] | null>(null);
  const placed = acts.filter((a) => !a.act.fixed);
  const { theme } = festival;

  useEffect(() => {
    if (!fontsReady) document.fonts.ready.then(() => setFontsReady(true));
  }, [fontsReady]);

  const runLayout = useCallback(() => {
    // Logos know their shape; acts without one are measured as text.
    const measured = [...(measureRef.current?.children ?? [])] as HTMLElement[];
    const shapes = placed.map((a, i) =>
      a.act.logo
        ? {
            aspect: a.act.logo.width / a.act.logo.height,
            maxHeight: ((a.act.logo.height * MAX_LOGO_ENLARGEMENT) / festival.width) * 100,
          }
        : { aspect: measured[i].getBoundingClientRect().width / MEASURE_PX, maxHeight: Infinity },
    );
    setLayout(layoutReels(shapes, festival.reels, festival.height / festival.width));
    // `placed` is derived from `acts`.
  }, [acts, festival]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(runLayout, [runLayout, fontsReady]);

  const base = import.meta.env.BASE_URL;

  return (
    <div
      ref={ref}
      className="poster poster-reels"
      style={
        {
          aspectRatio: `${festival.width} / ${festival.height}`,
          fontFamily: theme.fontFamily,
          color: theme.textColor,
        } as CSSProperties
      }
    >
      <img className="poster-bg" src={`${base}${festival.background}`} alt="" draggable={false} />

      {layout?.map((rows, r) => (
        <div
          key={r}
          className="zone reel"
          style={{
            left: `${festival.reels[r].x}%`,
            top: `${festival.reels[r].y}%`,
            width: `${festival.reels[r].w}%`,
            height: `${festival.reels[r].h}%`,
          }}
        >
          {rows.map((row, i) => (
            <div key={i} className="reel-row">
              {row.map(({ index, height }) => {
                const a = placed[index];
                if (!a) return null;
                return (
                  <button
                    key={a.act.display}
                    type="button"
                    className="logo-button"
                    onClick={() => onSelect(a)}
                    title={a.act.display}
                  >
                    {a.act.logo ? (
                      <img src={`${base}${a.act.logo.src}`} alt={a.act.display} style={{ height: `${height}cqw` }} />
                    ) : (
                      <span className="logo-text" style={{ fontSize: `${height}cqw` }}>
                        {a.act.display}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ))}

      {placed.length === 0 && (
        <p className="poster-empty reels-empty" style={{ top: `${festival.reels[0].y}%` }}>
          None of your artists are on this lineup — yet.
        </p>
      )}

      {/* Hidden copies of logo-less names, to measure their width. */}
      <div ref={measureRef} className="measure" aria-hidden style={{ fontSize: MEASURE_PX }}>
        {placed.map((a) => (
          <span key={a.act.display} className="logo-text">
            {a.act.logo ? '' : a.act.display}
          </span>
        ))}
      </div>
    </div>
  );
});
