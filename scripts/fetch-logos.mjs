// Downloads band logos from TheAudioDB (free public API key) for review.
//
//   node scripts/fetch-logos.mjs festival-sources/<festival>
//
// Reads the slugs in <dir>/logos.config.json, searches TheAudioDB for each
// band, and saves any logo to <dir>/hd-raw/<slug>.png plus hd-raw/sources.json
// (which artist matched, so wrong matches can be spotted). Review them, then
// list the ones to use under "hd" in logos.config.json and run crop-logos.mjs.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/fetch-logos.mjs festival-sources/<festival>');
  process.exit(1);
}
const config = JSON.parse(readFileSync(join(dir, 'logos.config.json'), 'utf8'));
const names = config.names ?? {};
const outDir = join(dir, 'hd-raw');
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// The free key allows ~30 requests a minute.
const API = 'https://www.theaudiodb.com/api/v1/json/123/search.php?s=';

const sources = {};
for (const slug of Object.keys(config.logos)) {
  const name = names[slug] ?? slug.replace(/-/g, ' ');
  const res = await fetch(API + encodeURIComponent(name));
  const json = res.ok ? await res.json().catch(() => null) : null;
  const artist = (json?.artists ?? []).find((a) => norm(a.strArtist) === norm(name)) ?? json?.artists?.[0];
  const logo = artist?.strArtistLogo;
  if (logo) {
    const img = await fetch(logo);
    writeFileSync(join(outDir, `${slug}.png`), Buffer.from(await img.arrayBuffer()));
  }
  sources[slug] = { searched: name, matched: artist?.strArtist ?? null, logo: logo ?? null };
  console.log(`${logo ? 'logo ' : 'none '} ${name}${artist && norm(artist.strArtist) !== norm(name) ? `  (matched "${artist.strArtist}")` : ''}`);
  await sleep(2200);
}
writeFileSync(join(outDir, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
