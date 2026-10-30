// Storefront: the page around the engine. Draws the store, runs the clock and saves the game in
// this browser's localStorage. Nothing is sent anywhere.
// The game lives in a shadow root: the page carries AdSense auto ads, and auto ads must never be
// placed inside a panel that is redrawn every game day. The how-to above and the notes below are
// plain text, so an ad next to the game stays well clear of its buttons.
import * as G from './engine.js';

const KEY = 'storefront-v1', BEST = 'storefront-best';
const SPEEDS = [0, 2000, 700, 250]; // milliseconds per game day; 0 is paused
const TABS = [['overview', 'Overview'], ['products', 'Products'], ['hub', 'Supplier hub'], ['marketing', 'Marketing'], ['emanuel', 'Hire Emanuel'], ['apps', 'Apps & plan']];
const NAMES = ['Alpine Goods', 'Lakeside Supply', 'Nordlicht', 'Rhine & Co.', 'Summit Store', 'Cosy Corner', 'Edelweiss Market', 'Little Lake Shop'];
const HOW = [
  'You start with CHF 5,000 and one product, the cheapest of 40 in the supplier hub.',
  'Add products, set prices, keep them in stock and buy ads.',
  'Hire me to improve design, speed, SEO and more. Every project changes the numbers.',
  'A day passes every two seconds. Pause whenever you like; the game saves in this browser.',
];

const host = document.getElementById('game');
const root = host.attachShadow({ mode: 'open' });
let s = null, speed = 1, acc = 0, tab = 'overview', hubFilter = 'all', dragging = false;

const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const chf = (n, dec) => `${n < 0 ? '−' : ''}CHF ${dec ? Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : G.fmt(Math.abs(n))}`;
const money = n => n >= 100 ? chf(n) : chf(n, true);
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const plural = (n, one, many) => `${G.fmt(n)} ${n === 1 ? one : many}`;
const stars = q => { const n = Math.round(q * 5); return `<span class="sf-stars" aria-label="${n} of 5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`; };
const $ = sel => root.querySelector(sel);

function store(fn) { try { return fn(); } catch (e) { return null; } }
const save = () => store(() => localStorage.setItem(KEY, JSON.stringify(s)));
const load = () => store(() => { const x = JSON.parse(localStorage.getItem(KEY)); return x && x.v === 1 && Array.isArray(x.products) ? x : null; });
const best = () => Number(store(() => localStorage.getItem(BEST))) || 0;

const ICON = {
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>',
  play: n => `<svg viewBox="0 0 ${8 + n * 8} 16" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<path d="M${2 + i * 8} 2.5v11l8-5.5z"/>`).join('')}</svg>`,
};

// ---- the frame: how-to, then top bar, tabs, panel, toasts and one dialog, then the notes.
// The inline style hides everything until game.css has loaded, which then shows the host.
root.innerHTML = `<style>:host{display:block;opacity:0}</style><link rel="stylesheet" href="/play/game.css">
<section class="sf-how" aria-labelledby="sf-how-title"><h2 id="sf-how-title">How to play</h2><ul>${HOW.map(t => `<li>${t}</li>`).join('')}</ul></section>
<div class="sf">
<div class="sf-top">
  <div class="sf-id"><p class="sf-name" id="sf-name"></p><p class="sf-date" id="sf-date"></p></div>
  <dl class="sf-kpis" id="sf-kpis"></dl>
  <div class="sf-controls">
    <div class="sf-speed" role="group" aria-label="Game speed">
      <button type="button" data-act="speed" data-speed="0" aria-label="Pause">${ICON.pause}</button>
      <button type="button" data-act="speed" data-speed="1" aria-label="Normal speed">${ICON.play(1)}</button>
      <button type="button" data-act="speed" data-speed="2" aria-label="Fast">${ICON.play(2)}</button>
      <button type="button" data-act="speed" data-speed="3" aria-label="Fastest">${ICON.play(3)}</button>
    </div>
    <button type="button" class="sf-link" data-act="menu-new">New store</button>
  </div>
