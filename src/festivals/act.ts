import type { Act, ActMember } from './types';

/**
 * Builds an act. By default the members are taken from the display text:
 * "LIVE" / "(LIVE AV)" suffixes are dropped and "B2B", "&" and "x" split it
 * into separate artists. Pass `members` to override (e.g. for band names that
 * contain "&"). Spotify IDs can be filled in with `npm run resolve-ids`.
 */
export function act(display: string, billing: number, members?: (string | ActMember)[]): Act {
  const names =
    members ??
    display
      .replace(/\s*\(LIVE AV\)$/i, '')
      .replace(/\s+LIVE$/i, '')
      .split(/\s+(?:B2B|&|x)\s+/i);
  return {
    display,
    billing,
    members: names.map((m) => (typeof m === 'string' ? { name: m } : m)),
  };
}
