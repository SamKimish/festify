import type { Act, ActMember, Festival } from './types';

/**
 * Builds an act. By default the members are taken from the display text:
 * "LIVE" / "(LIVE AV)" suffixes are dropped and "B2B", "&" and "x" split it
 * into separate artists. Pass `members` to override (e.g. for band names that
 * contain "&"). Spotify IDs can be filled in with `npm run resolve-ids`.
 */
function act(display: string, billing: number, members?: (string | ActMember)[]): Act {
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

const lineup: Act[] = [
  // Top line
  act('DOECHII', 0),
  act('PHOEBE BRIDGERS', 0),
  act('FONTAINES D.C.', 0),
  act('HAYLEY WILLIAMS', 0),
  act('FKA TWIGS', 0),
  act('TURNSTILE', 0),
  act('MASSIVE ATTACK', 0),
  act('THE CHEMICAL BROTHERS', 0),
  act('ROBYN', 0),
  act('BAD GYAL', 0),
  act('LOLA YOUNG', 0),
  act('ADÉLA', 0),
  act('CAROLINE POLACHEK', 0),
  act('PROSPA', 0),
  // Closing set: printed on the artwork itself, so it isn't placed again.
  { ...act('SKRILLEX B2B NINAJIRACHI', 0), fixed: { x: 2.8, y: 32.4, w: 31.5, h: 3.4 } },

  // Second line
  act('PAVEMENT', 1),
  act('KING GIZZARD AND THE LIZARD WIZARD', 1, ['King Gizzard & The Lizard Wizard']),
  act('TINASHE', 1),
  act('UNDERWORLD', 1),
  act('ESDEEKID', 1),
  act('KIM PETRAS', 1),
  act('BLEACHERS', 1),
  act('ANOHNI', 1, ['ANOHNI', 'ANOHNI and the Johnsons']),
  act('ANGINE DE POITRINE', 1),
  act('METRONOMY', 1),
  act('JT', 1),
  act('ARCA', 1),
  act('ISAIAH RASHAD', 1),
  act('WALLOWS', 1),
  act('THEODORA', 1),
  act('SNOW STRIPPERS', 1),
  act('BICEP', 1),
  act('SHYGIRL', 1),
  act('DINOSAUR JR.', 1),
  act('HEARTS2HEARTS', 1),
  act('UNDERSCORES', 1),
  act('CHVRCHES', 1),
  act('BRUTALISMUS 3000 B2B ISOXO', 1),
  act('MUNA', 1),
  act('METRIKA', 1),
  act('BOY HARSHER', 1),
  act('AKRIILA', 1),
  act('PABLOPABLO', 1),
  act('BONNIE “PRINCE” BILLY', 1, ['Bonnie "Prince" Billy']),
  act('VASHTI BUNYAN', 1),
  act('WEYES BLOOD', 1),
  act('JULIEN BAKER', 1),
  act('JOY ORBISON', 1),
  act('CONVERGE', 1),
  act('ATLAS SOUND', 1),

  // Third line
  act('DIIV', 2),
  act('HAVE A NICE LIFE', 2),
  act('MUSHKA', 2),
  act('ERIN LECOUNT', 2),
  act('ABHIR', 2),
  act('SANTIAGO MOTORIZADO', 2),
  act('GREG FREEMAN', 2),
  act('JUANA MOLINA', 2),
  act('HAUTE & FREDDY', 2, ['Haute & Freddy']),
  act('ENGLISH TEACHER', 2),
  act('SOPHIA STEL', 2),
  act('WESTSIDE COWBOY', 2),
  act('RACING MOUNT PLEASANT', 2),
  act('EAR', 2),
  act('CASTLE RAT', 2),
  act('FRIKO', 2),
  act('LIP CRITIC', 2),
  act('GILLA BAND', 2),
  act('ALCALÁ NORTE', 2),
  act('@', 2),
  act('JERSEY', 2),
  act('LOS PUNSETES', 2),
  act('KELSEY LU', 2),
  act('ALEMEDA', 2),
  act('VIVA BELGRADO', 2),
  act('JOHN TALABOT', 2),
  act('FULL OF HELL', 2),
  act('MABE FRATTI', 2),
  act('DAME AREA', 2),
  act('DOVE ELLIS', 2),
  act('GUILLEM GISBERT', 2),
  act('REBE', 2),
  act('MISHIMA', 2),
  act('DON CABALLERO', 2),
  act('JESU', 2),
  act('SIMIAN MOBILE DISCO', 2),
  act('S.A.S.S. (SAOIRSE, MOXIE, PEACH, SHANTI CELESTE)', 2, [
    'Saoirse',
    'Moxie',
    'Peach',
    'Shanti Celeste',
  ]),

  // Primavera Bits: Sunday all-day takeover
  act('RICHIE HAWTIN x FOUR TET x DIXON', 1),

  // Small print
  act('AERONAVE ADOLESCENTE', 3),
  act('ALEX VS ALEX', 3),
  act('AL·LÈRGIQUES AL POL·LEN', 3),
  act('ANDY STOTT LIVE', 3),
  act('AXOLOTES MEXICANOS', 3),
  act('B0YG1RL', 3),
  act('BAE BAE', 3),
  act('BASHKKA B2B MIKE SERVITO', 3),
  act('BLACKHAINE', 3),
  act('BLANCO PALAMERA', 3),
  act('BLAYA', 3),
  act('CARLOS DE JACOBA & CIUTAT', 3),
  act('CARMEN VILLAIN LIVE', 3),
  act('CARRÉ', 3),
  act('DANI DICOSTAS', 3),
  act('DECODER', 3),
  act('DULCE', 3),
  act('EDEN AURELIUS', 3),
  act('EL BUEN HIJO', 3),
  act('FADES', 3),
  act('DJ FRA', 3),
  act('GAZELLA', 3),
  act('HEADACHE', 3),
  act('IBRAHIM ALFA JNR', 3),
  act('IRENEGARRY', 3),
  act('JUMP SOURCE LIVE', 3),
  act('KLARA LEWIS', 3),
  act('LIVWUTANG B2B KONDUKU', 3),
  act('LORADENIZ', 3),
  act('LUX LISBON', 3),
  act('MAD MIRAN B2B DJ ZERO', 3),
  act('MADRA SALACH', 3),
  act('MALIBU', 3),
  act('MARK FELL & RP BOO LIVE', 3),
  act('MARTA SALOGNI LIVE', 3),
  act('MEMORY PALACE', 3),
  act('MORI', 3),
  act('NAONE', 3),
  act('NAPA', 3),
  act('OCEANIC (LIVE AV)', 3),
  act('PERFECTO MISERABLE', 3),
  act('PICTURE LIVE', 3),
  act('PISS', 3),
  act('PLO MAN', 3),
  act('POLE 1 2 3', 3),
  act('POLYGONIA LIVE', 3),
  act('PROSTITUTE', 3),
  act('ROLY PORTER', 3),
  act('DJ /RUPTURE', 3),
  act('SKY H1 LIVE', 3),
  act('SONIDO UNDERGROUND: DNGDNGDNG & PHRAN', 3, ['dngdngdng', 'Phran']),
  act('DJ STINGRAY 313 LIVE', 3),
  act('TATYANA JANE', 3),
  act('TIRZAH', 3),
  act('TRACEY', 3),
  act('TRICKPONY', 3),
  act('TRISTÁN!', 3),
  act('TTSSFU', 3),
  act('TWISTED TEENS', 3),
  act('VERUSHKA B2B ACIDHEAVEN', 3),
  act('VICTORYLAND', 3),
  act('WARNING', 3),
];

export const primaveraSound2027: Festival = {
  id: 'primavera-sound-2027',
  name: 'Primavera Sound Barcelona 2027',
  dates: '2–6 June 2027',
  location: 'Parc del Fòrum, Barcelona',
  background: 'festivals/primavera-sound-2027/background.webp',
  width: 1500,
  height: 2000,
  theme: {
    fontFamily: "'Archivo Variable', 'Helvetica Neue', Arial, sans-serif",
    fontVariation: "'wdth' 88",
    fontWeight: 700,
    textColor: '#141414',
    accentColor: '#141414',
    dotColors: [
      '#E8DE6A', '#2A9D63', '#EEC1DA', '#4F78BE', '#E25A1D', '#3E7F74', '#1E2A44',
      '#AFCDEE', '#D3C2E6', '#D7283F', '#BDB5A6', '#5A2B1C', '#9B3D6E', '#0B4A80',
    ],
  },
  // Measured against the 1500×2000 artwork (percent of width / height). The
  // left column is interrupted by the closing set and the strategic partner
  // logos; the small print sits left of the logo and above the partner strip.
  zones: {
    // Headliners fill everything above "closing*set".
    header: { x: 2.75, y: 1.3, w: 94.5, h: 27.6 },
    mid: [
      { x: 12, y: 37, w: 22.5, h: 21.5 }, // beside the partner logos
      { x: 36.5, y: 30.2, w: 29, h: 28.5, belowHeader: true },
      { x: 67.6, y: 30.2, w: 29.9, h: 28.5, belowHeader: true },
    ],
    small: [
      { x: 2.75, y: 61.8, w: 20.3, h: 32.4 },
      { x: 24.6, y: 61.8, w: 20.3, h: 32.4 },
      { x: 47, y: 67.6, w: 20.8, h: 26.6 },
    ],
    credit: { x: 70.6, y: 68.2, w: 26.6, h: 12 },
  },
  lineup,
};
