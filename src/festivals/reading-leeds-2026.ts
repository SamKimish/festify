import { act } from './act';
import data from './reading-leeds-2026.lineup.json';
import type { Act, PhotosFestival, Slot } from './types';

/** The act's name, plus each artist in a "X b2b Y". */
function members(display: string): string[] {
  const parts = display.split(/\s+B2B\s+/i);
  return parts.length > 1 ? [display, ...parts] : [display];
}

// Every act and set time (Reading's days; Leeds runs the same bill in a
// different order), from scripts/parse-reading.mjs. Billing 0–3 = lines on the
// official poster, 4 = other main-stage acts, 5 = everyone else.
const { stages, acts } = data as { stages: string[]; acts: [string, number, [string, number, number, number][]][] };
const lineup: Act[] = acts.map(([display, billing, slots]) => ({
  ...act(display, billing, members(display)),
  slots: slots.map(([day, stage, start, end]): Slot => ({ day, stage: stages[stage], start, end })),
}));

export const readingLeeds2026: PhotosFestival = {
  id: 'reading-leeds-2026',
  layout: 'photos',
  name: 'Reading & Leeds Festival',
  edition: '2026',
  dates: '27–30 August 2026',
  location: 'Reading & Leeds',
  background: 'festivals/reading-leeds-2026/background.webp',
  width: 1200,
  height: 1500,
  theme: {
    fontFamily: "'Anton', 'Impact', sans-serif",
    fontVariation: 'normal',
    fontWeight: 400,
    textColor: '#e5341f',
    accentColor: '#e5341f',
    dotColors: ['#e5341f', '#f0e3c0', '#8c1d12', '#c9b48a'],
  },
  // Measured on the 1200×1500 artwork: headliners between the logo and the
  // first rule, everyone else between the two rules, credit under the second.
  headliners: { zone: { x: 1.7, y: 16, w: 96.6, h: 38.8 }, count: 5, nameShare: 0.36 },
  rest: { zone: { x: 6, y: 60.4, w: 88, h: 26.2 }, label: 'Special guests' },
  credit: { x: 6, y: 89, w: 88, h: 4 },
  colors: {
    names: '#e5341f',
    photoTint: '#efe2c4',
    label: '#e5341f',
    separator: '#efe2c4',
    credit: '#efe2c4',
  },
  lineup,
};
