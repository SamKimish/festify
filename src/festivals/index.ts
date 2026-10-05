import { primaveraSound2027 } from './primavera-sound-2027';
import { slamDunk2027 } from './slam-dunk-2027';
import type { Festival } from './types';

/** Festivals shown in the drop-down, in display order. */
export const festivals: Festival[] = [primaveraSound2027, slamDunk2027];

export type { Act, ActMember, ColumnsFestival, Festival, ReelsFestival, Region, Zone } from './types';