</div>
<div class="sf-tabs" role="tablist" aria-label="Store sections">${TABS.map(([id, name]) => `<button type="button" role="tab" id="sf-tab-${id}" data-act="tab" data-tab="${id}">${name}<span class="sf-count"></span></button>`).join('')}</div>
<div class="sf-panel" id="sf-panel" role="tabpanel"></div>
<div class="sf-toasts" id="sf-toasts" aria-live="polite"></div>
<dialog class="sf-dialog" id="sf-dialog"></dialog>
</div>`;
const notes = document.getElementById('sf-notes');
if (notes) root.appendChild(notes.content.cloneNode(true));
const dlg = $('#sf-dialog');

// ---- top bar and tabs
function renderTop() {
  const st = G.stats(s), c = st.cal;
  $('#sf-name').textContent = s.name;
  $('#sf-date').textContent = `${c.label}, year ${c.year} · day ${G.fmt(s.day + 1)}`;
  const L = s.last;
  $('#sf-kpis').innerHTML = `
    <div class="${s.cash < 0 ? 'is-bad' : ''}"><dt>Cash</dt><dd>${chf(s.cash)}</dd></div>
    <div><dt>Net worth</dt><dd>${chf(G.netWorth(s))}</dd></div>
    <div><dt>Orders yesterday</dt><dd>${L ? G.fmt(L.orders) : '–'}</dd></div>
    <div><dt>Rating</dt><dd>${s.reviews ? `★ ${s.rating.toFixed(1)} <small>(${G.fmt(s.reviews)})</small>` : '<small>No reviews yet</small>'}</dd></div>`;
  root.querySelectorAll('[data-act="speed"]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.speed === speed)));
  const counts = { products: st.n, hub: 40 - st.n, emanuel: s.dev.length };
  root.querySelectorAll('[role="tab"]').forEach(b => {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    const n = counts[b.dataset.tab];
    b.querySelector('.sf-count').textContent = n ? ` ${n}` : '';
  });
  $('#sf-panel').setAttribute('aria-labelledby', `sf-tab-${tab}`);
}

function render() {
  if (!s) return;
  renderTop();
  const panel = $('#sf-panel');
  if (!dragging) {
    const active = root.activeElement;
    const key = active && panel.contains(active) ? active.dataset.key : null;
    panel.innerHTML = PANELS[tab]();
    if (key) { const el = panel.querySelector(`[data-key="${key}"]`); if (el) el.focus(); }
  }
  news();
}

// ---- panels
const PANELS = {
  overview() {
    const st = G.stats(s), L = s.last, tips = G.advice(s);
    const meter = (name, v, note) => `<div class="sf-meter"><div class="sf-meter-head"><span>${name}</span><strong>${Math.round(v)}</strong></div><div class="sf-bar"><i style="width:${v}%" class="${v < 35 ? 'is-low' : v < 65 ? 'is-mid' : 'is-high'}"></i></div>${note ? `<p class="sf-sub">${note}</p>` : ''}</div>`;
    const chans = L ? Object.entries(L.ch).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) : [];
    const maxCh = chans.length ? chans[0][1] : 1;
    const dev = s.dev[0];
    const P = dev && G.project(dev.id);
    const pnl = L ? [['Revenue', L.revenue], ['Cost of goods sold', -L.cogs], ['Packing and handling', -L.fulfil], ['Card fees', -L.fees], ['Refunds', -L.refunds], ['Ads', -L.ads], ['Plan and apps', -L.fixed], ['Storage', -L.holding], ['Overdraft interest', -L.interest]].filter(([, v]) => Math.abs(v) >= .5) : [];
    const f = st.parts;
    return `<div class="sf-grid">
      ${tips.length ? `<section class="sf-card sf-wide sf-tips"><h3>Advice</h3><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
      <section class="sf-card sf-wide"><h3>Yesterday</h3>${L ? `<dl class="sf-stats">
        <div><dt>Visitors</dt><dd>${G.fmt(L.visitors)}</dd></div>
        <div><dt>Conversion</dt><dd>${pct(L.conv)}</dd></div>
        <div><dt>Orders</dt><dd>${G.fmt(L.orders)}</dd></div>
        <div><dt>Revenue</dt><dd>${chf(L.revenue)}</dd></div>
        <div><dt>Profit</dt><dd class="${L.profit < 0 ? 'is-bad' : 'is-good'}">${chf(L.profit)}</dd></div>
        <div><dt>Average order</dt><dd>${L.orders ? money(L.revenue / L.orders) : '–'}</dd></div>
      </dl>${L.lost ? `<p class="sf-sub is-bad">${plural(L.lost, 'unit', 'units')} could not be sold: out of stock.</p>` : ''}` : '<p class="sf-muted">Your first day is about to start. Press play, or look around first.</p>'}</section>
      <section class="sf-card sf-wide"><h3>Revenue and profit, last 60 days</h3>${chart()}</section>
      <section class="sf-card"><h3>Store health</h3>
        ${meter('SEO', st.seo, 'How easily Google sends you visitors.')}
        ${meter('Speed', st.perf, `Pages load in about ${st.loadTime.toFixed(1)} s${st.appPerf ? `. Apps cost ${Math.round(st.appPerf)} points` : ''}.`)}
        ${meter('Design', st.design, 'A free template scores low.')}
        ${meter('Trust', st.trust, 'Reviews, rating and a professional look.')}
        <details class="sf-why"><summary>What drives conversion</summary><dl class="sf-factors">
          <div><dt>Design</dt><dd>×${f.design.toFixed(2)}</dd></div><div><dt>Speed</dt><dd>×${f.speed.toFixed(2)}</dd></div><div><dt>Trust</dt><dd>×${f.trust.toFixed(2)}</dd></div>
          <div><dt>Catalogue and search</dt><dd>×${f.catalogue.toFixed(2)}</dd></div><div><dt>Plan, apps, checkout</dt><dd>×${f.extras.toFixed(2)}</dd></div>
        </dl><p class="sf-sub">${st.catalogPenalty ? `With ${st.n} products and ${s.done.search ? 'basic' : 'no'} search, ${pct(st.catalogPenalty, 0)} of visitors give up looking. ` : ''}Cheaper products convert better than expensive ones.</p></details>
      </section>
      <section class="sf-card"><h3>Where visitors came from</h3>${chans.length ? `<ul class="sf-chans">${chans.map(([k, v]) => `<li><span>${G.CHANNEL_NAMES[k]}</span><span class="sf-bar"><i style="width:${v / maxCh * 100}%"></i></span><strong>${G.fmt(v)}</strong></li>`).join('')}</ul>${s.day < 45 ? '<p class="sf-sub">Launch buzz from friends and social posts fades over your first six weeks.</p>' : ''}` : '<p class="sf-muted">No visitors yet.</p>'}</section>
      <section class="sf-card"><h3>Yesterday's money</h3>${pnl.length ? `<dl class="sf-pnl">${pnl.map(([k, v]) => `<div><dt>${k}</dt><dd>${v < 0 ? '−' : ''}${money(Math.abs(v)).replace('CHF ', '')}</dd></div>`).join('')}<div class="sf-total"><dt>Profit</dt><dd class="${L.profit < 0 ? 'is-bad' : 'is-good'}">${chf(L.profit)}</dd></div></dl><p class="sf-sub">Stock is paid when you order it, so cash and profit move differently.</p>` : '<p class="sf-muted">Nothing yet.</p>'}</section>
      <section class="sf-card sf-wide"><h3>Emanuel</h3>${dev ? `<div class="sf-dev"><p><strong>${P.icon} ${P.name}</strong>${P.levels.length > 1 ? `, level ${dev.level}` : ''}</p><div class="sf-bar sf-progress"><i style="width:${(1 - dev.left / dev.total) * 100}%"></i></div></div><p class="sf-sub">${plural(dev.left, 'day', 'days')} to go${s.dev.length > 1 ? `, then ${s.dev.slice(1).map(j => G.project(j.id).name).join(' and ')}` : ''}.</p>` : `<p class="sf-muted">Not working on anything for you right now.</p><button type="button" class="sf-btn sf-btn-sm" data-act="tab" data-tab="emanuel">See projects</button>`}</section>
      <section class="sf-card sf-wide"><h3>Activity</h3><ul class="sf-log">${s.log.slice(0, 12).map(x => `<li class="is-${x.kind}"><span>${G.calendar(x.d).label}</span> ${esc(x.text)}</li>`).join('')}</ul></section>
      <section class="sf-card sf-wide"><h3>Milestones</h3><ul class="sf-miles">${G.milestoneList().map(([id, name]) => `<li class="${s.got[id] !== undefined ? 'is-got' : ''}">${s.got[id] !== undefined ? '🏆' : '○'} ${name}</li>`).join('')}</ul></section>
    </div>`;
  },

  products() {
    const list = s.products.filter(p => p.listed);
    if (!list.length) return `<div class="sf-card"><p>Your store has no products. Add some from the <button type="button" class="sf-link" data-act="tab" data-tab="hub">supplier hub</button>.</p></div>`;
    const removed = s.products.filter(p => !p.listed && p.everListed);
    return `<p class="sf-intro">Set prices, keep stock and choose what restocks itself. Auto-restock orders about two weeks of sales plus the supplier's delivery time whenever stock runs low.</p>
    <div class="sf-prods">${list.map(p => {
      const avg = G.avgDemand(p), coming = G.onOrder(p), next = p.incoming.length ? Math.min(...p.incoming.map(x => x.day)) - s.day : 0;
      const qty = G.restockSuggestion(s, p), margin = (p.price - p.cost) / p.price;
      const trend = p.trend > 1.15 ? '<span class="sf-trend is-up" title="Demand is rising">▲</span>' : p.trend < .85 ? '<span class="sf-trend is-down" title="Demand is falling">▼</span>' : '';
      return `<article class="sf-prod${p.stock === 0 && p.live ? ' is-out' : ''}">
        <div class="sf-prod-id"><span class="sf-emoji" aria-hidden="true">${p.emoji}</span><div><h4>${esc(p.name)} ${trend}</h4><p class="sf-sub">${G.CATEGORIES[p.cat].name} · supplier ${stars(p.quality)}</p></div></div>
        <div class="sf-prod-col"><span class="sf-label">Price</span><div class="sf-stepper"><button type="button" data-act="price" data-dir="-1" data-id="${p.id}" data-key="pd${p.id}" aria-label="Lower the price of ${esc(p.name)}">−</button><strong>${chf(p.price, true)}</strong><button type="button" data-act="price" data-dir="1" data-id="${p.id}" data-key="pu${p.id}" aria-label="Raise the price of ${esc(p.name)}">+</button></div><span class="sf-sub">Suggested ${chf(p.msrp, true)} · margin ${pct(margin, 0)}</span></div>
        <div class="sf-prod-col"><span class="sf-label">Stock</span><strong class="${p.stock === 0 && p.live ? 'is-bad' : ''}">${p.stock ? G.fmt(p.stock) : p.live ? 'Sold out' : 'First delivery on its way'}</strong><span class="sf-sub">${coming ? `${G.fmt(coming)} arriving${next > 0 ? ` in ${plural(next, 'day', 'days')}` : ''}` : 'Nothing on order'}${avg > 0 && p.stock ? ` · lasts ~${plural(Math.max(1, Math.floor(p.stock / avg)), 'day', 'days')}` : ''}</span></div>
        <div class="sf-prod-col"><span class="sf-label">Sold, 7 days</span><strong>${G.fmt(p.sold7.reduce((t, x) => t + x, 0))}</strong><span class="sf-sub">${G.fmt(p.sold)} in total</span></div>
        <div class="sf-prod-actions">
          <label class="sf-check"><input type="checkbox" data-act="auto" data-id="${p.id}" data-key="au${p.id}" ${p.auto ? 'checked' : ''}> Auto-restock</label>
          <button type="button" class="sf-btn sf-btn-sm sf-btn-outline" data-act="order" data-id="${p.id}" data-qty="${qty}" data-key="or${p.id}" ${s.cash < qty * p.cost ? 'disabled' : ''}>Order ${G.fmt(qty)} · ${chf(qty * p.cost)}</button>
          <button type="button" class="sf-link" data-act="remove" data-id="${p.id}">Remove</button>
        </div>
      </article>`;
    }).join('')}</div>
    ${removed.length ? `<p class="sf-sub">Removed products can be added back for free in the supplier hub.</p>` : ''}`;
  },

  hub() {
    const cats = Object.entries(G.CATEGORIES);
    const items = s.products.filter(p => hubFilter === 'all' || (hubFilter === 'afford' ? !p.listed && s.cash >= G.listFee(p) + p.moq * p.cost : p.cat === hubFilter));
    const chip = (id, name) => `<button type="button" class="sf-chip${hubFilter === id ? ' is-on' : ''}" data-act="filter" data-cat="${id}" aria-pressed="${hubFilter === id}">${name}</button>`;
    return `<p class="sf-intro">40 products from different suppliers, cheapest first. Adding one pays for photos and a product page, plus a first order of the supplier's minimum quantity.</p>
    <div class="sf-chips">${chip('all', 'All')}${chip('afford', 'I can afford')}${cats.map(([id, c]) => chip(id, c.name)).join('')}</div>
    <div class="sf-items">${items.map(p => {
      const cost = G.listFee(p) + p.moq * p.cost, margin = (p.msrp - p.cost) / p.msrp;
      const action = p.listed ? '<span class="sf-badge">In your store</span>'
        : p.everListed ? `<button type="button" class="sf-btn sf-btn-sm" data-act="add" data-id="${p.id}" data-key="ad${p.id}">Add back, free</button>`
          : `<button type="button" class="sf-btn sf-btn-sm" data-act="add" data-id="${p.id}" data-key="ad${p.id}" ${s.cash < cost ? 'disabled' : ''}>Add · ${chf(cost)}</button>`;
      return `<article class="sf-item${p.listed ? ' is-listed' : ''}">
        <div class="sf-item-top"><span class="sf-emoji" aria-hidden="true">${p.emoji}</span><span class="sf-tag">${G.CATEGORIES[p.cat].name}</span></div>
        <h4>${esc(p.name)}</h4>
        <p class="sf-sub">Supplier ${stars(p.quality)}${G.SEASON_NAMES[p.season] ? ` · ${G.SEASON_NAMES[p.season]}` : ''}</p>
        <dl class="sf-facts">
          <div><dt>Unit cost</dt><dd>${chf(p.cost, true)}</dd></div>
          <div><dt>Suggested price</dt><dd>${chf(p.msrp, true)}</dd></div>
          <div><dt>Margin</dt><dd>${pct(margin, 0)}</dd></div>
          <div><dt>Minimum order</dt><dd>${plural(p.moq, 'unit', 'units')}</dd></div>
          <div><dt>Delivery</dt><dd>${plural(G.leadOf(s, p), 'day', 'days')}</dd></div>
        </dl>
        ${action}
      </article>`;
    }).join('') || '<p class="sf-muted">Nothing here.</p>'}</div>`;
  },

  marketing() {
    const L = s.last, max = Math.max(1000, Math.ceil(s.ads * 2 / 100) * 100);
    const roas = L && L.ads ? L.adRev / L.ads : 0;
    const campaignWait = G.CAMPAIGN_COOLDOWN - (s.day - s.campaign.last), saleWait = G.SALE_COOLDOWN - (s.day - s.sale.last), postWait = 3 - (s.day - s.lastPost);
    const saleOn = s.sale.until >= s.day;
    return `<div class="sf-grid">
      <section class="sf-card sf-wide"><h3>Ads</h3>
        <p>Paid visitors from search and social ads. The more you spend in a day, the more each click costs, and ads stop by themselves while you are in overdraft.</p>
        <div class="sf-range"><label for="sf-ads">Daily budget</label><input type="range" id="sf-ads" min="0" max="${max}" step="10" value="${s.ads}"><output id="sf-ads-out" for="sf-ads">${chf(s.ads)} a day</output></div>
        ${L && L.ads ? `<dl class="sf-stats">
          <div><dt>Visitors from ads</dt><dd>${G.fmt(L.ch.ads)}</dd></div>
          <div><dt>Cost per click</dt><dd>${chf(L.cpc, true)}</dd></div>
          <div><dt>Sales from ads</dt><dd>${chf(L.adRev)}</dd></div>
          <div><dt>Return on ad spend</dt><dd class="${roas < 1.5 ? 'is-bad' : 'is-good'}">${roas.toFixed(1)}×</dd></div>
        </dl><p class="sf-sub">Below about 1.5× the ads lose money once product costs, fees and handling are paid.</p>` : '<p class="sf-sub">Tip: ads pay off once your store converts well. Improve design, speed and trust first.</p>'}
      </section>
      <section class="sf-card"><h3>Newsletter</h3><p>${G.fmt(s.list)} subscribers. Each sees about one email a week; a newsletter brings a burst of visitors who buy more often than others.</p>
        <button type="button" class="sf-btn" data-act="campaign" data-key="cmp" ${s.list < 50 || campaignWait > 0 ? 'disabled' : ''}>Send a newsletter</button>
        <p class="sf-sub">${s.list < 50 ? 'You need 50 subscribers. An email pop-up app collects them faster.' : campaignWait > 0 ? `Next one in ${plural(campaignWait, 'day', 'days')}.` : 'Free to send, included in your plan.'}</p></section>
      <section class="sf-card"><h3>Blog</h3><p>Helpful articles bring visitors from Google: +1.2 SEO per post, up to ${G.POST_LIMIT} posts. You have written ${s.posts}.</p>
        <button type="button" class="sf-btn" data-act="post" data-key="post" ${s.cash < G.POST_COST || postWait > 0 ? 'disabled' : ''}>Write a post · ${chf(G.POST_COST)}</button>
        <p class="sf-sub">${postWait > 0 ? `Next post in ${plural(postWait, 'day', 'days')}.` : 'One post every three days.'}</p></section>
      <section class="sf-card"><h3>Sale</h3><p>Everything is cheaper for ${G.SALE_DAYS} days: more people buy, each sale earns less. Run one for Black Friday.</p>
        <div class="sf-row">${[.1, .2, .3].map(x => `<button type="button" class="sf-btn sf-btn-outline" data-act="sale" data-pct="${x}" data-key="sale${x}" ${saleWait > 0 ? 'disabled' : ''}>${x * 100}% off</button>`).join('')}</div>
        <p class="sf-sub">${saleOn ? `A ${s.sale.pct * 100}% sale is running.` : saleWait > 0 ? `Next sale possible in ${plural(saleWait, 'day', 'days')}.` : 'Sales lose their pull if you run them too often.'}</p></section>
    </div>`;
  },

  emanuel() {
    const queue = s.dev.map((j, i) => { const P = G.project(j.id); return `<li>${P.icon} <strong>${P.name}</strong>${P.levels.length > 1 ? `, level ${j.level}` : ''} · ${i === 0 ? `${plural(j.left, 'day', 'days')} left` : `waiting, ${plural(j.total, 'day', 'days')}`}</li>`; }).join('');
    return `<section class="sf-card sf-me">
      <picture><source type="image/avif" srcset="/assets/img/emanuel-rusu-136.avif"><source type="image/webp" srcset="/assets/img/emanuel-rusu-136.webp"><img src="/assets/img/emanuel-rusu.jpg" alt="Emanuel Rusu" width="68" height="68"></picture>
      <div><h3>Hire me for your store</h3><p>I work alone, so in the game, as in real life, I take one project at a time. You can book up to three; I start the next as soon as one is finished. You pay when you book.</p>
      ${queue ? `<ol class="sf-queue">${queue}</ol>` : ''}</div>
    </section>
    <div class="sf-projects">${G.PROJECTS.map(P => {
      const ps = G.projectState(s, P), full = ps.next >= ps.max;
      const reason = full ? '' : ps.need ? `Needs the ${G.PLANS[ps.need].name} plan` : s.dev.length >= 3 ? 'Queue is full' : s.cash < ps.cost ? `You need ${chf(ps.cost)}` : '';
      const pips = Array.from({ length: ps.max }, (_, i) => `<i class="${i < ps.done ? 'is-done' : i < ps.next ? 'is-queued' : ''}"></i>`).join('');
      return `<article class="sf-project${ps.done === ps.max ? ' is-done' : ''}">
        <div class="sf-item-top"><span class="sf-emoji" aria-hidden="true">${P.icon}</span>${ps.max > 1 ? `<span class="sf-pips" aria-label="Level ${ps.done} of ${ps.max}">${pips}</span>` : ''}</div>
        <h4>${P.name}</h4>
        <p>${P.text}</p>
        <p class="sf-effect">${full ? `${ps.done === ps.max ? 'Done' : 'Booked'}${ps.max > 1 ? `: all ${ps.max} levels` : ''}.` : `${ps.max > 1 ? `Level ${ps.next + 1}: ` : ''}${P.effect[ps.next]}`}</p>
        <div class="sf-foot">${full ? '' : `<p class="sf-sub">${chf(ps.cost)} · ${plural(ps.days, 'working day', 'working days')}</p>
          <button type="button" class="sf-btn sf-btn-sm" data-act="book" data-id="${P.id}" data-key="bk${P.id}" ${reason ? 'disabled' : ''}>Book Emanuel</button>${reason ? `<p class="sf-sub">${reason}.</p>` : ''}`}
          ${P.link ? `<a class="sf-real" href="${P.link[0]}" target="_blank" rel="noopener">I did this for a real store: ${esc(P.link[1])}</a>` : ''}</div>
      </article>`;
    }).join('')}</div>`;
  },

  apps() {
    const st = G.stats(s);
    return `<h3 class="sf-h">Plan</h3>
    <div class="sf-plans">${G.PLAN_ORDER.map(id => {
      const P = G.PLANS[id], on = s.plan === id;
      return `<article class="sf-plan${on ? ' is-on' : ''}"><h4>${P.name}</h4><p class="sf-price">${chf(P.price)} <small>a month</small></p><p class="sf-sub">Card fees ${pct(P.rate)} + CHF 0.30</p><p>${P.perk}</p>
        ${on ? '<span class="sf-badge">Your plan</span>' : `<button type="button" class="sf-btn sf-btn-sm sf-btn-outline" data-act="plan" data-id="${id}" data-key="pl${id}">Switch to ${P.name}</button>`}</article>`;
    }).join('')}</div>
    <h3 class="sf-h">Apps</h3>
    <p class="sf-intro">Apps add features at once, for a monthly fee. Each one also loads scripts on every page. Your apps currently cost <strong>${Math.round(st.appPerf)}</strong> speed points${s.done.apps ? ', already reduced by Emanuel\'s theme work' : ''}.</p>
    <div class="sf-items">${Object.entries(G.APPS).filter(([id, A]) => !A.hidden || s.apps[id]).map(([id, A]) => `<article class="sf-item${s.apps[id] ? ' is-listed' : ''}">
      <div class="sf-item-top"><span class="sf-emoji" aria-hidden="true">${A.icon}</span><span class="sf-tag">${chf(A.price)} a month</span></div>
      <h4>${A.name}</h4><p>${A.text}</p><p class="sf-sub">Speed −${A.perf}</p>
      ${s.apps[id] ? `<button type="button" class="sf-btn sf-btn-sm sf-btn-outline" data-act="uninstall" data-id="${id}" data-key="un${id}">Remove</button>` : `<button type="button" class="sf-btn sf-btn-sm" data-act="install" data-id="${id}" data-key="in${id}">Install</button>`}
    </article>`).join('')}</div>`;
  },
};

