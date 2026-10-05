import { act } from './act';
import type { Act, DaysFestival, Slot } from './types';

const DAYS: Record<string, string> = { W: 'Wednesday', T: 'Thursday', F: 'Friday', S: 'Saturday', U: 'Sunday' };

/** "HH:MM" → minutes; anything before 6am belongs to the previous day's night. */
function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h < 6 ? h + 24 : h) * 60 + m;
}

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
// { stages, acts: [name, day section, billing, set times] }. Billing 0–2 = lines on the official poster,
// 3 = other main-stage acts, 4 = everything else. ~2,500 acts, so it's a separate
// download, fetched only when Glastonbury is picked.
async function loadLineup(): Promise<Act[]> {
  const [{ default: data }, { default: ids }] = await Promise.all([
    import('./glastonbury-2025.lineup.json'),
    // Spotify artist IDs for the acts (scripts/resolve-spotify-ids.mjs), so a
    // namesake you listen to isn't mistaken for the act playing.
    import('./glastonbury-2025.ids.json'),
  ]);
  const { stages, acts } = data as { stages: string[]; acts: [string, string, number, [string, number, string, string][]][] };
  const spotifyIds = ids as Record<string, string>;
  return acts.map(([name, day, billing, slots]) => ({
    ...act(
      name,
      billing,
      members(name).map((m, i) => (i === 0 && spotifyIds[m] ? { name: m, spotifyId: spotifyIds[m] } : m)),
    ),
    day,
    slots: slots.map(([d, stage, from, to]): Slot => {
      const start = minutes(from);
      let end = minutes(to);
      if (end <= start) end += 24 * 60;
      return { day: DAYS[d], stage: stages[stage], start, end };
    }),
  }));
}

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
  lineup: [],
  loadLineup,
};
