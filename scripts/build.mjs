// Build the project cards on the homepage and one page per project from data/projects.json,
// the articles (data/articles.json) with their list page and homepage section,
// data/media.json (written by capture.mjs) and data/popularity.json (Tranco ranks from popularity.mjs,
// country bands from regional.mjs, hand-checked category placings).
// Output is committed; the deploy has no build step.
// Usage: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { loadArticles } from './articles.mjs';

const ROOT = new URL('../', import.meta.url);
const SITE = 'https://remtadigital.com';
const read = p => readFileSync(new URL(p, ROOT), 'utf8');
const readJson = (p, fallback) => existsSync(new URL(p, ROOT)) ? JSON.parse(read(p)) : fallback;
const write = (p, s) => { mkdirSync(new URL(p.replace(/[^/]+$/, ''), ROOT), { recursive: true }); writeFileSync(new URL(p, ROOT), s); };

const projects = readJson('data/projects.json', []);
const media = readJson('data/media.json', {});
const popularity = readJson('data/popularity.json', { ranks: {}, aliases: {} });
const articles = loadArticles(ROOT);
const categories = readJson('data/categories.json', []);
const catOf = p => categories.find(c => c.projects.includes(p.slug));
const catName = c => c.name.replace(/&/g, '&amp;');

const strip = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const attr = s => strip(s).replace(/"/g, '&quot;');
const initials = t => strip(t).replace(/&amp;/g, '&').split(/[\s.\-]+/).filter(w => /^[A-Za-z0-9ÄÖÜäöü]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const hasFile = (slug, f) => f && existsSync(new URL(`public/projects/${slug}/${f}`, ROOT));
const m = p => media[p.slug] || {};
const shots = p => (m(p).shots || []).filter(s => hasFile(p.slug, s.file) && !(p.hideShots || []).includes(s.file));
const hostLabel = p => p.urlLabel || (p.url ? new URL(p.url).host.replace(/^www\./, '') : '');
const fmt = n => n.toLocaleString('en-US');
// Reading time at 200 words a minute, rounded up.
const readingTime = a => Math.max(1, Math.ceil(strip(a.body.join(' ').replace(/<[^>]+>/g, ' ')).split(' ').length / 200));
const slugify = s => strip(s).toLowerCase().replace(/&[a-z]+;/g, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const seriesParts = a => a.series ? articles.filter(x => x.series && x.series.name === a.series.name).sort((x, y) => x.series.part - y.series.part) : [];
const shortTitle = a => { const t = a.series ? a.title.replace(/^[^:]*:\s*/, '') : a.title; return t.charAt(0).toUpperCase() + t.slice(1); };
const longDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const articleMeta = a => `<time datetime="${a.date}">${longDate(a.date)}</time> &middot; ${readingTime(a)} min read`;
const articleCard = (a, prefix) => `
        <article class="post">
          <p class="post-meta">${a.series ? `<span class="post-cat">Guide, part ${a.series.part}</span> &middot; ` : ''}${articleMeta(a)}</p>
          <h3><a href="${prefix}${a.slug}/">${a.title}</a></h3>
          <p>${a.summary}</p>
          <a class="case-link" href="${prefix}${a.slug}/">Read the article</a>
        </article>
`;

// Tranco ranks registrable domains (example.ch), so map shop.example.ch to example.ch.
const registrable = p => p.url ? new URL(p.url).host.replace(/^www\./, '').split('.').slice(-2).join('.') : null;
function rankOf(p) {
  if (!p.url) return null;
  let d = registrable(p);
  d = (popularity.aliases || {})[d] || d;
  return popularity.ranks[d] || null;
}

// Country rank bands from the Chrome UX Report (regional.mjs), merged over every domain the
// project's stores run on. The home market is the store's main country.
const EUROPE = new Set('ad al at ba be bg by ch cy cz de dk ee es fi fr gb gr hr hu ie is it li lt lu lv mc md me mk mt nl no pl pt ro rs se si sk sm ua xk'.split(' '));
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const country = cc => (['us', 'gb', 'nl', 'ae'].includes(cc) ? 'the ' : '') + regionNames.of(cc.toUpperCase()).replace(' & ', ' and ');
const regional = popularity.regional || { sites: {} };
const crMonth = regional.month ? new Date(regional.month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';
const trancoMonth = popularity.date ? new Date(popularity.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';

function domainsOf(p) {
  const d = registrable(p);
  if (!d) return [];
  const alias = (popularity.aliases || {})[d];
  return [d, ...(alias ? [alias] : []), ...((popularity.extraDomains || {})[p.slug] || [])];
}
function bandsOf(p) {
  const out = {};
  for (const d of domainsOf(p)) for (const [cc, b] of Object.entries(regional.sites[d] || {})) out[cc] = Math.min(out[cc] || Infinity, b);
  return out;
}
const homeOf = p => { const d = registrable(p); return d ? ((popularity.markets || {})[d] || d.split('.').pop()) : null; };
const homeBand = p => bandsOf(p)[homeOf(p)] || null;
const categoryOf = p => (popularity.categories || {})[p.slug] || null;
function badgeOf(p) {
  const cat = categoryOf(p);
  if (cat && cat.badge) return cat.badge;
  const b = homeBand(p);
  return b && b <= 1000 ? `Top ${fmt(b)} site in ${country(homeOf(p))}` : '';
}

// "Most visited" order: rank band in the home market first, then the worldwide Tranco rank.
const popOrder = new Map(projects.slice().sort((a, b) =>
  ((homeBand(a) || Infinity) - (homeBand(b) || Infinity)) ||
  ((rankOf(a) || Infinity) - (rankOf(b) || Infinity)) ||
  strip(a.title).localeCompare(strip(b.title))).map((p, i) => [p.slug, i + 1]));

// Link-preview text: LinkedIn wants at least 100 characters, so short summaries get a note on what the page shows.
const shareText = p => strip(p.summary).length >= 100 ? p.summary : `${p.summary} ${p.company ? `What I built at ${p.company}, with screenshots and details.` : 'What I built, with screenshots and details.'}`;

// Short label for cards: who I did the work with, and my role.
function metaLine(p) {
  if (p.company) return `${p.company} &middot; ${p.role}`;
  return p.role === 'Theme developer' ? 'Custom theme' : 'Shopify project';
}

// One honest sentence on where the work came from.
function provenance(p) {
  if (p.kind) return `An internal tool at ${p.company}, built while I worked there as a developer. The details below describe my part.`;
  if (p.company) return `I worked on this as a developer at ${p.company}, which ran the project for its client. REMTA Digital was not involved; the details below describe my own part.`;
  return 'Built while I worked for another company, before I founded REMTA Digital.';
}

function brand(p, prefix, size = 'sm') {
  const icon = m(p).icon;
  if (hasFile(p.slug, icon)) {
    const src = m(p).iconSource;
    const low = src && src < 64 ? ` brand-lowres" style="--src:${src}px` : '';
    return `<span class="brand brand-${size}${m(p).iconTone === 'light' ? ' brand-dark' : ''}${low}"><img src="${prefix}${p.slug}/${icon}" alt="" width="96" height="96" loading="lazy" decoding="async"></span>`;
  }
  return `<span class="brand brand-${size} brand-initials" aria-hidden="true">${initials(p.title)}</span>`;
}

function thumb(p, prefix) {
  const first = shots(p).find(s => !s.mobile);
  if (first) {
    return `<a class="thumb" href="${prefix}${p.slug}/" tabindex="-1" aria-hidden="true"><img src="${prefix}${p.slug}/${first.file}" alt="" width="1280" height="800" loading="lazy" decoding="async"></a>`;
  }
  const logo = m(p).logo;
  const inner = hasFile(p.slug, logo)
    ? `<img class="thumb-logo" src="${prefix}${p.slug}/${logo}" alt="" loading="lazy" decoding="async">`
    : `<span class="thumb-initials">${initials(p.title)}</span>`;
  return `<a class="thumb thumb-brand" href="${prefix}${p.slug}/" tabindex="-1" aria-hidden="true">${inner}</a>`;
}

// root is '' on the homepage (relative links) and '/' on other pages.
function card(p, root = '') {
  const cat = catOf(p);
  const rank = rankOf(p);
  const tags = p.tech.map(t => `<li>${t}</li>`).join('');
  const live = p.url ? `<a class="out" href="${p.url}" target="_blank" rel="noopener noreferrer">${hostLabel(p)}</a>` : '';
  const band = homeBand(p);
  const parts = [band ? `Top ${fmt(band)} in ${country(homeOf(p))}` : '', rank ? `#${fmt(rank)} worldwide` : ''].filter(Boolean);
  const rankLine = parts.length ? parts.join(' &middot; ') : (p.url ? 'Not in public traffic rankings' : 'Internal tool, no public site');
  const badge = badgeOf(p);
  return `
        <article class="work" data-tags="${p.filters.join(' ')}" data-cat="${cat ? cat.slug : ''}" data-title="${attr(p.title)}" data-pop="${popOrder.get(p.slug)}">
          ${thumb(p, `${root}projects/`)}
          <div class="work-head">
            ${brand(p, `${root}projects/`)}
            <div>
              <h3><a href="${root}projects/${p.slug}/">${p.title}</a></h3>
              <p class="meta">${metaLine(p)}</p>${cat ? `
              <p class="cat"><a href="${root}industries/${cat.slug}/">${catName(cat)}</a></p>` : ''}
            </div>
          </div>${badge ? `
          <p class="badge">${badge}</p>` : ''}
          <p class="rank">${rankLine}</p>
          <p>${p.summary}</p>
          <ul class="tags">${tags}</ul>
          <div class="work-links"><a class="case-link" href="${root}projects/${p.slug}/">View project</a>${live}</div>
        </article>
`;
}

// ---- homepage cards
let index = read('public/index.html');
const start = '<!-- projects:start -->', end = '<!-- projects:end -->';
if (!index.includes(start)) throw new Error('index.html is missing the projects markers');
index = index.slice(0, index.indexOf(start) + start.length) + '\n' + projects.map(p => card(p)).join('') + '\n        ' + index.slice(index.indexOf(end));
const aStart = '<!-- articles:start -->', aEnd = '<!-- articles:end -->';
if (index.includes(aStart)) index = index.slice(0, index.indexOf(aStart) + aStart.length) + '\n' + [...articles.filter(a => a.featured), ...articles.filter(a => !a.featured && !a.series)].slice(0, 3).map(a => articleCard(a, 'articles/')).join('') + '\n        ' + index.slice(index.indexOf(aEnd));
const fill = (html, name, inner) => {
  const a = `<!-- ${name}:start -->`, z = `<!-- ${name}:end -->`;
  if (!html.includes(a)) throw new Error(`index.html is missing the ${name} markers`);
  return html.slice(0, html.indexOf(a) + a.length) + inner + html.slice(html.indexOf(z));
};
index = fill(index, 'cats', '\n' + categories.map(c => `              <option value="${c.slug}">${catName(c)} (${c.projects.length})</option>`).join('\n') + '\n              ');
index = fill(index, 'industries', '\n' + categories.map(c => `          <li><a href="industries/${c.slug}/">${catName(c)} <span>${c.projects.length}</span></a></li>`).join('\n') + '\n          ');
index = index.replace(/<dt>\d+<\/dt><dd>projects on this page<\/dd>/, `<dt>${projects.length}</dt><dd>projects on this page</dd>`);
write('public/index.html', index);

// ---- project pages
const shared = index;
const head = shared.slice(0, shared.indexOf('<title>'));
const headerHtml = shared.slice(shared.indexOf('<header class="site-header"'), shared.indexOf('</header>') + 9)
  .replace(/href="#(cases|services|work|about|faq|contact)"/g, 'href="/#$1"')
  .replace('href="#top" aria-label="REMTA Digital, back to top"', 'href="/" aria-label="REMTA Digital, home"');
const footerHtml = shared.slice(shared.indexOf('<footer>'), shared.indexOf('</footer>') + 9);
const favicon = (shared.match(/<link rel="icon" href="([^"]*)"/) || [])[1];

function page(p, i) {
  const prev = projects[(i - 1 + projects.length) % projects.length];
  const next = projects[(i + 1) % projects.length];
  const url = `${SITE}/projects/${p.slug}/`;
  const list = shots(p);
  const desktop = list.filter(s => !s.mobile);
  const mobile = list.find(s => s.mobile);
  const rec = m(p);
  const rank = rankOf(p);
  // Preview image rendered by og.mjs; falls back to a screenshot, then the homepage preview.
  const ogImage = hasFile(p.slug, 'og.jpg') ? `${SITE}/projects/${p.slug}/og.jpg` : desktop[0] ? `${SITE}/projects/${p.slug}/${desktop[0].file}` : `${SITE}/assets/img/og-home.jpg`;
  const logo = hasFile(p.slug, rec.logo) ? `<img class="project-logo" src="/projects/${p.slug}/${rec.logo}" alt="${attr(p.title)} logo">` : '';
  const live = p.url ? `<a class="btn out" href="${p.url}" target="_blank" rel="noopener noreferrer">Visit ${hostLabel(p)}</a>` : '';
  const captured = rec.capturedAt ? new Date(rec.capturedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';
  const meta = p.company ? `With <strong>${p.company}</strong> &middot; ${p.role}` : metaLine(p);

  const gallery = desktop.length ? `
  <section class="gallery-sec">
    <div class="wrap">
      <div class="shots">
        ${desktop.map((s, n) => `<figure class="frame${n === 0 ? ' frame-wide' : ''}">
          <div class="frame-bar" aria-hidden="true"><i></i><i></i><i></i><span>${hostLabel(p)}</span></div>
          <a href="/projects/${p.slug}/${s.file}" target="_blank" rel="noopener"><img src="/projects/${p.slug}/${s.file}" alt="${attr(p.title)}: ${s.label.toLowerCase()}" width="1280" height="800" ${n === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></a>
          <figcaption>${s.label}</figcaption>
        </figure>`).join('\n        ')}
      </div>
      <p class="note">Screenshots of the live store, captured ${captured}. Stores keep changing after a project, so not everything shown here is my work. Click an image to see it full size.</p>
    </div>
  </section>` : '';

  const details = p.details.length
    ? `<h2>${p.detailsTitle === 'My contribution' ? 'My contribution' : 'What I built'}</h2>
        <ul class="built">${p.details.map(d => `<li>${d}</li>`).join('')}</ul>`
    : `<h2>What I did</h2><p>${p.summary}</p>`;

  const phone = mobile ? `<figure class="phone">
          <img src="/projects/${p.slug}/${mobile.file}" alt="${attr(p.title)} on mobile" width="585" height="1266" loading="lazy" decoding="async">
          <figcaption>Mobile</figcaption>
        </figure>` : '';

  const results = p.results ? `
  <section class="results-sec">
    <div class="wrap">
      <div class="project-card">
        <h2>By the numbers</h2>
        <dl class="stats">
          ${p.results.map(r => `<div><dt>${r.value}</dt><dd>${r.label}${r.before ? `<span class="was">Before: ${r.before}</span>` : ''}</dd></div>`).join('\n          ')}
        </dl>
        ${p.resultsNote ? `<p class="note">${p.resultsNote}</p>` : ''}
      </div>
    </div>
  </section>` : '';

  const facts = [
    p.company ? `<div><dt>Company</dt><dd>${p.company}</dd></div>` : '',
    `<div><dt>My role</dt><dd>${p.role}</dd></div>`,
    p.url ? `<div><dt>Live site</dt><dd><a class="out" href="${p.url}" target="_blank" rel="noopener noreferrer">${hostLabel(p)}</a></dd></div>` : '',
    catOf(p) ? `<div><dt>Industry</dt><dd><a href="/industries/${catOf(p).slug}/">${catName(catOf(p))}</a></dd></div>` : '',
    `<div><dt>Stack</dt><dd>${p.tech.join(', ')}</dd></div>`,
  ].filter(Boolean).join('\n            ');

  // Site popularity: home market first, then other countries outside Europe, then Europe,
  // countries with the same band grouped on one row, and the worldwide rank last.
  const bands = bandsOf(p);
  const home = homeOf(p);
  const cat = categoryOf(p);
  const group = ccs => {
    const byBand = new Map();
    ccs.sort((a, b) => bands[a] - bands[b]).forEach(cc => byBand.set(bands[cc], [...(byBand.get(bands[cc]) || []), cc]));
    return [...byBand].map(([b, list]) => `<div><dt>${list.map(cc => country(cc).replace(/^the /, '')).join(', ')}</dt><dd>Top ${fmt(b)}</dd></div>`);
  };
  const europe = Object.keys(bands).filter(cc => cc !== home && EUROPE.has(cc));
  const others = Object.keys(bands).filter(cc => cc !== home && !EUROPE.has(cc));
  const counted = Object.keys(bands).filter(cc => EUROPE.has(cc)).length;
  const rows = [
    bands[home] ? `<div><dt>${country(home).replace(/^the /, '')}</dt><dd>Top ${fmt(bands[home])}</dd></div>` : '',
    ...group(others),
    counted > 1 ? `<div class="sum"><dt>Europe</dt><dd>Ranked in ${counted} countries</dd></div>` : '',
    ...group(europe),
    rank ? `<div><dt>Worldwide</dt><dd>#${fmt(rank)}</dd></div>` : '',
  ].filter(Boolean);
  const sources = [
    Object.keys(bands).length ? `Country bands: <a href="https://developer.chrome.com/docs/crux" target="_blank" rel="noopener noreferrer">Chrome UX Report</a>, ${crMonth}, counted for ${domainsOf(p).filter(d => regional.sites[d]).join(' and ')}. It ranks sites by Chrome page loads in each country and publishes bands such as top 1,000.` : '',
    rank ? `Worldwide: <a href="https://tranco-list.eu/" target="_blank" rel="noopener noreferrer">Tranco list</a>, ${trancoMonth}.` : '',
  ].filter(Boolean).join(' ');
  const reach = rows.length || cat ? `
          <div class="reach">
            <h2>Site popularity</h2>${cat ? `${cat.badge ? `
            <p class="badge">${cat.badge}</p>` : ''}
            <p class="reach-cat">${cat.text} <span>(<a href="${cat.url}" target="_blank" rel="noopener noreferrer">${cat.source}</a>, ${cat.month})</span></p>` : ''}
            <dl>
              ${rows.join('\n              ')}
            </dl>
            <p class="note">${sources}</p>
          </div>` : '';

  // "Shopify store" in the title for live stores, so searches for the brand plus Shopify find the page.
  const pageTitle = p.url && !p.kind ? `${strip(p.title)} Shopify store | Emanuel Rusu` : `${strip(p.title)} | Emanuel Rusu, Shopify developer`;
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: 'Projects', item: `${SITE}/#work` },
    { '@type': 'ListItem', position: 3, name: strip(p.title), item: url } ] };
  return `${head}<title>${pageTitle}</title>
<meta name="description" content="${attr(shareText(p))}">
<meta name="theme-color" content="#1d5e6b">
<meta property="og:title" content="${attr(pageTitle)}">
<meta property="og:description" content="${attr(shareText(p))}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${url}">
<link rel="icon" href="${favicon}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/source-sans-3-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/source-serif-4-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/style.css">
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
</head>
<body class="project-page" id="top">
<a class="skip" href="#main">Skip to content</a>

${headerHtml}

<main id="main">

  <section class="project-hero">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/#work">My work</a> <span aria-hidden="true">/</span> <span>${p.title}</span></nav>
      <div class="project-intro">
        <div class="project-card">
          <div class="project-id">
            ${brand(p, '/projects/', 'lg')}
            <p class="meta">${meta}</p>
          </div>
          <h1>${p.title}</h1>
          <p class="lead">${p.summary}</p>
          <p class="provenance">${provenance(p)}</p>
          <div class="cta-row">${live}<a class="btn btn-outline" href="/#contact">Work with me</a></div>
        </div>
        <aside class="project-facts" aria-label="Project facts">
          ${logo ? `<div class="logo-plate">${logo}</div>` : ''}
          <dl>
            ${facts}
          </dl>${reach}
        </aside>
      </div>
    </div>
  </section>
${results}${gallery}
  <section class="project-body">
    <div class="wrap${phone ? ' body-grid' : ' narrow'}">
      <div class="project-card">
        ${details}
        <ul class="tags">${p.tech.map(t => `<li>${t}</li>`).join('')}</ul>
      </div>
      ${phone}
    </div>
  </section>

  <nav class="pager wrap" aria-label="More projects">
    <a href="/projects/${prev.slug}/"><span>Previous</span>${prev.title}</a>
    <a class="all" href="/#work">All projects</a>
    <a href="/projects/${next.slug}/"><span>Next</span>${next.title}</a>
  </nav>

  <section id="contact">
    <div class="wrap narrow center">
      <h2>Want something like this for your store?</h2>
      <p class="lead">Send me a short message about your store and what you'd like to build.</p>
      <p class="cta-row center-row"><a class="btn btn-lg" href="mailto:emanuel@remtadigital.com">emanuel@remtadigital.com</a><a class="btn btn-lg btn-outline" href="/emanuel-rusu-cv.pdf" download>Download my CV</a></p>
    </div>
  </section>

</main>

${footerHtml}

<script src="/assets/main.js" defer></script>
</body>
</html>
`;
}

projects.forEach((p, i) => write(`public/projects/${p.slug}/index.html`, page(p, i)));

// ---- articles
// Google AdSense (auto ads) runs on article pages only; the portfolio and CV stay ad-free.
const ADSENSE = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2728164635897891" crossorigin="anonymous"></script>';
const pageHead = ({ title, description, url, image, type, jsonLd, ads }) => `${head}<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#1d5e6b">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="${type}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${url}">
<link rel="icon" href="${favicon}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/source-sans-3-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/source-serif-4-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="alternate" type="application/rss+xml" title="Articles by Emanuel Rusu" href="/articles/feed.xml">
<link rel="stylesheet" href="/assets/style.css">${ads ? `
${ADSENSE}` : ''}${jsonLd ? `
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
</head>`;
const contactSection = heading => `
  <section id="contact">
    <div class="wrap narrow center">
      <h2>${heading}</h2>
      <p class="lead">Send me a short message about your store and what you'd like to build.</p>
      <p class="cta-row center-row"><a class="btn btn-lg" href="mailto:emanuel@remtadigital.com">emanuel@remtadigital.com</a><a class="btn btn-lg btn-outline" href="/emanuel-rusu-cv.pdf" download>Download my CV</a></p>
    </div>
  </section>`;
const pageEnd = `
</main>

${footerHtml}

<script src="/assets/main.js" defer></script>
</body>
</html>
`;

function articlePage(a) {
  const url = `${SITE}/articles/${a.slug}/`;
  const image = existsSync(new URL(`public/articles/${a.slug}/og.jpg`, ROOT)) ? `${url}og.jpg` : `${SITE}/assets/img/og-home.jpg`;
  const p = projects.find(x => x.slug === a.project);
  const parts = seriesParts(a);
  const toc = [];
  let body = a.body.join('\n').replace(/<h2>([\s\S]*?)<\/h2>/g, (m, t) => { const id = slugify(t); toc.push([id, t]); return `<h2 id="${id}">${t}</h2>`; });
  if (a.links.length) toc.push(['further-reading', 'Further reading']);
  const tocHtml = toc.length >= 3 ? `
    <nav class="toc" aria-label="On this page">
      <p>On this page</p>
      <ol>${toc.map(([id, t]) => `<li><a href="#${id}">${strip(t)}</a></li>`).join('')}</ol>
    </nav>` : '';
  const seriesHtml = parts.length > 1 ? `
    <aside class="series" aria-label="${a.series.name}">
      <p><strong>${a.series.name}</strong> &middot; part ${a.series.part} of ${parts.length}</p>
      <ol>${parts.map(x => x === a ? `<li aria-current="page">${shortTitle(x)}</li>` : `<li><a href="/articles/${x.slug}/">${shortTitle(x)}</a></li>`).join('')}</ol>
    </aside>` : '';
  const further = a.links.length ? `
      <section class="further">
        <h2 id="further-reading">Further reading</h2>
        <ul>${a.links.map(l => `<li><a class="out" href="${l.url}" target="_blank" rel="noopener noreferrer">${l.title}</a></li>`).join('')}</ul>
      </section>` : '';
  const i = parts.indexOf(a);
  const pager = parts.length > 1 ? `
  <nav class="pager wrap" aria-label="Guide parts">
    ${i > 0 ? `<a href="/articles/${parts[i - 1].slug}/"><span>Previous part</span>${shortTitle(parts[i - 1])}</a>` : '<span></span>'}
    <a class="all" href="/articles/">All articles</a>
    ${i < parts.length - 1 ? `<a href="/articles/${parts[i + 1].slug}/"><span>Next part</span>${shortTitle(parts[i + 1])}</a>` : '<span></span>'}
  </nav>` : '';
  const others = [...articles.filter(x => x !== a && !parts.includes(x) && x.category === a.category), ...articles.filter(x => x !== a && !parts.includes(x) && x.category !== a.category)].slice(0, 3);
  const source = p ? `From my work on <a href="/projects/${p.slug}/">${p.title}</a>${p.company ? `, built as a developer at ${p.company}, which ran the project for its client` : ''}.` : '';
  return `${pageHead({
    title: `${attr(a.title)} | Emanuel Rusu`, description: attr(a.summary), url, image, type: 'article', ads: true,
    jsonLd: { '@context': 'https://schema.org', '@graph': [
      { '@type': 'BlogPosting', headline: strip(a.title), description: strip(a.summary), datePublished: a.date, dateModified: a.updated || a.date, articleSection: a.category,
        keywords: (a.tags || []).join(', '), image, mainEntityOfPage: url, inLanguage: 'en',
        author: { '@type': 'Person', '@id': `${SITE}/#person`, name: 'Emanuel Rusu', url: `${SITE}/` },
        publisher: { '@type': 'Organization', '@id': `${SITE}/#business`, name: 'REMTA Digital', logo: { '@type': 'ImageObject', url: `${SITE}/assets/img/apple-touch-icon.png` } } },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Articles', item: `${SITE}/articles/` },
        { '@type': 'ListItem', position: 3, name: strip(a.title), item: url } ] } ] },
  })}
<body class="article-page" id="top">
<a class="skip" href="#main">Skip to content</a>

${headerHtml}

<main id="main">
  <article class="article wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/articles/">Articles</a> <span aria-hidden="true">/</span> <span>${a.series ? a.series.name : p ? strip(p.title) : 'Article'}</span></nav>
    <header class="article-head">
      <p class="post-meta">${a.series ? `<span class="post-cat">Guide, part ${a.series.part}</span> &middot; ` : ''}${articleMeta(a)}</p>
      <h1>${a.title}</h1>
      <p class="lead">${a.summary}</p>
      <p class="byline"><img src="/assets/img/emanuel-rusu.jpg" alt="" width="40" height="40"> <span>Emanuel Rusu, Shopify developer</span></p>
    </header>${seriesHtml}${tocHtml}
    <div class="article-body">
      ${body}${further}
    </div>
    <div class="article-foot">
      ${source ? `<p class="provenance">${source}</p>` : ''}
      <ul class="tags">${(a.tags || []).map(t => `<li>${t}</li>`).join('')}</ul>
      ${p ? `<p><a class="case-link" href="/projects/${p.slug}/">See the project</a></p>` : ''}
    </div>
  </article>${pager}
${others.length ? `
  <section class="more-posts">
    <div class="wrap">
      <h2>More articles</h2>
      <div class="posts">${others.map(x => articleCard(x, '/articles/')).join('')}</div>
    </div>
  </section>` : ''}
${contactSection('Want something like this for your store?')}
${pageEnd}`;
}

function articlesIndex() {
  const url = `${SITE}/articles/`;
  return `${pageHead({ title: 'Shopify Guides and Project Notes | Emanuel Rusu, Shopify developer', description: 'A step-by-step guide to editing Shopify themes, and short notes from real Shopify projects: what the problem was, what I built and what changed.', url, image: `${SITE}/assets/img/og-home.jpg`, type: 'website', ads: true })}
<body class="article-page" id="top">
<a class="skip" href="#main">Skip to content</a>

${headerHtml}

<main id="main">
  <section class="articles-hero">
    <div class="wrap">
      <h1>Articles</h1>
      <p class="lead">A step-by-step guide to editing Shopify themes, and short notes from real projects. A few minutes each.</p>
      ${[...new Set(articles.filter(a => a.series).map(a => a.series.name))].map(name => `
      <h2 class="posts-title">${name}</h2>
      <p class="note">A step-by-step guide, from the theme editor to a full Git workflow.</p>
      <div class="posts">${articles.filter(a => a.series && a.series.name === name).sort((x, y) => x.series.part - y.series.part).map(a => articleCard(a, '/articles/')).join('')}</div>`).join('')}
      <h2 class="posts-title">Notes from my projects</h2>
      <p class="note">What the problem was, what I built and what changed, from stores I worked on at aiconomy AG and WebGurus.</p>
      <div class="posts">${articles.filter(a => !a.series).map(a => articleCard(a, '/articles/')).join('')}</div>
    </div>
  </section>
${contactSection('Let&rsquo;s talk about your store')}
${pageEnd}`;
}

// ---- privacy page (required by AdSense; keep it in line with what the site actually loads)
write('public/privacy/index.html', `${pageHead({ title: 'Privacy | REMTA Digital', description: 'What remtadigital.com collects: cookieless visit statistics from Cloudflare, and Google AdSense ads on article pages only.', url: `${SITE}/privacy/`, image: `${SITE}/assets/img/og-home.jpg`, type: 'website' })}
<body class="article-page" id="top">
<a class="skip" href="#main">Skip to content</a>

${headerHtml}

<main id="main">
  <article class="article wrap">
    <header class="article-head">
      <h1>Privacy</h1>
      <p class="post-meta">Last updated 12 October 2026</p>
    </header>
    <div class="article-body">
      <p>This site belongs to REMTA S.R.L. (REMTA Digital), Cluj-Napoca, Romania. For any question about your data, write to <a href="mailto:emanuel@remtadigital.com">emanuel@remtadigital.com</a>.</p>
      <h2>Visit statistics</h2>
      <p>I use Cloudflare Web Analytics to count visits and page views. It sets no cookies and does not identify you; I only see totals such as pages viewed, countries, browsers and referring sites.</p>
      <h2>Ads on article pages</h2>
      <p>The article pages show ads from Google AdSense. Google and its partners may use cookies to show and measure ads, and in the EU and UK you are asked for your consent first. You can read <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">how Google uses information from sites that use its services</a> and change your ad settings at <a href="https://myadcenter.google.com/" target="_blank" rel="noopener noreferrer">My Ad Center</a>. The homepage, project pages and CV show no ads.</p>
      <h2>Email</h2>
      <p>If you email me, I use your message only to reply and keep it as long as our conversation or project needs it.</p>
      <h2>Your rights</h2>
      <p>Under the GDPR you can ask what I hold about you, have it corrected or deleted, and complain to the Romanian data protection authority (ANSPDCP).</p>
    </div>
  </article>
${pageEnd}`);

if (articles.length) {
  articles.forEach(a => write(`public/articles/${a.slug}/index.html`, articlePage(a)));
  write('public/articles/index.html', articlesIndex());
}

// ---- industry pages: one indexable page per category, with its projects and related articles
function industryPage(c) {
  const url = `${SITE}/industries/${c.slug}/`;
  const list = c.projects.map(s => projects.find(p => p.slug === s)).filter(Boolean);
  const related = articles.filter(a => c.projects.includes(a.project));
  const crumbs = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'CollectionPage', name: c.seoTitle, description: c.intro, url, about: c.name,
      hasPart: list.map(p => ({ '@type': 'CreativeWork', name: strip(p.title), url: `${SITE}/projects/${p.slug}/` })) },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Projects', item: `${SITE}/#work` },
      { '@type': 'ListItem', position: 3, name: c.name, item: url } ] } ] };
  return `${pageHead({ title: `${c.seoTitle} | Emanuel Rusu`, description: attr(c.intro), url, image: `${SITE}/assets/img/og-home.jpg`, type: 'website', jsonLd: crumbs })}
<body class="industry-page" id="top">
<a class="skip" href="#main">Skip to content</a>

${headerHtml}

<main id="main">
  <section class="industry-hero">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/#work">My work</a> <span aria-hidden="true">/</span> <span>${catName(c)}</span></nav>
      <h1>${c.seoTitle}</h1>
      <p class="lead">${c.intro}</p>
      <p class="note">${list.length} ${list.length === 1 ? 'project' : 'projects'}. I worked on most of them as a developer at aiconomy AG or WebGurus; each project page says which parts I built myself.</p>
    </div>
  </section>
  <section class="industry-list">
    <div class="wrap">
      <div class="work-grid">${list.map(p => card(p, '/')).join('')}</div>
    </div>
  </section>${related.length ? `
  <section class="more-posts">
    <div class="wrap">
      <h2>Articles from these projects</h2>
      <div class="posts">${related.map(a => articleCard(a, '/articles/')).join('')}</div>
    </div>
  </section>` : ''}
  <section class="other-industries">
    <div class="wrap">
      <nav class="industries" aria-label="Other industries">
        <h3>Other industries</h3>
        <ul>${categories.filter(x => x !== c).map(x => `<li><a href="/industries/${x.slug}/">${catName(x)}</a></li>`).join('')}</ul>
      </nav>
    </div>
  </section>
${contactSection('Want something like this for your store?')}
${pageEnd}`;
}
categories.forEach(c => write(`public/industries/${c.slug}/index.html`, industryPage(c)));

