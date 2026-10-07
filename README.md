# REMTA Digital website

Static one-page site for [remtadigital.com](https://remtadigital.com). Plain HTML, CSS and a little JavaScript, with no build step.

## Structure

```
index.html          page content
assets/style.css    styles (dark by default, light via prefers-color-scheme)
assets/main.js      mobile menu, project filters, reveal-on-scroll
robots.txt
sitemap.xml
```

## Run locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy (Cloudflare Pages)

1. Cloudflare dashboard, Workers & Pages, Create, Pages, connect this repository.
2. Build command: none. Build output directory: `/` (the repository root).
3. Add the custom domain `remtadigital.com` in the project's Custom domains tab.

Every push to the default branch redeploys the site.
