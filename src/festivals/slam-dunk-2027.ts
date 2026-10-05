import { act } from './act';
import logoSizes from './slam-dunk-2027.logos.json';
import type { Act, ReelsFestival } from './types';

/** An act with its logo cut from the official poster (traced to SVG; see festival-sources/slam-dunk-2027). */
function band(display: string, billing: number, slug: keyof typeof logoSizes, members?: string[]): Act {
  return {
    ...act(display, billing, members ?? [display]),
    logo: { src: `festivals/slam-dunk-2027/logos/${slug}.svg`, ...logoSizes[slug] },
  };
}

const lineup: Act[] = [
  // Reel 1
  band('Bowling For Soup', 0, 'bowling-for-soup'),
  band('Simple Plan', 0, 'simple-plan'),
  band('Reel Big Fish', 0, 'reel-big-fish'),
  band('Less Than Jake', 0, 'less-than-jake'),
  band('The Interrupters', 0, 'the-interrupters'),
  band('Grade 2', 0, 'grade-2'),
  // Reel 2
  band('Killswitch Engage', 1, 'killswitch-engage'),
  band('Beartooth', 1, 'beartooth'),
  band('Wage War', 1, 'wage-war'),
  band('The Amity Affliction', 1, 'the-amity-affliction'),
  band('ERRA', 1, 'erra'),
  band('Melrose Avenue', 1, 'melrose-avenue'),
  band('From Ashes To New', 1, 'from-ashes-to-new'),
  // Reel 3
  band('Sleeping With Sirens', 2, 'sleeping-with-sirens'),
  band('The Used', 2, 'the-used'),
  band('The Maine', 2, 'the-maine'),
  band('We The Kings', 2, 'we-the-kings'),
  band('The Academy Is...', 2, 'the-academy-is'),
  band('Cute Is What We Aim For', 2, 'cute-is-what-we-aim-for'),
  // Reel 4
  band('The Front Bottoms', 3, 'the-front-bottoms'),
  band('Four Year Strong', 3, 'four-year-strong'),
  band('Trophy Eyes', 3, 'trophy-eyes'),
  band('Knuckle Puck', 3, 'knuckle-puck'),
  band('Overgrown', 3, 'overgrown'),
  band('Love Rarely', 3, 'love-rarely'),
  // Reel 5
  band('Hot Milk', 4, 'hot-milk'),
  band('Mouth Culture', 4, 'mouth-culture'),
  band('As December Falls', 4, 'as-december-falls'),
  band('Redhook', 4, 'redhook'),
];

export const slamDunk2027: ReelsFestival = {
  id: 'slam-dunk-2027',
  layout: 'reels',
  name: 'Slam Dunk Festival 2027',
  dates: '29–30 May 2027',
  location: 'Leeds & Hatfield',
  background: 'festivals/slam-dunk-2027/background.webp',
  width: 1024,
  height: 1278,
  theme: {
    // Used for acts without a logo.
    fontFamily: "'Anton', 'Impact', sans-serif",
    fontVariation: 'normal',
    fontWeight: 400,
    textColor: '#111111',
    accentColor: '#e5197e',
    dotColors: ['#e5197e', '#ffe500', '#2b3a8f', '#2bb5c0', '#f39200'],
  },
  // White inner area of each slot-machine reel (percent of width / height),
  // inset from the curved shading at the edges.
  reels: [
    { x: 23.4, y: 17.8, w: 54.7, h: 11.9 },
    { x: 23.0, y: 34.6, w: 55.7, h: 10.0 },
    { x: 22.7, y: 49.5, w: 56.2, h: 11.3 },
    { x: 22.3, y: 65.7, w: 57.2, h: 8.9 },
    { x: 21.9, y: 78.6, w: 58.0, h: 6.8 },
  ],
  lineup,
};
