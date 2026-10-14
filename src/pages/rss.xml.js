import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '../lib/site';

export async function GET(context) {
  const posts = (await getCollection('posts', (p) => !p.data.draft)).sort((a, b) => b.data.date - a.data.date);
  return rss({
    title: 'Tower 212',
    description: SITE.description,
    site: context.site,
    items: posts.map((p) => ({
      title: p.data.title,
      pubDate: p.data.date,
      description: p.data.excerpt ?? '',
      link: `/blog/${p.id}/`,
      categories: [p.data.category],
    })),
  });
}
