# REMTA Digital website

Static one-page site for [remtadigital.com](https://remtadigital.com). Plain HTML, CSS and a little JavaScript, with no build step.

## Structure

```
public/index.html          page content
public/assets/style.css    styles (dark by default, light via prefers-color-scheme)
public/assets/main.js      mobile menu, project filters, reveal-on-scroll
public/robots.txt
public/sitemap.xml
wrangler.jsonc             Cloudflare Worker config (serves public/ as static assets)
```

Only `public/` is published. Everything else in the repository stays private.

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
