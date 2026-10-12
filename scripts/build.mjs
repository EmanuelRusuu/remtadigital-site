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
// alternates: { en: url, de: url } for pages that exist in both languages (hreflang, x-default is English).
const hreflang = alt => alt ? Object.entries(alt).map(([l, u]) => `\n<link rel="alternate" hreflang="${l}" href="${u}">`).join('') + `\n<link rel="alternate" hreflang="x-default" href="${alt.en}">` : '';
const pageHead = ({ title, description, url, image, type, jsonLd, ads, lang = 'en', alternates }) => `${lang === 'en' ? head : head.replace('<html lang="en">', `<html lang="${lang}">`)}<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#1d5e6b">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="${type}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">${lang === 'de' ? `
<meta property="og:locale" content="de_CH">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${url}">${hreflang(alternates)}
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
  return `${pageHead({ title: `${c.seoTitle} | Emanuel Rusu`, description: attr(c.intro), url, image: `${SITE}/assets/img/og-home.jpg`, type: 'website', jsonLd: crumbs, alternates: { en: url, de: `${SITE}/de/branchen/${c.de.slug}/` } })}
<body class="industry-page" id="top">
<a class="skip" href="#main">Skip to content</a>

${headerHtml.replace('href="/de/"', `href="/de/branchen/${c.de.slug}/"`)}

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

// ---- German pages: /de/ and /de/branchen/<slug>/, texts from data/de.json and the "de" field of each
// category. Project pages and articles stay English; links to them carry hreflang="en" and say so.
const de = readJson('data/de.json', null);
const deIndustryUrl = c => `/de/branchen/${c.de.slug}/`;
// Replace a piece of copied English markup, failing loudly if the source changed.
const must = (html, from, to) => { if (!html.includes(from)) throw new Error(`German page: "${from}" not found in index.html`); return html.split(from).join(to); };
const absAssets = html => html.replace(/(["\s,])assets\//g, '$1/assets/');
const swissCount = projects.filter(p => p.url && new URL(p.url).host.endsWith('.ch')).length;
const deText = s => s.replace(/\{projects\}/g, projects.length).replace(/\{swiss\}/g, swissCount);
const logoSvg = (headerHtml.match(/<svg class="logo-mark"[\s\S]*?<\/svg>/) || [''])[0];
const deEn = `<span class="lang-tag">${de ? de.english : ''}</span>`;

const deHeader = enHref => `<header class="site-header">
  <div class="wrap bar">
    <a class="logo" href="/de/" aria-label="REMTA Digital, Startseite">${logoSvg}<span class="logo-word"><b>REMTA</b> <span>Digital</span></span></a>
    <button class="menu-btn" aria-expanded="false" aria-controls="nav" aria-label="Menü ein- und ausblenden">
      <span></span><span></span><span></span>
    </button>
    <nav id="nav" aria-label="Hauptmenü">
      <a href="/de/#projekte">${de.nav.projects}</a>
      <a href="/de/#leistungen">${de.nav.services}</a>
      <a href="/de/#branchen">${de.nav.industries}</a>
      <a href="/de/#ueber-mich">${de.nav.about}</a>
      <a href="/de/#faq">${de.nav.faq}</a>
      <a class="nav-cv" href="/emanuel-rusu-cv.pdf" download>${de.nav.cv}</a>
      <a class="nav-cta" href="/de/#kontakt">${de.nav.contact}</a>
      <a class="nav-lang" href="${enHref}" hreflang="en" lang="en">English</a>
    </nav>
  </div>
</header>`;
const deLangNote = () => `
  <div class="wrap">
    <aside class="lang-note" aria-label="Sprache">
      <p>${de.langNote}</p>
    </aside>
  </div>`;
const deContact = heading => `
  <section id="kontakt">
    <div class="wrap narrow center">
      <h2>${heading}</h2>
      <p class="lead">${de.contact.lead}</p>
      <aside class="lang-note" aria-label="Sprache"><p>${de.langNote}</p></aside>
      <p class="cta-row center-row"><a class="btn btn-lg" href="mailto:emanuel@remtadigital.com">emanuel@remtadigital.com</a><a class="btn btn-lg btn-outline" href="/emanuel-rusu-cv.pdf" download>${de.contact.cv}</a></p>
      <p class="links"><a href="https://www.linkedin.com/in/emanuel-rusu/" target="_blank" rel="noopener noreferrer">${de.contact.linkedin}</a></p>
    </div>
  </section>`;
const dePageEnd = () => `
</main>

