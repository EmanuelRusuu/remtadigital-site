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

Run `node capture.mjs` without arguments to refresh every project. Screenshots are only taken for sites that still run on Shopify, so a store that has moved to another platform never shows work that isn't ours. Commit the generated files; the deploy itself has no build step.

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
