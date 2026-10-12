// Articles live in data/articles/<slug>.html: a JSON front block in an HTML comment, then the body.
//
// <!--
// { "title": "...", "summary": "...", "date": "2026-10-12", "order": 10, "category": "Guide" or "Case note",
//   "project": "ev-zug", "tags": [...], "featured": true, "series": { "name": "...", "part": 1 },
//   "links": [{ "title": "...", "url": "https://..." }] }
// -->
// <p>Body HTML. Every <h2> becomes an entry in the table of contents.</p>
import { readFileSync, readdirSync, existsSync } from 'node:fs';

export function loadArticles(root) {
  const dir = new URL('data/articles/', root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.html')).map(f => {
    const src = readFileSync(new URL(f, dir), 'utf8');
    const m = src.match(/^\s*<!--([\s\S]*?)-->\s*([\s\S]*)$/);
    if (!m) throw new Error(`data/articles/${f}: missing the <!-- { ... } --> front block`);
    let meta;
    try { meta = JSON.parse(m[1]); } catch (e) { throw new Error(`data/articles/${f}: ${e.message}`); }
    return { slug: f.replace(/\.html$/, ''), tags: [], links: [], ...meta, body: [m[2].trim()] };
  }).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.slug.localeCompare(b.slug));
}
