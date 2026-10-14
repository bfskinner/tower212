import generated from '../data/generated.json';

type Gen = { images: Record<string, { width: number; height: number; sizes: Record<string, string> }> };
const g = generated as unknown as Gen;

/** Web-sized copy of an uploaded image (falls back to the original). */
export function img(src: string | undefined, width: 480 | 960 | 1600 = 960): string {
  if (!src) return '';
  return g.images[src]?.sizes?.[width] ?? src;
}

export function srcset(src: string | undefined): string | undefined {
  const e = src ? g.images[src] : undefined;
  if (!e) return undefined;
  return Object.entries(e.sizes)
    .map(([w, url]) => `${url} ${Math.min(Number(w), e.width)}w`)
    .join(', ');
}

export function dims(src: string | undefined) {
  const e = src ? g.images[src] : undefined;
  return e ? { width: e.width, height: e.height } : { width: 1600, height: 1000 };
}
