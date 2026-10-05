import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { HEADLINER_COUNT, type CuratedAct } from '../curate';
import type { Festival, Region, Zone } from '../festivals';

interface Props {
  festival: Festival;
  acts: CuratedAct[];
  curatedFor: string;
  onSelect: (act: CuratedAct) => void;
}

// Base sizes as a percentage of poster width (cqw), before fitting.
const HEADLINER_SIZE = 6.2;
const GROUPS = {
  mid: { base: 2.35, max: 1.15 },
  small: { base: 1.75, max: 1.1 },
} as const;
type Group = keyof typeof GROUPS;
const MIN_SCALE = 0.3;
/** Must match `.name` in styles.css. */
const LINE_HEIGHT = 1.04;
const WRAP_INDENT = 1.1;
/** Font size the words are measured at; widths scale linearly from it. */
const MEASURE_PX = 100;
/** With room to spare, aim for this many second-tier acts before using the small print. */
const PREFERRED_MID = 30;

const pct = (z: Zone): CSSProperties => ({
  left: `${z.x}%`,
  top: `${z.y}%`,
  width: `${z.w}%`,
  height: `${z.h}%`,
});

/** Word widths of one act's name, in px at MEASURE_PX. */
type Words = number[];

/** Number of lines a name breaks into, mirroring the browser's greedy wrapping. */
function lineCount(words: Words, space: number, width: number, fontPx: number): number {
  const k = fontPx / MEASURE_PX;
  const s = space * k;
  const total = words.reduce((t, w) => t + w * k, 0) + s * (words.length - 1);
  if (total <= width) return 1;
  // Wrapped names get an indented first line, like the real poster.
  let lines = 1;
  let avail = width - WRAP_INDENT * fontPx;
  let used = 0;
  for (const w of words) {
    const ww = w * k;
    if (used === 0) used = ww;
    else if (used + s + ww <= avail) used += s + ww;
    else {
      lines++;
      avail = width;
      used = ww;
    }
  }
  return lines;
}

interface Column {
  zone: Zone;
  items: number[]; // indices into `rest`
}

interface GroupLayout {
  scale: number;
  columns: Column[];
  wrapped: Set<number>;
}

interface Box {
  zone: Zone;
  widthPx: number;
  heightPx: number;
}

/**
 * Greedy column fill: items go into columns in reading order; each column
 * holds up to `fill` of its height. Returns null if they don't all fit.
 */
function pack(
  items: number[],
  words: Words[],
  space: number,
  boxes: Box[],
  fontPx: number,
  fill: number,
): number[][] | null {
  const columns: number[][] = boxes.map(() => []);
  const lineHeight = fontPx * LINE_HEIGHT;
  let col = 0;
  let used = 0;
  for (const item of items) {
    for (;;) {
      if (col >= boxes.length) return null;
      const h = lineCount(words[item], space, boxes[col].widthPx, fontPx) * lineHeight;
      // Small safety margin for the browser's own rounding.
      if (used + h <= boxes[col].heightPx * fill * 0.985) {
        columns[col].push(item);
        used += h;
        break;
      }
      col++;
      used = 0;
    }
  }
  return columns;
}