<footer>
  <div class="wrap foot">
    ${de.footer.map(f => `<p>${f}</p>`).join('\n    ')}
  </div>
</footer>

<script src="/assets/main.js" defer></script>
</body>
</html>
`;
const deMeta = p => p.company ? `${p.company} &middot; ${de.roles[p.role] || p.role}` : (p.role === 'Theme developer' ? 'Individuelles Theme' : 'Shopify-Projekt');
const deCard = p => `
        <article class="work">
          ${thumb(p, '/projects/').replace('href="/projects/', 'hreflang="en" href="/projects/')}
          <div class="work-head">
            ${brand(p, '/projects/')}
            <div>
              <h3><a href="/projects/${p.slug}/" hreflang="en">${p.title}</a></h3>
              <p class="meta">${deMeta(p)}</p>
            </div>
          </div>
          <ul class="tags">${p.tech.map(t => `<li>${t}</li>`).join('')}</ul>
          <div class="work-links"><a class="case-link" href="/projects/${p.slug}/" hreflang="en">${de.projectLink} ${deEn}</a>${p.url ? `<a class="out" href="${p.url}" target="_blank" rel="noopener noreferrer">${hostLabel(p)}</a>` : ''}</div>
        </article>
`;

function deHome() {
  const url = `${SITE}/de/`;
  // The avatar and the photo dialog are copied from the English homepage, so image changes apply to both.
  const avatar = must(absAssets(index.match(/<button class="avatar-btn"[\s\S]*?<\/button>/)[0]),
    'aria-label="View a larger photo of Emanuel Rusu"', 'aria-label="Grösseres Foto von Emanuel Rusu anzeigen"');
  let dialog = absAssets(index.match(/<dialog id="photo-view"[\s\S]*?<\/dialog>/)[0]);
  dialog = must(dialog, 'aria-label="Photo of Emanuel Rusu"', 'aria-label="Foto von Emanuel Rusu"');
  dialog = must(dialog, 'alt="Emanuel Rusu, Shopify developer, in a white shirt"', 'alt="Emanuel Rusu, Shopify-Entwickler, im weissen Hemd"');
  dialog = must(dialog, 'Emanuel Rusu &middot; Shopify developer, Cluj-Napoca', 'Emanuel Rusu &middot; Shopify-Entwickler, Cluj-Napoca');
  dialog = must(dialog, 'aria-label="Close photo"', 'aria-label="Foto schliessen"');
  const cover = must(absAssets(index.match(/<ul class="cover-logos"[\s\S]*?<\/ul>/)[0]), 'aria-label="Where I studied and worked"', 'aria-label="Wo ich studiert und gearbeitet habe"')
    .replace(/ title="[^"]*"/g, '');
  const quote = index.match(/<figure class="quote">[\s\S]*?<\/figure>/)[0]
    .replace('<blockquote>', '<blockquote lang="en">').replace(/<figcaption>[\s\S]*?<\/figcaption>/, `<figcaption>${de.about.quoteNote}</figcaption>`);
  const jsonLd = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: strip(de.title), description: strip(de.description), inLanguage: 'de',
      isPartOf: { '@id': `${SITE}/#website` }, about: { '@id': `${SITE}/#business` } },
    { '@type': 'ProfessionalService', '@id': `${SITE}/#business`, name: 'REMTA Digital', legalName: 'REMTA S.R.L.', url: `${SITE}/`, email: 'emanuel@remtadigital.com',
      description: 'Freelance Shopify-Entwicklung: individuelle Themes, Shopify-Apps und Functions, Checkout-Erweiterungen und Anbindungen an ERP, PIM und Suche. Arbeitssprachen Englisch und Rumänisch.',
      knowsLanguage: ['en', 'ro'], address: { '@type': 'PostalAddress', addressLocality: 'Cluj-Napoca', addressCountry: 'RO' }, founder: { '@id': `${SITE}/#person` } } ] };
  return `${pageHead({ lang: 'de', title: de.title, description: attr(de.description), url, image: `${SITE}/assets/img/og-home.jpg`, type: 'website', jsonLd, alternates: { en: `${SITE}/`, de: url } })}
<body id="top">
<a class="skip" href="#main">Zum Inhalt springen</a>

${deHeader('/')}

<main id="main">
${deLangNote()}

  <section class="intro">
    <div class="wrap">
      <div class="profile">
        <div class="profile-cover">
          ${cover}
        </div>
        <div class="profile-top">
          ${avatar}
          <div class="profile-main">
            <h1><span class="h1-name">Emanuel Rusu</span> <span class="headline">${de.hero.headline}</span></h1>
            <p class="location">${de.hero.location}</p>
            <p class="open"><span class="dot" aria-hidden="true"></span>${de.hero.open}</p>
            <div class="cta-row">
              <a class="btn" href="mailto:emanuel@remtadigital.com">${de.hero.email}</a>
              <a class="btn btn-outline" href="#projekte">${de.hero.work}</a>
              <a class="btn btn-text" href="https://www.linkedin.com/in/emanuel-rusu/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
              <a class="btn btn-text" href="/emanuel-rusu-cv.pdf" download>${de.hero.cv}</a>
            </div>
          </div>
          <dl class="profile-facts">
            ${de.hero.facts.map(([n, t]) => `<div><dt>${deText(n)}</dt><dd>${t}</dd></div>`).join('\n            ')}
          </dl>
        </div>
        <div class="profile-about">
          <div>
            ${de.hero.about.map(t => `<p>${t}</p>`).join('\n            ')}
          </div>
          <aside class="now" aria-labelledby="now-title">
            <h2 id="now-title">${de.hero.nowTitle}</h2>
            <ul>
              ${de.hero.now.map(t => `<li>${t}</li>`).join('\n              ')}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  </section>

  <section id="projekte">
    <div class="wrap">
      <div class="sec-head">
        <h2>${de.swiss.title}</h2>
        ${de.swiss.text.map(t => `<p class="note">${deText(t)}</p>`).join('\n        ')}
      </div>
      <h3 class="tools-title">${de.cases.title}</h3>
      <p class="note cases-note">${de.cases.note}</p>
      <div class="cases">${de.cases.items.map(c => `
        <article class="case">
          <p class="meta">${c.meta}</p>
          <h3>${c.title}</h3>
          <p>${c.text}</p>
          <a class="case-link" href="/projects/${c.slug}/" hreflang="en">${de.cases.link} ${deEn}</a>
        </article>`).join('')}
      </div>
    </div>
  </section>

  <section id="leistungen" class="alt">
    <div class="wrap">
      <div class="sec-head">
        <h2>${de.services.title}</h2>
      </div>
      <div class="services">${de.services.items.map(([h, t]) => `
        <div class="service">
          <h3>${h}</h3>
          <p>${t}</p>
        </div>`).join('')}
      </div>
    </div>
  </section>

  <section id="branchen">
    <div class="wrap">
      <nav class="industries industries-top" aria-labelledby="branchen-title">
        <h2 id="branchen-title">${de.industries.title}</h2>
        <p class="note">${de.industries.note}</p>
        <ul>
          ${categories.map(c => `<li><a href="${deIndustryUrl(c)}">${catName(c.de)} <span>${c.projects.length}</span></a></li>`).join('\n          ')}
        </ul>
      </nav>
      <p class="all-posts"><a class="case-link" href="/#work" hreflang="en">${deText(de.industries.all)}</a></p>
      <p class="all-posts"><a class="case-link" href="/articles/" hreflang="en">${de.articles}</a></p>
    </div>
  </section>

  <section id="ueber-mich" class="alt">
    <div class="wrap about-grid">
      <div>
        <h2>${de.about.title}</h2>
        ${de.about.text.map(t => `<p>${t}</p>`).join('\n        ')}
      </div>
      <div>
        <div class="panel">
          <h3>${de.about.timelineTitle}</h3>
          <ol class="timeline">
            ${de.about.timeline.map(([w, n, t]) => `<li><span class="when">${w}</span><strong>${n}</strong><span>${t}</span></li>`).join('\n            ')}
          </ol>
        </div>
        ${quote}
      </div>
    </div>
  </section>

  <section id="faq">
    <div class="wrap narrow">
      <div class="sec-head">
        <h2>${de.faq.title}</h2>
      </div>
      ${de.faq.items.map(([q, a]) => `<details>
        <summary>${q}</summary>
        <p>${a}</p>
      </details>`).join('\n      ')}
    </div>
  </section>
${deContact(de.contact.title)}

  ${dialog}
${dePageEnd()}`;
}

