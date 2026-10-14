// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.tower212.com',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
});
