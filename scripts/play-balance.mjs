// Balance check for the Storefront game (public/play/engine.js): plays a year with a few simple
// strategies and prints how the store is doing at checkpoints. Run after changing game numbers.
// Usage: node play-balance.mjs [seeds]
import * as G from '../public/play/engine.js';

const seeds = Number(process.argv[2]) || 3;
const avg = (h, k, n = 7) => h.slice(-n).reduce((t, x) => t + x[k], 0) / Math.min(n, h.length || 1);

// A player who never touches anything.
const idle = () => {};

// A player who buys ads from day one and nothing else.
const adsOnly = s => { if (s.day === 0) G.setAds(s, 150); };

// A careful player: fixes the store before buying traffic, grows the catalogue as search allows.
// Each mention of a project books its next scope up.
const ORDER = ['design', 'speed', 'seo', 'consent', 'cart', 'seo', 'design', 'search', 'speed', 'consent', 'markets', 'wishlist', 'accounts', 'search', 'giftcards', 'fallback',
  'markets', 'seo', 'wishlist', 'accounts', 'fallback', 'design', 'apps', 'pricing', 'speed', 'cart', 'giftcards', 'apps', 'markets', 'pricing', 'erp', 'checkout', 'erp', 'checkout'];
function careful(s) {
  const st = G.stats(s), last = s.last, month = avg(s.history, 'r', 30) * 30;
  const reserve = 300 + s.day * 2;
  // plan
  if (s.plan === 'basic' && month > 8000) G.setPlan(s, 'grow');
  if (s.plan === 'grow' && month > 40000) G.setPlan(s, 'advanced');
  if (s.plan === 'advanced' && month > 250000) G.setPlan(s, 'plus');
  // Emanuel
  if (!s.dev.length) {
    const next = ORDER.find((id, i) => { const ps = G.projectState(s, G.project(id)); return ps.next < ps.max && ps.next + 1 === ORDER.slice(0, i + 1).filter(x => x === id).length; });
    if (next) { const ps = G.projectState(s, G.project(next)); if (!ps.need && s.cash > ps.cost + reserve) G.bookProject(s, next); }
  }
  // catalogue: grow while search can keep up
  const cap = (s.done.search || 0) >= 2 ? 40 : (s.done.search || 0) === 1 ? 16 : 10;
  const nextP = s.products.find(p => !p.listed);
  if (nextP && st.n < cap && s.cash > G.listFee(nextP) + nextP.moq * nextP.cost + reserve * 1.5) G.addProduct(s, nextP.id);
  // apps
  if (!s.apps.reviews && s.totals.orders > 20) G.installApp(s, 'reviews');
  if (!s.apps.chat && s.cash > 4000) G.installApp(s, 'chat');
  // ads follow return on ad spend
  if (last && st.conv > .5) {
    const roas = s.ads ? last.adRev / s.ads : 0;
    if (!s.ads && s.cash > 2000) G.setAds(s, 30);
    else if (s.ads && roas > 2.4 && s.cash > reserve) G.setAds(s, s.ads * 1.15 + 10);
    else if (s.ads && roas < 1.6) G.setAds(s, s.ads * .8);
  }
  if (s.posts < 20 && s.cash > 3000) G.writePost(s);
  G.sendCampaign(s);
  // Black Friday: stock up two weeks ahead and run a sale
  const doy = s.day % G.YEAR;
  if (doy === G.BLACK_FRIDAY - 16) for (const p of st.listed) G.orderStock(s, p.id, G.restockSuggestion(s, p) * 2);
  if (doy === G.BLACK_FRIDAY) G.startSale(s, .2);
}

function answer(s) {
  const pe = s.pending;
  if (pe.id === 'booster') return G.resolveEvent(s, 1);
  if (pe.id === 'year') return G.resolveEvent(s, 0);
  const c = pe.choices.findIndex(c => !c.cost || s.cash > c.cost * 3);
  G.resolveEvent(s, c < 0 ? pe.choices.length - 1 : c);
}

function play(name, bot, seed, days = 365) {
  const s = G.newGame('Test', seed), rows = [];
  for (let d = 0; d < days && !s.over; d++) {
    bot(s);
    G.simulateDay(s);
    if (s.pending && !s.over) answer(s);
    if ([14, 30, 60, 90, 180, 270, 364].includes(s.day)) {
      const st = G.stats(s), h = s.history;
      rows.push({ day: s.day, cash: Math.round(s.cash), worth: Math.round(G.netWorth(s)), n: st.n, vis: Math.round(avg(h, 'v')), ord: +avg(h, 'o').toFixed(1),
        conv: (avg(h, 'o') / Math.max(1, avg(h, 'v')) * 100).toFixed(1) + '%', 'rev/d': Math.round(avg(h, 'r')), 'pft/d': Math.round(avg(h, 'p')), stars: s.rating.toFixed(2),
        seo: Math.round(st.seo), spd: Math.round(st.perf), des: Math.round(st.design), tru: Math.round(st.trust), proj: Object.values(s.done).reduce((t, x) => t + x, 0), plan: s.plan, ads: s.ads });
    }
  }
  console.log(`\n${name}, seed ${seed}${s.over ? `: BANKRUPT on day ${s.day}` : ''}. Year revenue ${G.eur(s.totals.revenue)}, profit ${G.eur(s.totals.profit)}, orders ${G.fmt(s.totals.orders)}, paid Emanuel ${G.eur(s.spent)}`);
  console.table(rows);
}

for (let seed = 1; seed <= seeds; seed++) {
  play('idle', idle, seed);
  play('ads only', adsOnly, seed);
  play('careful', careful, seed);
}
