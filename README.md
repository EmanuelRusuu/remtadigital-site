# REMTA Digital website

Static one-page site for [remtadigital.com](https://remtadigital.com). Plain HTML, CSS and a little JavaScript, with no build step.

## Structure

```
public/index.html              homepage (project cards are generated, see below)
public/projects/<slug>/        one page per project, with brand icon, logo and screenshots
public/assets/style.css        styles (dark by default, light via prefers-color-scheme)
public/assets/main.js          mobile menu, project filters, reveal-on-scroll
public/robots.txt
public/sitemap.xml             generated
data/projects.json             the projects: title, role, summary, details, stack, filters, live URL
data/media.json                what capture found per project (Shopify or not, icon, logo, screenshots)
data/popularity.json           traffic data for the "Most visited" sort and the project pages:
                               Tranco ranks, Chrome UX Report country bands, category placings
scripts/                       local tooling, not used by the deploy
wrangler.jsonc                 Cloudflare Worker config (serves public/ as static assets)
```

Only `public/` is published. Everything else in the repository stays private.

## Projects

Edit `data/projects.json`, then regenerate the cards, project pages and sitemap:

```bash
cd scripts && npm install && node build.mjs
```

To refresh a project's icon, logo and screenshots (uses the local Chrome with a temporary profile):

```bash
cd scripts && node capture.mjs curaprox nile
```

To refresh the traffic data behind the "Most visited" sort, the badges and each project's "Site popularity" box:

```bash
cd scripts && node popularity.mjs && node regional.mjs && node build.mjs
```

`popularity.mjs` fetches worldwide ranks from the [Tranco list](https://tranco-list.eu/). `regional.mjs` downloads the latest [Chrome UX Report](https://developer.chrome.com/docs/crux) country lists (via [zakird/crux-top-lists](https://github.com/zakird/crux-top-lists)) for every European country plus each store's home market, and records each domain's best rank band per country. In `data/popularity.json`, `markets` sets a store's home country when its domain doesn't say (`.com`), `extraDomains` adds a project's other stores, and `categories` holds hand-checked placings with their source (for example Curaprox against other oral-care brand sites in the Swiss list); a category `badge`, or a top-1,000 band in the home country, shows as a badge on the homepage card.

Run `node capture.mjs` without arguments to refresh every project. Screenshots are only taken for sites that still run on Shopify, so a store that has moved to another platform never shows work that isn't mine. Commit the generated files; the deploy itself has no build step.

## Run locally

```bash
npx wrangler@4.86.0 dev
# open http://localhost:8787
```

Or without Wrangler: `cd public && python3 -m http.server 8080`.

## Deploy (Cloudflare Workers Builds)

The site is served by the Worker `first`. The `name` in `wrangler.jsonc` must match that Worker's name.

1. Cloudflare dashboard, Workers & Pages, `first`, Settings, Builds, Connect, and choose this repository.
2. Build command: none. Deploy command: `npx wrangler deploy` (the default).
3. Custom domain `remtadigital.com` under Settings, Domains & Routes.

Every push to `main` redeploys the site.
