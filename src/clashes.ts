import type { CuratedAct } from './curate';
import type { Slot } from './festivals';

export interface Clash {
  a: CuratedAct;
  b: CuratedAct;
  slotA: Slot;
  slotB: Slot;
  /** Minutes the two sets overlap. */
  overlap: number;
  /** Each act's position in your running order (1 = top). */
  rankA: number;
  rankB: number;
}

/**
 * Sets overlapping by more than this many minutes clash: with the walk between
 * Glastonbury stages, even a short overlap means missing part of a set.
 */
const MAX_OK_OVERLAP = 5;

const overlapOf = (x: Slot, y: Slot) =>
  x.day === y.day && x.stage !== y.stage ? Math.max(0, Math.min(x.end, y.end) - Math.max(x.start, y.start)) : 0;

/**
 * The poster's biggest clashes: pairs of acts where you can't see both because
 * every set by one overlaps a set by the other. `acts` is your running order,
 * and a clash is as big as the two acts' combined position in it: your 5th and
 * 6th favourites (5 + 6) clash harder than your favourite and your 50th
 * (1 + 50). Longer overlaps break ties.
 */
export function findClashes(acts: CuratedAct[], limit = 5): Clash[] {
  const position = new Map(acts.map((a, i) => [a, i + 1]));
  const timed = acts.filter((a) => a.act.slots?.length);
  const clashes: Clash[] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const A = timed[i].act.slots!;
      const B = timed[j].act.slots!;
      const clashesWith = (s: Slot, others: Slot[]) => others.some((o) => overlapOf(s, o) > MAX_OK_OVERLAP);
      // If either act has a set that clashes with nothing of the other's, you can see both.
      if (A.some((s) => !clashesWith(s, B)) || B.some((s) => !clashesWith(s, A))) continue;
      let worst: { slotA: Slot; slotB: Slot; overlap: number } | null = null;
      for (const sa of A) {
        for (const sb of B) {
          const overlap = overlapOf(sa, sb);
          if (overlap > MAX_OK_OVERLAP && (!worst || overlap > worst.overlap)) worst = { slotA: sa, slotB: sb, overlap };
        }
      }
      if (!worst) continue;
      clashes.push({ a: timed[i], b: timed[j], ...worst, rankA: position.get(timed[i])!, rankB: position.get(timed[j])! });
    }
  }
  return clashes
    .sort((x, y) => x.rankA + x.rankB - (y.rankA + y.rankB) || y.overlap - x.overlap)
    .slice(0, limit);
}

/** 1500 → "01:00" */
export function clockTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
