// Storefront: the page around the engine. Draws the store admin, runs the clock and saves the game
// in this browser's localStorage. Nothing is sent anywhere.
// The game lives in a shadow root, so no ad (auto ads are excluded on /play/ in AdSense, but just
// in case) can ever be placed inside a panel that is redrawn every game day. The how-to above and
// the notes below are plain text, so the ad unit under the game stays well clear of its buttons.
import * as G from './engine.js';

// Version 2 counts in euros and bills Emanuel by the hour, so a version 1 store (francs, old
// project prices) cannot carry on: its save is removed and the player opens a new store.
const KEY = 'storefront-v2', BEST = 'storefront-best-v2', OLD_KEYS = ['storefront-v1', 'storefront-best'];
// [label, milliseconds per game day]. 1× is a calm three seconds a day.
const SPEEDS = [['0.5×', 6000], ['1×', 3000], ['2×', 1500], ['4×', 750], ['8×', 375]];
const NORMAL = 1, WEEK = 7;
const PAGES = { home: 'Home', orders: 'Orders', products: 'Products', hub: 'Supplier hub', customers: 'Customers', marketing: 'Marketing', analytics: 'Analytics', apps: 'Apps', emanuel: 'Hire Emanuel', settings: 'Settings' };
const NAV = ['home', 'orders', 'products', 'hub', 'customers', 'marketing', 'analytics', '', 'apps', 'emanuel', '', 'settings'];
const NAMES = ['Alpine Goods', 'Lakeside Supply', 'Nordlicht', 'Rhine & Co.', 'Summit Store', 'Cosy Corner', 'Edelweiss Market', 'Little Lake Shop'];
const HOW = [
  'You start with €5,000 and one product, the cheapest of 40 in the supplier hub.',
  'Add products, set prices, keep them in stock and buy ads.',
  `Hire me to improve design, speed, SEO and more, at €${G.RATE_MIN} to €${G.RATE_MAX} an hour. Every project changes the numbers.`,
  'At 1× a day takes three seconds. Pause, slow down or speed up to 8× whenever you like; the game saves in this browser.',
  'Keyboard: Space pauses, − and + change the speed, W skips a week.',
];
const KEYS = [['<kbd>Space</kbd>', 'Pause or carry on'], ['<kbd>−</kbd> and <kbd>+</kbd>', 'Slower or faster'], ['<kbd>1</kbd> to <kbd>5</kbd>', 'Pick a speed, from 0.5× to 8×'], ['<kbd>W</kbd>', 'Skip a week'], ['<kbd>D</kbd>', 'Skip a day']];
// Names for the sample orders on the Orders page
const FIRST = ['Anna', 'Luca', 'Mia', 'Noah', 'Lea', 'Elias', 'Sofia', 'David', 'Laura', 'Jonas', 'Elena', 'Marco', 'Nina', 'Tim', 'Sara', 'Felix', 'Julia', 'Leon', 'Chiara', 'Ben', 'Ioana', 'Andrei', 'Clara', 'Max'];
const INITIALS = 'BMKSRFHWZLGPTD';

const host = document.getElementById('game');
const root = host.attachShadow({ mode: 'open' });
let s = null, speed = NORMAL, paused = true, acc = 0, page = 'home', hubFilter = 'all', dragging = false, pressing = false, welcomeBack = false, oldSave = false;

const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const eur = (n, dec) => dec ? `${n < 0 ? '−' : ''}€${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : G.eur(n);
const money = n => Math.abs(n) >= 100 ? eur(n) : eur(n, true);
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const plural = (n, one, many) => `${G.fmt(n)} ${Math.round(n) === 1 ? one : many}`;
const stars = q => { const n = Math.round(q * 5); return `<span class="sf-stars" aria-label="${n} of 5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`; };
const secs = i => `${(SPEEDS[i][1] / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} s`;
const sumOf = (arr, k) => arr.reduce((t, x) => t + x[k], 0);
const $ = sel => root.querySelector(sel);

function store(fn) { try { return fn(); } catch (e) { return null; } }
const save = () => store(() => localStorage.setItem(KEY, JSON.stringify(s)));
const load = () => store(() => { const x = JSON.parse(localStorage.getItem(KEY)); return x && (x.v === 2 || x.v === 3) && Array.isArray(x.products) && Array.isArray(x.history) ? G.upgradeSave(x) : null; });
const best = () => Number(store(() => localStorage.getItem(BEST))) || 0;

const svg = (d, cls = '', box = '0 0 20 20') => `<svg viewBox="${box}" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${d}</svg>`;
const ICON = {
  home: svg('<path d="M3.5 9 10 3.8 16.5 9v7.2a.8.8 0 0 1-.8.8h-3.2v-4.5h-5V17H4.3a.8.8 0 0 1-.8-.8z"/>'),
  orders: svg('<path d="M3 11.5h4.2l1.3 2h3l1.3-2H17M5 4h10l2 7.5v4.7a.8.8 0 0 1-.8.8H3.8a.8.8 0 0 1-.8-.8v-4.7z"/>'),
  products: svg('<path d="M3.2 3.2h5.9l7.7 7.7a1 1 0 0 1 0 1.4l-4.5 4.5a1 1 0 0 1-1.4 0L3.2 9.1z"/><circle cx="6.6" cy="6.6" r="1.1"/>'),
  hub: svg('<path d="M3 6.5 10 3l7 3.5v7.2L10 17l-7-3.3zM3 6.5l7 3.3 7-3.3M10 9.8V17"/>'),
  customers: svg('<circle cx="10" cy="7" r="3.2"/><path d="M3.8 17c.8-3.2 3.3-5 6.2-5s5.4 1.8 6.2 5"/>'),
  marketing: svg('<path d="M3 8.3v3.4c0 .5.4.8.8.8H6l6.5 3.7V3.8L6 7.5H3.8a.8.8 0 0 0-.8.8zM15.2 7.4a3.6 3.6 0 0 1 0 5.2M6.6 12.5 8 17"/>'),
  analytics: svg('<path d="M3 17h14M5.5 14V9.5M10 14V5M14.5 14v-3.5"/>'),
  apps: svg('<rect x="3" y="3" width="5.5" height="5.5" rx="1.2"/><rect x="11.5" y="3" width="5.5" height="5.5" rx="1.2"/><rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2"/><path d="M14.25 11.5V17M11.5 14.25H17"/>'),
  emanuel: svg('<rect x="2.8" y="6" width="14.4" height="10.5" rx="1.5"/><path d="M7.4 6V4.6c0-.6.4-1 1-1h3.2c.6 0 1 .4 1 1V6M2.8 10.8h14.4"/>'),
  settings: svg('<path d="M3.5 6h6.8M14.8 6h1.7M3.5 14h1.7M9.7 14h6.8"/><circle cx="12.5" cy="6" r="2.1"/><circle cx="7.4" cy="14" r="2.1"/>'),
  store: svg('<path d="M3.2 3.5h13.6l1.2 3.8a2.4 2.4 0 0 1-4.6.9 2.4 2.4 0 0 1-4.4 0 2.4 2.4 0 0 1-4.4 0 2.4 2.4 0 0 1-4.6-.9zM4 10v6.5h12V10M8.2 16.5v-3.8h3.6v3.8"/>'),
  menu: svg('<path d="M3 5.5h14M3 10h14M3 14.5h14"/>'),
  close: svg('<path d="M5 5l10 10M15 5 5 15"/>'),
  pause: svg('<rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/>', 'is-fill', '0 0 16 16'),
  play: svg('<path d="M4 2.3v11.4c0 .6.7 1 1.2.6l8.3-5.7a.7.7 0 0 0 0-1.2L5.2 1.7c-.5-.4-1.2 0-1.2.6z"/>', 'is-fill', '0 0 16 16'),
  skip: svg('<path d="M1.5 2.5v11l7-5.5zM9 2.5v11l7-5.5z"/><rect x="16.3" y="2.5" width="2.2" height="11" rx=".6"/>', 'is-fill', '0 0 20 16'),
};

