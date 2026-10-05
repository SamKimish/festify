import { glastonbury2025 } from './glastonbury-2025';
import { primaveraSound2027 } from './primavera-sound-2027';
import { leeds2026, reading2026 } from './reading-leeds-2026';
import { slamDunk2027 } from './slam-dunk-2027';
import type { Festival } from './types';

/** Festivals shown in the drop-down, in display order. */
export const festivals: Festival[] = [primaveraSound2027, slamDunk2027, reading2026, leeds2026, glastonbury2025];

/** Shown greyed out in the drop-down until their lineups are in. */
export const comingSoon: string[] = [];

/** The id shown in the menu for a festival (its first site, for multi-site festivals). */
export const menuId = (f: Festival) => (f.site ? festivals.find((x) => x.site?.group === f.site!.group)!.id : f.id);

/** Every site of a multi-site festival (just the festival itself otherwise). */
export const sitesOf = (f: Festival) => (f.site ? festivals.filter((x) => x.site?.group === f.site!.group) : [f]);

/** Festivals grouped by edition for the menu, one entry per multi-site festival. */
export const festivalsByEdition: [string, Festival[]][] = [
  ...festivals
    .filter((f) => menuId(f) === f.id)
    .reduce((groups, f) => groups.set(f.edition, [...(groups.get(f.edition) ?? []), f]), new Map<string, Festival[]>()),
];

export { lineupOf, loadLineup } from './lineup';
export type {
  Act,
  ActMember,
  ColumnsFestival,
  DaysFestival,
  DaySection,
  Festival,
  PhotosFestival,
  ReelsFestival,
  Region,
  Slot,
  Zone,
} from './types';
