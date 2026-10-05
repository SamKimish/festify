/** How far back to look, for sources with full listening history (Last.fm, Spotify data uploads). */
export type ListeningPeriod = 'overall' | '12month' | '6month' | '3month' | '1month';

export const LISTENING_PERIODS: { id: ListeningPeriod; label: string }[] = [
  { id: 'overall', label: 'All time' },
  { id: '12month', label: 'Last 12 months' },
  { id: '6month', label: 'Last 6 months' },
  { id: '3month', label: 'Last 3 months' },
  { id: '1month', label: 'Last month' },
];

export const PERIOD_DAYS: Record<ListeningPeriod, number> = {
  overall: Infinity,
  '12month': 365,
  '6month': 182,
  '3month': 91,
  '1month': 30,
};

export const isListeningPeriod = (x: unknown): x is ListeningPeriod => LISTENING_PERIODS.some((p) => p.id === x);
