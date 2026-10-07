// Capture brand icon, header logo and screenshots for each project with a live site.
// Usage: node capture.mjs [slug ...]   (no slugs = all projects)
// Writes public/projects/<slug>/* and data/media.json. Uses the locally installed Chrome (fresh temp profile).
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const BROWSER = process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const CONCURRENCY = 3;

const projects = JSON.parse(readFileSync(new URL('data/projects.json', ROOT), 'utf8'));
const mediaPath = new URL('data/media.json', ROOT);
const media = existsSync(mediaPath) ? JSON.parse(readFileSync(mediaPath, 'utf8')) : {};
const only = process.argv.slice(2);
const queue = projects.filter(p => p.url && (!only.length || only.includes(p.slug)));

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Runs in the page: hide cookie banners, newsletter popups and scroll locks so the shot shows the store.
function cleanPage() {
  const known = [
    '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay', '#onetrust-consent-sdk', '#usercentrics-root',
    '#usercentrics-cmp-ui', '#shopify-pc__banner', '#shopify-pc__prefs', '.cky-consent-container', '.cky-overlay',
    '#cmpbox', '#cmpbox2', '#pandectes-banner', '.cc-window', '.cc-banner', '#termly-code-snippet-support',
    '.klaviyo-form', '[data-testid="POPUP"]', '.needsclick[role="dialog"]', '#axeptio_overlay', '#didomi-host',
    '#iubenda-cs-banner', '.cookie-banner', '#cookie-banner', '#consent-banner', '.privy-popup-container',
    '#attentive_overlay', '#smile-ui-container', '#gorgias-chat-container', '#chat-button', '#launcher',
    '.consentmo-banner', '#isense-gdpr-cookie-banner', '.age-verification', 'cookie-consent-banner',
  ];
  for (const sel of known) document.querySelectorAll(sel).forEach(el => el.remove());
  document.querySelectorAll('[aria-modal="true"], dialog[open]').forEach(el => el.remove());
  const vw = innerWidth, vh = innerHeight;
  const word = /cookie|consent|datenschutz|privacy|newsletter|rabatt|anmelden und|sign up|subscribe|% off|gutschein|discount code|akzeptieren|ablehnen|accept all|reject/i;
  // Walk the DOM including open shadow roots, since some banners live inside web components.
  const all = [];
  (function walk(root) {
    for (const el of root.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); }
  })(document.body);
  for (const el of all) {
    if (!el.isConnected) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const area = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    if (area === 0) continue;
    const text = (el.textContent || '').slice(0, 2000);
    const topBar = (r.top <= 2 || (r.top < vh * 0.15 && r.width > vw * 0.9)) && r.height < vh * 0.25;
    if (topBar && !word.test(text)) continue; // site header / announcement bar
    if (cs.position === 'sticky' && !(r.bottom >= vh - 2 && word.test(text))) continue; // ordinary sticky content
    const bottomBar = r.bottom >= vh - 2 && r.height < vh * 0.45;
    const floating = !topBar && area > vw * vh * 0.03; // modal, popup or slide-in
    const cornerWidget = r.right > vw - 140 && r.bottom > vh - 180 && area < vw * vh * 0.05; // chat bubbles
    if (area > vw * vh * 0.35 || word.test(text) || bottomBar || floating || cornerWidget) el.remove();
  }
  for (const el of [document.documentElement, document.body]) {
    el.style.setProperty('overflow', 'auto', 'important');
    el.classList.remove('modal-open', 'overflow-hidden', 'no-scroll', 'js-drawer-open');
  }
  window.scrollTo(0, 0);
}

async function open(browser, url, mobile) {
  const page = await browser.newPage();
  if (mobile) {
    await page.setUserAgent(UA_MOBILE);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  } else {
    await page.setUserAgent(UA_DESKTOP);
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  }
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8' });
  let status = 0;
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    status = res ? res.status() : 0;
  } catch {
    try { const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); status = res ? res.status() : 0; } catch { status = -1; }
  }
  for (let i = 0; i < 3; i++) {
    const t = await page.title().catch(() => '');
    if (!/verifying your connection|just a moment|attention required/i.test(t)) break;
    await sleep(6000);
  }
  await sleep(2500);
  // Scroll a little and back so lazy-loaded hero images render, then clear popups that appeared meanwhile.
  await page.evaluate(() => window.scrollTo(0, Math.round(innerHeight * 0.6))).catch(() => {});
  await sleep(1200);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await sleep(1500);
  await page.evaluate(cleanPage).catch(() => {});
  await sleep(800);
  await page.evaluate(cleanPage).catch(() => {});
  return { page, status };
}

