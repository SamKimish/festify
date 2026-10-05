// Builds the Glastonbury lineup data from the festival website.
//
//   curl -sL https://www.glastonburyfestivals.co.uk/line-up/line-up-2025/ -o festival-sources/glastonbury-2025/line-up.html
//   node scripts/parse-glastonbury.mjs festival-sources/glastonbury-2025/line-up.html src/festivals/glastonbury-2025.lineup.json
//
// Every act on every stage is included, so people can match acts that never
// made the poster. Each act appears once: on the poster's day if it's on the
// official poster, otherwise the day of its first listed slot (stages are
// listed biggest first). Wednesday/Thursday acts go in the Friday section, as
// the poster only has Friday–Sunday.
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!output) {
  console.error('Usage: node scripts/parse-glastonbury.mjs <line-up.html> <out.json>');
  process.exit(1);
}
const html = readFileSync(input, 'utf8');

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;|&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

// The official poster, line by line (billing 0 = top line).
const POSTER = {
  FRIDAY: [
    ['THE 1975', 'LOYLE CARNER', 'BIFFY CLYRO', 'ALANIS MORISSETTE'],
    ['BUSTA RHYMES', 'MARIBOU STATE', 'GRACIE ABRAMS', 'FOUR TET', 'WET LEG'],
    ['ANOHNI AND THE JOHNSONS', 'BADBADNOTGOOD', 'BLOSSOMS', 'BURNING SPEAR', 'CMAT', 'DENZEL CURRY', 'EN VOGUE',
      'ENGLISH TEACHER', 'FATBOY SLIM', 'FAYE WEBSTER', 'FLOATING POINTS', 'FRANZ FERDINAND', 'GLASS BEAMS', 'INHALER',
      'LOLA YOUNG', 'MYLES SMITH', 'OSEES', 'PINKPANTHERESS', 'SELF ESTEEM', 'SUPERGRASS', 'VIEUX FARKA TOURÉ',
      'WUNDERHORSE'],
  ],
  SATURDAY: [
    ['NEIL YOUNG AND THE CHROME HEARTS', 'CHARLI XCX', 'RAYE', 'DOECHII'],
    ['DEFTONES', 'EZRA COLLECTIVE', 'JOHN FOGERTY', 'AMYL AND THE SNIFFERS'],
    ['AMAARAE', 'BEABADOOBEE', 'BETH GIBBONS', 'BOB VYLAN', 'BRANDI CARLILE', 'CARIBOU', 'FATHER JOHN MISTY',
      'GARY NUMAN', 'GREENTEA PENG', 'JADE', 'JAPANESE BREAKFAST', 'KAISER CHIEFS', 'KNEECAP', 'LEFTFIELD',
      'LUCY DACUS', 'NICK LOWE', 'NOVA TWINS', 'PA SALIEU', 'SCISSOR SISTERS', 'THE SCRIPT', 'TV ON THE RADIO',
      'WEEZER', 'YUSSEF DAYES'],
  ],
  SUNDAY: [
    ['OLIVIA RODRIGO', 'ROD STEWART', 'THE PRODIGY', 'NOAH KAHAN'],
    ['NILE RODGERS & CHIC', 'WOLF ALICE', 'JORJA SMITH', 'OVERMONO', 'THE LIBERTINES'],
    ['AJ TRACEY', 'BLACK UHURU', 'CELESTE', 'CYMANDE', 'DANILO PLESSOW', 'DJO', 'FUTURE ISLANDS', 'GIRL IN RED',
      'GOAT', 'JOY CROOKES', 'KAE TEMPEST', 'KATY J PEARSON', 'PARCELS', 'PAWSA', 'ROYEL OTIS', 'SHABOOZEY',
      'SNOW PATROL', 'SPRINTS', 'ST. VINCENT', 'THE BIG MOON', 'THE BRIAN JONESTOWN MASSACRE', 'THE MACCABEES',
      'THE SELECTER', 'TURNSTILE'],
  ],
};
const MAIN_STAGES = new Set(['PYRAMID STAGE', 'OTHER STAGE', 'WEST HOLTS STAGE', 'WOODSIES', 'THE PARK STAGE']);
// Placeholders and non-artist listings.
const SKIP = /^(TBA|TBC|SPECIAL GUESTS?|SECRET .*|PATCHWORK|CLOSED|.*\bTO BE ANNOUNCED\b.*)$/i;

const key = (s) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9]/g, '');
const poster = new Map();
for (const [day, lines] of Object.entries(POSTER)) {
  lines.forEach((line, billing) => line.forEach((name) => poster.set(key(name), { day, billing, name })));
}

// Stage names from the stage header buttons.
const stageNames = {};
for (const m of html.matchAll(/id="stage-header-(\d+)"[^>]*>([^<]*)</g)) stageNames[m[1]] ??= decode(m[2]);

// Walk the stage containers in page order.
const acts = new Map();
const tokens = /<div id="[^"]*" aria-labelledby="stage-header-(\d+)"|class="stage-day">([^<]*)<|<tr>\s*<td>([\s\S]*?)<\/td>/g;
let stage = '';
let day = '';
for (const m of html.matchAll(tokens)) {
  if (m[1]) stage = stageNames[m[1]] ?? '';
  else if (m[2]) day = decode(m[2]).toUpperCase();
  else if (m[3]) {
    const name = decode(m[3]);
    if (!name || SKIP.test(name)) continue;
    const k = key(name);
    if (!k || acts.has(k)) continue;
    const onPoster = poster.get(k);
    const sectionDay = onPoster?.day ?? (['WEDNESDAY', 'THURSDAY'].includes(day) ? 'FRIDAY' : day);
    acts.set(k, {
      name: onPoster?.name ?? name,
      day: sectionDay,
      billing: onPoster ? onPoster.billing : MAIN_STAGES.has(stage) ? 3 : 4,
      stage,
    });
  }
}
// Poster acts missing from the stage listings (shouldn't happen, but keep the poster complete).
for (const [k, p] of poster) if (!acts.has(k)) acts.set(k, { name: p.name, day: p.day, billing: p.billing, stage: '' });

const list = [...acts.values()].sort((a, b) => a.billing - b.billing);
writeFileSync(output, JSON.stringify(list.map(({ name, day, billing, stage }) => [name, day, billing, stage])) + '\n');
const byDay = list.reduce((t, a) => ({ ...t, [a.day]: (t[a.day] ?? 0) + 1 }), {});
console.log(`Wrote ${list.length} acts to ${output}`, byDay);