function deIndustryPage(c) {
  const url = `${SITE}${deIndustryUrl(c)}`;
  const list = c.projects.map(s => projects.find(p => p.slug === s)).filter(Boolean);
  const related = articles.filter(a => c.projects.includes(a.project));
  const jsonLd = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'CollectionPage', name: c.de.seoTitle, description: c.de.intro, url, inLanguage: 'de', about: c.de.name,
      hasPart: list.map(p => ({ '@type': 'CreativeWork', name: strip(p.title), url: `${SITE}/projects/${p.slug}/`, inLanguage: 'en' })) },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Startseite', item: `${SITE}/de/` },
      { '@type': 'ListItem', position: 2, name: de.industryPage.crumb, item: `${SITE}/de/#branchen` },
      { '@type': 'ListItem', position: 3, name: c.de.name, item: url } ] } ] };
  return `${pageHead({ lang: 'de', title: `${c.de.seoTitle} | Emanuel Rusu`, description: attr(c.de.intro), url, image: `${SITE}/assets/img/og-home.jpg`, type: 'website', jsonLd, alternates: { en: `${SITE}/industries/${c.slug}/`, de: url } })}
<body class="industry-page" id="top">
<a class="skip" href="#main">Zum Inhalt springen</a>

${deHeader(`/industries/${c.slug}/`)}

<main id="main">
${deLangNote()}
  <section class="industry-hero">
    <div class="wrap">
      <nav class="crumbs" aria-label="Brotkrumen"><a href="/de/#branchen">${de.industryPage.crumb}</a> <span aria-hidden="true">/</span> <span>${catName(c.de)}</span></nav>
      <h1>${c.de.seoTitle}</h1>
      <p class="lead">${c.de.intro}</p>
      <p class="note">${list.length} ${de.industryPage.count[list.length === 1 ? 0 : 1]}. ${de.industryPage.note}</p>
    </div>
  </section>
  <section class="industry-list">
    <div class="wrap">
      <div class="work-grid">${list.map(p => deCard(p)).join('')}</div>
    </div>
  </section>${related.length ? `
  <section class="more-posts">
    <div class="wrap">
      <h2>${de.industryPage.articles}</h2>
      <ul class="plain post-links">${related.map(a => `<li><a href="/articles/${a.slug}/" hreflang="en" lang="en">${a.title}</a></li>`).join('')}</ul>
    </div>
  </section>` : ''}
  <section class="other-industries">
    <div class="wrap">
      <nav class="industries" aria-label="${de.industryPage.others}">
        <h3>${de.industryPage.others}</h3>
        <ul>${categories.filter(x => x !== c).map(x => `<li><a href="${deIndustryUrl(x)}">${catName(x.de)}</a></li>`).join('')}</ul>
      </nav>
    </div>
  </section>
${deContact(de.industryPage.contact)}
${dePageEnd()}`;
}

if (de) {
  write('public/de/index.html', deHome());
  categories.forEach(c => write(`public/de/branchen/${c.de.slug}/index.html`, deIndustryPage(c)));
}

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
  ...categories.map(c => [`${SITE}/industries/${c.slug}/`, today]), [`${SITE}/privacy/`, today],
  ...(de ? [[`${SITE}/de/`, today], ...categories.map(c => [`${SITE}${deIndustryUrl(c)}`, today])] : [])];
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
