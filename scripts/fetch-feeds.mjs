// Pulls every podcast and news feed listed in src/data/sources.yml and writes
// src/data/feeds.json. Run hourly by .github/workflows/update-data.yml.
// The file is only rewritten when the episode or headline list changes, so the
// workflow commits (and Render redeploys) only when there is something new.

import { readFile, writeFile } from 'node:fs/promises';
import * as yaml from 'js-yaml';
import { XMLParser } from 'fast-xml-parser';

const SOURCES = new URL('../src/data/sources.yml', import.meta.url);
const OUT = new URL('../src/data/feeds.json', import.meta.url);
const PER_SOURCE = 12;
const MAX_PODCASTS = 60;
const MAX_NEWS = 60;
const UA = 'Tower212FeedBot/1.0 (+https://www.tower212.com)';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  cdataPropName: '#text',
});

const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  if (Array.isArray(v)) return text(v[0]);
  return text(v['#text'] ?? '');
};
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const stripHtml = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return as === 'json' ? res.json() : res.text();
}

// iHeart shows have no public RSS; their public API lists episodes.
async function fetchIheart(src) {
  const data = await get(
    `https://us.api.iheart.com/api/v3/podcast/podcasts/${encodeURIComponent(src.iheart_id)}/episodes?limit=50&sortBy=startDate-desc`,
    'json',
  );
  return (data.data ?? []).map((e) => ({
    title: decode(stripHtml(e.title ?? '')),
    description: decode(stripHtml(e.description ?? '')),
    link: src.link,
    date: new Date(e.startDate).toISOString(),
    audio: null,
    duration: e.duration ? String(e.duration) : null,
    podcastImage: e.imageUrl || null,
  }));
}

async function resolvePodcastFeed(src) {
  if (src.feed) return { feed: src.feed };
  if (src.apple_id) {
    const data = await get(`https://itunes.apple.com/lookup?id=${encodeURIComponent(src.apple_id)}&entity=podcast`, 'json');
    const hit = data.results?.find((r) => r.feedUrl);
    if (!hit) throw new Error('Apple lookup returned no feed');
    return { feed: hit.feedUrl, artwork: hit.artworkUrl600 };
  }
  if (src.apple_search) {
    const data = await get(
      `https://itunes.apple.com/search?media=podcast&limit=10&term=${encodeURIComponent(src.apple_search)}`,
      'json',
    );
    const want = src.apple_search.toLowerCase().trim();
    const hit = data.results?.find((r) => r.feedUrl && r.collectionName?.toLowerCase().trim() === want);
    if (!hit) throw new Error(`No exact Apple match for "${src.apple_search}"`);
    return { feed: hit.feedUrl, artwork: hit.artworkUrl600 };
  }
  throw new Error('Needs feed, apple_id, or apple_search');
}

function parseFeed(xml) {
  const doc = parser.parse(xml);
  if (doc.rss) {
    const ch = doc.rss.channel;
    const chImage = ch['itunes:image']?.['@href'] || text(ch.image?.url);
    return arr(ch.item).map((it) => ({
      title: decode(stripHtml(text(it.title))),
      description: decode(stripHtml(text(it.description) || text(it['itunes:summary']))).slice(0, 600),
      link: text(it.link) || it.enclosure?.['@url'] || text(it.guid),
      date: new Date(text(it.pubDate) || text(it['dc:date']) || Date.now()).toISOString(),
      audio: it.enclosure?.['@url'] || null,
      duration: text(it['itunes:duration']) || null,
      image:
        (String(it.enclosure?.['@type'] ?? '').startsWith('image') ? it.enclosure['@url'] : null) ||
        arr(it['media:content']).find((m) => m?.['@url'] && (m['@medium'] === 'image' || /\.(jpe?g|png|webp)/i.test(m['@url'])))?.['@url'] ||
        it['media:thumbnail']?.['@url'] ||
        null,
      podcastImage: it['itunes:image']?.['@href'] || chImage || null,
      source: text(it.source) || null,
    }));
  }
  if (doc.feed) {
    return arr(doc.feed.entry).map((e) => {
      const link = arr(e.link).find((l) => !l['@rel'] || l['@rel'] === 'alternate') || arr(e.link)[0];
      return {
        title: decode(stripHtml(text(e.title))),
        link: link?.['@href'] || '',
        date: new Date(text(e.published) || text(e.updated) || Date.now()).toISOString(),
        audio: null,
        duration: null,
        image: null,
        source: null,
      };
    });
  }
  throw new Error('Not an RSS or Atom feed');
}

