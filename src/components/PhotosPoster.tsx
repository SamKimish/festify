import { Fragment, forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { CuratedAct } from '../curate';
import { layoutDays, type DayLine } from '../daysLayout';
import type { PhotosFestival } from '../festivals';
import { photoFor, posterPhoto } from '../photos';
import { posterLabel } from '../posterEdits';
import type { ListeningProfile } from '../spotify/profile';
import { useFontEpoch } from '../useFontEpoch';
import { ActLabel } from './ActLabel';

interface Props {
  festival: PhotosFestival;
  acts: CuratedAct[];
  profile: ListeningProfile;
  curatedFor: string;
  curatedVia: string;
  onSelect: (act: CuratedAct) => void;
}

const MEASURE_PX = 100;
const SEPARATOR = ' • ';
const NAME_LINE_HEIGHT = 0.92;
const COLUMN_GAP = 1.2; // cqw
const LABEL_SPACE = 4.5; // cqw reserved for the "Special guests" heading
/** Second section: two big names, then three, then everyone else. */
const REST_LINES = { tierCounts: [2, 3, Infinity], tierSizes: [1, 0.82, 0.68], baseSize: 6.4, maxScale: 1.15, lineHeight: 1.12 };

/** Splits a name into one or two lines, as evenly as possible. */
function splitName(name: string, width: (s: string) => number): string[] {
  const words = name.split(' ');
  if (words.length < 2) return [name];
  let best = [name];
  let bestWidth = width(name);
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const w = Math.max(...lines.map(width));
    if (w < bestWidth) {
      best = lines;
      bestWidth = w;
    }
  }
  return best;
}

interface HeadlinerLayout {
  sizes: number[]; // cqw, per headliner
  /** Vertical stretch per headliner, so every name fills the space above its photo. */
  stretch: number[];
  names: string[][]; // lines per headliner
  /** Which line of a two-line name gets the flanking stars (the narrower one). */
  flank: number[];
}

/** Width the two flanking stars add to a line, in em (see .photo-star). */
const STARS_EM = 1.15;
/** Most a headliner name is stretched vertically. */
const MAX_STRETCH = 2.6;

/** Short names may print bigger than long ones, but no more than this. */
const MAX_NAME_RATIO = 1.35;

