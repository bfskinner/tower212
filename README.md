# Tower 212

The unofficial home of the USF Water Tower: **www.tower212.com**

A static Astro site in GitHub, deployed by Render, edited with Pages CMS, and kept fresh by one hourly GitHub Action. No server, no database, no monthly bill.

## How the site runs itself

| What | How it updates | You do |
|---|---|---|
| The Wire and Podcasts | `.github/workflows/update-data.yml` runs hourly, reads `src/data/sources.yml`, pulls every feed, and commits `src/data/feeds.json` when something is new | Nothing. Add a source when you want one. |
| Matchday strip and Scores & Schedule | Same workflow pulls ESPN's public schedule into `src/data/schedule.json`. The matchday strip also checks ESPN live during games. | Nothing |
| Wallpaper sizes, thumbnails, "Download all" ZIPs | `scripts/build-images.mjs` runs before every build | Upload one master image |
| Deploys | Render rebuilds on every push to `main` (about 2 minutes) | Nothing |

## Editing content (Pages CMS)

1. Go to **app.pagescms.org**, sign in with GitHub, and open this repository.
2. **Blog posts:** New entry, write, add a cover image, Save. Live in about 2 minutes.
3. **Free downloads:** New entry, pick a type, upload the image.
   - *Wallpaper:* upload the largest version you have. The build makes Desktop 4K, 1440p, iPhone, iPad, and Watch sizes, and skips any size the image is too small for.
   - *Sticker or icon pack:* main image plus more images in "gallery". The site builds the "Download all" ZIP.
   - Tick "Feature on the homepage" to put it on the homepage tile.
4. **Podcast and news sources:** this list also feeds the USF Media directory. Add a show by its Apple Podcasts ID (the number after `/id` in its Apple link), its exact Apple title, or its RSS feed URL.

Images go in `public/uploads/`. Keep files under about 10 MB each.

### Wallpaper fine-tuning (optional frontmatter)

- `focus: north` (or `south`, `east`, `west`, `centre`) to change where crops anchor
- `fit: contain` with `background: "#00382A"` to letterbox instead of crop

## Settings

`src/lib/site.ts` holds the site name, X handle, and an optional Discord invite link (`discord: ''`). Paste a Discord invite there to show a Discord button under every post.

## Run it locally (optional)

```
npm install
npm run dev        # http://localhost:4321
npm run feeds      # pull podcasts and news now
npm run schedule   # pull scores now
```

Requires Node 22.12 or newer.

## Hosting setup (one time)

- **GitHub:** this repo, branch `main`. Actions tab, "Update podcasts, news, and scores", **Run workflow** once to fill in live data.
- **Render:** New, Static Site, connect this repo. Build command `npm ci && npm run build`, publish directory `dist`, environment variable `NODE_VERSION=22.12.0`. (`render.yaml` has the same settings for a Blueprint.)
- **Domain (Spaceship DNS):** add `tower212.com` and `www.tower212.com` as custom domains in Render, then at Spaceship:
  - `A` record, host `@`, value `216.24.57.1`
  - `CNAME` record, host `www`, value `<your-service>.onrender.com`
  - Delete any `AAAA` records and any parking/forwarding on tower212.com.
- **usftower.com:** in Spaceship, set URL forwarding (301, permanent) to `https://www.tower212.com`.

Tower 212 is a fan site. It is not affiliated with, endorsed by, or sponsored by the University of South Florida or USF Athletics.