// ---- the frame: how-to, then the admin (top bar with the clock, sidebar, page), toasts and one
// dialog, then the notes. The inline style hides everything until game.css has loaded.
root.innerHTML = `<style>:host{display:block;opacity:0}</style><link rel="stylesheet" href="/play/game.css">
<section class="sf-how" aria-labelledby="sf-how-title"><h2 id="sf-how-title">How to play</h2><ul>${HOW.map(t => `<li>${t}</li>`).join('')}</ul></section>
<div class="sf">
<div class="sf-top">
  <button type="button" class="sf-burger" data-act="nav" aria-label="Menu" aria-controls="sf-side" aria-expanded="false">${ICON.menu}</button>
  <div class="sf-brand"><span class="sf-mark">${ICON.store}</span><span class="sf-store" id="sf-store"></span></div>
  <div class="sf-clock"><p class="sf-date"><strong id="sf-date"></strong> <span class="sf-pill" id="sf-pill"></span></p><p class="sf-day" id="sf-day"></p><span class="sf-dayline" aria-hidden="true"><i id="sf-fill"></i></span></div>
  <div class="sf-time" role="group" aria-label="Game speed">
    <button type="button" class="sf-play" id="sf-play" data-act="play"></button>
    <div class="sf-speeds">${SPEEDS.map(([label], i) => `<button type="button" data-act="speed" data-speed="${i}" title="${label}: a day takes ${secs(i)} (key ${i + 1})">${label}</button>`).join('')}</div>
    <div class="sf-step"><button type="button" data-act="slower" aria-label="Slower">−</button><span id="sf-speed"></span><button type="button" data-act="faster" aria-label="Faster">+</button></div>
    <button type="button" class="sf-skip" data-act="skip" aria-label="Skip a week" title="Skip a week (W)">${ICON.skip}<span>Week</span></button>
  </div>
  <dl class="sf-cash" id="sf-cash"></dl>
</div>
<div class="sf-body">
  <nav class="sf-side" id="sf-side" aria-label="Store admin"><div class="sf-side-in">
    <div class="sf-side-head"><span class="sf-mark">${ICON.store}</span><strong id="sf-store2"></strong><button type="button" class="sf-close" data-act="nav" aria-label="Close the menu">${ICON.close}</button></div>
    <ul class="sf-nav">${NAV.map(id => id ? `<li class="${id === 'hub' ? 'is-sub' : id === 'emanuel' ? 'is-hire' : ''}"><button type="button" data-act="go" data-page="${id}" data-key="nav-${id}">${id === 'hub' ? '' : ICON[id]}<span>${PAGES[id]}</span><span class="sf-count"></span></button></li>` : '<li class="sf-sep" aria-hidden="true"></li>').join('')}</ul>
  </div></nav>
  <div class="sf-scrim" data-act="nav"></div>
  <div class="sf-main" id="sf-panel" role="region"></div>
</div>
<div class="sf-toasts" id="sf-toasts" aria-live="polite"></div>
<dialog class="sf-dialog" id="sf-dialog"></dialog>
</div>`;
const notes = document.getElementById('sf-notes');
if (notes) root.appendChild(notes.content.cloneNode(true));
const dlg = $('#sf-dialog'), fill = $('#sf-fill');

// ---- top bar and sidebar
function renderTop() {
  const c = G.calendar(s.day), L = s.last;
  $('#sf-store').textContent = $('#sf-store2').textContent = s.name;
  $('#sf-date').textContent = c.label;
  $('#sf-day').textContent = `Year ${c.year} · day ${G.fmt(s.day + 1)}`;
  const pill = $('#sf-pill');
  pill.textContent = paused ? 'Paused' : `${SPEEDS[speed][0]} · ${secs(speed)} a day`;
  pill.classList.toggle('is-paused', paused);
  const play = $('#sf-play');
  play.innerHTML = paused ? ICON.play : ICON.pause;
  play.setAttribute('aria-label', paused ? 'Play' : 'Pause');
  play.title = `${paused ? 'Play' : 'Pause'} (Space)`;
  play.classList.toggle('is-paused', paused);
  root.querySelectorAll('[data-act="speed"]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.speed === speed)));
  $('#sf-speed').textContent = SPEEDS[speed][0];
  $('#sf-cash').innerHTML = `<div class="${s.cash < 0 ? 'is-bad' : ''}"><dt>Cash</dt><dd>${eur(s.cash)}</dd></div>`;
  const counts = { orders: L ? L.orders : 0, products: s.products.filter(p => p.listed).length, apps: Object.keys(s.apps).length, emanuel: s.dev.length };
  root.querySelectorAll('.sf-nav [data-page]').forEach(b => {
    const id = b.dataset.page;
    if (id === page) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    b.querySelector('.sf-count').textContent = counts[id] ? G.fmt(counts[id]) : '';
  });
}

function render() {
  if (!s) return;
  renderTop();
  const panel = $('#sf-panel');
  if (!dragging && !pressing) {
    const active = root.activeElement;
    const key = active && panel.contains(active) ? active.dataset.key : null;
    panel.innerHTML = PANELS[page]();
    panel.setAttribute('aria-label', PAGES[page]);
    if (key) { const el = panel.querySelector(`[data-key="${key}"]`); if (el) el.focus({ preventScroll: true }); }
  }
  news();
}

// ---- pieces the pages share
const head = (title, sub, actions = '') => `<div class="sf-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="sf-head-actions">${actions}</div>` : ''}</div>`;
const badge = (text, tone = '') => `<span class="sf-badge${tone ? ` is-${tone}` : ''}">${text}</span>`;
const kpi = (label, value, o = {}) => `<div class="sf-kpi${o.cls ? ` ${o.cls}` : ''}"><dt>${label}</dt><dd><span class="sf-kpi-v">${value}</span>${o.delta || ''}${o.sub ? `<span class="sf-sub">${o.sub}</span>` : ''}${o.spark ? spark(o.spark) : ''}</dd></div>`;
const delta = (now, before) => {
  if (!(before > 0)) return '';
  const d = now / before - 1;
  if (Math.abs(d) < .005) return '<span class="sf-delta">± 0% vs last week</span>';
  return `<span class="sf-delta ${d > 0 ? 'is-up' : 'is-down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(0)}% vs last week</span>`;
};
function spark(v) {
  if (v.length < 2) return '';
  const W = 100, H = 28, max = Math.max(...v), min = Math.min(0, ...v), span = max - min || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * W).toFixed(1)},${(H - 1 - (x - min) / span * (H - 2)).toFixed(1)}`).join(' ');
  return `<svg class="sf-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}
const realLinks = P => P.links ? `<p class="sf-real">${P.links.length > 1 ? 'I did this for real stores' : 'I did this for a real store'}: ${P.links.map(([href, text]) => `<a href="${href}" target="_blank" rel="noopener">${esc(text)}</a>`).join(' · ')}</p>` : '';
const conv = x => x.v ? x.o / x.v : 0;
const avgBy = (arr, f) => arr.length ? arr.reduce((t, x) => t + f(x), 0) / arr.length : 0;

