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

/** Acts per tier: headliners, second line, then everyone else. */
const TIER_COUNTS = [4, 5, Infinity];
/** Font size of each tier relative to the headliners (from the official poster). */
const TIER_SIZES = [1, 0.78, 0.66];
/** Headliner size at scale 1 (cqw), matching the official poster. */
const BASE_SIZE = 3.7;
const MAX_SCALE = 1.7;
const LINE_HEIGHT = 1.15;
/** Days with few acts may print at most this much bigger than the busiest day. */
const MAX_DAY_RATIO = 1.3;

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

function linesAt(items: number[], m: Measure, scale: number, width: number): DayLine[] {
  const out: DayLine[] = [];
  let next = 0;
  TIER_COUNTS.forEach((count, tier) => {
    const tierItems = items.slice(next, next + count);
    next += tierItems.length;
    const size = BASE_SIZE * TIER_SIZES[tier] * scale;
    for (const line of fillLines(tierItems, m, size, width)) out.push({ items: line, size, tier });
  });
  return out;
}

const fits = (lines: DayLine[], m: Measure, width: number, height: number) =>
  lines.reduce((h, l) => h + l.size * LINE_HEIGHT, 0) <= height &&
  lines.every((l) => l.items.length > 1 || m.widths[l.items[0]] * l.size <= width);

/** Largest scale at which a day's acts fit its zone. */
function bestScale(items: number[], m: Measure, width: number, height: number): number {
  if (!items.length) return Infinity;
  let lo = 0.05;
  let hi = MAX_SCALE;
  if (fits(linesAt(items, m, hi, width), m, width, height)) return hi;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (fits(linesAt(items, m, mid, width), m, width, height)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Lays out every day. `days` gives each day's acts (in rank order) and its
 * zone size in cqw. Busy days shrink to fit; quiet days don't balloon past
 * MAX_DAY_RATIO times the busiest, so the days still look like one poster.
 */
export function layoutDays(days: { items: number[]; width: number; height: number }[], m: Measure): DayLine[][] {
  const scales = days.map((d) => bestScale(d.items, m, d.width, d.height));
  const smallest = Math.min(...scales.filter(Number.isFinite));
  return days.map((d, i) => {
    const scale = Number.isFinite(smallest) ? Math.min(scales[i], smallest * MAX_DAY_RATIO) : 1;
    return linesAt(d.items, m, scale, d.width);
  });
}
