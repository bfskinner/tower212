export const SITE = {
  name: 'Tower 212',
  url: 'https://www.tower212.com',
  description:
    'The unofficial home of the USF Water Tower. Scores, a blog, free wallpapers and memes, and the best USF podcasts and news, curated from the tallest seat on campus.',
  tagline: 'An independent view of USF sports + culture.',
  x: 'WaterTowerUSF',
  xUrl: 'https://x.com/WaterTowerUSF',
  discord: '', // Paste a USF fan Discord invite link here to show the Discord button.
  disclaimer:
    'Tower 212 is a fan site. It is not affiliated with, endorsed by, or sponsored by the University of South Florida or USF Athletics.',
};

export const NAV = [
  { label: 'The Wire', href: '/wire/' },
  { label: 'Blog', href: '/blog/' },
  { label: 'Podcasts', href: '/podcasts/' },
  { label: 'Free Downloads', href: '/downloads/' },
  { label: 'USF Media', href: '/usf-media/' },
];

const TZ = 'America/New_York';
export const fmt = {
  // Post dates are calendar dates (no time), so show them in UTC to avoid a day shift.
  post: (d: Date | string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
  postShort: (d: Date | string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  date: (d: Date | string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ }),
  short: (d: Date | string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ }),
  day: (d: Date | string) =>
    new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ }),
  time: (d: Date | string) =>
    new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }) + ' ET',
};

export const readingTime = (body = '') => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 230));
