import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { SECOND_TIER_COUNT, type CuratedAct } from '../curate';
import type { Festival, Zone } from '../festivals';

interface Props {
  festival: Festival;
  acts: CuratedAct[];
  curatedFor: string;
  onSelect: (act: CuratedAct) => void;
}

// Base sizes as a percentage of poster width (cqw), before fitting.
const HEADLINER_SIZE = 6.2;
const MID_SIZE = 2.35;
const SMALL_SIZE = 1.75;

const zoneStyle = (z: Zone): CSSProperties => ({
  left: `${z.x}%`,
  top: `${z.y}%`,
  width: `${z.w}%`,
  height: `${z.h}%`,
});

const overflows = (el: HTMLElement) =>
  el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;

/** Largest scale in [lo, hi] for which `fits()` holds (binary search). */
function fitScale(apply: (s: number) => void, fits: () => boolean, lo: number, hi: number) {
  apply(hi);
  if (fits()) return hi;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    apply(mid);
    if (fits()) lo = mid;
    else hi = mid;
  }
  apply(lo);
  return lo;
}

/** Flags names that wrap, so they get the poster's indented first line. */
function markWrapped(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('.name').forEach((el) => {
    el.classList.remove('wrapped');
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    if (el.offsetHeight > lineHeight * 1.5) el.classList.add('wrapped');
  });
}

export const Poster = forwardRef<HTMLDivElement, Props>(function Poster(
  { festival, acts, curatedFor, onSelect },
  ref,
) {
  const posterRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  // How many non-headliners go in the top block; tuned after layout so the
  // two blocks end up printed at similar sizes. Resets when the acts change.
  const [split, setSplit] = useState({ acts, count: SECOND_TIER_COUNT, step: 0 });
  const current = split.acts === acts ? split : { acts, count: SECOND_TIER_COUNT, step: 0 };

  const headliners = acts.filter((a) => a.tier === 0);
  const rest = acts.filter((a) => a.tier !== 0);
  const mid = rest.slice(0, current.count);
  const small = rest.slice(current.count);

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true));
  }, []);

  const layout = useCallback(() => {
    const poster = posterRef.current;
    const top = topRef.current;
    const head = headRef.current;
    const midEl = midRef.current;
    const bottom = bottomRef.current;
    if (!poster || !top || !head || !midEl || !bottom) return null;
    const set = (name: string, value: number) => poster.style.setProperty(name, `${value}cqw`);

    // Headliners: as big as possible, one line each, at most ~45% of the top block.
    set('--hl-size', HEADLINER_SIZE);
    const widest = Math.max(1, ...[...head.children].map((c) => (c as HTMLElement).scrollWidth));
    const widthScale = top.clientWidth / widest;
    const heightScale = (top.clientHeight * 0.45) / Math.max(1, head.offsetHeight);
    set('--hl-size', HEADLINER_SIZE * Math.min(1.25, widthScale, heightScale));

    // Second tier fills the rest of the top block; small print fills the bottom block.
    const scales = [
      [midEl, '--mid-size', MID_SIZE, 1.15],
      [bottom, '--small-size', SMALL_SIZE, 1.1],
    ].map(([el, name, base, max]) => {
      const container = el as HTMLElement;
      const fits = () => {
        markWrapped(container);
        return !overflows(container);
      };
      return fitScale((s) => set(name as string, (base as number) * s), fits, 0.35, max as number);
    });
    return { mid: scales[0], small: scales[1] };
  }, []);

  useLayoutEffect(() => {
    const scales = layout();
    if (!scales || current.step >= 8) return;
    // Rebalance: if the small print came out much smaller (relative to its
    // base size) than the second tier, promote some acts, and vice versa.
    const ratio = scales.small / scales.mid;
    let count = current.count;
    if (small.length && ratio < 0.85) count += Math.max(1, Math.round(small.length * (1 - ratio) * 0.5));
    else if (mid.length && small.length && ratio > 1.2) count -= Math.max(1, Math.round(mid.length * (ratio - 1) * 0.3));
    if (count !== current.count) setSplit({ acts, count, step: current.step + 1 });
  }, [layout, acts, current, fontsReady, mid.length, small.length]);

  useEffect(() => {
    const poster = posterRef.current;
    if (!poster) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    });
    observer.observe(poster);
    return () => observer.disconnect();
  }, [layout]);

  const setRefs = (el: HTMLDivElement | null) => {
    posterRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  const { theme } = festival;
  const name = (a: CuratedAct, cls: string) => (
    <button key={a.act.display} type="button" className={`name ${cls}`} onClick={() => onSelect(a)}>
      {a.act.display}
    </button>
  );

  return (
    <div
      ref={setRefs}
      className="poster"
      style={
        {
          aspectRatio: `${festival.width} / ${festival.height}`,
          fontFamily: theme.fontFamily,
          fontVariationSettings: theme.fontVariation,
          color: theme.textColor,
          '--name-weight': theme.fontWeight,
          '--accent': theme.accentColor,
        } as CSSProperties
      }
    >
      <img
        className="poster-bg"
        src={`${import.meta.env.BASE_URL}${festival.background}`}
        alt=""
        draggable={false}
      />

      <div ref={topRef} className="zone zone-top" style={zoneStyle(festival.zones.top)}>
        <div ref={headRef} className="headliners">
          {headliners.map((a) => name(a, 'name-hl'))}
        </div>
        <div ref={midRef} className="cols cols-mid">
          {mid.map((a) => name(a, 'name-mid'))}
        </div>
        {acts.length === 0 && (
          <p className="poster-empty">
            None of your artists are on this lineup — yet.
            <br />
            Time for some homework?
          </p>
        )}
      </div>

      <div className="zone zone-bottom" style={zoneStyle(festival.zones.bottom)}>
        <div ref={bottomRef} className="cols cols-small">
          {small.map((a) => name(a, 'name-small'))}
        </div>
      </div>

      <div className="zone zone-credit" style={zoneStyle(festival.zones.credit)}>
        <div className="credit-title">
          your<span className="credit-star">*</span>lineup
        </div>
        <div className="credit-sub">curated from your spotify for</div>
        <div className="credit-name">{curatedFor}</div>
      </div>
    </div>
  );
});