/** Largest scale (≤ max) at which `items` fit in `boxes`. */
function bestScale(items: number[], words: Words[], space: number, boxes: Box[], basePx: number, max: number) {
  const fits = (s: number) => pack(items, words, space, boxes, basePx * s, 1) !== null;
  if (!items.length || fits(max)) return max;
  let lo = MIN_SCALE;
  let hi = max;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Places `items` at `scale`, balancing the columns. */
function placeGroup(
  items: number[],
  words: Words[],
  space: number,
  boxes: Box[],
  basePx: number,
  scale: number,
): GroupLayout {
  const fontPx = basePx * scale;
  let best = pack(items, words, space, boxes, fontPx, 1);
  // Smallest fill fraction that still fits, so columns come out even.
  let lo = 0.05;
  let hi = 1;
  for (let i = 0; best && i < 12; i++) {
    const mid = (lo + hi) / 2;
    const packed = pack(items, words, space, boxes, fontPx, mid);
    if (packed) {
      best = packed;
      hi = mid;
    } else lo = mid;
  }
  // Didn't fit even at the smallest size: spread evenly and let it overflow.
  if (!best) {
    best = boxes.map(() => []);
    const per = Math.ceil(items.length / boxes.length);
    items.forEach((item, i) => best![Math.min(boxes.length - 1, Math.floor(i / per))].push(item));
  }
  const wrapped = new Set<number>();
  best.forEach((col, c) => {
    for (const item of col) {
      if (lineCount(words[item], space, boxes[c].widthPx, fontPx) > 1) wrapped.add(item);
    }
  });
  return { scale, columns: best.map((col, c) => ({ zone: boxes[c].zone, items: col })), wrapped };
}

export const Poster = forwardRef<HTMLDivElement, Props>(function Poster(
  { festival, acts, curatedFor, onSelect },
  ref,
) {
  const posterRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(() => document.fonts.status === 'loaded');
  const [layout, setLayout] = useState<{ mid: GroupLayout; small: GroupLayout } | null>(null);

  const placed = acts.filter((a) => !a.act.fixed);
  const fixed = acts.filter((a) => a.act.fixed);
  const headliners = placed.slice(0, HEADLINER_COUNT);
  const rest = placed.slice(HEADLINER_COUNT);
  const { zones } = festival;

  useEffect(() => {
    if (!fontsReady) document.fonts.ready.then(() => setFontsReady(true));
  }, [fontsReady]);

  const runLayout = useCallback(() => {
    const poster = posterRef.current;
    const head = headRef.current;
    const measure = measureRef.current;
    if (!poster || !head || !measure) return;
    const W = poster.clientWidth;
    const H = poster.clientHeight;
    if (!W || !H) return;
    const set = (name: string, value: number) => poster.style.setProperty(name, `${value}cqw`);

    // Headliners: one line each, as big as fits the width and the header's max height.
    set('--hl-size', HEADLINER_SIZE);
    const widest = Math.max(1, ...[...head.children].map((c) => (c as HTMLElement).scrollWidth));
    const hlScale = Math.min(
      1.25,
      (zones.header.w * W) / 100 / widest,
      (zones.header.h * H) / 100 / Math.max(1, head.offsetHeight),
    );
    set('--hl-size', HEADLINER_SIZE * hlScale);
    const headerBottom = head.children.length ? ((head.offsetTop + head.offsetHeight) / H) * 100 + 0.8 : 0;

    const boxesFor = (list: Region[]): Box[] =>
      list.map((r) => {
        const top = r.belowHeader ? Math.max(r.y, headerBottom) : r.y;
        const zone = { x: r.x, y: top, w: r.w, h: Math.max(0, r.y + r.h - top) };
        return { zone, widthPx: (zone.w * W) / 100, heightPx: (zone.h * H) / 100 };
      });
    const boxes = { mid: boxesFor(zones.mid), small: boxesFor(zones.small) };

    // Word widths, measured once (one reflow) at a fixed size.
    const [spaceEl, ...actEls] = [...measure.children] as HTMLElement[];
    const space = spaceEl.getBoundingClientRect().width;
    const words: Words[] = actEls.map((el) =>
      ([...el.children] as HTMLElement[]).map((w) => w.getBoundingClientRect().width),
    );

    const basePx = { mid: (GROUPS.mid.base * W) / 100, small: (GROUPS.small.base * W) / 100 };
    const indices = rest.map((_, i) => i);
    const scaleFor = (group: Group, items: number[]) =>
      bestScale(items, words, space, boxes[group], basePx[group], GROUPS[group].max);

    // Split the rest between second tier and small print so both print as large as
    // possible; when everything fits comfortably, keep about PREFERRED_MID up top.
    const target = Math.min(PREFERRED_MID, rest.length);
    let best = { k: 0, mid: 0, small: 0, score: -1 };
    for (let k = 0; k <= rest.length; k++) {
      const mid = scaleFor('mid', indices.slice(0, k));
      const small = scaleFor('small', indices.slice(k));
      const score = Math.min(
        k ? mid / GROUPS.mid.max : Infinity,
        k < rest.length ? small / GROUPS.small.max : Infinity,
      );
      if (
        score > best.score + 1e-4 ||
        (Math.abs(score - best.score) <= 1e-4 && Math.abs(k - target) < Math.abs(best.k - target))
      ) {
        best = { k, mid, small, score };
      }
    }

    const mid = placeGroup(indices.slice(0, best.k), words, space, boxes.mid, basePx.mid, best.mid);
    const small = placeGroup(indices.slice(best.k), words, space, boxes.small, basePx.small, best.small);
    set('--mid-size', GROUPS.mid.base * mid.scale);
    set('--small-size', GROUPS.small.base * small.scale);
    setLayout({ mid, small });
    // `rest` is derived from `acts`.
  }, [acts, festival]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(runLayout, [runLayout, fontsReady]);

  useEffect(() => {
    const poster = posterRef.current;
    if (!poster) return;
    let frame = 0;
    let lastWidth = poster.clientWidth;
    const observer = new ResizeObserver(() => {
      if (Math.abs(poster.clientWidth - lastWidth) < 2) return;
      lastWidth = poster.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(runLayout);
    });
    observer.observe(poster);
    return () => observer.disconnect();
  }, [runLayout]);

  const setRefs = (el: HTMLDivElement | null) => {
    posterRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  const { theme } = festival;
  const columns = (group: Group) =>
    layout?.[group].columns.map((col, c) => (
      <div key={`${group}-${c}`} className="zone col" style={pct(col.zone)}>
        {col.items.map((i) =>
          rest[i] ? (
            <button
              key={rest[i].act.display}
              type="button"
              className={`name name-${group}${layout[group].wrapped.has(i) ? ' wrapped' : ''}`}
              onClick={() => onSelect(rest[i])}
            >
              {rest[i].act.display}
            </button>
          ) : null,
        )}
      </div>
    ));

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
        } as CSSProperties
      }
    >
      <img
        className="poster-bg"
        src={`${import.meta.env.BASE_URL}${festival.background}`}
        alt=""
        draggable={false}
      />

      <div className="zone" style={{ ...pct(zones.header), height: 'auto' }}>
        <div ref={headRef} className="headliners">
          {headliners.map((a) => (
            <button key={a.act.display} type="button" className="name name-hl" onClick={() => onSelect(a)}>
              {a.act.display}
            </button>
          ))}
        </div>
        {placed.length === 0 && (
          <p className="poster-empty">
            None of your artists are on this lineup — yet.
            <br />
            Time for some homework?
          </p>
        )}
      </div>

      {columns('mid')}
      {columns('small')}

      {fixed.map((a) => (
        <button
          key={a.act.display}
          type="button"
          className="fixed-hotspot"
          style={pct(a.act.fixed!)}
          onClick={() => onSelect(a)}
          aria-label={a.act.display}
          title={a.act.display}
        />
      ))}

      <div className="zone zone-credit" style={pct(zones.credit)}>
        <div className="credit-title">your*lineup</div>
        <div className="credit-sub">curated from your spotify for</div>
        <div className="credit-name">{curatedFor}</div>
      </div>

      {/* Hidden copy of each name, split into words, for measuring line breaks. */}
      <div ref={measureRef} className="measure" aria-hidden style={{ fontSize: MEASURE_PX }}>
        <span className="name">{' '}</span>
        {rest.map((a) => (
          <div key={a.act.display} className="name">
            {a.act.display.split(' ').map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});
