import { scoreArtists } from '../curate';
import type { ListeningProfile } from '../spotify/profile';
import type { Act, PersonalFestival } from './types';

/** How many of your favourite artists play your festival. */
const LINEUP_SIZE = 36;

/**
 * Your own festival: the poster is drawn entirely in code (a two-ink
 * risograph print), so there's no artwork, and the lineup comes from your
 * listening (see personalLineup).
 */
export const personalFest: PersonalFestival = {
  id: 'yourfest',
  layout: 'personal',
  name: 'YourFest',
  edition: 'Just for you',
  dates: 'All weekend, every weekend',
  location: 'Somewhere in your headphones',
  background: '',
  width: 1200,
  height: 1500,
  theme: {
    fontFamily: "'Archivo Variable', 'Helvetica Neue', Arial, sans-serif",
    fontVariation: "'wdth' 100",
    fontWeight: 800,
    textColor: '#2340c8',
    accentColor: '#ff4fa3',
    dotColors: ['#ff4fa3', '#2340c8', '#ffcf3a', '#16a37f'],
  },
  lineup: [],
};

/** "Sam Kimish" → "SamFest". Falls back to "YourFest" when there's no usable name. */
export function festName(profile: ListeningProfile | null): string {
  const first = (profile?.source === 'export' && profile.displayName === 'Spotify listener' ? '' : profile?.displayName ?? '')
    .trim()
    .split(/\s+/)[0]
    .replace(/[^\p{L}]/gu, '')
    .slice(0, 12);
  const name = first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : 'Your';
  return `${name}Fest`;
}

/** Your top artists as the lineup, best first. */
export function personalLineup(profile: ListeningProfile): Act[] {
  return [...scoreArtists(profile).values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, LINEUP_SIZE)
    .map(({ stats }, i) => ({
      display: stats.name.toUpperCase(),
      billing: i,
      // Spotify IDs only mean something for Spotify logins; everyone else matches by name.
      members: [{ name: stats.name, spotifyId: profile.source === 'spotify' ? stats.id : undefined }],
    }));
}
