// Provisional Leeds blank: the official poster with the lineup area replaced by
// matching dark, grainy paper (keeps the logo and the scribbled border).
// Replace public/festivals/reading-leeds-2026/leeds-background.webp with a real
// blank when one is available.
const sharp = require('sharp');
(async () => {
  const SCALE = 2;
  const src = 'festival-sources/reading-leeds-2026/leeds-poster.webp';
  const { data, info } = await sharp(src)
    .resize(576 * SCALE, 1024 * SCALE, { kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const top = 216 * SCALE, bottom = 866 * SCALE, feather = 14 * SCALE;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = top - feather; y < bottom + feather; y++) {
    // 0 = keep original, 1 = fully replaced; feathered at both edges.
    const t = y < top ? (y - (top - feather)) / feather : y > bottom ? 1 - (y - bottom) / feather : 1;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const grain = 27 + (rand() - 0.5) * 14;
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * (1 - t) + grain * t);
    }
  }
  await sharp(data, { raw: { width: W, height: H, channels: 3 } })
    .webp({ quality: 86 })
    .toFile('public/festivals/reading-leeds-2026/leeds-background.webp');
  console.log('wrote leeds-background.webp', W, H);
})();