function chart() {
  const h = s.history.slice(-60);
  if (h.length < 2) return '<p class="sf-muted">The chart fills in as the days pass.</p>';
  const W = 600, H = 150, max = Math.max(1, ...h.map(x => x.r)), min = Math.min(0, ...h.map(x => x.p));
  const y = v => H - 2 - (v - min) / (max - min) * (H - 4), bw = W / h.length;
  const bars = h.map((x, i) => `<rect x="${(i * bw + bw * .15).toFixed(1)}" y="${y(x.r).toFixed(1)}" width="${(bw * .7).toFixed(1)}" height="${Math.max(0, y(0) - y(x.r)).toFixed(1)}"/>`).join('');
  const line = h.map((x, i) => `${(i * bw + bw / 2).toFixed(1)},${y(x.p).toFixed(1)}`).join(' ');
  const first = G.calendar(h[0].d), last = G.calendar(h[h.length - 1].d);
  return `<div class="sf-chart"><span class="sf-axis">${chf(max)}</span>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Daily revenue and profit from ${first.label} to ${last.label}">
      <g class="sf-revenue">${bars}</g>${min < 0 ? `<line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="sf-zero"/>` : ''}
      <polyline points="${line}" class="sf-profit"/></svg>
    <div class="sf-chart-foot"><span>${first.label}</span><span class="sf-legend"><i class="sf-key-rev"></i>Revenue <i class="sf-key-pft"></i>Profit</span><span>${last.label}</span></div></div>`;
}