// ---- 404 page (served by the Worker for any unknown path, with status 404)
write('public/404.html', `${pageHead({ title: 'Page not found | REMTA Digital', description: 'This page does not exist.', url: `${SITE}/404.html`, image: `${SITE}/assets/img/og-home.jpg`, type: 'website' }).replace('content="index, follow, max-image-preview:large"', 'content="noindex"')}
<body class="article-page" id="top">
<a class="skip" href="#main">Skip to content</a>

${headerHtml}

<main id="main">
  <section class="articles-hero">
    <div class="wrap narrow">
      <h1>This page does not exist</h1>
      <p class="lead">The link may be old or mistyped. Here is where most people want to go:</p>
      <ul class="plain">
        <li><a href="/">Home</a>: who I am and what I build on Shopify</li>
        <li><a href="/#work">Projects</a>: 36 stores and apps I worked on</li>
        <li><a href="/articles/">Articles</a>: the theme editing guide and notes from projects</li>
        <li><a href="mailto:emanuel@remtadigital.com">emanuel@remtadigital.com</a>: or just write to me</li>
      </ul>
    </div>
  </section>
${pageEnd}`);

// ---- RSS feed for the articles
const xml = s => strip(s).replace(/&(?![a-z]+;|#\d+;)/g, '&amp;').replace(/</g, '&lt;');
if (articles.length) write('public/articles/feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Articles by Emanuel Rusu, Shopify developer</title>
  <link>${SITE}/articles/</link>
  <atom:link href="${SITE}/articles/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Guides to editing Shopify themes and notes from real Shopify projects.</description>
  <language>en</language>
${articles.map(a => `  <item>
    <title>${xml(a.title)}</title>
    <link>${SITE}/articles/${a.slug}/</link>
    <guid>${SITE}/articles/${a.slug}/</guid>
    <pubDate>${new Date(a.date + 'T08:00:00Z').toUTCString()}</pubDate>
    <description>${xml(a.summary)}</description>
  </item>`).join('\n')}
</channel>
</rss>
`);

// ---- sitemap, with the article date or today's build date as lastmod
const today = new Date().toISOString().slice(0, 10);
const entries = [[`${SITE}/`, today], ...projects.map(p => [`${SITE}/projects/${p.slug}/`, today]),
  ...(articles.length ? [[`${SITE}/articles/`, today], ...articles.map(a => [`${SITE}/articles/${a.slug}/`, a.updated || a.date])] : []),
  ...categories.map(c => [`${SITE}/industries/${c.slug}/`, today]), [`${SITE}/privacy/`, today]];
const urls = entries.map(e => e[0]);
write('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(([u, d]) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${d}</lastmod>\n  </url>`).join('\n')}
</urlset>
`);

const withShots = projects.filter(p => shots(p).length).length;
const withIcon = projects.filter(p => hasFile(p.slug, m(p).icon)).length;
const ranked = projects.filter(rankOf).length;
const banded = projects.filter(homeBand).length;
const badged = projects.filter(badgeOf).map(p => strip(p.title));
console.log(`built ${projects.length} project pages (${withShots} with screenshots, ${withIcon} with brand icons, ${ranked} with a Tranco rank, ${banded} with a home-country band), sitemap with ${urls.length} URLs`);
console.log(`articles: ${articles.map(a => `${a.slug} (${readingTime(a)} min)`).join(', ')}`);
console.log(`badges: ${badged.join('; ') || 'none'}`);
