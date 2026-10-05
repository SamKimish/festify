// Builds the Reading & Leeds lineup data from a plain-text stage timetable:
//
//   Friday August 28
//   The Grid
//   Charli xcx – 7.45pm-9pm
//   …
//
//   node scripts/parse-reading.mjs festival-sources/reading-leeds-2026/lineup.txt src/festivals/reading-leeds-2026.lineup.json
//
// Output: { stages, acts: [display, billing, [[day, stage index, start, end], …]] }
// with times in minutes after midnight (after-midnight sets run past 1440).
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!output) {
  console.error('Usage: node scripts/parse-reading.mjs <lineup.txt> <out.json>');
  process.exit(1);
}

// The official poster's billing; everyone else is 4 (main stage) or 5.
const POSTER = [
  ['CHARLI XCX', 'CHASE & STATUS', 'DAVE', 'FLORENCE + THE MACHINE', 'FONTAINES D.C.', 'RAYE'],
  ['SKEPTA', 'SOMBR'],
  ['ROLE MODEL', 'JADE'],
  ['JOSH BAKER', 'KNEECAP', 'KETTAMA', 'CHRIS STUSSY', 'GEESE', 'SKYE NEWMAN', 'ADÉLA', 'KEO'],
];
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

/** "7.45pm" → minutes; small hours count as the night after the listed day. */
function minutes(t) {
  const m = t.trim().match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)$/i);
  if (!m) throw new Error(`Bad time: ${t}`);
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'pm') h += 12;
  if (h < 6) h += 24;
  return h * 60 + Number(m[2] ?? 0);
}

const stages = [];
const acts = new Map();
let day = '';
let stage = '';
for (const raw of readFileSync(input, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line) continue;
  const dayMatch = line.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
  const set = line.match(/^(.+?)\s+[–-]\s+([\d.:]+\s*[ap]m)\s*-\s*([\d.:]+\s*[ap]m)$/i);
  if (dayMatch && !set) {
    day = dayMatch[1][0].toUpperCase() + dayMatch[1].slice(1).toLowerCase();
  } else if (!set) {
    stage = line;
    if (!stages.includes(stage)) stages.push(stage);
  } else {
    const name = set[1].replace(/\s*\(live\)$/i, '').trim();
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
      billing: posterBilling.get(k) ?? (stage === MAIN_STAGE ? 4 : 5),
      slots: [slot],
    });
  }
}

const list = [...acts.values()].sort((a, b) => a.billing - b.billing);
writeFileSync(output, JSON.stringify({ stages, acts: list.map((a) => [a.display, a.billing, a.slots]) }) + '\n');
const missing = [...posterName.keys()].filter((k) => !acts.has(k)).map((k) => posterName.get(k));
console.log(`Wrote ${list.length} acts to ${output}${missing.length ? `; poster acts not in timetable: ${missing.join(', ')}` : ''}`);