// Render any image bytes (png/ico/svg/webp/jpg) to a square PNG through a canvas in the page.
async function toPng(page, buf, type, size) {
  const dataUrl = `data:${type};base64,${buf.toString('base64')}`;
  const out = await page.evaluate(async (src, size) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const s = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return c.toDataURL('image/png');
  }, dataUrl, size);
  return Buffer.from(out.split(',')[1], 'base64');
}

// 'light' when the icon's visible pixels are mostly white (needs a dark tile), else 'dark'.
async function iconTone(page, png) {
  return page.evaluate(async src => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      n++;
    }
    const coverage = n / (d.length / 4);
    // An icon that fills its square has its own background and works on a white tile.
    return n && coverage < 0.9 && sum / n > 200 ? 'light' : 'dark';
  }, `data:image/png;base64,${png.toString('base64')}`);
}

async function captureIcon(page, dir) {
  const candidates = await page.evaluate(() => {
    const links = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"], link[rel="shortcut icon"]')];
    return links.map(l => ({ href: l.href, rel: l.rel, sizes: l.getAttribute('sizes') || '' }))
      .sort((a, b) => {
        const score = x => (x.rel.includes('apple') ? 1000 : 0) + (parseInt(x.sizes) || (x.href.endsWith('.svg') ? 500 : 16));
        return score(b) - score(a);
      });
  });
  const tries = [...candidates.map(c => c.href), new URL('/favicon.ico', page.url()).href];
  for (let href of tries) {
    try {
      if (/cdn\.shopify\.com|\/cdn\/shop\//.test(href)) href = href.replace(/([?&])(width|height)=\d+/g, '$1$2=192').replace(/_\d+x\d*(\.\w+)/, '$1') + (href.includes('width=') ? '' : (href.includes('?') ? '&' : '?') + 'width=192');
      const res = await fetch(href, { headers: { 'User-Agent': UA_DESKTOP }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const type = (res.headers.get('content-type') || '').split(';')[0] || 'image/x-icon';
      if (!type.startsWith('image/')) continue;
      const png = await toPng(page, Buffer.from(await res.arrayBuffer()), type, 96);
      writeFileSync(new URL('icon.png', dir), png);
      page.__iconTone = await iconTone(page, png).catch(() => 'dark');
      return 'icon.png';
    } catch { /* try next */ }
  }
  return null;
}

async function captureLogo(page, dir) {
  const handle = await page.evaluateHandle(() => {
    const sels = [
      'header .header__heading-logo', 'header .header__heading-link img', 'header .header__heading-link svg',
      'header [class*="logo"] img', 'header [class*="logo"] svg', 'header a[href="/"] img', 'header a[href="/"] svg',
      '[class*="header"] [class*="logo"] img', '[class*="header"] [class*="logo"] svg', '[class*="logo"] img', 'img[alt*="logo" i]', 'a[href="/"] img',
    ];
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.top >= 0 && r.top < 220 && r.width >= 40 && r.width <= 520 && r.height >= 14 && r.height <= 220) return el;
      }
    }
    return null;
  });
  const el = handle.asElement();
  if (!el) return null;
  // Re-render at 2x so the logo stays sharp on the project page, then go back to 1x for screenshots.
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  await sleep(700);
  try {
    await el.screenshot({ path: fileURLToPath(new URL('logo.png', dir)), type: 'png' });
  } finally {
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await sleep(500);
  }
  return 'logo.png';
}

async function shot(page, dir, name) {
  await page.evaluate(cleanPage).catch(() => {}); // late popups (timed newsletter forms) appear after load
  await sleep(300);
  await page.screenshot({ path: fileURLToPath(new URL(name, dir)), type: 'webp', quality: 70, captureBeyondViewport: false });
  return name;
}

