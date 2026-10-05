import { HEADLINER_COUNT, type CuratedAct } from './curate';
import type { Act } from './festivals';

/** A person's tweaks to one festival's poster, keyed by act display name. */
export interface PosterEdits {
  /** Taken off the poster. */
  hidden: string[];
  /** Forced to the top, in this order. */
  headliners: string[];
  /** Added by hand (e.g. bands they listen to on vinyl or another service). */
  added: string[];
}

export const NO_EDITS: PosterEdits = { hidden: [], headliners: [], added: [] };
const key = (festivalId: string) => `festify.edits.${festivalId}`;

export function loadEdits(festivalId: string): PosterEdits {
  try {
    const raw = localStorage.getItem(key(festivalId));
    return raw ? { ...NO_EDITS, ...JSON.parse(raw) } : NO_EDITS;
  } catch {
    return NO_EDITS;
  }
}

export function saveEdits(festivalId: string, edits: PosterEdits) {
  try {
    if (!edits.hidden.length && !edits.headliners.length && !edits.added.length) localStorage.removeItem(key(festivalId));
    else localStorage.setItem(key(festivalId), JSON.stringify(edits));
  } catch {
    /* storage unavailable: edits last for this visit only */
  }
}

export const hasEdits = (e: PosterEdits) => e.hidden.length + e.headliners.length + e.added.length > 0;

/**
 * Combines your listening, suggestions and hand-added acts into the final
 * running order. Pinned headliners go first; everything else by score. Added
 * acts get a middling score (you clearly like them, but we have no numbers).
 */
export function buildPoster(
  listened: CuratedAct[],
  suggested: CuratedAct[],
  lineup: Act[],
  edits: PosterEdits,
): { acts: CuratedAct[]; hidden: CuratedAct[] } {
  const byName = new Map<string, CuratedAct>();
  for (const a of listened) byName.set(a.act.display, a);
  for (const a of suggested) if (!byName.has(a.act.display)) byName.set(a.act.display, a);

  const scores = listened.map((a) => a.score).sort((x, y) => x - y);
  const median = scores.length ? scores[Math.floor(scores.length / 2)] : 1;
  const lineupByName = new Map(lineup.map((a) => [a.display, a]));
  for (const name of edits.added) {
    const act = lineupByName.get(name);
    if (act && !byName.has(name)) byName.set(name, { act, score: median, artists: [], origin: 'added' });
  }

  const hiddenSet = new Set(edits.hidden);
  const all = [...byName.values()];
  const hidden = all.filter((a) => hiddenSet.has(a.act.display));
  const shown = all.filter((a) => !hiddenSet.has(a.act.display));
  const pinned = edits.headliners.map((n) => shown.find((a) => a.act.display === n)).filter(Boolean) as CuratedAct[];
  const rest = shown.filter((a) => !pinned.includes(a)).sort((a, b) => b.score - a.score || a.act.billing - b.act.billing);
  // Suggestions never take a headline slot from an act you actually listen to.
  const slots = Math.max(0, HEADLINER_COUNT - pinned.length);
  const top = rest.filter((a) => a.origin !== 'suggested').slice(0, slots);
  return { acts: [...pinned, ...top, ...rest.filter((a) => !top.includes(a))], hidden };
}

/** Text as printed on the poster: suggestions get the festify* asterisk. */
export const posterLabel = (a: CuratedAct) => (a.origin === 'suggested' ? `${a.act.display}*` : a.act.display);
