// Looks up each lineup artist on Spotify and prints suggested Spotify IDs, so
// acts are matched by ID instead of by name (avoids e.g. a different "NAPA").
//
// Usage: put VITE_SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local, then
//   npm run resolve-ids -- src/festivals/primavera-sound-2027.ts
//
// It writes <festival>.ids.json next to the festival file for review. Paste the
// confident matches into the act() calls as { name, spotifyId } members.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run resolve-ids -- src/festivals/<festival>.ts');
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
const id = process.env.VITE_SPOTIFY_CLIENT_ID ?? env.VITE_SPOTIFY_CLIENT_ID;
const secret = process.env.SPOTIFY_CLIENT_SECRET ?? env.SPOTIFY_CLIENT_SECRET;
if (!id || !secret) {
  console.error('Set VITE_SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local');
  process.exit(1);
}

// Pull member names out of the festival file: act('DISPLAY', n) or act(..., ['A', 'B']).
const source = readFileSync(file, 'utf8');
const names = new Set();
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

const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
  },
  body: 'grant_type=client_credentials',
});
if (!tokenRes.ok) throw new Error(`Token request failed: ${tokenRes.status} ${await tokenRes.text()}`);
const { access_token } = await tokenRes.json();

const norm = (s) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9@]/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(name) {
  const url = `https://api.spotify.com/v1/search?type=artist&limit=5&q=${encodeURIComponent(name)}`;
  for (;;) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    if (res.status === 429) {
      await sleep((Number(res.headers.get('Retry-After') ?? 1) + 1) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Search failed for ${name}: ${res.status}`);
    return (await res.json()).artists.items;
  }
}

const results = {};
for (const name of names) {
  const items = await search(name);
  const exact = items.filter((a) => norm(a.name) === norm(name));
  const pick = exact[0];
  results[name] = {
    spotifyId: pick?.id ?? null,
    confidence: !pick ? 'none' : exact.length === 1 ? 'exact' : 'ambiguous',
    candidates: items.map((a) => ({ id: a.id, name: a.name, url: a.external_urls?.spotify })),
  };
  console.log(`${(results[name].confidence + '        ').slice(0, 9)} ${name} -> ${pick?.name ?? '-'} ${pick?.id ?? ''}`);
  await sleep(120);
}

const out = file.replace(/\.ts$/, '.ids.json');
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`\nWrote ${out}. Review "ambiguous" and "none" entries by hand.`);