async function captureProject(browser, p) {
  const dir = new URL(`public/projects/${p.slug}/`, ROOT);
  mkdirSync(dir, { recursive: true });
  for (const f of ['icon.png', 'logo.png', 'home.webp', 'home-mobile.webp', 'collection.webp', 'product.webp']) {
    if (existsSync(new URL(f, dir))) rmSync(new URL(f, dir));
  }
  const rec = { shopify: false, status: 0, icon: null, logo: null, shots: [], title: '', capturedAt: new Date().toISOString().slice(0, 10) };
  const { page, status } = await open(browser, p.url, false);
  rec.status = status;
  try {
    rec.title = await page.title();
    rec.shopify = await page.evaluate(() => !!(window.Shopify && window.Shopify.shop) ||
      !!document.querySelector('link[href*="cdn.shopify.com"], script[src*="cdn.shopify.com"], link[href*="/cdn/shop/"]'));
    rec.themeColor = await page.evaluate(() => (document.querySelector('meta[name="theme-color"]') || {}).content || null);
    rec.icon = await captureIcon(page, dir);
    rec.iconTone = page.__iconTone || null;
    rec.logo = await captureLogo(page, dir).catch(() => null);
    if (rec.shopify && status > 0 && status < 400) {
      rec.shots.push({ file: await shot(page, dir, 'home.webp'), label: 'Homepage' });
      const origin = new URL(page.url()).origin;
      const found = await page.evaluate(async () => {
        const out = {};
        try {
          const c = await (await fetch('/collections.json?limit=30')).json();
          const internal = /frontpage|^all$|home|hidden|test|price|do not|don't|internal|draft|old|copy/i;
          const col = c.collections.filter(x => x.products_count > 3 && !internal.test(x.handle) && !internal.test(x.title || ''))
            .sort((a, b) => b.products_count - a.products_count)[0];
          if (col) out.collection = col.handle;
        } catch {}
        try {
          const pr = await (await fetch('/products.json?limit=30')).json();
          const prod = pr.products.find(x => x.images && x.images.length && x.variants.some(v => v.available)) || pr.products[0];
          if (prod) out.product = prod.handle;
        } catch {}
        return out;
      });
      await page.close();
      if (found.collection) {
        const c = await open(browser, `${origin}/collections/${found.collection}`, false);
        if (c.status > 0 && c.status < 400) rec.shots.push({ file: await shot(c.page, dir, 'collection.webp'), label: 'Collection page' });
        await c.page.close();
      }
      if (found.product) {
        const pr = await open(browser, `${origin}/products/${found.product}`, false);
        if (pr.status > 0 && pr.status < 400) rec.shots.push({ file: await shot(pr.page, dir, 'product.webp'), label: 'Product page' });
        await pr.page.close();
      }
      const m = await open(browser, p.url, true);
      if (m.status > 0 && m.status < 400) rec.shots.push({ file: await shot(m.page, dir, 'home-mobile.webp'), label: 'Mobile', mobile: true });
      await m.page.close();
    } else {
      await page.close();
    }
  } catch (e) {
    rec.error = String(e.message || e).slice(0, 200);
    await page.close().catch(() => {});
  }
  return rec;
}

if (only[0] === '--tones') {
  const b = await puppeteer.launch({ executablePath: BROWSER, headless: true, pipe: true });
  const pg = await b.newPage();
  for (const p of projects) {
    const f = new URL(`public/projects/${p.slug}/icon.png`, ROOT);
    if (!media[p.slug] || !existsSync(f)) continue;
    media[p.slug].iconTone = await iconTone(pg, readFileSync(f));
    console.log(p.slug.padEnd(36), media[p.slug].iconTone);
  }
  writeFileSync(mediaPath, JSON.stringify(media, null, 2) + '\n');
  await b.close();
  process.exit(0);
}

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  pipe: true,
  protocolTimeout: 240000,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled', '--lang=de-CH'],
});
let i = 0;
async function worker() {
  while (i < queue.length) {
    const p = queue[i++];
    const t0 = Date.now();
    const rec = await captureProject(browser, p).catch(e => ({ error: String(e) }));
    media[p.slug] = rec;
    writeFileSync(mediaPath, JSON.stringify(media, null, 2) + '\n');
    console.log(`${p.slug.padEnd(36)} shopify=${rec.shopify} status=${rec.status} icon=${!!rec.icon} logo=${!!rec.logo} shots=${(rec.shots || []).length} ${rec.error || ''} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await browser.close();
