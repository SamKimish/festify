import type { Act, Festival } from './types';

const loaded = new Map<string, Act[]>();

/** The festival's acts, or null if they still need loading with `loadLineup`. */
export function lineupOf(festival: Festival): Act[] | null {
  return festival.loadLineup ? (loaded.get(festival.id) ?? null) : festival.lineup;
}

/** Loads (once) and returns the festival's acts. */
export async function loadLineup(festival: Festival): Promise<Act[]> {
  const ready = lineupOf(festival);
  if (ready) return ready;
  const acts = await festival.loadLineup!();
  loaded.set(festival.id, acts);
  return acts;
}
