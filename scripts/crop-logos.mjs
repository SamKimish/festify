// Crops labelled logos out of a lineup poster and traces them into crisp SVGs.
//
//   node scripts/crop-logos.mjs festival-sources/<festival>
//
// Reads blank.webp, poster.webp and logos.config.json ({ logos: { slug: [x0, y0, x1, y1] },
// overrides?: { slug: "file.png" } }; an override is a supplied image used instead of the crop)
// from that folder and writes public/festivals/<festival>/logos/<slug>.svg plus
// src/festivals/<festival>.logos.json ({ slug: { width, height } }) for the festival definition.
import potrace from 'potrace';
import sharp from 'sharp';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { basename, join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/crop-logos.mjs festival-sources/<festival>');
  process.exit(1);
}
const outDir = join('public', 'festivals', basename(dir), 'logos');
const { logos, overrides = {} } = JSON.parse(readFileSync(join(dir, 'logos.config.json'), 'utf8'));

const load = async (p) => {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width };
};
const blank = await load(join(dir, 'blank.webp'));
const poster = await load(join(dir, 'poster.webp'));
const lum = (d, i) => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];

// Upscale before tracing so curves come out smooth.
const UPSCALE = 4;
const trace = promisify(potrace.trace);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const sizes = {};
/** Greyscale pixels of a supplied logo image, flattened onto white. */
async function fromFile(file) {
  const { data, info } = await sharp(join(dir, file))
    .flatten({ background: '#ffffff' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { grey: data, cw: info.width, ch: info.height };
}

/** Greyscale pixels of a box on the poster: ink only where the blank artwork is white. */
function fromPoster([x0, y0, x1, y1]) {
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const grey = Buffer.alloc(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y0 + y) * blank.w + (x0 + x);
      grey[y * cw + x] = lum(blank.data, i) > 200 ? Math.round(lum(poster.data, i)) : 255;
    }
  }
  return { grey, cw, ch };
}

for (const [slug, box] of Object.entries(logos)) {
  const { grey, cw, ch } = overrides[slug] ? await fromFile(overrides[slug]) : fromPoster(box);
  const upscaled = await sharp(grey, { raw: { width: cw, height: ch, channels: 1 } })
    .resize(cw * UPSCALE, ch * UPSCALE, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const svg = await trace(upscaled, {
    threshold: 150,
    turdSize: 4,
    optTolerance: 0.4,
    color: '#111111',
    background: 'transparent',
  });
  writeFileSync(join(outDir, `${slug}.svg`), svg);
  sizes[slug] = { width: cw, height: ch };
}
writeFileSync(join('src', 'festivals', `${basename(dir)}.logos.json`), JSON.stringify(sizes, null, 2) + '\n');
console.log(`Traced ${Object.keys(sizes).length} logos to ${outDir}`);
