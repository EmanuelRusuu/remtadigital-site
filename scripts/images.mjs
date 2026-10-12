// Smaller image variants for the pages, made with sharp. The originals stay in place (og.mjs, cv.mjs
// and capture.mjs use them); build.mjs picks a variant up when its file exists.
//   - profile photo: AVIF and WebP at 80, 136, 272 and 400 px (avatar and article byline)
//   - portrait in the photo dialog: AVIF and WebP at full size
//   - cover logos: resized to twice their displayed size
//   - brand icons (projects/<slug>/icon.png, 256 px): WebP at 192 px
//   - card thumbnails: WebP at 640 px wide next to each 1280 px screenshot (<name>-640.webp)
// Run after capture.mjs or after changing a photo. Existing variants newer than their source are skipped.
// Usage: node images.mjs [--force]
import sharp from 'sharp';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const path = p => new URL(p, ROOT);
const force = process.argv.includes('--force');
const media = JSON.parse(readFileSync(path('data/media.json'), 'utf8'));
let made = 0, before = 0, after = 0;

async function variant(src, out, fn) {
  if (!existsSync(path(src))) return;
  if (!force && existsSync(path(out)) && statSync(path(out)).mtimeMs >= statSync(path(src)).mtimeMs) return;
  await fn(sharp(readFileSync(path(src)))).toFile(fileURLToPath(path(out)));
  made++;
  before += statSync(path(src)).size;
  after += statSync(path(out)).size;
}

const IMG = 'public/assets/img/';
for (const w of [80, 136, 272, 400]) {
  await variant(`${IMG}emanuel-rusu.jpg`, `${IMG}emanuel-rusu-${w}.avif`, s => s.resize(w).avif({ quality: 55, effort: 9 }));
  await variant(`${IMG}emanuel-rusu.jpg`, `${IMG}emanuel-rusu-${w}.webp`, s => s.resize(w).webp({ quality: 78 }));
}
await variant(`${IMG}emanuel-rusu-portrait.jpg`, `${IMG}emanuel-rusu-portrait.avif`, s => s.avif({ quality: 55, effort: 9 }));
await variant(`${IMG}emanuel-rusu-portrait.jpg`, `${IMG}emanuel-rusu-portrait.webp`, s => s.webp({ quality: 78 }));
await variant(`${IMG}brands/ubb-crest.webp`, `${IMG}brands/ubb-crest-128.webp`, s => s.resize(128).webp({ quality: 85 }));
await variant(`${IMG}brands/aico.webp`, `${IMG}brands/aico-248.webp`, s => s.resize(248).webp({ quality: 85 }));

for (const [slug, rec] of Object.entries(media)) {
  const dir = `public/projects/${slug}/`;
  if (rec.icon && /\.png$/.test(rec.icon)) {
    await variant(dir + rec.icon, dir + rec.icon.replace(/\.png$/, '.webp'), s => s.resize(192, 192, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }));
  }
  for (const shot of (rec.shots || []).filter(s => !s.mobile)) {
    await variant(dir + shot.file, dir + shot.file.replace(/\.\w+$/, '-640.webp'), s => s.resize(640).webp({ quality: 74 }));
  }
}

console.log(made ? `made ${made} variants: ${Math.round(before / 1024)} KB of sources, ${Math.round(after / 1024)} KB of variants` : 'all variants up to date');
