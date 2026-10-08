// Render my one-page CV to public/emanuel-rusu-cv.pdf (A4) with the site's fonts and colours.
// Every line here is also on remtadigital.com or LinkedIn; update both together.
// Usage: node cv.mjs
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const BROWSER = process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const data = (p, type) => `data:${type};base64,${readFileSync(new URL(p, ROOT)).toString('base64')}`;

const tools = ['Shopify Liquid', 'Dawn', 'Horizon', 'JavaScript', 'TypeScript', 'React Router', 'Polaris', 'Shopify Admin GraphQL API',
  'App proxy', 'Metaobjects & metafields', 'Shopify Functions', 'Checkout UI extensions', 'WebAssembly', 'Meilisearch', 'InstantSearch',
  'Klaviyo', 'HubSpot', 'JSON-LD & SEO', 'Prisma', 'Vitest', 'Laravel', 'HTML & CSS'];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:CvSans;font-weight:400 700;src:url(${data('public/assets/fonts/source-sans-3-latin.woff2', 'font/woff2')})}
@font-face{font-family:CvSans;font-weight:400 700;src:url(${data('public/assets/fonts/source-sans-3-latin-ext.woff2', 'font/woff2')});unicode-range:U+0100-02BA}
@font-face{font-family:CvSerif;font-weight:600 700;src:url(${data('public/assets/fonts/source-serif-4-latin.woff2', 'font/woff2')})}
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fff;font-family:CvSans,sans-serif;font-size:9.6pt;line-height:1.42;color:#2f383c;width:210mm;height:297mm;display:grid;grid-template-columns:62mm 1fr}
a{color:#1d5e6b;text-decoration:none}
aside{background:#1d5e6b;color:#e6f0f1;padding:14mm 8mm 12mm 10mm}
aside a{color:#fff}
.photo{width:34mm;height:34mm;border-radius:7mm;object-fit:cover;border:1mm solid rgba(255,255,255,.8)}
aside h2{font-size:8.6pt;letter-spacing:.08em;text-transform:uppercase;color:#a9d3da;margin:7mm 0 2.2mm}
aside p,aside li{font-size:9pt}
aside ul{list-style:none}
aside li{margin-bottom:1.2mm}
.tools li{display:inline-block;margin:0 1mm 1.4mm 0;padding:.5mm 2mm;border:1px solid rgba(255,255,255,.35);border-radius:1.5mm;font-size:8.2pt}
main{padding:13mm 13mm 10mm 11mm}
h1{font-family:CvSerif;font-weight:650;font-size:27pt;line-height:1.05;color:#1c2326}
.role{font-size:12pt;font-weight:600;color:#1d5e6b;margin:1.5mm 0 4mm}
.intro{font-size:10pt;color:#2f383c;margin-bottom:2mm}
main h2{font-family:CvSerif;font-weight:650;font-size:13pt;color:#1c2326;border-bottom:1.4px solid #1c2326;padding-bottom:1mm;margin:6mm 0 3mm}
.job{margin-bottom:4mm}
.job-head{display:flex;justify-content:space-between;align-items:baseline;gap:4mm}
.job-head b{font-size:10.6pt;color:#1c2326}
.job-head span{font-size:8.8pt;color:#58626a;white-space:nowrap}
.job .sub{color:#58626a;margin:.4mm 0 1.4mm}
.job ul{padding-left:4mm}
.job li{margin-bottom:1.1mm}
.job li strong{color:#1c2326}
.edu div{display:flex;justify-content:space-between;margin-bottom:1.4mm}
.edu span{color:#58626a;white-space:nowrap}
.foot{font-size:8pt;color:#58626a;margin-top:4mm}
</style></head><body>
<aside>
  <img class="photo" src="${data('public/assets/img/emanuel-rusu.jpg', 'image/jpeg')}">
  <h2>Contact</h2>
  <ul>
    <li><a href="mailto:emanuel@remtadigital.com">emanuel@remtadigital.com</a></li>
    <li><a href="https://remtadigital.com/">remtadigital.com</a></li>
    <li><a href="https://www.linkedin.com/in/emanuel-rusu/">linkedin.com/in/emanuel-rusu</a></li>
    <li>Cluj-Napoca, Romania, working remotely</li>
  </ul>
  <h2>Languages</h2>
  <p>English and Romanian</p>
  <h2>Tools I use every day</h2>
  <ul class="tools">${tools.map(t => `<li>${t.replace('&', '&amp;')}</li>`).join('')}</ul>
  <h2>Education</h2>
  <ul>
    <li><b>Babe&#537;-Bolyai University</b><br>Economic Informatics, 2021 to 2024</li>
    <li><b>IT School</b><br>Front-End Web Development certification, 2023</li>
  </ul>
</aside>
<main>
  <h1>Emanuel Rusu</h1>
  <p class="role">Shopify developer &middot; Founder of REMTA Digital</p>
  <p class="intro">I build custom Shopify themes, features and apps, mostly for larger stores that sell in several languages and markets and need to talk to an ERP, PIM or search service. Since 2023 I have worked on 36 Shopify projects, listed with screenshots and details at remtadigital.com.</p>

  <h2>Experience</h2>
  <div class="job">
    <div class="job-head"><b>REMTA Digital</b><span>Dec 2025 to today</span></div>
    <p class="sub">Founder and Shopify developer. My own one-person company for Shopify projects.</p>
  </div>
  <div class="job">
    <div class="job-head"><b>aiconomy AG</b><span>Apr 2025 to today</span></div>
    <p class="sub">Shopify developer on multilingual Swiss stores connected to aico's cloud ERP, POS and PIM: frontend, custom functionality, discount logic and custom apps.</p>
    <ul>
      <li><strong>EV Zug:</strong> a Cart Transform Function in TypeScript, compiled to WebAssembly, that merges a personalised jersey into one line in cart and checkout; the live auction page and the order emails. 325 of the store's 907 commits are mine.</li>
      <li><strong>Curaprox:</strong> the Swiss and UAE stores on one shared Horizon theme, with content resolved per store from the PIM. A colour-variant product page went from 16.2 MB to 4.5 MB.</li>
      <li><strong>PrestaShop to Shopify migration app:</strong> customers and order history imported into a live store without a single customer email, enforced by a release-blocking test; 17 test suites.</li>
      <li><strong>Inuikii:</strong> a Meilisearch search and collection layer with colour grouping and market-aware prices, plus a B2B showroom, an influencer store and a checkout app.</li>
      <li><strong>Also:</strong> FC Basel 1893, FC St. Gallen 1879, FC Z&uuml;rich (collection and product pages at least 30% faster), Confiserie Spr&uuml;ngli, Nile, Lush Switzerland, Revendo and more.</li>
    </ul>
  </div>
  <div class="job">
    <div class="job-head"><b>WebGurus</b><span>Oct 2023 to Mar 2025</span></div>
    <p class="sub">Shopify developer on custom themes for US clients, after starting there as a mobile app developer and full stack intern.</p>
    <ul>
      <li><strong>Tshirts.com:</strong> my first fully custom theme, built from scratch, then optimised until the page was loaded and usable in under 2 seconds, down from over 9.</li>
      <li><strong>Also:</strong> American Stationery, Brand Depot and Cosmic Clothing.</li>
    </ul>
  </div>
  <h2>How I work</h2>
  <div class="job"><ul>
    <li>I agree on scope and trade-offs in plain language before I write code.</li>
    <li>I build on a staging store and ship in small, reviewable steps.</li>
    <li>Several languages and markets are the default for me, not an afterthought.</li>
    <li>I leave code your own team can read and keep working on.</li>
  </ul></div>
  <p class="foot">Project details, screenshots and sources: remtadigital.com</p>
</main>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: BROWSER, headless: true, pipe: true });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const overflow = await page.evaluate(() => document.body.scrollHeight - document.body.clientHeight);
writeFileSync(new URL('public/emanuel-rusu-cv.pdf', ROOT), await page.pdf({ format: 'A4', printBackground: true, pageRanges: '1' }));
await page.setViewport({ width: 794, height: 1123 });
writeFileSync(new URL('scripts/.cache/cv-preview.png', ROOT), await page.screenshot());
await browser.close();
console.log(`saved public/emanuel-rusu-cv.pdf${overflow > 0 ? ` (content overflows the page by ${overflow}px)` : ''}`);