function formatDuration(d) {
  if (!d) return null;
  if (/^\d+$/.test(d)) {
    const s = Number(d);
    return s >= 3600 ? `${Math.floor(s / 3600)} hr ${Math.round((s % 3600) / 60)} min` : `${Math.max(1, Math.round(s / 60))} min`;
  }
  const parts = d.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  const secs = parts.reduce((a, b) => a * 60 + b, 0);
  return formatDuration(String(secs));
}

const sources = yaml.load(await readFile(SOURCES, 'utf8'));

// Relevance rules. A source's `keywords` must appear as whole words in the
// title (or, for podcasts, the episode description). The global `exclude`
// list in sources.yml drops matching titles from every source.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (words) => new RegExp(`\\b(${arr(words).map(esc).join('|')})\\b`, 'i');
const excludeRe = sources.exclude?.length ? new RegExp(arr(sources.exclude).join('|'), 'i') : null;
const relevant = (src, title, extra = '', minWords = 3) => {
  if (!title || title.trim().split(/\s+/).length < minWords) return false;
  if (excludeRe?.test(title)) return false;
  if (src.keywords && !wordRe(src.keywords).test(`${title} ${extra}`)) return false;
  return true;
};
const podcasts = [];
const news = [];
const report = [];
const failed = { podcasts: [], news: [] };

for (const src of sources.podcasts ?? []) {
  try {
    let items, artwork;
    if (src.iheart_id) {
      items = await fetchIheart(src);
    } else {
      const r = await resolvePodcastFeed(src);
      artwork = r.artwork;
      items = parseFeed(await get(r.feed));
    }
    items = items.filter((it) => relevant(src, it.title, it.description, 1)).slice(0, PER_SOURCE);
    for (const it of items) {
      podcasts.push({
        show: src.name,
        title: it.title,
        link: it.link || src.link,
        audio: it.audio,
        duration: formatDuration(it.duration),
        date: it.date,
        image: it.podcastImage || artwork || null,
      });
    }
    report.push(`ok   podcast  ${src.name} (${items.length})`);
  } catch (err) {
    report.push(`FAIL podcast  ${src.name}: ${err.message}`);
    failed.podcasts.push(src.name);
  }
}

for (const src of sources.news ?? []) {
  try {
    let items = parseFeed(await get(src.feed)).map((it) => ({
      ...it,
      // Google News titles end with " - Publisher"; drop it.
      title: it.title.replace(/\s+-\s+[^-]{2,60}$/, ''),
    }));
    items = items.filter((it) => relevant(src, it.title)).slice(0, PER_SOURCE);
    for (const it of items) {
      const title = it.title;
      news.push({ source: src.name, title, link: it.link, date: it.date, image: it.image && !it.image.includes('news.google') ? it.image : null });
    }
    report.push(`ok   news     ${src.name} (${items.length})`);
  } catch (err) {
    report.push(`FAIL news     ${src.name}: ${err.message}`);
    failed.news.push(src.name);
  }
}

const byDate = (a, b) => (a.date < b.date ? 1 : -1);
const dedupe = (list, key) => {
  const seen = new Set();
  return list.filter((x) => {
    const k = key(x).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

const next = {
  podcasts: dedupe(podcasts.sort(byDate), (x) => x.title + x.show).slice(0, MAX_PODCASTS),
  news: dedupe(news.sort(byDate), (x) => x.title).slice(0, MAX_NEWS),
};

console.log(report.join('\n'));

let prev = null;
try {
  prev = JSON.parse(await readFile(OUT, 'utf8'));
} catch {}

// Keep the previous list for any source that failed this run, so one broken
// feed never empties the page.
if (prev) {
  for (const kind of ['podcasts', 'news']) {
    for (const name of failed[kind]) {
      const src = (sources[kind] ?? []).find((x) => x.name === name) ?? {};
      const keep = (prev[kind] ?? []).filter((x) => (x.show || x.source) === name && relevant(src, x.title, '', kind === 'podcasts' ? 1 : 3));
      next[kind].push(...keep);
    }
    next[kind].sort(byDate);
  }
}

const same = prev && JSON.stringify(prev.podcasts) === JSON.stringify(next.podcasts) && JSON.stringify(prev.news) === JSON.stringify(next.news);
if (same) {
  console.log('No new episodes or headlines. feeds.json unchanged.');
} else if (next.podcasts.length + next.news.length === 0) {
  console.log('Every feed failed. Leaving feeds.json alone.');
} else {
  await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), ...next }, null, 2) + '\n');
  console.log(`feeds.json updated: ${next.podcasts.length} episodes, ${next.news.length} headlines.`);
}
