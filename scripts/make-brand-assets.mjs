// Generates the favicon, app icons and social preview image into public/.
//
//   node scripts/make-brand-assets.mjs
//
// Text is converted to vector outlines with opentype.js, so the images don't
// depend on fonts installed on the machine.
import opentype from 'opentype.js';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const BG = '#141414';
const TEXT = '#f1efea';
const MUTED = '#a39f97';
const ACCENT = '#e25a1d';
const fontFile = (w) => `node_modules/@fontsource/archivo/files/archivo-latin-${w}-normal.woff`;
const load = (w) => opentype.parse(readFileSync(fontFile(w)).buffer);
const bold = load(800);
// 500 rather than 400: opentype.js misreads a few glyphs in the 400 file.
const regular = load(500);

/** SVG path for text, left-aligned at x with baseline y; returns [svg, width]. */
function text(font, str, x, y, size, fill, tracking = 0) {
  // Glyph by glyph with kerning (opentype.js's shaper chokes on some of Archivo's features).
  const scale = size / font.unitsPerEm;
  const glyphs = [...str].map((c) => font.charToGlyph(c));
  let pen = x;
  const d = glyphs.map((g, i) => {
    const data = g.getPath(pen, y, size).toPathData(2);
    pen += g.advanceWidth * scale + tracking * size;
    if (glyphs[i + 1]) pen += font.getKerningValue(g, glyphs[i + 1]) * scale;
    return data;
  });
  // One <path> per glyph, so a quirk in one glyph's outline can't break the rest.
  return [d.map((p) => `<path d="${p}" fill="${fill}"/>`).join(''), pen - x];
}

/** Six-armed asterisk centred on (cx, cy). */
function asterisk(cx, cy, r, stroke, fill) {
  const arms = [0, 60, 120].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const dx = Math.sin(a) * r;
    const dy = Math.cos(a) * r;
    return `<line x1="${cx - dx}" y1="${cy - dy}" x2="${cx + dx}" y2="${cy + dy}"/>`;
  });
  return `<g stroke="${fill}" stroke-width="${stroke}" stroke-linecap="round">${arms.join('')}</g>`;
}

// Favicon: orange asterisk on the site's near-black, in a rounded square.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${BG}"/>
  ${asterisk(32, 32, 19, 8, ACCENT)}
</svg>
`;
writeFileSync('public/favicon.svg', favicon);
await sharp(Buffer.from(favicon)).resize(32, 32).png().toFile('public/favicon-32.png');
// Home-screen icon: square (iOS rounds the corners itself).
const touch = favicon.replace('rx="14"', 'rx="0"');
await sharp(Buffer.from(touch)).resize(180, 180).png().toFile('public/apple-touch-icon.png');

// Social preview (1200×630): headline on the left, the festival artwork fanned on the right.
const W = 1200;
const H = 630;
const parts = [];
const [wordmark, wordmarkW] = text(bold, 'festify', 72, 108, 44, TEXT, -0.02);
parts.push(wordmark, asterisk(72 + wordmarkW + 14, 80, 11, 5, ACCENT));
const [l1, l1w] = text(bold, 'YOUR LINEUP', 72, 300, 84, TEXT, -0.01);
parts.push(l1, asterisk(72 + l1w + 24, 240, 18, 9, ACCENT));
parts.push(text(bold, 'YOUR', 72, 386, 84, TEXT, -0.01)[0]);
parts.push(text(bold, 'HEADLINERS', 72, 472, 84, TEXT, -0.01)[0]);
parts.push(text(regular, 'Your Spotify listening, as a festival poster.', 72, 556, 28, MUTED)[0]);
const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;

const card = async (file, width, angle) => {
  const img = await sharp(file).resize({ width }).toBuffer();
  const { height } = await sharp(img).metadata();
  const framed = await sharp({
    create: { width: width + 12, height: height + 12, channels: 4, background: '#00000000' },
  })
    .composite([{ input: img, left: 6, top: 6 }])
    .png()
    .toBuffer();
  return sharp(framed).rotate(angle, { background: '#00000000' }).png().toBuffer();
};
const posters = [
  { file: 'public/festivals/glastonbury-2025/background.webp', left: 790, top: 70, angle: -9 },
  { file: 'public/festivals/slam-dunk-2027/background.webp', left: 965, top: 95, angle: 8 },
  { file: 'public/festivals/primavera-sound-2027/background.webp', left: 870, top: 150, angle: -1 },
];
const layers = [];
for (const p of posters) layers.push({ input: await card(p.file, 250, p.angle), left: p.left, top: p.top });

await sharp({ create: { width: W, height: H, channels: 3, background: BG } })
  .composite([...layers, { input: Buffer.from(overlay), left: 0, top: 0 }])
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile('public/og-image.jpg');
console.log('Wrote favicon.svg, favicon-32.png, apple-touch-icon.png, og-image.jpg');
