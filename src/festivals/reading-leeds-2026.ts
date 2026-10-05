import { act } from './act';
import leedsData from './leeds-2026.lineup.json';
import readingData from './reading-2026.lineup.json';
import type { Act, PhotosFestival, Slot } from './types';

/** The act's name, plus each artist in a "X b2b Y". */
function members(display: string): string[] {
  const parts = display.split(/\s+B2B\s+/i);
  return parts.length > 1 ? [display, ...parts] : [display];
}

type TimetableJson = { stages: string[]; acts: [string, number, [string, number, number, number][]][] };

/**
 * Every act and set time for one site, from scripts/parse-reading.mjs. Billing
 * follows that site's official poster; everyone else sits just below it.
 */
function lineupFrom(data: TimetableJson): Act[] {
  return data.acts.map(([display, billing, slots]) => ({
    ...act(display, billing, members(display)),
    slots: slots.map(([day, stage, start, end]): Slot => ({ day, stage: data.stages[stage], start, end })),
  }));
}

const shared = {
  name: 'Reading & Leeds Festival',
  edition: '2026',
  dates: '27–30 August 2026',
  layout: 'photos' as const,
  theme: {
    fontFamily: "'Anton', 'Impact', sans-serif",
    fontVariation: 'normal',
    fontWeight: 400,
    textColor: '#e5341f',
    accentColor: '#e5341f',
    dotColors: ['#e5341f', '#f0e3c0', '#8c1d12', '#c9b48a'],
  },
};

/** Reading: red on black. (Keeps the original id so saved choices and edits carry over.) */
export const reading2026: PhotosFestival = {
  ...shared,
  id: 'reading-leeds-2026',
  site: { group: 'reading-leeds-2026', label: 'Reading' },
  location: 'Richfield Avenue, Reading',
  background: 'festivals/reading-leeds-2026/background.webp',
  width: 1200,
  height: 1500,
  // Measured on the 1200×1500 artwork: headliners between the logo and the
  // first rule, everyone else between the two rules, credit under the second.
  headliners: { zone: { x: 1.7, y: 16, w: 96.6, h: 38.8 }, count: 5, nameShare: 0.36 },
  rest: { zone: { x: 6, y: 60.4, w: 88, h: 26.2 }, label: 'Special guests' },
  credit: { x: 6, y: 89, w: 88, h: 4 },
  colors: { names: '#e5341f', photoTint: '#efe2c4', label: '#e5341f', separator: '#efe2c4', credit: '#efe2c4' },
  lineup: lineupFrom(readingData as TimetableJson),
};

/** Leeds: yellow on black, a taller story-format poster, its own bill and days. */
export const leeds2026: PhotosFestival = {
  ...shared,
  id: 'leeds-2026',
  site: { group: 'reading-leeds-2026', label: 'Leeds' },
  location: 'Bramham Park, Leeds',
  // Provisional blank made from the official poster (festival-sources/reading-leeds-2026/make-leeds-blank.cjs).
  background: 'festivals/reading-leeds-2026/leeds-background.webp',
  width: 1152,
  height: 2048,
  theme: { ...shared.theme, textColor: '#f2c84b', accentColor: '#f2c84b', dotColors: ['#f2c84b', '#efe0b0', '#8a6d1c', '#c9b48a'] },
  headliners: { zone: { x: 3, y: 22.2, w: 94, h: 23 }, count: 5, nameShare: 0.36 },
  rest: { zone: { x: 5, y: 47, w: 90, h: 35.5 }, label: 'Special guests' },
  credit: { x: 5, y: 83, w: 90, h: 2.6 },
  colors: { names: '#f2c84b', photoTint: '#efe0b0', label: '#f2c84b', separator: '#efe0b0', credit: '#efe0b0' },
  lineup: lineupFrom(leedsData as TimetableJson),
};