// ---- toasts for wins, warnings and finished projects
function news() {
  const box = $('#sf-toasts');
  for (const n of s.news.splice(0)) toast(n.text, n.kind, box);
}
function toast(text, kind = 'info', box = $('#sf-toasts')) {
  const el = document.createElement('p');
  el.className = `sf-toast is-${kind}`;
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 5000);
}

// ---- dialogs: events, the start screen and the new-store check
function showDialog(html) {
  dlg.innerHTML = html;
  if (!dlg.open) dlg.showModal();
  const first = dlg.querySelector('input, button:not([disabled])');
  if (first) first.focus();
}
function openEvent() {
  const pe = s.pending;
  if (!pe) return;
  if (pe.id === 'year') { const w = pe.data.worth; if (w > best()) store(() => localStorage.setItem(BEST, String(Math.round(w)))); }
  const short = pe.choices.some(c => c.cost && s.cash < c.cost);
  showDialog(`<div class="sf-event"><h3>${esc(pe.title)}</h3><p>${esc(pe.text)}</p>
    ${pe.id === 'year' ? `<p class="sf-sub">Your best year so far: ${chf(Math.max(best(), pe.data.worth))} net worth.</p>` : ''}
    ${pe.link ? `<p><a class="out" href="${pe.link[0]}" target="_blank" rel="noopener">${esc(pe.link[1])}</a></p>` : ''}
    <div class="sf-choices">${pe.choices.map((c, i) => `<button type="button" class="sf-btn${i ? ' sf-btn-outline' : ''}" data-act="choice" data-i="${i}" ${c.cost && s.cash < c.cost ? 'disabled' : ''}>${esc(c.label)}${c.cost ? ` · ${chf(c.cost)}` : ''}</button>`).join('')}</div>
    ${short ? `<p class="sf-sub">You have ${chf(s.cash)}.</p>` : ''}</div>`);
}
function startScreen() {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  showDialog(`<form class="sf-start" data-form="start"><h3>Open your store</h3>
    <label for="sf-store-name">Store name</label>
    <input id="sf-store-name" name="storename" maxlength="28" value="${esc(name)}" autocomplete="off" required>
    <ul class="sf-start-list">${HOW.map(t => `<li>${t}</li>`).join('')}</ul>
    <button type="submit" class="sf-btn">Open the store</button></form>`);
}
function confirmNew() {
  showDialog(`<div class="sf-event"><h3>Start a new store?</h3><p>${esc(s.name)} and everything in it will be gone.</p>
    <div class="sf-choices"><button type="button" class="sf-btn" data-act="new">Start a new store</button><button type="button" class="sf-btn sf-btn-outline" data-act="close">Keep playing</button></div></div>`);
}
dlg.addEventListener('cancel', e => { if (!s || s.pending) e.preventDefault(); });

