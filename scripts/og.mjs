// Render the 1200x630 link-preview images (og:image) for the homepage and every project page.
// Output: public/assets/img/og-home.jpg and public/projects/<slug>/og.jpg. Run after build.mjs data changes.
// Usage: node og.mjs
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const BROWSER = process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const read = p => readFileSync(new URL(p, ROOT));
const projects = JSON.parse(read('data/projects.json'));
const media = JSON.parse(read('data/media.json'));
const popularity = JSON.parse(read('data/popularity.json'));

const data = (p, type) => `data:${type};base64,${read(p).toString('base64')}`;
const mime = f => f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
const file = (slug, f) => f && existsSync(new URL(`public/projects/${slug}/${f}`, ROOT)) ? data(`public/projects/${slug}/${f}`, mime(f)) : null;
const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&middot;/g, '·');

const fonts = `
@font-face{font-family:OgSans;font-weight:400 700;src:url(${data('public/assets/fonts/source-sans-3-latin.woff2', 'font/woff2')})}
@font-face{font-family:OgSerif;font-weight:600 700;src:url(${data('public/assets/fonts/source-serif-4-latin.woff2', 'font/woff2')})}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;font-family:OgSans,sans-serif;color:#1c2326}
.mark{display:flex;align-items:center;gap:12px;font-size:26px}
.mark b{letter-spacing:.07em}`;
const logo = read('public/assets/img/logo.svg').toString().replace('<svg ', '<svg width="44" height="44" ');

function homeHtml() {
  const icons = ['curaprox', 'fc-basel-1893', 'confiserie-sprungli', 'ev-zug', 'nile', 'fc-st-gallen-1879']
    .map(s => `<span><img src="${file(s, media[s].icon)}"></span>`).join('');
  return `<style>${fonts}
body{background:linear-gradient(90deg,#2f6170 0%,#417684 30%,#7aa0a9 62%,#cfdde0 100%);display:grid;grid-template-columns:1fr 330px;gap:40px;padding:64px 70px;color:#fff}
.photo{width:150px;height:150px;border-radius:30px;object-fit:cover;border:4px solid rgba(255,255,255,.85)}
h1{font-family:OgSerif;font-weight:650;font-size:76px;line-height:1.05;margin:26px 0 12px}
.role{font-size:32px;font-weight:600}
.what{font-size:27px;margin-top:14px;opacity:.95;max-width:640px;line-height:1.35}
.foot{position:absolute;left:70px;bottom:52px}
.mark{color:#fff}.mark span{font-weight:400;opacity:.9}
.grid{align-self:center;display:grid;grid-template-columns:repeat(2,1fr);gap:22px}
.grid span{display:grid;place-items:center;width:150px;height:150px;background:#fff;border-radius:30px;box-shadow:0 12px 30px -16px rgba(0,0,0,.45)}
.grid img{width:110px;height:110px;object-fit:contain}
</style>
<div><img class="photo" src="${data('public/assets/img/emanuel-rusu.jpg', 'image/jpeg')}">
<h1>Emanuel Rusu</h1><p class="role">Shopify developer · Founder of REMTA Digital</p>
<p class="what">Custom themes, features, apps and integrations for larger, multilingual stores.</p></div>
<div class="grid">${icons}</div>
<div class="foot mark">${logo}<b>REMTA</b><span>Digital · remtadigital.com</span></div>`;
}

function projectHtml(p) {
  const m = media[p.slug] || {};
  const shot = (m.shots || []).find(s => !s.mobile && !(p.hideShots || []).includes(s.file));
  const icon = file(p.slug, m.icon);
  const badge = (popularity.categories || {})[p.slug]?.badge;
  const meta = p.company ? `${p.company} · ${p.role}` : p.role;
  const right = shot
    ? `<div class="frame"><div class="bar"><i></i><i></i><i></i><span>${strip(p.urlLabel || '')}</span></div><img src="${file(p.slug, shot.file)}"></div>`
    : file(p.slug, m.logo) ? `<div class="plate"><img src="${file(p.slug, m.logo)}"></div>` : '';
  return `<style>${fonts}
body{background:#f6f5f1;display:grid;grid-template-columns:${right ? '1fr 560px' : '1fr'};gap:44px;padding:56px 60px;position:relative}
body::before{content:"";position:absolute;left:0;top:0;bottom:0;width:14px;background:#1d5e6b}
.icon{width:120px;height:120px;border-radius:28px;background:${m.iconTone === 'light' ? '#1f1f1f' : '#fff'};border:1px solid #e2e3dd;display:grid;place-items:center;box-shadow:0 10px 26px -16px rgba(20,40,45,.5)}
.icon img{width:88px;height:88px;object-fit:contain}
.initials{font-family:OgSerif;font-size:46px;color:#1d5e6b;background:#e1edef}
h1{font-family:OgSerif;font-weight:650;font-size:${strip(p.title).length > 22 ? 54 : 64}px;line-height:1.08;margin:28px 0 12px}
.meta{font-size:28px;color:#58626a;font-weight:600}
.badge{display:inline-flex;align-items:center;gap:10px;margin-top:22px;padding:8px 16px 8px 14px;border-radius:10px;background:#f6efd9;color:#6b4e0f;font-size:21px;font-weight:700;white-space:nowrap}
.sum{font-size:28px;line-height:1.4;color:#2f383c;max-width:900px;margin-top:22px}
.badge::before{content:"";width:12px;height:12px;border-radius:50%;background:#c8961e}
.foot{position:absolute;left:60px;bottom:46px;color:#1c2326}
.mark span{color:#1d5e6b}
.frame{align-self:center;background:#fff;border:1px solid #e2e3dd;border-radius:18px;overflow:hidden;box-shadow:0 22px 50px -28px rgba(20,40,45,.55)}
.bar{display:flex;align-items:center;gap:7px;padding:11px 16px;background:#f1f4f3;border-bottom:1px solid #e2e3dd;font-size:18px;color:#58626a}
.bar i{width:11px;height:11px;border-radius:50%;background:#d6d9d4}.bar span{margin-left:10px}
.frame img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top}
.plate{align-self:center;display:grid;place-items:center;height:360px;background:#fff;border:1px solid #e2e3dd;border-radius:18px}
.plate img{max-width:78%;max-height:62%;object-fit:contain}
</style>
<div>${icon ? `<div class="icon"><img src="${icon}"></div>` : `<div class="icon initials">${strip(p.title).split(/[\s.]+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</div>`}
<h1>${strip(p.title)}</h1><p class="meta">${strip(meta)}</p>${badge ? `<p class="badge">${badge}</p>` : ''}${right ? '' : `<p class="sum">${strip(p.summary)}</p>`}</div>
${right}
<div class="foot mark">${logo}<b>REMTA</b><span>Digital · Emanuel Rusu, Shopify developer</span></div>`;
}

const browser = await puppeteer.launch({ executablePath: BROWSER, headless: true, pipe: true });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630 });
async function render(html, out) {
  await page.setContent(`<!doctype html><html><body>${html}</body></html>`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(new URL(out, ROOT), await page.screenshot({ type: 'jpeg', quality: 86 }));
}
await render(homeHtml(), 'public/assets/img/og-home.jpg');
for (const p of projects) await render(projectHtml(p), `public/projects/${p.slug}/og.jpg`);
await browser.close();
console.log(`rendered og-home.jpg and ${projects.length} project previews`);
