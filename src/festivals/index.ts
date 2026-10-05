import { glastonbury2025 } from './glastonbury-2025';
import { primaveraSound2027 } from './primavera-sound-2027';
import { slamDunk2027 } from './slam-dunk-2027';
import type { Festival } from './types';

/** Festivals shown in the drop-down, in display order. */
export const festivals: Festival[] = [primaveraSound2027, slamDunk2027, glastonbury2025];

/** Shown greyed out in the drop-down until their lineups are in. */
export const comingSoon: string[] = ['Reading / Leeds Festival'];

/** Festivals grouped by edition, in display order. */
export const festivalsByEdition: [string, Festival[]][] = [
  ...festivals.reduce((groups, f) => groups.set(f.edition, [...(groups.get(f.edition) ?? []), f]), new Map<string, Festival[]>()),
];

export type {
  Act,
  ActMember,
  ColumnsFestival,
  DaysFestival,
  DaySection,
  Festival,
  ReelsFestival,
  Region,
  Zone,
} from './types';
