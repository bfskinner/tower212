import { getCollection, type CollectionEntry } from 'astro:content';
import generated from '../data/generated.json';

export type Download = CollectionEntry<'downloads'>;
type Gen = {
  wallpapers: Record<string, { key: string; label: string; w: number; h: number; url: string }[]>;
  packs: Record<string, { url: string; count: number; bytes: number }>;
};
const g = generated as unknown as Gen;

export const TYPES = [
  { key: 'wallpaper', label: 'Wallpapers', anchor: 'wallpapers' },
  { key: 'meme', label: 'Memes', anchor: 'memes' },
  { key: 'sticker', label: 'Sticker packs', anchor: 'stickers' },
  { key: 'icon', label: 'Icon packs', anchor: 'icons' },
  { key: 'photo', label: 'Photos', anchor: 'photos' },
] as const;

export async function allDownloads() {
  const list = await getCollection('downloads');
  return list.sort((a, b) => {
    if (a.data.featured !== b.data.featured) return a.data.featured ? -1 : 1;
    return (b.data.date?.getTime() ?? 0) - (a.data.date?.getTime() ?? 0);
  });
}

export const sizesFor = (d: Download) => g.wallpapers[d.id] ?? [];
export const packFor = (d: Download) => g.packs[d.id];
export const fileName = (u: string) => decodeURIComponent(u.split('/').pop() ?? 'download');
export const mb = (bytes: number) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`);
