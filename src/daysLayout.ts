/**
 * Layout for day-split posters (e.g. Glastonbury): under each day, names run
 * in centred lines separated by bullets. The first line holds the day's
 * headliners in the biggest type, the second line the next few, then
 * everyone else in smaller type. All sizes are in cqw (percent of poster width).
 */

export interface DayLine {
  items: number[]; // indices into the acts list
  size: number; // font size, cqw
  tier: number; // 0 = headliners
}

export interface LineOptions {
  /** Acts per tier: headliners, second line, then everyone else. */
  tierCounts: number[];
  /** Font size of each tier relative to the first. */
  tierSizes: number[];
  /** First-tier size at scale 1 (cqw). */
  baseSize: number;
  maxScale: number;
  lineHeight: number;
  /** Days with few acts may print at most this much bigger than the busiest day. */
  maxDayRatio: number;
}

/** Defaults match the Glastonbury poster. */
const DEFAULTS: LineOptions = {
  tierCounts: [4, 5, Infinity],
  tierSizes: [1, 0.78, 0.66],
  baseSize: 3.7,
  maxScale: 1.7,
  lineHeight: 1.15,
  maxDayRatio: 1.3,
};

export interface Measure {
  /** Width of each act's name at 1px font size (i.e. em). */
  widths: number[];
  /** Width of the " • " separator, em. */
  sep: number;
}

/** Greedily fills lines no wider than `width`; returns the lines' items. */
function fillLines(items: number[], m: Measure, size: number, width: number): number[][] {
  const lines: number[][] = [];
  let line: number[] = [];
  let used = 0;
  for (const i of items) {
    const w = m.widths[i] * size;
    if (line.length && used + m.sep * size + w > width) {
      lines.push(line);
      line = [];
      used = 0;
    }
    used += (line.length ? m.sep * size : 0) + w;
    line.push(i);
  }
  if (line.length) lines.push(line);
  return lines;
}

function linesAt(items: number[], m: Measure, scale: number, width: number, o: LineOptions): DayLine[] {
  const out: DayLine[] = [];
  let next = 0;
  o.tierCounts.forEach((count, tier) => {
    const tierItems = items.slice(next, next + count);
    next += tierItems.length;
    const size = o.baseSize * o.tierSizes[tier] * scale;
    for (const line of fillLines(tierItems, m, size, width)) out.push({ items: line, size, tier });
  });
  return out;
}

const fits = (lines: DayLine[], m: Measure, width: number, height: number, o: LineOptions) =>
  lines.reduce((h, l) => h + l.size * o.lineHeight, 0) <= height &&
  lines.every((l) => l.items.length > 1 || m.widths[l.items[0]] * l.size <= width);

/** Largest scale at which a day's acts fit its zone. */
function bestScale(items: number[], m: Measure, width: number, height: number, o: LineOptions): number {
  if (!items.length) return Infinity;
  let lo = 0.05;
  let hi = o.maxScale;
  if (fits(linesAt(items, m, hi, width, o), m, width, height, o)) return hi;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (fits(linesAt(items, m, mid, width, o), m, width, height, o)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Lays out every day. `days` gives each day's acts (in rank order) and its
 * zone size in cqw. Busy days shrink to fit; quiet days don't balloon past
 * MAX_DAY_RATIO times the busiest, so the days still look like one poster.
 */
export function layoutDays(
  days: { items: number[]; width: number; height: number }[],
  m: Measure,
  options: Partial<LineOptions> = {},
): DayLine[][] {
  const o = { ...DEFAULTS, ...options };
  const scales = days.map((d) => bestScale(d.items, m, d.width, d.height, o));
  const smallest = Math.min(...scales.filter(Number.isFinite));
  return days.map((d, i) => {
    const scale = Number.isFinite(smallest) ? Math.min(scales[i], smallest * o.maxDayRatio) : 1;
    return linesAt(d.items, m, scale, d.width, o);
  });
}
