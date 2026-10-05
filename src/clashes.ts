import type { CuratedAct } from './curate';
import type { Slot } from './festivals';

export interface Clash {
  a: CuratedAct;
  b: CuratedAct;
  slotA: Slot;
  slotB: Slot;
  /** Minutes the two sets overlap. */
  overlap: number;
}

/**
 * Sets overlapping by more than this many minutes clash: with the walk between
 * Glastonbury stages, even a short overlap means missing part of a set.
 */
const MAX_OK_OVERLAP = 5;

const overlapOf = (x: Slot, y: Slot) =>
  x.day === y.day && x.stage !== y.stage ? Math.max(0, Math.min(x.end, y.end) - Math.max(x.start, y.start)) : 0;

/**
 * The poster's worst clashes: pairs of acts where you can't see both because
 * every set by one overlaps a set by the other. Ranked by how much you like
 * the *less* loved act of the pair (that's what you'd be giving up), weighted
 * by how much of the shorter set the clash eats.
 */
export function findClashes(acts: CuratedAct[], limit = 5): Clash[] {
  const timed = acts.filter((a) => a.act.slots?.length);
  const clashes: (Clash & { weight: number })[] = [];
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
      const shorter = Math.min(worst.slotA.end - worst.slotA.start, worst.slotB.end - worst.slotB.start);
      const weight = Math.min(timed[i].score, timed[j].score) * (worst.overlap / Math.max(shorter, 1));
      clashes.push({ a: timed[i], b: timed[j], ...worst, weight });
    }
  }
  return clashes
    .sort((x, y) => y.weight - x.weight)
    .slice(0, limit)
    .map(({ weight: _, ...c }) => c);
}

/** 1500 → "01:00" */
export function clockTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
