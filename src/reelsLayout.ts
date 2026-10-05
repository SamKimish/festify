import type { Zone } from './festivals';

/**
 * Layout for logo posters made of stacked panels ("reels"): the best acts go
 * in the first reel, and inside a reel the logos sit in centred rows that get
 * smaller towards the bottom, like the official Slam Dunk poster.
 *
 * All sizes are in cqw (percent of poster width).
 */

export interface PlacedLogo {
  index: number; // into the acts list
  height: number; // cqw
}

export type ReelLayout = PlacedLogo[][]; // rows

const H_GAP = 3; // between logos in a row
const V_GAP = 1; // between rows
const ROW_SHRINK = 0.85; // each row is this much smaller than the one above
const MAX_ROWS = 4;

/**
 * Wide logos (long names) would dominate at equal height, so heights are
 * partly normalised by aspect ratio towards a reference shape.
 */
const sizeFactor = (aspect: number) => Math.min(1.6, Math.max(0.55, (4 / aspect) ** 0.35));

/** How many acts per reel: earlier reels get fewer (so bigger) when it doesn't divide evenly. */
export function distribute(n: number, reels: number): number[] {
  if (n <= reels) return Array.from({ length: reels }, (_, i) => (i < n ? 1 : 0));
  const base = Math.floor(n / reels);
  const extra = n % reels;
  return Array.from({ length: reels }, (_, i) => base + (i >= reels - extra ? 1 : 0));
}

/** Split m logos into r rows, later rows taking the extras. */
function partition(m: number, r: number): number[] {
  const base = Math.floor(m / r);
  const extra = m % r;
  return Array.from({ length: r }, (_, i) => base + (i >= r - extra ? 1 : 0));
}

export interface LogoShape {
  /** width / height */
  aspect: number;
  /** Largest height (cqw) before a low-resolution logo starts to look blurry. */
  maxHeight: number;
}

/** Fits rows of logos into a W×H box; returns heights. */
function fitRows(rows: LogoShape[][], W: number, H: number): number[][] {
  const rowInfo = rows.map((shapes, r) => {
    const aspects = shapes.map((s) => s.aspect);
    const weight = ROW_SHRINK ** r;
    const factors = aspects.map(sizeFactor);
    const widthPerT = weight * factors.reduce((t, f, i) => t + f * aspects[i], 0);
    const caps = shapes.map((s) => s.maxHeight);
    return { weight, factors, caps, maxT: (W - H_GAP * (aspects.length - 1)) / widthPerT };
  });
  const heightsAt = (t: number) =>
    rowInfo.map((row) => row.factors.map((f, j) => Math.min(Math.min(t, row.maxT) * row.weight * f, row.caps[j])));
  const heightAt = (t: number) =>
    heightsAt(t).reduce((sum, hs) => sum + Math.max(...hs), 0) + V_GAP * (rows.length - 1);
  let lo = 0;
  let hi = H * 2;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (heightAt(mid) <= H) lo = mid;
    else hi = mid;
  }
  return heightsAt(lo);
}

/** Lays out one reel, trying different row counts and keeping the one with the biggest logos. */
function layoutReel(indices: number[], shapes: LogoShape[], W: number, H: number): ReelLayout {
  if (!indices.length) return [];
  let best: { layout: ReelLayout; score: number } | null = null;
  for (let r = 1; r <= Math.min(MAX_ROWS, indices.length); r++) {
    const counts = partition(indices.length, r);
    const rows: number[][] = [];
    let next = 0;
    for (const c of counts) {
      rows.push(indices.slice(next, next + c));
      next += c;
    }
    const heights = fitRows(
      rows.map((row) => row.map((i) => shapes[i])),
      W,
      H,
    );
    const layout = rows.map((row, r2) => row.map((index, j) => ({ index, height: heights[r2][j] })));
    // Score: total logo area, so wide logos in one row don't win by shrinking everyone.
    const score = layout.flat().reduce((t, l) => t + l.height * l.height * shapes[l.index].aspect, 0);
    if (!best || score > best.score * 1.05) best = { layout, score };
  }
  return best!.layout;
}

/** Full layout: acts in rank order with their logo shapes, split across the reels. */
export function layoutReels(shapes: LogoShape[], reels: Zone[], posterAspect: number): ReelLayout[] {
  const counts = distribute(shapes.length, reels.length);
  let next = 0;
  return reels.map((zone, r) => {
    const indices = Array.from({ length: counts[r] }, (_, i) => next + i);
    next += counts[r];
    return layoutReel(indices, shapes, zone.w, zone.h * posterAspect);
  });
}
