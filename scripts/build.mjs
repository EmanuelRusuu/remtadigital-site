// Build the project cards on the homepage and one page per project from data/projects.json
// and data/media.json (written by capture.mjs). Output is committed; the deploy has no build step.
// Usage: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const SITE = 'https://remtadigital.com';
const read = p => readFileSync(new URL(p, ROOT), 'utf8');
const write = (p, s) => { mkdirSync(new URL(p.replace(/[^/]+$/, ''), ROOT), { recursive: true }); writeFileSync(new URL(p, ROOT), s); };

const projects = JSON.parse(read('data/projects.json'));
const media = existsSync(new URL('data/media.json', ROOT)) ? JSON.parse(read('data/media.json')) : {};

const strip = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const attr = s => strip(s).replace(/"/g, '&quot;');
const initials = t => strip(t).replace(/&amp;/g, '&').split(/[\s.\-]+/).filter(w => /^[A-Za-z0-9ÄÖÜäöü]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const hasFile = (slug, f) => f && existsSync(new URL(`public/projects/${slug}/${f}`, ROOT));
const m = p => media[p.slug] || {};
const shots = p => (m(p).shots || []).filter(s => hasFile(p.slug, s.file) && !(p.hideShots || []).includes(s.file));

function brand(p, prefix, size = 'sm') {
  const icon = m(p).icon;
  if (hasFile(p.slug, icon)) {
    return `<span class="brand brand-${size}${m(p).iconTone === 'light' ? ' brand-dark' : ''}"><img src="${prefix}${p.slug}/${icon}" alt="" width="96" height="96" loading="lazy" decoding="async"></span>`;
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

const hostLabel = p => p.urlLabel || (p.url ? new URL(p.url).host.replace(/^www\./, '') : '');

function card(p) {
  const tags = p.tech.map(t => `<li>${t}</li>`).join('');
  const live = p.url ? `<a class="out" href="${p.url}" target="_blank" rel="noopener noreferrer">${hostLabel(p)}</a>` : '';
  return `
        <article class="work reveal" data-tags="${p.filters.join(' ')}">
          ${thumb(p, 'projects/')}
          <div class="work-head">
            ${brand(p, 'projects/')}
            <div>
              <p class="meta">${p.meta}</p>
              <h3><a href="projects/${p.slug}/">${p.title}</a></h3>
            </div>
          </div>
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
write('public/index.html', index);

// ---- project pages
const shared = index;
const head = shared.slice(0, shared.indexOf('<title>'));
const headerHtml = shared.slice(shared.indexOf('<header class="site-header"'), shared.indexOf('</header>') + 9)
  .replace(/href="#(services|work|process|about|faq|contact)"/g, 'href="/#$1"')
  .replace('href="#top" aria-label="REMTA Digital, home"', 'href="/" aria-label="REMTA Digital, home"');
const footerHtml = shared.slice(shared.indexOf('<footer>'), shared.indexOf('</footer>') + 9);

function page(p, i) {
  const prev = projects[(i - 1 + projects.length) % projects.length];
  const next = projects[(i + 1) % projects.length];
  const url = `${SITE}/projects/${p.slug}/`;
  const list = shots(p);
  const desktop = list.filter(s => !s.mobile);
  const mobile = list.find(s => s.mobile);
  const rec = m(p);
  const ogImage = desktop[0] ? `${SITE}/projects/${p.slug}/${desktop[0].file}` : null;
  const logo = hasFile(p.slug, rec.logo) ? `<img class="project-logo" src="/projects/${p.slug}/${rec.logo}" alt="${attr(p.title)} logo">` : '';
  const live = p.url ? `<a class="btn" href="${p.url}" target="_blank" rel="noopener noreferrer">Visit ${hostLabel(p)} <span aria-hidden="true">&#8599;</span></a>` : '';
  const captured = rec.capturedAt ? new Date(rec.capturedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';

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
      <p class="note">Screenshots of the live store, captured ${captured}. Click an image to see it full size.</p>
    </div>
  </section>` : '';

  const details = p.details.length ? `<h2>${p.detailsTitle === 'My contribution' ? 'My contribution' : 'What was built'}</h2>
        <ul class="built">${p.details.map(d => `<li>${d}</li>`).join('')}</ul>` : `<h2>The work</h2><p>${p.summary}</p>`;

  const phone = mobile ? `<figure class="phone">
          <img src="/projects/${p.slug}/${mobile.file}" alt="${attr(p.title)} on mobile" width="585" height="1266" loading="lazy" decoding="async">
          <figcaption>Mobile</figcaption>
        </figure>` : '';

  return `${head}<title>${strip(p.title)} | REMTA Digital</title>
<meta name="description" content="${attr(p.summary)}">
<meta name="theme-color" content="#0f1115">
<meta property="og:title" content="${attr(p.title)} | REMTA Digital">
<meta property="og:description" content="${attr(p.summary)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
${ogImage ? `<meta property="og:image" content="${ogImage}">\n` : ''}<link rel="canonical" href="${url}">
<link rel="icon" href="${(shared.match(/<link rel="icon" href="([^"]*)"/) || [])[1]}">
<link rel="stylesheet" href="/assets/style.css">
</head>
<body class="project-page">
<a class="skip" href="#main">Skip to content</a>

${headerHtml}

<main id="main">

  <section class="project-hero">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/#work">Work</a> <span aria-hidden="true">/</span> <span>${p.title}</span></nav>
      <div class="project-intro">
        <div>
          <div class="project-id">
            ${brand(p, '/projects/', 'lg')}
            <p class="meta">${p.meta}</p>
          </div>
          <h1>${p.title}</h1>
          <p class="lead">${p.summary}</p>
          <div class="cta-row">${live}<a class="btn ghost" href="/#contact">Start a similar project</a></div>
        </div>
        <aside class="project-facts" aria-label="Project facts">
          ${logo ? `<div class="logo-plate">${logo}</div>` : ''}
          <dl>
            <div><dt>Role</dt><dd>${p.meta}</dd></div>
            ${p.url ? `<div><dt>Live site</dt><dd><a class="out" href="${p.url}" target="_blank" rel="noopener noreferrer">${hostLabel(p)}</a></dd></div>` : ''}
            <div><dt>Stack</dt><dd>${p.tech.join(', ')}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  </section>
${gallery}
  <section class="project-body">
    <div class="wrap${phone ? ' body-grid' : ' narrow'}">
      <div>
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

  <section id="contact" class="alt">
    <div class="wrap narrow center">
      <p class="eyebrow">Contact</p>
      <h2>Have a project in mind?</h2>
      <p class="lead">Send a short message about your store and what you want to build.</p>
      <p><a class="mail" href="mailto:emanuel@remtadigital.com">emanuel@remtadigital.com</a></p>
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
console.log(`built ${projects.length} project pages (${withShots} with screenshots, ${withIcon} with brand icons), sitemap with ${urls.length} URLs`);
