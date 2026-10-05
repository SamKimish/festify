// Crops labelled logos out of a lineup poster as black-on-transparent PNGs.
//
//   node scripts/crop-logos.mjs festival-sources/<festival>
//
// Reads blank.webp, poster.webp and logos.config.json ({ logos: { slug: [x0, y0, x1, y1] } })
// from that folder and writes public/festivals/<festival>/logos/<slug>.png plus
// src/festivals/<festival>.logos.json ({ slug: { width, height } }) for the festival definition.
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/crop-logos.mjs festival-sources/<festival>');
  process.exit(1);
}
const outDir = join('public', 'festivals', basename(dir), 'logos');
const { logos } = JSON.parse(readFileSync(join(dir, 'logos.config.json'), 'utf8'));

const load = async (p) => {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width };
};
const blank = await load(join(dir, 'blank.webp'));
const poster = await load(join(dir, 'poster.webp'));
const lum = (d, i) => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];

// Render at a larger size so logos stay smooth when scaled up on screen.
const UPSCALE = 3;
mkdirSync(outDir, { recursive: true });
const sizes = {};
for (const [slug, [x0, y0, x1, y1]] of Object.entries(logos)) {
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y0 + y) * blank.w + (x0 + x);
      const o = (y * cw + x) * 4;
      // Ink = darker than the blank artwork at the same spot (the reels are white).
      const a = lum(blank.data, i) > 200 ? ((235 - lum(poster.data, i)) / 205) * 255 : 0;
      out[o] = out[o + 1] = out[o + 2] = 17;
      out[o + 3] = Math.max(0, Math.min(255, a));
    }
  }
  await sharp(out, { raw: { width: cw, height: ch, channels: 4 } })
    .resize(cw * UPSCALE, ch * UPSCALE, { kernel: 'lanczos3' })
    .png()
    .toFile(join(outDir, `${slug}.png`));
  sizes[slug] = { width: cw, height: ch };
}
writeFileSync(join('src', 'festivals', `${basename(dir)}.logos.json`), JSON.stringify(sizes, null, 2) + '\n');
console.log(`Cropped ${Object.keys(sizes).length} logos to ${outDir}`);
