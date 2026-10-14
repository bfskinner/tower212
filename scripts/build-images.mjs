// Runs before every build. Turns whatever is in public/uploads into:
//   public/generated/w{480,960,1600}/<name>.webp   web-sized copies for the pages
//   public/generated/wallpapers/<slug>/<size>.jpg  every device size from one master
//   public/generated/packs/<slug>.zip              "download all" ZIPs for sticker and icon packs
// and writes src/data/generated.json so the pages know sizes and file names.
// Drop one master file in the CMS; this script does the rest.

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as yaml from 'js-yaml';
import JSZip from 'jszip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPLOADS = path.join(ROOT, 'public/uploads');
const GEN = path.join(ROOT, 'public/generated');
const DOWNLOADS = path.join(ROOT, 'src/content/downloads');
const MANIFEST = path.join(ROOT, 'src/data/generated.json');
const WIDTHS = [480, 960, 1600];
const IMG = /\.(jpe?g|png|webp|avif)$/i;

const WALLPAPER_SIZES = [
  { key: 'desktop-4k', label: 'Desktop 4K', w: 3840, h: 2160 },
  { key: 'desktop-1440p', label: 'Desktop 1440p', w: 2560, h: 1440 },
  { key: 'iphone', label: 'iPhone', w: 1290, h: 2796 },
  { key: 'ipad', label: 'iPad', w: 2048, h: 2732 },
  { key: 'watch', label: 'Watch', w: 396, h: 484 },
];

const exists = async (p) => !!(await stat(p).catch(() => null));
const newer = async (out, src) => {
  const o = await stat(out).catch(() => null);
  if (!o) return false;
  return o.mtimeMs >= (await stat(src)).mtimeMs;
};
const rel = (p) => '/' + path.relative(path.join(ROOT, 'public'), p).split(path.sep).join('/');
const fromUrl = (u) => path.join(ROOT, 'public', decodeURIComponent(u.replace(/^\//, '')));

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const manifest = { images: {}, wallpapers: {}, packs: {} };

// 1. Web sizes for every uploaded image.
for (const file of (await walk(UPLOADS)).filter((f) => IMG.test(f))) {
  const key = rel(file);
  const meta = await sharp(file).metadata();
  const relName = path.relative(UPLOADS, file).replace(IMG, '.webp');
  const entry = { width: meta.width, height: meta.height, sizes: {} };
  for (const w of WIDTHS) {
    const out = path.join(GEN, `w${w}`, relName);
    if (!(await newer(out, file))) {
      await mkdir(path.dirname(out), { recursive: true });
      await sharp(file).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toFile(out);
    }
    entry.sizes[w] = rel(out);
  }
  manifest.images[key] = entry;
}

// 2. Read download entries (frontmatter only).
async function readEntries() {
  const list = [];
  for (const f of (await readdir(DOWNLOADS).catch(() => [])).filter((f) => f.endsWith('.md'))) {
    const src = await readFile(path.join(DOWNLOADS, f), 'utf8');
    const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) continue;
    list.push({ slug: f.replace(/\.md$/, ''), ...yaml.load(m[1]) });
  }
  return list;
}
const entries = await readEntries();

// 3. Wallpapers: every device size from one master.
for (const e of entries.filter((e) => e.type === 'wallpaper' && e.image)) {
  const src = fromUrl(e.image);
  if (!(await exists(src))) {
    console.warn(`Wallpaper "${e.title}": ${e.image} not found`);
    continue;
  }
  const meta = await sharp(src).metadata();
  const srcRatio = meta.width / meta.height;
  // Does the art sit on a plain background? Then padding it out to a wider or
  // taller screen looks natural. If not, skip shapes that would need padding.
  const strip = async (left) =>
    sharp(await sharp(src).extract({ left, top: 0, width: 8, height: meta.height }).png().toBuffer()).stats();
  const edges = [await strip(0), await strip(meta.width - 8)];
  const plainEdges = edges.every((st) => st.channels.slice(0, 3).every((c) => c.stdev < 14));
  const edgeColor = edges[0].channels.slice(0, 3).map((c) => Math.round(c.mean));
  const bg = e.background || `rgb(${edgeColor.join(',')})`;
  const made = [];
  for (const s of WALLPAPER_SIZES) {
    const ratio = s.w / s.h;
    // Usually crop to fill, keeping the subject in frame. When the shapes are far
    // apart (tall art on a wide screen), fit the whole image on its own background.
    // Set fit: cover or fit: contain on a download entry to override.
    const cover = e.fit ? e.fit === 'cover' : Math.max(ratio / srcRatio, srcRatio / ratio) < 2.2;
    const scaleNeeded = cover ? Math.max(s.w / meta.width, s.h / meta.height) : Math.min(s.w / meta.width, s.h / meta.height);
    if (scaleNeeded > 1.6) continue; // master too small for this size; skip rather than blur
    if (!cover && !plainEdges && !e.fit) continue; // would need ugly bars; skip this size
    const out = path.join(GEN, 'wallpapers', e.slug, `${s.key}.jpg`);
    if (!(await newer(out, src))) {
      await mkdir(path.dirname(out), { recursive: true });
      const img = sharp(src).rotate();
      if (cover) {
        await img.resize(s.w, s.h, { fit: 'cover', position: e.focus || 'centre' }).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
      } else {
        await img.resize(s.w, s.h, { fit: 'contain', background: bg }).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
      }
    }
    made.push({ key: s.key, label: s.label, w: s.w, h: s.h, url: rel(out) });
  }
  manifest.wallpapers[e.slug] = made;
}

// 4. Packs: ZIP the main image plus the gallery.
for (const e of entries.filter((e) => Array.isArray(e.gallery) && e.gallery.length && !e.file)) {
  const files = [e.image, ...e.gallery].filter(Boolean);
  const out = path.join(GEN, 'packs', `${e.slug}.zip`);
  const zip = new JSZip();
  for (const u of files) {
    const p = fromUrl(u);
    if (await exists(p)) zip.file(path.basename(p), await readFile(p));
  }
  zip.file('LICENSE.txt', 'Free for personal use. Credit @WaterTowerUSF. Tower 212 is a fan site, not affiliated with USF.\n');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  manifest.packs[e.slug] = { url: rel(out), count: files.length, bytes: (await stat(out)).size };
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(
  `images: ${Object.keys(manifest.images).length} uploads, ${Object.keys(manifest.wallpapers).length} wallpapers, ${Object.keys(manifest.packs).length} packs`,
);
