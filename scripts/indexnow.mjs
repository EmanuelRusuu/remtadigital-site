// Tell Bing, Yandex and other IndexNow search engines about every URL in the sitemap.
// The key file public/<key>.txt proves the site is ours; run after a deploy that changes pages.
// Usage: node indexnow.mjs
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const key = readdirSync(new URL('public/', ROOT)).map(f => f.match(/^([0-9a-f]{32})\.txt$/)).find(Boolean)?.[1];
if (!key) throw new Error('no IndexNow key file in public/');
const urls = [...readFileSync(new URL('public/sitemap.xml', ROOT), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: 'remtadigital.com', key, keyLocation: `https://remtadigital.com/${key}.txt`, urlList: urls }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urls.length} URLs`);
