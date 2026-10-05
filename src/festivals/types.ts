/** A rectangle on the poster, in percent of the poster's width / height. */
export interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
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

export interface Festival {
  id: string;
  name: string;
  dates: string;
  location: string;
  /** Path (relative to the site root) of the blank poster artwork. */
  background: string;
  /** Pixel size of the artwork, used for the aspect ratio. */
  width: number;
  height: number;
  theme: FestivalTheme;
  zones: {
    /** Headliners plus second-tier acts. */
    top: Zone;
    /** Small-print acts. */
    bottom: Zone;
    /** "curated for <name>" block. */
    credit: Zone;
  };
  lineup: Act[];
}