// ---- pages
const PANELS = {
  home() {
    const L = s.last, h = s.history, tips = G.advice(s), month = h.slice(-30), week = h.slice(-8, -1);
    const dev = s.dev[0], P = dev && G.project(dev.id);
    const sub = L ? `How ${esc(s.name)} did on ${G.calendar(L.d).label}, and what to do next.` : `${esc(s.name)} is open for business.`;
    return `${head('Home', sub)}
    ${!L && !paused ? '<section class="sf-card sf-welcome"><h3>Day 1 is under way</h3><p>Your first visitors arrive while the line under the date fills up.</p></section>' : ''}
    ${!L && paused ? `<section class="sf-card sf-welcome"><h3>Your store is open</h3><p>Look around first: your first product is under Products, 39 more wait in the supplier hub, and you can book me under Hire Emanuel. When you are ready, start the clock. At 1× a day takes three seconds, and you can pause, slow down or speed up whenever you like.</p>
      <div class="sf-row"><button type="button" class="sf-btn" data-act="play" data-key="start">Start day 1</button><button type="button" class="sf-btn sf-btn-outline" data-act="go" data-page="hub">Open the supplier hub</button></div></section>` : ''}
    ${L && paused && welcomeBack ? `<section class="sf-card sf-welcome"><h3>Welcome back to ${esc(s.name)}</h3><p>The clock is paused where you left it. Press play, or Space, to carry on.</p><div class="sf-row"><button type="button" class="sf-btn" data-act="play" data-key="resume">Carry on</button></div></section>` : ''}
    ${L ? `<dl class="sf-kpis">
      ${kpi('Sales yesterday', eur(L.revenue), { delta: delta(L.revenue, avgBy(week, x => x.r)), spark: month.map(x => x.r) })}
      ${kpi('Orders', G.fmt(L.orders), { delta: delta(L.orders, avgBy(week, x => x.o)), spark: month.map(x => x.o) })}
      ${kpi('Visitors', G.fmt(L.visitors), { delta: delta(L.visitors, avgBy(week, x => x.v)), spark: month.map(x => x.v) })}
      ${kpi('Conversion', pct(L.conv), { delta: delta(L.conv, avgBy(week, conv)), spark: month.map(conv) })}
    </dl>` : ''}
    <div class="sf-cols">
      <div class="sf-stack">
        ${tips.length ? `<section class="sf-card sf-tips"><h3>Things to do next</h3><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
        <section class="sf-card"><h3>Revenue and profit, last 60 days</h3>${chart()}</section>
        <section class="sf-card"><h3>Activity</h3><ul class="sf-log">${s.log.slice(0, 10).map(x => `<li class="is-${x.kind}"><span>${G.calendar(x.d).label}</span> ${esc(x.text)}</li>`).join('')}</ul></section>
      </div>
      <div class="sf-stack">
        <section class="sf-card"><h3>Balance</h3><dl class="sf-list">
          <div class="${s.cash < 0 ? 'is-bad' : ''}"><dt>Cash</dt><dd>${eur(s.cash)}</dd></div>
          <div><dt>Stock, at cost</dt><dd>${eur(G.stockValue(s))}</dd></div>
          <div class="sf-total"><dt>Net worth</dt><dd>${eur(G.netWorth(s))}</dd></div>
          <div><dt>Rating</dt><dd>${s.reviews ? `★ ${s.rating.toFixed(1)} <small>(${G.fmt(s.reviews)})</small>` : '<small>No reviews yet</small>'}</dd></div>
        </dl></section>
        <section class="sf-card"><h3>Emanuel</h3>${dev ? `<p><strong>${P.icon} ${P.name}</strong>, ${P.scopes[dev.level - 1][0].toLowerCase()}</p><div class="sf-bar sf-progress"><i style="width:${(1 - dev.left / dev.total) * 100}%"></i></div><p class="sf-sub">${plural(dev.left, 'day', 'days')} to go${s.dev.length > 1 ? `, then ${s.dev.slice(1).map(j => G.project(j.id).name).join(' and ')}` : ''}.</p>`
          : `<p class="sf-muted">Not working on anything for you right now.</p><button type="button" class="sf-btn sf-btn-sm sf-btn-outline" data-act="go" data-page="emanuel">See projects</button>`}</section>
        <section class="sf-card"><h3>Milestones</h3><ul class="sf-miles">${G.milestoneList().map(([id, name]) => `<li class="${s.got[id] !== undefined ? 'is-got' : ''}">${s.got[id] !== undefined ? '🏆' : '○'} ${name}</li>`).join('')}</ul></section>
      </div>
    </div>`;
  },

  orders() {
    const L = s.last;
    if (!L) return `${head('Orders', 'Orders show up here once the first day has passed.')}<section class="sf-card"><p class="sf-muted">No orders yet. Press play to start the first day.</p></section>`;
    const rows = sampleOrders(), days = s.history.slice(-14).reverse();
    return `${head('Orders', `${plural(s.totals.orders, 'order', 'orders')} since ${esc(s.name)} opened.`)}
    <dl class="sf-kpis">
      ${kpi('Orders yesterday', G.fmt(L.orders))}
      ${kpi('Items sold', G.fmt(L.units))}
      ${kpi('Average order', L.orders ? money(L.revenue / L.orders) : '–')}
      ${kpi('Missed, sold out', G.fmt(L.lost), { cls: L.lost ? 'is-bad' : '', sub: L.lost ? 'Units people wanted but you did not have' : 'Every order could be filled' })}
    </dl>
    <section class="sf-card is-flush"><h3>Orders on ${G.calendar(L.d).label}</h3>${rows.length ? `<table class="sf-table">
      <thead><tr><th>Order</th><th class="sf-opt">Channel</th><th class="sf-opt">Items</th><th class="sf-num">Total</th><th class="sf-opt">Payment</th><th>Fulfilment</th></tr></thead>
      <tbody>${rows.map(o => `<tr><td><strong>#${o.no}</strong><span class="sf-sub">${o.who}</span></td><td class="sf-opt">${G.CHANNEL_NAMES[o.ch]}</td><td class="sf-opt">${o.qty} × ${o.p.emoji} ${esc(o.p.name)}</td><td class="sf-num">${eur(o.total, true)}</td>
        <td class="sf-opt">${o.refunded ? badge('Refunded') : badge('Paid', 'success')}</td><td>${o.refunded ? badge('Returned') : o.open ? badge('Unfulfilled', 'warning') : badge('Fulfilled', 'info')}</td></tr>`).join('')}</tbody></table>
      <p class="sf-foot-note">The latest ${plural(rows.length, 'order', 'orders')} of ${G.fmt(L.orders)} that day.</p>` : '<p class="sf-empty">Nobody ordered that day.</p>'}</section>
    <section class="sf-card is-flush"><h3>Last 14 days</h3><table class="sf-table">
      <thead><tr><th>Day</th><th class="sf-num sf-opt">Visitors</th><th class="sf-num">Orders</th><th class="sf-num sf-opt">Conversion</th><th class="sf-num">Revenue</th><th class="sf-num">Profit</th><th class="sf-num sf-opt">Sold out</th></tr></thead>
      <tbody>${days.map(x => `<tr><td>${G.calendar(x.d).label}</td><td class="sf-num sf-opt">${G.fmt(x.v)}</td><td class="sf-num">${G.fmt(x.o)}</td><td class="sf-num sf-opt">${pct(conv(x))}</td><td class="sf-num">${eur(x.r)}</td>
        <td class="sf-num ${x.p < 0 ? 'is-bad' : ''}">${eur(x.p)}</td><td class="sf-num sf-opt">${x.l ? `<span class="is-bad">${G.fmt(x.l)}</span>` : '–'}</td></tr>`).join('')}</tbody></table></section>`;
  },

  products() {
    const list = s.products.filter(p => p.listed);
    const add = `<button type="button" class="sf-btn" data-act="go" data-page="hub" data-key="addp">Add products</button>`;
    if (!list.length) return `${head('Products', 'Your store has no products.', add)}<section class="sf-card"><p class="sf-muted">Add some from the supplier hub.</p></section>`;
    const removed = s.products.some(p => !p.listed && p.everListed);
    return `${head('Products', `${plural(list.length, 'product', 'products')} in your store. Auto-restock orders about two weeks of sales plus the supplier's delivery time whenever stock runs low.`, add)}
    <section class="sf-card is-flush"><table class="sf-table sf-products">
      <thead><tr><th>Product</th><th>Status</th><th>Inventory</th><th>Price</th><th>Restock</th></tr></thead>
      <tbody>${list.map(p => {
        const avg = G.avgDemand(p), coming = G.onOrder(p), next = p.incoming.length ? Math.min(...p.incoming.map(x => x.day)) - s.day : 0;
        const qty = G.restockSuggestion(s, p), margin = (p.price - p.cost) / p.price, lasts = avg > 0 && p.stock ? Math.max(1, Math.floor(p.stock / avg)) : 0;
        const trend = p.trend > 1.15 ? '<span class="sf-trend is-up" title="Demand is rising">▲</span>' : p.trend < .85 ? '<span class="sf-trend is-down" title="Demand is falling">▼</span>' : '';
        const status = !p.live ? badge('On its way', 'info') : !p.stock ? badge('Sold out', 'critical') : lasts && lasts < G.leadOf(s, p) && !coming ? badge('Low stock', 'warning') : badge('Active', 'success');
        return `<tr class="${p.live && !p.stock ? 'is-out' : ''}">
          <td><div class="sf-prod"><span class="sf-thumb" aria-hidden="true">${p.emoji}</span><div><strong>${esc(p.name)}</strong> ${trend}<span class="sf-sub">${G.CATEGORIES[p.cat].name} · supplier ${stars(p.quality)}</span>
            <button type="button" class="sf-link sf-link-sm" data-act="remove" data-id="${p.id}">Remove</button></div></div></td>
          <td data-label="Status">${status}</td>
          <td data-label="Inventory"><strong class="${p.live && !p.stock ? 'is-bad' : ''}">${p.live ? `${G.fmt(p.stock)} in stock` : 'First delivery'}</strong><span class="sf-sub">${G.fmt(p.sold7.reduce((t, x) => t + x, 0))} sold in 7 days${lasts ? `, lasts ~${plural(lasts, 'day', 'days')}` : ''}</span><span class="sf-sub">${coming ? `${G.fmt(coming)} arriving${next > 0 ? ` in ${plural(next, 'day', 'days')}` : ''}` : 'Nothing on order'}</span></td>
          <td data-label="Price"><div class="sf-stepper"><button type="button" data-act="price" data-dir="-1" data-id="${p.id}" data-key="pd${p.id}" aria-label="Lower the price of ${esc(p.name)}">−</button><strong>${eur(p.price, true)}</strong><button type="button" data-act="price" data-dir="1" data-id="${p.id}" data-key="pu${p.id}" aria-label="Raise the price of ${esc(p.name)}">+</button></div><span class="sf-sub">Margin ${pct(margin, 0)}</span><span class="sf-sub">Suggested ${eur(p.msrp, true)}</span></td>
          <td class="sf-restock"><label class="sf-switch"><input type="checkbox" role="switch" data-act="auto" data-id="${p.id}" data-key="au${p.id}" ${p.auto ? 'checked' : ''}><span>Auto-restock</span></label>
            <button type="button" class="sf-btn sf-btn-sm sf-btn-outline" data-act="order" data-id="${p.id}" data-qty="${qty}" data-key="or${p.id}" ${s.cash < qty * p.cost ? 'disabled' : ''}>Order ${G.fmt(qty)} · ${eur(qty * p.cost)}</button></td>
        </tr>`;
      }).join('')}</tbody></table></section>
    ${removed ? '<p class="sf-sub">Removed products can be added back for free in the supplier hub.</p>' : ''}`;
  },

  hub() {
    const cats = Object.entries(G.CATEGORIES);
    const items = s.products.filter(p => hubFilter === 'all' || (hubFilter === 'afford' ? !p.listed && s.cash >= G.listFee(p) + p.moq * p.cost : p.cat === hubFilter));
    const chip = (id, name) => `<button type="button" class="sf-chip${hubFilter === id ? ' is-on' : ''}" data-act="filter" data-cat="${id}" aria-pressed="${hubFilter === id}">${name}</button>`;
    return `${head('Supplier hub', '40 products from different suppliers, cheapest first. Adding one pays for photos and a product page, plus a first order of the supplier\'s minimum quantity.')}
    <div class="sf-chips">${chip('all', 'All')}${chip('afford', 'I can afford')}${cats.map(([id, c]) => chip(id, c.name)).join('')}</div>
    <div class="sf-items">${items.map(p => {
      const cost = G.listFee(p) + p.moq * p.cost, margin = (p.msrp - p.cost) / p.msrp;
      const action = p.listed ? badge('In your store', 'success')
        : p.everListed ? `<button type="button" class="sf-btn sf-btn-sm" data-act="add" data-id="${p.id}" data-key="ad${p.id}">Add back, free</button>`
          : `<button type="button" class="sf-btn sf-btn-sm" data-act="add" data-id="${p.id}" data-key="ad${p.id}" ${s.cash < cost ? 'disabled' : ''}>Add · ${eur(cost)}</button>`;
      return `<article class="sf-item${p.listed ? ' is-listed' : ''}">
        <div class="sf-item-top"><span class="sf-thumb" aria-hidden="true">${p.emoji}</span>${badge(G.CATEGORIES[p.cat].name)}</div>
        <h4>${esc(p.name)}</h4>
        <p class="sf-sub">Supplier ${stars(p.quality)}${G.SEASON_NAMES[p.season] ? ` · ${G.SEASON_NAMES[p.season]}` : ''}</p>
        <dl class="sf-facts">
          <div><dt>Unit cost</dt><dd>${eur(p.cost, true)}</dd></div>
          <div><dt>Suggested price</dt><dd>${eur(p.msrp, true)}</dd></div>
          <div><dt>Margin</dt><dd>${pct(margin, 0)}</dd></div>
          <div><dt>Minimum order</dt><dd>${plural(p.moq, 'unit', 'units')}</dd></div>
          <div><dt>Delivery</dt><dd>${plural(G.leadOf(s, p), 'day', 'days')}</dd></div>
        </dl>
        ${action}
      </article>`;
    }).join('') || '<p class="sf-muted">Nothing here.</p>'}</div>`;
  },

  customers() {
    const L = s.last, built = id => s.done[id] ? G.project(id).scopes[s.done[id] - 1][0] : s.dev.some(j => j.id === id) ? 'Booked' : false;
    const lever = (name, how, on, go, label) => `<tr><td><strong>${name}</strong><span class="sf-sub">${how}</span></td><td>${on ? badge(on === true ? 'On' : on, 'success') : badge('Not yet')}</td>
      <td class="sf-num">${on ? '' : `<button type="button" class="sf-link" data-act="go" data-page="${go}">${label}</button>`}</td></tr>`;
    return `${head('Customers', 'People who bought before come back by themselves; subscribers come when you send a newsletter.')}
    <dl class="sf-kpis">
      ${kpi('Active customers', G.fmt(s.customers), { sub: 'Recent buyers. Some drift away every day.' })}
      ${kpi('Email subscribers', G.fmt(s.list))}
      ${kpi('Returning visitors', L ? G.fmt(L.ch.returning) : '–', { sub: 'Yesterday' })}
      ${kpi('Rating', s.reviews ? `★ ${s.rating.toFixed(1)}` : '–', { sub: s.reviews ? plural(s.reviews, 'review', 'reviews') : 'No reviews yet' })}
    </dl>
    <div class="sf-cols">
      <section class="sf-card is-flush"><h3>What brings customers back</h3><table class="sf-table"><tbody>
        ${lever('Loyalty points', 'App: +40% returning customers', !!s.apps.loyalty, 'apps', 'Apps')}
        ${lever('Wishlist', 'Project with Emanuel: up to +25% returning visitors', built('wishlist'), 'emanuel', 'Book')}
        ${lever('Customer accounts and invoices', 'Project with Emanuel: up to +15% returning visitors, +8 trust', built('accounts'), 'emanuel', 'Book')}
        ${lever('Email pop-up', 'App: five times more subscribers', !!s.apps.popup, 'apps', 'Apps')}
        ${lever('Newsletter', 'Free: a burst of visitors who buy more often', s.campaign.last >= 0 ? `Sent ${G.calendar(s.campaign.last).label}` : false, 'marketing', 'Marketing')}
      </tbody></table></section>
      <section class="sf-card"><h3>Reviews</h3>${s.reviews ? `<p class="sf-big">${s.rating.toFixed(1)} <span>${stars(s.rating / 5)}</span></p><p class="sf-sub">${plural(s.reviews, 'review', 'reviews')}${s.apps.reviews ? ', collected by your reviews app' : ''}.</p>` : '<p class="sf-muted">No reviews yet.</p>'}
        <p>Products from better suppliers (more stars in the hub) get better reviews. Sold-out products and late parcels cost stars; a custom design earns a few.</p>
        ${s.apps.reviews ? '' : '<button type="button" class="sf-btn sf-btn-sm sf-btn-outline" data-act="go" data-page="apps">Get a reviews app</button>'}</section>
    </div>`;
  },

  marketing() {
    const L = s.last, max = Math.max(1000, Math.ceil(s.ads * 2 / 100) * 100);
    const roas = L && L.ads ? L.adRev / L.ads : 0;
    const campaignWait = G.CAMPAIGN_COOLDOWN - (s.day - s.campaign.last), saleWait = G.SALE_COOLDOWN - (s.day - s.sale.last), postWait = 3 - (s.day - s.lastPost);
    const saleOn = s.sale.until >= s.day;
    return `${head('Marketing', 'Bring visitors in. Paid ones cost money every day; the others take time.')}
    <div class="sf-stack">
      <section class="sf-card"><h3>Ads ${s.ads ? badge('Running', 'success') : badge('Off')}</h3>
        <p>Paid visitors from search and social ads. The more you spend in a day, the more each click costs, and ads stop by themselves while you are in overdraft.</p>
        <div class="sf-range"><label for="sf-ads">Daily budget</label><input type="range" id="sf-ads" min="0" max="${max}" step="10" value="${s.ads}"><output id="sf-ads-out" for="sf-ads">${eur(s.ads)} a day</output></div>
        ${L && L.ads ? `<dl class="sf-stats">
          <div><dt>Visitors from ads</dt><dd>${G.fmt(L.ch.ads)}</dd></div>
          <div><dt>Cost per click</dt><dd>${eur(L.cpc, true)}</dd></div>
          <div><dt>Sales from ads</dt><dd>${eur(L.adRev)}</dd></div>
          <div><dt>Return on ad spend</dt><dd class="${roas < 1.5 ? 'is-bad' : 'is-good'}">${roas.toFixed(1)}×</dd></div>
        </dl><p class="sf-sub">Below about 1.5× the ads lose money once product costs, fees and handling are paid.</p>` : '<p class="sf-sub">Tip: ads pay off once your store converts well. Improve design, speed and trust first.</p>'}
      </section>
      <div class="sf-grid">
        <section class="sf-card"><h3>Newsletter</h3><p>${plural(s.list, 'subscriber', 'subscribers')}. Each sees about one email a week; a newsletter brings a burst of visitors who buy more often than others.</p>
          <button type="button" class="sf-btn" data-act="campaign" data-key="cmp" ${s.list < 50 || campaignWait > 0 ? 'disabled' : ''}>Send a newsletter</button>
          <p class="sf-sub">${s.list < 50 ? 'You need 50 subscribers. An email pop-up app collects them faster.' : campaignWait > 0 ? `Next one in ${plural(campaignWait, 'day', 'days')}.` : 'Free to send, included in your plan.'}</p></section>
        <section class="sf-card"><h3>Blog</h3><p>Helpful articles bring visitors from Google: +1.2 SEO per post, up to ${G.POST_LIMIT} posts. You have written ${s.posts}.</p>
          <button type="button" class="sf-btn" data-act="post" data-key="post" ${s.cash < G.POST_COST || postWait > 0 ? 'disabled' : ''}>Write a post · ${eur(G.POST_COST)}</button>
          <p class="sf-sub">${postWait > 0 ? `Next post in ${plural(postWait, 'day', 'days')}.` : 'One post every three days.'}</p></section>
        <section class="sf-card"><h3>Sale ${saleOn ? badge(`${s.sale.pct * 100}% off`, 'success') : ''}</h3><p>Everything is cheaper for ${G.SALE_DAYS} days: more people buy, each sale earns less. Run one for Black Friday.</p>
          <div class="sf-row">${[.1, .2, .3].map(x => `<button type="button" class="sf-btn sf-btn-outline" data-act="sale" data-pct="${x}" data-key="sale${x}" ${saleWait > 0 ? 'disabled' : ''}>${x * 100}% off</button>`).join('')}</div>
          <p class="sf-sub">${saleOn ? `A ${s.sale.pct * 100}% sale is running.` : saleWait > 0 ? `Next sale possible in ${plural(saleWait, 'day', 'days')}.` : 'Sales lose their pull if you run them too often.'}</p></section>
      </div>
    </div>`;
  },

  analytics() {
    const st = G.stats(s), L = s.last, month = s.history.slice(-30), f = st.parts;
    const meter = (name, v, note) => `<div class="sf-meter"><div class="sf-meter-head"><span>${name}</span><strong>${Math.round(v)}</strong></div><div class="sf-bar"><i style="width:${v}%" class="${v < 35 ? 'is-low' : v < 65 ? 'is-mid' : 'is-high'}"></i></div>${note ? `<p class="sf-sub">${note}</p>` : ''}</div>`;
    const chans = L ? Object.entries(L.ch).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) : [];
    const maxCh = chans.length ? chans[0][1] : 1;
    const pnl = L ? [['Revenue', L.revenue], ['Cost of goods sold', -L.cogs], ['Packing and handling', -L.fulfil], ['Card fees', -L.fees], ['Refunds', -L.refunds], ['Ads', -L.ads], ['Plan and apps', -L.fixed], ['Storage', -L.holding], ['Overdraft interest', -L.interest]].filter(([, v]) => Math.abs(v) >= .5) : [];
    const top = s.products.filter(p => p.listed).map(p => [p, p.sold7.reduce((t, x) => t + x, 0)]).sort((a, b) => b[1] - a[1] || b[0].revenue - a[0].revenue).slice(0, 8);
    const r = sumOf(month, 'r'), o = sumOf(month, 'o'), v = sumOf(month, 'v');
    return `${head('Analytics', month.length ? `The last ${plural(month.length, 'day', 'days')}, and what drives the numbers.` : 'Numbers show up here once the first day has passed.')}
    <dl class="sf-kpis">
      ${kpi('Revenue', eur(r), { sub: 'Last 30 days' })}
      ${kpi('Profit', eur(sumOf(month, 'p')), { sub: 'Last 30 days', cls: sumOf(month, 'p') < 0 ? 'is-bad' : '' })}
      ${kpi('Orders', G.fmt(o), { sub: o ? `Average order ${money(r / o)}` : 'Last 30 days' })}
      ${kpi('Conversion', v ? pct(o / v) : '–', { sub: `${G.fmt(v)} visitors` })}
    </dl>
    <div class="sf-stack">
      <section class="sf-card"><h3>Revenue and profit, last 60 days</h3>${chart()}</section>
      <div class="sf-grid">
        <section class="sf-card"><h3>Store health</h3>
          ${meter('SEO', st.seo, 'How easily Google sends you visitors.')}
          ${meter('Speed', st.perf, `Pages load in about ${st.loadTime.toFixed(1)} s${st.appPerf ? `. Apps cost ${Math.round(st.appPerf)} points` : ''}.`)}
          ${meter('Design', st.design, 'A free template scores low.')}
          ${meter('Trust', st.trust, 'Reviews, rating and a professional look.')}
          <details class="sf-why"><summary>What drives conversion</summary><dl class="sf-list">
            <div><dt>Design</dt><dd>×${f.design.toFixed(2)}</dd></div><div><dt>Speed</dt><dd>×${f.speed.toFixed(2)}</dd></div><div><dt>Trust</dt><dd>×${f.trust.toFixed(2)}</dd></div>
            <div><dt>Catalogue and search</dt><dd>×${f.catalogue.toFixed(2)}</dd></div><div><dt>Plan, apps, checkout</dt><dd>×${f.extras.toFixed(2)}</dd></div>
          </dl><p class="sf-sub">${st.catalogPenalty ? `With ${st.n} products and ${s.done.search ? 'basic' : 'no'} search, ${pct(st.catalogPenalty, 0)} of visitors give up looking. ` : ''}Cheaper products convert better than expensive ones.</p></details>
        </section>
        <section class="sf-card"><h3>Where visitors came from yesterday</h3>${chans.length ? `<ul class="sf-chans">${chans.map(([k, n]) => `<li><span>${G.CHANNEL_NAMES[k]}</span><span class="sf-bar"><i style="width:${n / maxCh * 100}%"></i></span><strong>${G.fmt(n)}</strong></li>`).join('')}</ul>${s.day < 45 ? '<p class="sf-sub">Launch buzz from friends and social posts fades over your first six weeks.</p>' : ''}` : '<p class="sf-muted">No visitors yet.</p>'}</section>
        <section class="sf-card"><h3>Yesterday's money</h3>${pnl.length ? `<dl class="sf-list">${pnl.map(([k, n]) => `<div><dt>${k}</dt><dd>${n < 0 ? '−' : ''}${money(Math.abs(n))}</dd></div>`).join('')}<div class="sf-total"><dt>Profit</dt><dd class="${L.profit < 0 ? 'is-bad' : 'is-good'}">${eur(L.profit)}</dd></div></dl><p class="sf-sub">Stock is paid when you order it, so cash and profit move differently.</p>` : '<p class="sf-muted">Nothing yet.</p>'}</section>
      </div>
      <section class="sf-card is-flush"><h3>Best sellers, last 7 days</h3><table class="sf-table">
        <thead><tr><th>Product</th><th class="sf-num">Sold, 7 days</th><th class="sf-num sf-opt">Revenue to date</th><th class="sf-num">Margin</th></tr></thead>
        <tbody>${top.map(([p, n]) => `<tr><td>${p.emoji} ${esc(p.name)}</td><td class="sf-num">${G.fmt(n)}</td><td class="sf-num sf-opt">${eur(p.revenue)}</td><td class="sf-num">${pct((p.price - p.cost) / p.price, 0)}</td></tr>`).join('')}</tbody></table></section>
    </div>`;
  },

  apps() {
    const st = G.stats(s);
    return `${head('Apps', `Apps add features at once, for a monthly fee. Each one also loads scripts on every page: yours currently cost <strong>${Math.round(st.appPerf)}</strong> speed points${s.done.apps ? ', already reduced by Emanuel\'s theme work' : ''}.`)}
    <div class="sf-items">${Object.entries(G.APPS).filter(([id, A]) => !A.hidden || s.apps[id]).map(([id, A]) => `<article class="sf-item${s.apps[id] ? ' is-listed' : ''}">
      <div class="sf-item-top"><span class="sf-thumb" aria-hidden="true">${A.icon}</span>${s.apps[id] ? badge('Installed', 'success') : badge(`${eur(A.price)} a month`)}</div>
      <h4>${A.name}</h4><p>${A.text}</p><p class="sf-sub">${s.apps[id] ? `${eur(A.price)} a month · ` : ''}Speed −${A.perf}</p>
      ${s.apps[id] ? `<button type="button" class="sf-btn sf-btn-sm sf-btn-outline" data-act="uninstall" data-id="${id}" data-key="un${id}">Remove</button>` : `<button type="button" class="sf-btn sf-btn-sm" data-act="install" data-id="${id}" data-key="in${id}">Install</button>`}
    </article>`).join('')}</div>`;
  },

  emanuel() {
    const queue = s.dev.map((j, i) => { const P = G.project(j.id); return `<li>${P.icon} <strong>${P.name}</strong>, ${P.scopes[j.level - 1][0].toLowerCase()} · ${i === 0 ? `${plural(j.left, 'day', 'days')} left` : `waiting, ${plural(j.total, 'day', 'days')}`}</li>`; }).join('');
    return `${head('Hire Emanuel', 'Projects take longer than apps and cost more up front, but they are built into the theme.')}
    <section class="sf-card sf-me">
      <picture><source type="image/avif" srcset="/assets/img/emanuel-rusu-136.avif"><source type="image/webp" srcset="/assets/img/emanuel-rusu-136.webp"><img src="/assets/img/emanuel-rusu.jpg" alt="Emanuel Rusu" width="68" height="68"></picture>
      <div><h3>Hire me for your store</h3><p>I bill by the hour, €${G.RATE_MIN} for routine work up to €${G.RATE_MAX} for the most complex builds, and a working day is eight hours. Every project comes in scopes: a quick fix that helps a little, or the full job that helps the most. Start small and upgrade later; you only pay for the hours that are left. You pay the quote when you book. I take one project at a time, and you can book up to three.</p>
      <dl class="sf-me-facts"><div><dt>Rate</dt><dd>€${G.RATE_MIN}–${G.RATE_MAX} an hour</dd></div><div><dt>Queue</dt><dd>${s.dev.length} of 3</dd></div><div><dt>Paid so far</dt><dd>${eur(s.spent || 0)}</dd></div></dl>
      ${queue ? `<ol class="sf-queue">${queue}</ol>` : ''}</div>
    </section>
    <div class="sf-projects">${G.PROJECTS.map(P => {
      const ps = G.projectState(s, P), working = s.dev[0] && s.dev[0].id === P.id;
      const state = ps.done === ps.max ? badge('Full scope', 'success') : working ? badge('In progress', 'info') : ps.queued ? badge('Booked', 'warning') : '';
      const pips = `<span class="sf-pips" aria-label="${ps.done} of ${ps.max} scopes done">${ps.options.map(o => `<i class="${o.state === 'done' ? 'is-done' : o.state === 'booked' ? 'is-queued' : ''}"></i>`).join('')}</span>`;
      const scope = o => {
        const reason = o.need ? `Needs the ${G.PLANS[o.need].name} plan` : s.dev.length >= 3 ? 'Queue is full' : s.cash < o.cost ? `You have ${eur(s.cash)}` : '';
        const upgrade = o.state === 'open' && o.hours < o.total;
        return `<li class="sf-scope is-${o.state}"><div class="sf-scope-main"><strong>${o.name}</strong><span class="sf-effect">${o.effect}</span>
          <span class="sf-sub">${o.state === 'done' ? 'Done' : o.state === 'booked' ? 'Booked' : `${upgrade ? 'Upgrade: ' : ''}${o.hours} hours · ${plural(o.days, 'day', 'days')}${reason ? ` · ${reason}` : ''}`}</span></div>
          <div class="sf-scope-buy">${o.state === 'open' ? `<strong>${eur(o.cost)}</strong><button type="button" class="sf-btn sf-btn-sm${o.level < ps.max ? ' sf-btn-outline' : ''}" data-act="book" data-id="${P.id}" data-level="${o.level}" data-key="bk${P.id}${o.level}" ${reason ? 'disabled' : ''} aria-label="Book ${esc(P.name)}, ${esc(o.name)}, ${eur(o.cost)}">Book</button>` : o.state === 'done' ? badge('Done', 'success') : badge('Booked', 'warning')}</div></li>`;
      };
      return `<article class="sf-project${ps.done === ps.max ? ' is-done' : ''}">
        <div class="sf-item-top"><span class="sf-thumb" aria-hidden="true">${P.icon}</span><span class="sf-row">${pips}${state}</span></div>
        <h4>${P.name}</h4>
        <p>${P.text} <span class="sf-rate">€${P.rate} an hour</span></p>
        <ul class="sf-scopes">${ps.options.map(scope).join('')}</ul>
        ${realLinks(P)}
      </article>`;
    }).join('')}</div>`;
  },

  settings() {
    return `${head('Settings', 'Your plan, your store and how the game runs.')}
    <div class="sf-stack">
      <section class="sf-card"><h3>Plan</h3><div class="sf-plans">${G.PLAN_ORDER.map(id => {
        const P = G.PLANS[id], on = s.plan === id;
        return `<article class="sf-plan${on ? ' is-on' : ''}"><div class="sf-item-top"><h4>${P.name}</h4>${on ? badge('Your plan', 'success') : ''}</div><p class="sf-price">${eur(P.price)} <small>a month</small></p><p class="sf-sub">Card fees ${pct(P.rate)} + €0.30</p><p>${P.perk}</p>
          ${on ? '' : `<button type="button" class="sf-btn sf-btn-sm sf-btn-outline" data-act="plan" data-id="${id}" data-key="pl${id}">Switch to ${P.name}</button>`}</article>`;
      }).join('')}</div></section>
      <div class="sf-grid">
        <section class="sf-card"><h3>Game speed</h3><p>At 1× a game day takes three seconds. Events pause the game until you answer them.</p>
          <div class="sf-row">${SPEEDS.map(([label], i) => `<button type="button" class="sf-chip${i === speed ? ' is-on' : ''}" data-act="speed" data-speed="${i}" data-key="sp${i}" aria-pressed="${i === speed}">${label} <small>${secs(i)}</small></button>`).join('')}</div>
          <h4 class="sf-h4">Keyboard</h4><dl class="sf-list sf-keys">${KEYS.map(([k, what]) => `<div><dt>${k}</dt><dd>${what}</dd></div>`).join('')}</dl></section>
        <section class="sf-card"><h3>Store details</h3><dl class="sf-list">
          <div><dt>Store name</dt><dd>${esc(s.name)}</dd></div>
          <div><dt>Open for</dt><dd>${plural(s.day, 'day', 'days')}</dd></div>
          <div><dt>Currency</dt><dd>Euro (€)</dd></div>
          <div><dt>Best year so far</dt><dd>${best() ? `${eur(best())} net worth` : '–'}</dd></div>
        </dl><p class="sf-sub">The store is saved in this browser only.</p>
          <button type="button" class="sf-btn sf-btn-danger" data-act="menu-new">Close this store and start again</button></section>
      </div>
    </div>`;
  },
};

// A handful of yesterday's orders, made up from what really sold that day. The same day always
// shows the same orders, so a redraw does not shuffle them.
const noise = (a, b) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0x27d4eb2f, 0xc2b2ae35); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
function sampleOrders() {
  const L = s.last, sold = (L.sold || []).filter(x => s.products[x[0]]);
  const chans = Object.entries(L.ch).filter(([, v]) => v > 0);
  const n = Math.min(8, L.orders);
  if (!n || !sold.length || !chans.length) return [];
  const weighted = (list, r) => { let left = r * list.reduce((t, x) => t + x[1], 0); for (const x of list) if ((left -= x[1]) <= 0) return x[0]; return list[list.length - 1][0]; };
  const extra = G.stats(s).items - 1;
  return Array.from({ length: n }, (_, k) => {
    const r = i => noise(L.d * 131 + k, i), p = s.products[weighted(sold, r(1))], qty = r(2) < extra ? 2 : 1;
    return { no: 1000 + s.totals.orders - k, who: `${FIRST[Math.floor(r(3) * FIRST.length)]} ${INITIALS[Math.floor(r(4) * INITIALS.length)]}.`, p, qty, ch: weighted(chans, r(5)),
      total: qty * p.price * (1 - (L.sale || 0)), refunded: r(6) < p.ret * .6, open: k < Math.max(1, Math.round(n / 4)) };
  });
}

function chart() {
  const h = s.history.slice(-60);
  if (h.length < 2) return '<p class="sf-muted">The chart fills in as the days pass.</p>';
  const W = 600, H = 150, max = Math.max(1, ...h.map(x => x.r)), min = Math.min(0, ...h.map(x => x.p));
  const y = v => H - 2 - (v - min) / (max - min) * (H - 4), bw = W / h.length;
  const bars = h.map((x, i) => `<rect x="${(i * bw + bw * .15).toFixed(1)}" y="${y(x.r).toFixed(1)}" width="${(bw * .7).toFixed(1)}" height="${Math.max(0, y(0) - y(x.r)).toFixed(1)}"/>`).join('');
  const line = h.map((x, i) => `${(i * bw + bw / 2).toFixed(1)},${y(x.p).toFixed(1)}`).join(' ');
  const first = G.calendar(h[0].d), last = G.calendar(h[h.length - 1].d);
  return `<div class="sf-chart"><span class="sf-axis">${eur(max)}</span>
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
  while (box.children.length > (innerWidth < 640 ? 2 : 3)) box.firstChild.remove();
  setTimeout(() => el.remove(), 4500);
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
    ${pe.id === 'year' ? `<p class="sf-sub">Your best year so far: ${eur(Math.max(best(), pe.data.worth))} net worth.</p>` : ''}
    ${pe.link ? `<p><a class="out" href="${pe.link[0]}" target="_blank" rel="noopener">${esc(pe.link[1])}</a></p>` : ''}
    <div class="sf-choices">${pe.choices.map((c, i) => `<button type="button" class="sf-btn${i ? ' sf-btn-outline' : ''}" data-act="choice" data-i="${i}" ${c.cost && s.cash < c.cost ? 'disabled' : ''}>${esc(c.label)}${c.cost ? ` · ${eur(c.cost)}` : ''}</button>`).join('')}</div>
    ${short ? `<p class="sf-sub">You have ${eur(s.cash)}.</p>` : ''}</div>`);
}
function startScreen() {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  showDialog(`<form class="sf-start" data-form="start"><h3>Open your store</h3>
    ${oldSave ? '<p class="sf-note">Storefront now counts in euros and I bill projects by the hour, so stores from the earlier version could not carry on. Open a new one; it saves in this browser as before.</p>' : ''}
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

// ---- the clock. A day passes every SPEEDS[speed][1] ms while the game runs; the thin line under
// the date shows how far the current day has got.
const running = () => s && !paused && !s.pending && !s.over && !dlg.open && !document.hidden;
function setSpeed(i) {
  const next = Math.max(0, Math.min(SPEEDS.length - 1, i));
  acc = acc / SPEEDS[speed][1] * SPEEDS[next][1];
  speed = next;
}
function play(on) { paused = !on; if (on) welcomeBack = false; }
// Days pass at once (skip a week); stops early when an event needs an answer.
function skip(days) {
  for (let i = 0; i < days && !s.pending && !s.over; i++) G.simulateDay(s);
  acc = 0;
}
function nextDay() {
  G.simulateDay(s);
  save();
  render();
  if (s.pending) openEvent();
}
let then = performance.now();
function frame(now) {
  const dt = Math.min(250, now - then);
  then = now;
  if (running()) {
    acc += dt;
    if (acc >= SPEEDS[speed][1]) { acc = 0; nextDay(); }
  }
  fill.style.transform = `scaleX(${s ? Math.min(1, acc / SPEEDS[speed][1]).toFixed(3) : 0})`;
  requestAnimationFrame(frame);
}

// ---- the sidebar: a column on wide screens, a drawer behind the menu button on phones
function setNav(open) {
  $('.sf').classList.toggle('is-nav', open);
  $('.sf-burger').setAttribute('aria-expanded', String(open));
  if (open) { const b = $('.sf-nav [aria-current="page"]') || $('.sf-nav button'); b.focus(); }
}
const navOpen = () => $('.sf').classList.contains('is-nav');
function go(id) {
  page = id;
  if (navOpen()) { setNav(false); $('.sf-burger').focus(); }
  const box = $('.sf');
  if (box.getBoundingClientRect().top < 0) box.scrollIntoView({ behavior: 'smooth' });
}

// ---- input
const ACTIONS = {
  play: () => play(paused),
  speed: b => { setSpeed(+b.dataset.speed); play(true); },
  slower: () => setSpeed(speed - 1),
  faster: () => setSpeed(speed + 1),
  skip: () => skip(WEEK),
  day: () => skip(1),
  nav: () => { setNav(!navOpen()); return false; },
  go: b => go(b.dataset.page),
  filter: b => { hubFilter = b.dataset.cat; },
  add: b => G.addProduct(s, +b.dataset.id),
  remove: b => G.removeProduct(s, +b.dataset.id),
  price: b => { const p = s.products[+b.dataset.id]; G.setPrice(s, p.id, p.price + Math.sign(+b.dataset.dir) * Math.max(.1, p.msrp * .05)); },
  order: b => G.orderStock(s, +b.dataset.id, +b.dataset.qty),
  campaign: () => G.sendCampaign(s),
  post: () => G.writePost(s),
  sale: b => G.startSale(s, +b.dataset.pct),
  book: b => G.bookProject(s, b.dataset.id, +b.dataset.level),
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
function act(name, b) {
  const out = ACTIONS[name](b);
  if (out === false || !s) return;
  if (typeof out === 'string') toast(out, 'warn');
  save();
  render();
  if (s.pending && !dlg.open) openEvent();
}
root.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled || b.type === 'checkbox' || !ACTIONS[b.dataset.act]) return;
  act(b.dataset.act, b);
});
root.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.act === 'auto') { G.toggleAuto(s, +t.dataset.id); save(); render(); }
  if (t.id === 'sf-ads') { dragging = false; G.setAds(s, +t.value); save(); render(); }
});
root.addEventListener('input', e => {
  if (e.target.id !== 'sf-ads') return;
  dragging = true;
  $('#sf-ads-out').textContent = `${eur(+e.target.value)} a day`;
});
// A click that lands while the page is being redrawn would be lost, so the page waits for it.
$('#sf-panel').addEventListener('pointerdown', () => { pressing = true; });
addEventListener('pointerup', () => { pressing = false; });
addEventListener('pointercancel', () => { pressing = false; });
root.addEventListener('submit', e => {
  if (e.target.dataset.form !== 'start') return;
  e.preventDefault();
  const name = $('#sf-store-name').value.trim().slice(0, 28) || NAMES[0];
  s = G.newGame(name);
  page = 'home'; speed = NORMAL; acc = 0; paused = true; welcomeBack = false; oldSave = false;
  dlg.close();
  save();
  render();
});
// Keyboard shortcuts work while the game is on screen, but never while typing, and Space is left
// to a focused button or link.
document.addEventListener('keydown', e => {
  if (!s || dlg.open || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.composedPath()[0];
  if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'Escape' && navOpen()) { setNav(false); $('.sf-burger').focus(); return; }
  const r = host.getBoundingClientRect();
  if (r.bottom < 120 || r.top > innerHeight - 120) return;
  const k = e.key.toLowerCase();
  let name = null;
  if (k === ' ' || k === 'k' || k === 'p') { if (k === ' ' && t instanceof Element && t.closest('button, a, summary, label')) return; name = 'play'; }
  else if (k === '+' || k === '=' || k === ']') name = 'faster';
  else if (k === '-' || k === '_' || k === '[') name = 'slower';
  else if (k >= '1' && k <= String(SPEEDS.length)) name = 'speed';
  else if (k === 'w') name = 'skip';
  else if (k === 'd' || k === '.') name = 'day';
  if (!name) return;
  e.preventDefault();
  act(name, { dataset: { speed: +k - 1 } });
});

s = load();
oldSave = !s && !!store(() => OLD_KEYS.some(k => localStorage.getItem(k) !== null));
store(() => OLD_KEYS.forEach(k => localStorage.removeItem(k)));
try {
  if (s) { welcomeBack = !!s.last; render(); if (s.pending) openEvent(); } else startScreen();
} catch (e) {
  // A save this version cannot draw: start over instead of showing a broken store.
  s = null;
  store(() => localStorage.removeItem(KEY));
  startScreen();
}
requestAnimationFrame(frame);
