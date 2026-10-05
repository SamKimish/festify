/** A rectangle on the poster, in percent of the poster's width / height. */
export interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A column the lineup text flows through. */
export interface Region extends Zone {
  /** Start below the headliners rather than at `y` if they reach further down. */
  belowHeader?: boolean;
}

/** One Spotify artist that performs as part of an act. */
export interface ActMember {
  name: string;
  /** Spotify artist ID. When missing, the act is matched by name instead. */
  spotifyId?: string;
}

/** One line on the poster, e.g. "BASHKKA B2B MIKE SERVITO". */
export interface Act {
  /** Text exactly as it should be printed on the poster. */
  display: string;
  members: ActMember[];
  /** Billing on the official poster: 0 = top line, higher = smaller print. */
  billing: number;
  /**
   * Set when the act is already printed on the background artwork (e.g. the
   * closing set). It stays out of the generated lineup, and this area becomes
   * clickable when the user listens to them.
   */
  fixed?: Zone;
  /** Logo image (path relative to the site root) and its pixel size, for logo posters. */
  logo?: { src: string; width: number; height: number };
  /** Day section the act appears in, for day-based posters (matches DaySection.label). */
  day?: string;
  /** Set times, where the festival publishes them (used to find clashes). */
  slots?: Slot[];
}

export interface Slot {
  /** Day the set is listed under, e.g. "Saturday". */
  day: string;
  stage: string;
  /** Minutes after midnight at the start of `day`; after-midnight sets run past 1440. */
  start: number;
  end: number;
}

export interface FestivalTheme {
  fontFamily: string;
  /** CSS font-variation-settings for the artist names. */
  fontVariation: string;
  fontWeight: number;
  textColor: string;
  /** Colour the "curated for" block uses for its rule line. */
  accentColor: string;
  /** Colours used for placeholder artist images (the poster's dots). */
  dotColors: string[];
}

interface FestivalBase {
  id: string;
  /** Festival name without the year, e.g. "Slam Dunk Festival". */
  name: string;
  /** Which edition this lineup is for, e.g. "2027". Groups the drop-down. */
  edition: string;
  /**
   * For festivals split across sites with different bills and timetables
   * (Reading / Leeds): one menu entry per group, and a toggle between sites.
   */
  site?: { group: string; label: string };
  dates: string;
  location: string;
  /** Path (relative to the site root) of the blank poster artwork. */
  background: string;
  /** Pixel size of the artwork, used for the aspect ratio. */
  width: number;
  height: number;
  theme: FestivalTheme;
  /** The acts, or [] when they're loaded on demand with `loadLineup`. */
  lineup: Act[];
  /** For big lineups: loads the acts in a separate download when the festival is picked. */
  loadLineup?: () => Promise<Act[]>;
}

/** Text lineup flowing through columns (e.g. Primavera Sound). */
export interface ColumnsFestival extends FestivalBase {
  layout: 'columns';
  zones: {
    /** Headliners, one per line; `h` is the most height they may take. */
    header: Zone;
    /** Columns for second-tier acts, in reading order. */
    mid: Region[];
    /** Columns for small-print acts, in reading order. */
    small: Region[];
    /** "curated for <name>" block. */
    credit: Zone;
  };
}

/** Logo lineup split across stacked panels, best first (e.g. Slam Dunk's slot-machine reels). */
export interface ReelsFestival extends FestivalBase {
  layout: 'reels';
  /** Inner area of each panel, top to bottom. */
  reels: Zone[];
}

/** One day's block on a day-split poster. */
export interface DaySection {
  /** Matches Act.day, e.g. "FRIDAY". The label itself is printed on the artwork. */
  label: string;
  /** Area for that day's names. */
  zone: Zone;
  /** Colour of the top two lines… */
  topColor: string;
  /** …and of everyone else. */
  restColor: string;
}

/** Names in centred, bullet-separated lines under each day (e.g. Glastonbury). */
export interface DaysFestival extends FestivalBase {
  layout: 'days';
  days: DaySection[];
}

/**
 * A row of headliners, each with their name over a photo, then the rest in
 * bullet-separated lines (e.g. Reading & Leeds).
 */
export interface PhotosFestival extends FestivalBase {
  layout: 'photos';
  headliners: {
    zone: Zone;
    /** Most headliner columns. */
    count: number;
    /** Share of the zone's height for the names; the photos get the rest. */
    nameShare: number;
  };
  /** Everyone else, with an optional heading such as "Special guests". */
  rest: { zone: Zone; label?: string };
  credit: Zone;
  colors: { names: string; photoTint: string; label: string; separator: string; credit: string };
}

export type Festival = ColumnsFestival | ReelsFestival | DaysFestival | PhotosFestival;
