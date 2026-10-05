// Looks up each lineup artist on Spotify and suggests Spotify IDs, so acts are
// matched by ID instead of by name (avoids e.g. a different "NAPA").
//
// Usage: put VITE_SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local, then
//   npm run resolve-ids -- src/festivals/primavera-sound-2027.ts
//   npm run resolve-ids -- src/festivals/glastonbury-2025.lineup.json
//
// For a .ts festival it writes <festival>.ids.json next to the file for review;
// paste the confident matches into the act() calls as { name, spotifyId } members.
//
// For a full-lineup .lineup.json (e.g. Glastonbury) it writes <festival>.ids.json
// ({ name: spotifyId }), which the festival loads automatically, plus a review
// file in festival-sources/<festival>/. Progress is cached there too, so a long
// run can be stopped and resumed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run resolve-ids -- src/festivals/<festival>.ts|.lineup.json');
  process.exit(1);
}

const env = Object.fromEntries(
  ['.env', '.env.local']
    .filter(existsSync)
    .flatMap((f) => readFileSync(f, 'utf8').split(/\r?\n/))
    .map((l) => l.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const clientId = process.env.VITE_SPOTIFY_CLIENT_ID ?? env.VITE_SPOTIFY_CLIENT_ID;
const secret = process.env.SPOTIFY_CLIENT_SECRET ?? env.SPOTIFY_CLIENT_SECRET;
if (!clientId || !secret) {
  console.error('Set VITE_SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local');
  process.exit(1);
}

const isLineupJson = file.endsWith('.lineup.json');
const festivalId = basename(file).replace(/\.lineup\.json$|\.ts$/, '');
const names = new Set();

// Same clean-up as members() in the full-lineup festival files: drop "(DJ SET)", "LIVE" etc.
const cleanName = (n) =>
  n
    .replace(/\s*\((?:[^)]*)\)\s*$/, '')
    .replace(/\s+(?:LIVE|DJ SET|LIVE SET)$/i, '')
    .trim();

if (isLineupJson) {
  for (const [name] of JSON.parse(readFileSync(file, 'utf8')).acts) names.add(cleanName(name));
} else {
  // Member names from act('DISPLAY', n) or act(..., ['A', 'B']).
  const source = readFileSync(file, 'utf8');
  for (const m of source.matchAll(/act\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*\d+\s*(?:,\s*\[([^\]]*)\])?\s*\)/g)) {
    if (m[2]) {
      for (const n of m[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)) names.add(n[1]);
    } else {
      m[1]
        .replace(/\s*\(LIVE AV\)$/i, '')
        .replace(/\s+LIVE$/i, '')
        .split(/\s+(?:B2B|&|x)\s+/i)
        .forEach((n) => names.add(n));
    }
  }
}

let accessToken = '';
async function refreshToken() {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  accessToken = (await res.json()).access_token;
}
await refreshToken();

const norm = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9@]/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(name) {
  // (Search returns at most 10 results for development-mode apps.)
  const url = `https://api.spotify.com/v1/search?type=artist&limit=10&q=${encodeURIComponent(name)}`;
  for (;;) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 429) {
      await sleep((Number(res.headers.get('Retry-After') ?? 1) + 1) * 1000);
      continue;
    }
    if (res.status === 401) {
      await refreshToken();
      continue;
    }
    if (!res.ok) throw new Error(`Search failed for ${name}: ${res.status}`);
    return (await res.json()).artists.items;
  }
}

const cacheDir = join('festival-sources', festivalId);
const cacheFile = join(cacheDir, 'ids-cache.json');
mkdirSync(cacheDir, { recursive: true });
const results = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};

let done = 0;
for (const name of names) {
  done++;
  if (results[name]) continue;
  const items = await search(name);
  const exact = items.filter((a) => norm(a.name) === norm(name));
  const pick = exact[0];
  results[name] = {
    spotifyId: pick?.id ?? null,
    confidence: !pick ? 'none' : exact.length === 1 ? 'exact' : 'ambiguous',
    candidates: items.slice(0, 5).map((a) => ({ id: a.id, name: a.name })),
  };
  const conf = `${results[name].confidence}         `.slice(0, 9);
  console.log(`[${done}/${names.size}] ${conf} ${name} -> ${pick?.name ?? '-'} ${pick?.id ?? ''}`);
  if (done % 25 === 0) writeFileSync(cacheFile, JSON.stringify(results));
  await sleep(150);
}
writeFileSync(cacheFile, JSON.stringify(results));

const count = (c) => [...names].filter((n) => results[n]?.confidence === c).length;
if (isLineupJson) {
  // Exact name matches only. With several same-named artists, Spotify lists the
  // most popular first, which is nearly always the one playing a big festival.
  const ids = Object.fromEntries([...names].filter((n) => results[n]?.spotifyId).map((n) => [n, results[n].spotifyId]));
  const out = file.replace(/\.lineup\.json$/, '.ids.json');
  writeFileSync(out, JSON.stringify(ids) + '\n');
  const review = Object.fromEntries(
    [...names].filter((n) => results[n]?.confidence !== 'exact').map((n) => [n, results[n]]),
  );
  writeFileSync(join(cacheDir, 'ids-review.json'), JSON.stringify(review, null, 2));
  console.log(
    `\nWrote ${out}: ${Object.keys(ids).length} IDs (${count('exact')} exact, ${count('ambiguous')} ambiguous), ${count('none')} not found.`,
  );
} else {
  const out = file.replace(/\.ts$/, '.ids.json');
  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${out}. Review "ambiguous" and "none" entries by hand.`);
}
