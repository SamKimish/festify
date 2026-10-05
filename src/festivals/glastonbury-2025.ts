import { act } from './act';
import data from './glastonbury-2025.lineup.json';
import type { Act, DaysFestival } from './types';

/**
 * Spotify artists an act might be listed under: the full name, plus the
 * parts of collaborations ("X B2B Y", "X & Y") and the leader of "X and the Y".
 * Very short fragments are skipped so they don't match unrelated artists.
 */
function members(name: string): string[] {
  const clean = name
    .replace(/\s*\((?:[^)]*)\)\s*$/, '')
    .replace(/\s+(?:LIVE|DJ SET|LIVE SET|\(LIVE\))$/i, '')
    .trim();
  const names = new Set([clean]);
  const parts = clean.split(/\s+(?:B2B|&|X|VS\.?|FEAT\.?|FT\.?|PRESENTS)\s+/i);
  if (parts.length > 1) parts.filter((p) => p.length >= 4).forEach((p) => names.add(p));
  const leader = clean.match(/^(.+?)\s+(?:AND|&)\s+(?:THE|HIS|HER|THEIR)\s+/i)?.[1];
  if (leader && leader.length >= 4) names.add(leader);
  return [...names];
}

// Every act on every stage, from the festival website (scripts/parse-glastonbury.mjs):
// [name, day section, billing, stage]. Billing 0–2 = lines on the official poster,
// 3 = other main-stage acts, 4 = everything else.
const lineup: Act[] = (data as [string, string, number, string][]).map(([name, day, billing]) => ({
  ...act(name, billing, members(name)),
  day,
}));

export const glastonbury2025: DaysFestival = {
  id: 'glastonbury-2025',
  layout: 'days',
  name: 'Glastonbury Festival',
  edition: '2025',
  dates: '25–29 June 2025',
  location: 'Worthy Farm, Pilton',
  background: 'festivals/glastonbury-2025/background.webp',
  width: 1599,
  height: 2000,
  theme: {
    fontFamily: "'Gloock', 'Georgia', serif",
    fontVariation: 'normal',
    fontWeight: 400,
    textColor: '#f4e4c1',
    accentColor: '#e9a56b',
    dotColors: ['#e9a56b', '#b7b4d9', '#e7be4c', '#c0392b', '#f4e4c1'],
  },
  // Under each day heading on the artwork (percent of width / height), clear
  // of the stained-glass border and the "plus many more acts" footer.
  days: [
    { label: 'FRIDAY', zone: { x: 10, y: 29.8, w: 80, h: 17 }, topColor: '#f6e8c8', restColor: '#eea76a' },
    { label: 'SATURDAY', zone: { x: 10, y: 52, w: 80, h: 16.5 }, topColor: '#f3f0f7', restColor: '#bab7dc' },
    { label: 'SUNDAY', zone: { x: 10, y: 73.8, w: 80, h: 18.2 }, topColor: '#f6e9b0', restColor: '#e9c04e' },
  ],
  lineup,
};
