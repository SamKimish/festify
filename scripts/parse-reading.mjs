// Builds Reading or Leeds lineup data from a plain-text stage timetable:
//
//   Friday August 28
//   The Grid
//   Charli xcx – 7.45pm-9pm      (or 19:45-21:00)
//   …
//
//   node scripts/parse-reading.mjs reading festival-sources/reading-leeds-2026/reading-lineup.txt src/festivals/reading-2026.lineup.json
//   node scripts/parse-reading.mjs leeds festival-sources/reading-leeds-2026/leeds-lineup.txt src/festivals/leeds-2026.lineup.json
//
// Output: { stages, acts: [display, billing, [[day, stage index, start, end], …]] }
// with times in minutes after midnight (after-midnight sets run past 1440).
import { readFileSync, writeFileSync } from 'node:fs';

const [site, input, output] = process.argv.slice(2);

// Each site's official poster, line by line (billing 0 = top). Everyone else is
// one below the poster on the main stage, two below elsewhere.
const POSTERS = {
  reading: [
    ['CHARLI XCX', 'CHASE & STATUS', 'DAVE', 'FLORENCE + THE MACHINE', 'FONTAINES D.C.', 'RAYE'],
    ['SKEPTA', 'SOMBR'],
    ['ROLE MODEL', 'JADE'],
    ['JOSH BAKER', 'KNEECAP', 'KETTAMA', 'CHRIS STUSSY', 'GEESE', 'SKYE NEWMAN', 'ADÉLA', 'KEO'],
  ],
  leeds: [
    ['CHARLI XCX', 'CHASE & STATUS', 'DAVE', 'FLORENCE + THE MACHINE', 'FONTAINES D.C.', 'RAYE', 'KASABIAN'],
    ['SKEPTA', 'SOMBR', 'ROLE MODEL'],
    ['ADÉLA', 'ARTHUR HILL', 'DECLAN MCKENNA', 'DUKE DUMONT', 'GEESE', 'HOLLY HUMBERSTONE', 'JADE', 'JAMES MARRIOTT',
      'JOSH BAKER', "THE K'S", 'KETTAMA', 'KINGFISHR', 'KNEECAP', 'THE LATHUMS', 'MAISIE PETERS', 'PARIS PALOMA',
      'SKYE NEWMAN', 'SLAYYYTER'],
    ['HYBRID MINDS', 'ROSSI.', 'SKEPTA B2B EAST END DUBS', 'HEDEX', 'ALISHA', 'MALL GRAB', 'NOTION', 'SILVA BUMPA',
      'SOTA', '[IVY]', 'DJAMMIN', 'HAMDI', 'IN PARALLEL', 'JACK MARLOW', 'JULIAN FIJMA', 'LOCKY', 'MEESHY', 'OMAR+',
      'RIORDAN', 'SAINT LUDO'],
  ],
};
const POSTER = POSTERS[site];
if (!POSTER || !output) {
  console.error('Usage: node scripts/parse-reading.mjs reading|leeds <lineup.txt> <out.json>');
  process.exit(1);
}
const MAIN_STAGE = 'The Grid';
const SKIP = /^(TBA|Special Guest)$/i;

const key = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/[^A-Z0-9]/g, '');
const posterBilling = new Map();
const posterName = new Map();
POSTER.forEach((line, billing) =>
  line.forEach((name) => {
    posterBilling.set(key(name), billing);
    posterName.set(key(name), name);
  }),
);

/** "7.45pm" or "19:45" → minutes; small hours count as the night after the listed day. */
function minutes(t) {
  const m = t.trim().match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?$/i);
  if (!m) throw new Error(`Bad time: ${t}`);
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  if (h < 6) h += 24;
  return h * 60 + Number(m[2] ?? 0);
}

const TIME = '([\\d.:]+\\s*(?:[ap]m)?)';
const SET_LINE = new RegExp(`^(.+?)\\s+[–-]\\s+${TIME}\\s*-\\s*${TIME}$`, 'i');

const stages = [];
const acts = new Map();
let day = '';
let stage = '';
for (const raw of readFileSync(input, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  // Blank lines and # comments (e.g. noting where a section came from) are skipped.
  if (!line || line.startsWith('#')) continue;
  const set = line.match(SET_LINE);
  const dayMatch = line.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
  if (dayMatch && !set) {
    day = dayMatch[1][0].toUpperCase() + dayMatch[1].slice(1).toLowerCase();
  } else if (!set) {
    stage = line.replace(/\s+presented by .*$/i, '');
    if (!stages.includes(stage)) stages.push(stage);
  } else {
    const name = set[1].replace(/\s*\(live\)$|\s+live$/i, '').trim();
    if (SKIP.test(name)) continue;
    const k = key(name);
    const start = minutes(set[2]);
    let end = minutes(set[3]);
    if (end <= start) end += 24 * 60;
    const slot = [day, stages.indexOf(stage), start, end];
    if (acts.has(k)) {
      acts.get(k).slots.push(slot);
      continue;
    }
    acts.set(k, {
      display: posterName.get(k) ?? name.toUpperCase(),
      billing: posterBilling.get(k) ?? POSTER.length + (stage === MAIN_STAGE ? 0 : 1),
      slots: [slot],
    });
  }
}

const list = [...acts.values()].sort((a, b) => a.billing - b.billing);
writeFileSync(output, JSON.stringify({ stages, acts: list.map((a) => [a.display, a.billing, a.slots]) }) + '\n');
const missing = [...posterName.keys()].filter((k) => !acts.has(k)).map((k) => posterName.get(k));
console.log(`Wrote ${list.length} acts to ${output}${missing.length ? `; poster acts not in timetable: ${missing.join(', ')}` : ''}`);
