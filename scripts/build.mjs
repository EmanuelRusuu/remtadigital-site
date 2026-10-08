// Build the project cards on the homepage and one page per project from data/projects.json,
// data/media.json (written by capture.mjs) and data/popularity.json (Tranco ranks from popularity.mjs,
// country bands from regional.mjs, hand-checked category placings).
// Output is committed; the deploy has no build step.
// Usage: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const SITE = 'https://remtadigital.com';
const read = p => readFileSync(new URL(p, ROOT), 'utf8');
const readJson = (p, fallback) => existsSync(new URL(p, ROOT)) ? JSON.parse(read(p)) : fallback;
const write = (p, s) => { mkdirSync(new URL(p.replace(/[^/]+$/, ''), ROOT), { recursive: true }); writeFileSync(new URL(p, ROOT), s); };

const projects = readJson('data/projects.json', []);
const media = readJson('data/media.json', {});
const popularity = readJson('data/popularity.json', { ranks: {}, aliases: {} });

const strip = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const attr = s => strip(s).replace(/"/g, '&quot;');
const initials = t => strip(t).replace(/&amp;/g, '&').split(/[\s.\-]+/).filter(w => /^[A-Za-z0-9ÄÖÜäöü]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const hasFile = (slug, f) => f && existsSync(new URL(`public/projects/${slug}/${f}`, ROOT));
const m = p => media[p.slug] || {};
const shots = p => (m(p).shots || []).filter(s => hasFile(p.slug, s.file) && !(p.hideShots || []).includes(s.file));
const hostLabel = p => p.urlLabel || (p.url ? new URL(p.url).host.replace(/^www\./, '') : '');
const fmt = n => n.toLocaleString('en-US');

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

function card(p) {
  const rank = rankOf(p);
  const tags = p.tech.map(t => `<li>${t}</li>`).join('');
  const live = p.url ? `<a class="out" href="${p.url}" target="_blank" rel="noopener noreferrer">${hostLabel(p)}</a>` : '';
  const band = homeBand(p);
  const parts = [band ? `Top ${fmt(band)} in ${country(homeOf(p))}` : '', rank ? `#${fmt(rank)} worldwide` : ''].filter(Boolean);
  const rankLine = parts.length ? parts.join(' &middot; ') : (p.url ? 'Not in public traffic rankings' : 'Internal tool, no public site');
  const badge = badgeOf(p);
  return `
        <article class="work" data-tags="${p.filters.join(' ')}" data-title="${attr(p.title)}" data-pop="${popOrder.get(p.slug)}">
          ${thumb(p, 'projects/')}
          <div class="work-head">
            ${brand(p, 'projects/')}
            <div>
              <h3><a href="projects/${p.slug}/">${p.title}</a></h3>
              <p class="meta">${metaLine(p)}</p>
            </div>
          </div>${badge ? `
          <p class="badge">${badge}</p>` : ''}
          <p class="rank">${rankLine}</p>
          <p>${p.summary}</p>
          <ul class="tags">${tags}</ul>
          <div class="work-links"><a class="case-link" href="projects/${p.slug}/">View project</a>${live}</div>
        </article>
`;
}

// ---- homepage cards
let index = read('public/index.html');
const start = '<!-- projects:start -->', end = '<!-- projects:end -->';
if (!index.includes(start)) throw new Error('index.html is missing the projects markers');
index = index.slice(0, index.indexOf(start) + start.length) + '\n' + projects.map(card).join('') + '\n        ' + index.slice(index.indexOf(end));
index = index.replace(/<dt>\d+<\/dt><dd>projects on this page<\/dd>/, `<dt>${projects.length}</dt><dd>projects on this page</dd>`);
write('public/index.html', index);

// ---- project pages
const shared = index;
const head = shared.slice(0, shared.indexOf('<title>'));
const headerHtml = shared.slice(shared.indexOf('<header class="site-header"'), shared.indexOf('</header>') + 9)
  .replace(/href="#(services|work|about|faq|contact)"/g, 'href="/#$1"')
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

  return `${head}<title>${strip(p.title)} | Emanuel Rusu, REMTA Digital</title>
<meta name="description" content="${attr(p.summary)}">
<meta name="theme-color" content="#1d5e6b">
<meta property="og:title" content="${attr(p.title)} | Emanuel Rusu, REMTA Digital">
<meta property="og:description" content="${attr(p.summary)}">
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

// ---- sitemap
const urls = [`${SITE}/`, ...projects.map(p => `${SITE}/projects/${p.slug}/`)];
write('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>\n    <loc>${u}</loc>\n  </url>`).join('\n')}
</urlset>
`);

const withShots = projects.filter(p => shots(p).length).length;
const withIcon = projects.filter(p => hasFile(p.slug, m(p).icon)).length;
const ranked = projects.filter(rankOf).length;
const banded = projects.filter(homeBand).length;
const badged = projects.filter(badgeOf).map(p => strip(p.title));
console.log(`built ${projects.length} project pages (${withShots} with screenshots, ${withIcon} with brand icons, ${ranked} with a Tranco rank, ${banded} with a home-country band), sitemap with ${urls.length} URLs`);
console.log(`badges: ${badged.join('; ') || 'none'}`);