// ---- input
const ACTIONS = {
  speed: b => { speed = +b.dataset.speed; acc = 0; },
  tab: b => { tab = b.dataset.tab; const box = $('.sf'); if (box.getBoundingClientRect().top < 0) box.scrollIntoView({ behavior: 'smooth' }); },
  filter: b => { hubFilter = b.dataset.cat; },
  add: b => G.addProduct(s, +b.dataset.id),
  remove: b => G.removeProduct(s, +b.dataset.id),
  price: b => { const p = s.products[+b.dataset.id]; G.setPrice(s, p.id, p.price + Math.sign(+b.dataset.dir) * Math.max(.1, p.msrp * .05)); },
  order: b => G.orderStock(s, +b.dataset.id, +b.dataset.qty),
  campaign: () => G.sendCampaign(s),
  post: () => G.writePost(s),
  sale: b => G.startSale(s, +b.dataset.pct),
  book: b => G.bookProject(s, b.dataset.id),
  install: b => G.installApp(s, b.dataset.id),
  uninstall: b => G.removeApp(s, b.dataset.id),
  plan: b => G.setPlan(s, b.dataset.id),
  'menu-new': () => { confirmNew(); return false; },
  close: () => { dlg.close(); },
  new: () => { dlg.close(); s = null; startScreen(); return false; },
  choice: b => {
    const pe = s.pending, i = +b.dataset.i;
    if (pe.id === 'over' || (pe.id === 'year' && i === 1)) { s = null; startScreen(); return false; }
    const err = G.resolveEvent(s, i);
    if (!err) dlg.close();
    return err;
  },
};
root.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled || b.type === 'checkbox' || !ACTIONS[b.dataset.act]) return;
  const out = ACTIONS[b.dataset.act](b);
  if (out === false || !s) return;
  if (typeof out === 'string') toast(out, 'warn');
  save();
  render();
});
root.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.act === 'auto') { G.toggleAuto(s, +t.dataset.id); save(); render(); }
  if (t.id === 'sf-ads') { dragging = false; G.setAds(s, +t.value); save(); render(); }
});
root.addEventListener('input', e => {
  if (e.target.id !== 'sf-ads') return;
  dragging = true;
  $('#sf-ads-out').textContent = `${chf(+e.target.value)} a day`;
});
root.addEventListener('submit', e => {
  if (e.target.dataset.form !== 'start') return;
  e.preventDefault();
  const name = $('#sf-store-name').value.trim().slice(0, 28) || NAMES[0];
  s = G.newGame(name);
  tab = 'overview'; speed = 1; acc = 0;
  dlg.close();
  save();
  render();
});
root.addEventListener('keydown', e => {
  const t = e.target;
  if (t.getAttribute('role') !== 'tab' || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const i = TABS.findIndex(([id]) => id === tab), next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
  tab = next; render();
  $(`#sf-tab-${next}`).focus();
});

// ---- the clock
setInterval(() => {
  if (!s || !speed || document.hidden || s.pending || dlg.open) return;
  acc += 100;
  if (acc < SPEEDS[speed]) return;
  acc = 0;
  G.simulateDay(s);
  save();
  render();
  if (s.pending) openEvent();
}, 100);

s = load();
if (s) { render(); if (s.pending) openEvent(); } else startScreen();