export const PhotosPoster = forwardRef<HTMLDivElement, Props>(function PhotosPoster(
  { festival, acts, profile, curatedFor, curatedVia, onSelect },
  ref,
) {
  const measureRef = useRef<HTMLDivElement>(null);
  const fontEpoch = useFontEpoch(festival.theme.fontFamily, festival.theme.fontWeight);
  const [computed, setComputed] = useState<{ acts: CuratedAct[]; head: HeadlinerLayout; rest: DayLine[] } | null>(null);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const { theme, colors, headliners: H, rest: R } = festival;
  const aspect = festival.height / festival.width;

  const count = Math.min(H.count, acts.length);
  const heads = acts.slice(0, count);
  const rest = acts.slice(count);
  const layout = computed?.acts === acts ? computed : null;


  // Look up photos for the headliners (cached between visits).
  const headKey = heads.map((a) => a.act.display).join('|');
  useEffect(() => {
    let live = true;
    heads.forEach((a) => {
      if (a.act.display in photos) return;
      photoFor(a, profile).then((url) => live && setPhotos((p) => ({ ...p, [a.act.display]: url })));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headKey, profile]);

  const runLayout = useCallback(() => {
    // Headliner names: same size for all, each split over at most two lines.
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = `${theme.fontWeight} ${MEASURE_PX}px ${theme.fontFamily}`;
    const em = (s: string) => ctx.measureText(s.toUpperCase()).width / MEASURE_PX;
    const colWidth = count ? (H.zone.w - COLUMN_GAP * (count - 1)) / count : 0;
    const nameHeight = H.zone.h * aspect * H.nameShare;
    const names = heads.map((a) => splitName(posterLabel(a), em));
    // Each name as big as its column allows, within MAX_NAME_RATIO of the smallest.
    const flank = names.map((lines) => (lines.length === 2 && em(lines[1]) < em(lines[0]) ? 1 : 0));
    const fit = names.map((lines, i) => {
      const widths = lines.map((line, l) => em(line) + (lines.length === 2 && l === flank[i] ? STARS_EM : 0));
      return Math.min(colWidth / Math.max(0.1, ...widths), nameHeight / (2 * NAME_LINE_HEIGHT), 9);
    });
    const smallest = Math.min(...fit);
    const sizes = fit.map((f) => Math.min(f, smallest * MAX_NAME_RATIO));
    // Tall condensed lettering like the poster: same width, stretched to fill the
    // name area (two lines' worth, so every name ends up the same height).
    const stretch = sizes.map((s) => Math.max(1, Math.min(MAX_STRETCH, nameHeight / (2 * NAME_LINE_HEIGHT * s))));

    // Everyone else: bullet-separated lines, measured in the hidden layer.
    const els = [...(measureRef.current?.children ?? [])] as HTMLElement[];
    const width = (el: HTMLElement) => el.getBoundingClientRect().width / MEASURE_PX;
    const measure = { sep: els[0] ? width(els[0]) : 0.5, widths: els.slice(1).map(width) };
    const [lines] = layoutDays(
      [{ items: rest.map((_, i) => i), width: R.zone.w, height: R.zone.h * aspect - (R.label ? LABEL_SPACE : 0) }],
      measure,
      REST_LINES,
    );
    setComputed({ acts, head: { sizes, stretch, names, flank }, rest: lines });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acts, festival]);

  useLayoutEffect(runLayout, [runLayout, fontEpoch]);

  const pct = (z: { x: number; y: number; w: number; h: number }): CSSProperties => ({
    left: `${z.x}%`,
    top: `${z.y}%`,
    width: `${z.w}%`,
    height: `${z.h}%`,
  });

  return (
    <div
      ref={ref}
      className="poster poster-photos"
      style={{ aspectRatio: `${festival.width} / ${festival.height}`, fontFamily: theme.fontFamily } as CSSProperties}
    >
      <img className="poster-bg" src={`${import.meta.env.BASE_URL}${festival.background}`} alt="" draggable={false} />

      {layout && count > 0 && (
        <div className="zone photo-heads" style={{ ...pct(H.zone), gap: `${COLUMN_GAP}cqw` }}>
          {heads.map((a, i) => {
            const lines = layout.head.names[i];
            const photo = photos[a.act.display];
            return (
              <button
                key={a.act.display}
                type="button"
                className="photo-head"
                onClick={() => onSelect(a)}
                aria-label={a.act.display}
                style={{ color: colors.names }}
              >
                <span
                  className="photo-name"
                  style={
                    {
                      height: `${H.nameShare * 100}%`,
                      fontSize: `${layout.head.sizes[i]}cqw`,
                      '--stretch': layout.head.stretch[i],
                    } as CSSProperties
                  }
                >
                  <span className="photo-name-inner">
                  {lines.length === 1 && <span className="photo-star">★</span>}
                  {lines.map((line, l) => {
                    // Stars flank the shorter line of a two-line name, like the poster.
                    const shorter = lines.length === 2 && l === layout.head.flank[i];
                    return (
                      <span key={l} className="photo-line">
                        {shorter && <span className="photo-star">★</span>}
                        {l === lines.length - 1 && a.origin === 'suggested' ? (
                          <>
                            {line.replace(/\*$/, '')}
                            <span className="suggested-star">*</span>
                          </>
                        ) : (
                          line
                        )}
                        {shorter && <span className="photo-star">★</span>}
                      </span>
                    );
                  })}
                  {lines.length === 1 && <span className="photo-star">★</span>}
                  </span>
                </span>
                <span className="photo-frame" style={{ background: colors.photoTint }}>
                  {photo ? (
                    <img
                      src={posterPhoto(photo)}
                      alt=""
                      crossOrigin="anonymous"
                      draggable={false}
                      onError={() => setPhotos((p) => ({ ...p, [a.act.display]: null }))}
                    />
                  ) : (
                    <span className="photo-placeholder" style={{ color: colors.names }} aria-hidden>
                      ★
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {layout && rest.length > 0 && (
        <div className="zone photo-rest" style={pct(R.zone)}>
          {R.label && (
            <p className="photo-label" style={{ color: colors.label }}>
              <span />
              {R.label}
              <span />
            </p>
          )}
          {layout.rest.map((line, l) => (
            <div key={l} className="day-line" style={{ fontSize: `${line.size}cqw`, color: colors.names }}>
              {line.items.map((i, j) => (
                <Fragment key={rest[i].act.display}>
                  {j > 0 && (
                    <span className="day-sep" style={{ color: colors.separator }}>
                      {SEPARATOR}
                    </span>
                  )}
                  <button type="button" className="day-name" onClick={() => onSelect(rest[i])}>
                    <ActLabel act={rest[i]} />
                  </button>
                </Fragment>
              ))}
            </div>
          ))}
        </div>
      )}

      {acts.length === 0 && (
        <p className="poster-empty photos-empty" style={{ color: colors.credit }}>
          None of your artists are on this lineup — yet.
        </p>
      )}

      <div className="zone photo-credit" style={{ ...pct(festival.credit), color: colors.credit }}>
        <span>
          your<span style={{ color: colors.names }}>*</span>lineup · curated from your {curatedVia} for {curatedFor}
          {acts.some((a) => a.origin === 'suggested') && <> · * you might like</>}
        </span>
      </div>

      {/* Hidden copies of the second-section names, to measure their widths. */}
      <div ref={measureRef} className="measure" aria-hidden style={{ fontSize: MEASURE_PX }}>
        <span className="day-name">{SEPARATOR}</span>
        {rest.map((a) => (
          <span key={a.act.display} className="day-name">
            {posterLabel(a)}
          </span>
        ))}
      </div>
    </div>
  );
});
