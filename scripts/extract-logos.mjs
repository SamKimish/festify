// Cuts band logos out of an official lineup poster by comparing it with the
// blank version of the same artwork.
//
//   node scripts/extract-logos.mjs <blank> <poster> <outDir>
//
// Logo pixels are dark pixels in the poster where the blank is near-white.
// They're grown slightly so letters and words of one logo join up, grouped
// into connected blobs, and each blob is saved as a black-on-transparent PNG
// (logo-01.png, …) in reading order, plus logos.json and contact-sheet.png
// for labelling.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [blankPath, posterPath, outDir] = process.argv.slice(2);
if (!outDir) {
  console.error('Usage: node scripts/extract-logos.mjs <blank> <poster> <outDir>');
  process.exit(1);
}

// Tunables: how far (px) to grow marks so a logo's pieces merge.
const GROW_X = Number(process.env.GROW_X ?? 9);
const GROW_Y = Number(process.env.GROW_Y ?? 6);
const MIN_AREA = 150;

const load = async (p) => {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};
const blank = await load(blankPath);
const poster = await load(posterPath);
if (blank.w !== poster.w || blank.h !== poster.h) throw new Error('Images must be the same size');
const { w, h } = blank;
const lum = (d, i) => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];

// 1. Ink mask: dark in the poster, white-ish in the blank.
const ink = new Uint8Array(w * h);
for (let i = 0; i < w * h; i++) ink[i] = lum(blank.data, i) > 215 && lum(poster.data, i) < 170 ? 1 : 0;

// 2. Grow (separable box dilation).
const grow = (src, rx, ry) => {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let run = -1;
    for (let x = 0; x < w; x++) if (src[y * w + x]) run = x;
      else if (run >= 0 && x - run <= rx) tmp[y * w + x] = 1;
    run = -1;
    for (let x = w - 1; x >= 0; x--) {
      if (src[y * w + x]) {
        run = x;
        tmp[y * w + x] = 1;
      } else if (run >= 0 && run - x <= rx) tmp[y * w + x] = 1;
    }
  }
  for (let x = 0; x < w; x++) {
    let run = -1;
    for (let y = 0; y < h; y++) if (tmp[y * w + x]) run = y;
      else if (run >= 0 && y - run <= ry) out[y * w + x] = 1;
    run = -1;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) {
        run = y;
        out[y * w + x] = 1;
      } else if (run >= 0 && run - y <= ry) out[y * w + x] = 1;
    }
  }
  return out;
};
const grown = grow(ink, GROW_X, GROW_Y);

// 3. Connected components → bounding boxes of the real ink inside each.
const label = new Int32Array(w * h).fill(-1);
const boxes = [];
for (let start = 0; start < w * h; start++) {
  if (!grown[start] || label[start] !== -1) continue;
  const id = boxes.length;
  const box = { x0: w, y0: h, x1: -1, y1: -1, area: 0 };
  const stack = [start];
  label[start] = id;
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    if (ink[i]) {
      box.area++;
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x);
      box.y1 = Math.max(box.y1, y);
    }
    for (const n of [i - 1, i + 1, i - w, i + w]) {
      if (n < 0 || n >= w * h || !grown[n] || label[n] !== -1) continue;
      if ((n === i - 1 && x === 0) || (n === i + 1 && x === w - 1)) continue;
      label[n] = id;
      stack.push(n);
    }
  }
  boxes.push(box);
}
const logos = boxes
  .filter((b) => b.area >= MIN_AREA && b.x1 >= 0)
  // Reading order: rows (by vertical centre, ~30px bands), then left to right.
  .sort((a, b) => {
    const ay = (a.y0 + a.y1) / 2;
    const by = (b.y0 + b.y1) / 2;
    return Math.abs(ay - by) > 30 ? ay - by : a.x0 - b.x0;
  });

// 4. Save each as black ink on transparency (alpha from darkness).
mkdirSync(outDir, { recursive: true });
const PAD = 2;
const meta = [];
for (const [n, b] of logos.entries()) {
  const x0 = Math.max(0, b.x0 - PAD);
  const y0 = Math.max(0, b.y0 - PAD);
  const cw = Math.min(w - 1, b.x1 + PAD) - x0 + 1;
  const ch = Math.min(h - 1, b.y1 + PAD) - y0 + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y0 + y) * w + (x0 + x);
      const o = (y * cw + x) * 4;
      // Only keep pixels that belong to this logo's blob, on blank-white areas.
      const mine = label[i] === boxes.indexOf(b) && lum(blank.data, i) > 215;
      const a = mine ? Math.max(0, Math.min(255, ((235 - lum(poster.data, i)) / 205) * 255)) : 0;
      out[o] = out[o + 1] = out[o + 2] = 17;
      out[o + 3] = a;
    }
  }
  const file = `logo-${String(n + 1).padStart(2, '0')}.png`;
  await sharp(out, { raw: { width: cw, height: ch, channels: 4 } }).png().toFile(join(outDir, file));
  meta.push({ file, x: x0, y: y0, width: cw, height: ch });
}
writeFileSync(join(outDir, 'logos.json'), JSON.stringify(meta, null, 2));

// 5. Contact sheet: each logo on white with its number.
const CELL_W = 340;
const CELL_H = 130;
const COLS = 3;
const rows = Math.ceil(meta.length / COLS);
const composites = [];
for (const [n, m] of meta.entries()) {
  const scale = Math.min((CELL_W - 20) / m.width, (CELL_H - 40) / m.height, 2);
  const img = await sharp(join(outDir, m.file))
    .resize(Math.round(m.width * scale), Math.round(m.height * scale))
    .toBuffer();
  const left = (n % COLS) * CELL_W + 10;
  const top = Math.floor(n / COLS) * CELL_H + 30;
  composites.push({ input: img, left, top });
  composites.push({
    input: Buffer.from(
      `<svg width="${CELL_W}" height="28"><text x="10" y="20" font-family="Arial" font-size="18" fill="#d00">${n + 1}</text></svg>`,
    ),
    left: (n % COLS) * CELL_W,
    top: Math.floor(n / COLS) * CELL_H,
  });
}
await sharp({ create: { width: CELL_W * COLS, height: CELL_H * rows, channels: 3, background: '#fff' } })
  .composite(composites)
  .png()
  .toFile(join(outDir, 'contact-sheet.png'));
console.log(`Extracted ${meta.length} logos to ${outDir}`);
