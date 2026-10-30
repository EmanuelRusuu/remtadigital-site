// Storefront, a Shopify store simulator (remtadigital.com/play/).
// This file is the engine: plain data and functions, no DOM. The page (game.js) and the balance
// check (scripts/play-balance.mjs) run the same code. simulateDay() moves the store on by one day.

export const YEAR = 365;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const BLACK_FRIDAY = 330; // day of the year: 27 November; the weekend runs to Cyber Monday
const XMAS_CUTOFF = 354;         // 21 December: parcels no longer arrive before Christmas

// ---- helpers. The random generator is seeded and its state lives in the save, so a loaded game
// carries on exactly where it stopped.
export function rand(s) {
  let t = (s.rng = (s.rng + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (s, a, b) => a + (b - a) * rand(s);
const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sum = arr => arr.reduce((t, x) => t + x, 0);
const mean = arr => arr.length ? sum(arr) / arr.length : 0;
const round2 = x => Math.round(x * 100) / 100;
const shuffle = (s, arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const gauss = s => { let u = 0; for (let i = 0; i < 6; i++) u += rand(s); return (u - 3) / Math.SQRT1_2; };
function poisson(s, l) {
  if (!(l > 0)) return 0;
  if (l < 30) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rand(s); } while (p > L); return k - 1; }
  return Math.max(0, Math.round(l + Math.sqrt(l) * gauss(s)));
}
export const fmt = n => Math.round(n).toLocaleString('en-US');
const priceEnding = x => x < 100 ? Math.max(1.9, Math.round(x) - 0.1) : x < 1000 ? Math.round(x / 10) * 10 - 1 : Math.round(x / 100) * 100 - 10;

export function calendar(day) {
  let d = day % YEAR, m = 0;
  while (d >= MONTH_DAYS[m]) d -= MONTH_DAYS[m++];
  return { year: Math.floor(day / YEAR) + 1, month: m, date: d + 1, doy: day % YEAR, label: `${d + 1} ${MONTHS[m]}` };
}

// ---- catalogue: 40 products drawn from these types when a store opens
const SEASONS = {
  flat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  gift: [.8, .9, .95, 1, 1, .95, .9, .95, 1, 1.05, 1.3, 1.6],
  summer: [.5, .55, .8, 1.1, 1.4, 1.6, 1.6, 1.4, 1, .75, .6, .6],
  winter: [1.5, 1.4, 1.1, .8, .6, .5, .5, .6, .9, 1.2, 1.45, 1.5],
  fitness: [1.45, 1.2, 1.1, 1, 1.1, 1.1, 1, .95, 1.05, 1, .9, .85],
  fashion: [.85, .9, 1.1, 1.15, 1.05, 1, .95, 1, 1.15, 1.1, 1.1, 1.15],
};
export const SEASON_NAMES = { gift: 'Peaks in December', summer: 'Summer seller', winter: 'Winter seller', fitness: 'Peaks in January', fashion: 'Spring and autumn' };
const TRAFFIC_SEASON = [.85, .85, .95, 1, 1, .95, .9, .95, 1, 1.05, 1.2, 1.35];

export const CATEGORIES = {
  acc: { name: 'Accessories', ret: .05, adj: ['Merino', 'Alpine', 'Recycled', 'Classic', 'Minimal', 'Vintage'] },
  home: { name: 'Home & living', ret: .04, adj: ['Nordic', 'Handmade', 'Linen', 'Oak', 'Cosy', 'Stoneware'] },
  beauty: { name: 'Beauty', ret: .04, adj: ['Organic', 'Lavender', 'Vegan', 'Glow', 'Pure', 'Herbal'] },
  apparel: { name: 'Apparel', ret: .14, adj: ['Organic', 'Oversized', 'Everyday', 'Heritage', 'Relaxed', 'Studio'] },
  sport: { name: 'Sports', ret: .06, adj: ['Pro', 'Trail', 'Club', 'Active', 'Peak', 'Training'] },
  food: { name: 'Food & drink', ret: .01, adj: ['Single-origin', 'Swiss', 'Wild', 'Smoky', 'Artisan', 'Small-batch'] },
  tech: { name: 'Tech', ret: .07, adj: ['Slim', 'Fast', 'Wireless', 'Compact', 'Rugged', 'Smart'] },
  outdoor: { name: 'Outdoor', ret: .05, adj: ['Ultralight', 'Summit', 'Weatherproof', 'Basecamp', 'Explorer', 'Lakeside'] },
  big: { name: 'Home improvement', ret: .03, adj: ['Premium', 'Swiss-made', 'Panorama', 'Family', 'Eco', 'Deluxe'] },
};
// name, emoji, category, season, lowest and highest unit cost (CHF), handling effort per unit
const TYPES = [
  ['Socks', '🧦', 'acc', 'gift', 2.5, 4.5, 1], ['Cap', '🧢', 'acc', 'summer', 3, 6, 1], ['Tote Bag', '👜', 'acc', 'flat', 3, 7, 1], ['Sunglasses', '🕶️', 'acc', 'summer', 5, 14, 1], ['Scarf', '🧣', 'acc', 'winter', 6, 15, 1], ['Wallet', '👛', 'acc', 'gift', 8, 20, 1], ['Watch', '⌚', 'acc', 'gift', 25, 80, 1],
  ['Candle', '🕯️', 'home', 'gift', 3, 7, 1], ['Mug', '☕', 'home', 'gift', 3, 6, 2], ['Cushion', '🛋️', 'home', 'flat', 8, 16, 2], ['Plant Pot', '🪴', 'home', 'summer', 4, 10, 2], ['Throw Blanket', '🧶', 'home', 'winter', 12, 30, 2], ['Desk Lamp', '💡', 'home', 'flat', 15, 35, 3],
  ['Lip Balm', '💄', 'beauty', 'winter', 2.5, 4, 1], ['Soap Bar', '🧼', 'beauty', 'gift', 2.5, 4.5, 1], ['Face Serum', '🧴', 'beauty', 'flat', 5, 14, 1], ['Perfume', '🌸', 'beauty', 'gift', 12, 35, 1], ['Bath Salts', '🛁', 'beauty', 'winter', 3, 7, 2], ['Hair Dryer', '💨', 'beauty', 'flat', 20, 45, 2],
  ['T-Shirt', '👕', 'apparel', 'summer', 5, 10, 1], ['Hoodie', '🧥', 'apparel', 'winter', 12, 22, 2], ['Jeans', '👖', 'apparel', 'fashion', 14, 28, 2], ['Summer Dress', '👗', 'apparel', 'summer', 10, 24, 1], ['Sneakers', '👟', 'apparel', 'fashion', 22, 45, 2], ['Rain Jacket', '🧥', 'apparel', 'fashion', 25, 55, 2],
  ['Water Bottle', '🥤', 'sport', 'summer', 3, 7, 1], ['Yoga Mat', '🧘', 'sport', 'fitness', 8, 16, 2], ['Football Jersey', '⚽', 'sport', 'flat', 14, 26, 1], ['Dumbbell Set', '🏋️', 'sport', 'fitness', 25, 60, 5], ['Bike Light', '🚲', 'sport', 'winter', 6, 14, 1], ['Running Shoes', '👟', 'sport', 'fitness', 30, 55, 2],
  ['Coffee Beans', '☕', 'food', 'winter', 5, 9, 1], ['Loose Tea', '🍵', 'food', 'winter', 3, 6, 1], ['Chocolate', '🍫', 'food', 'gift', 2.5, 4, 1], ['Honey', '🍯', 'food', 'flat', 4, 8, 1], ['Hot Sauce', '🌶️', 'food', 'flat', 3, 5, 1], ['Gift Box', '🎁', 'food', 'gift', 10, 22, 2],
  ['Phone Case', '📱', 'tech', 'flat', 3, 6, 1], ['USB-C Cable', '🔌', 'tech', 'flat', 2.5, 4.5, 1], ['Earbuds', '🎧', 'tech', 'gift', 12, 35, 1], ['Power Bank', '🔋', 'tech', 'gift', 8, 18, 1], ['Smart Plug', '🔌', 'tech', 'flat', 6, 12, 1], ['Speaker', '🔊', 'tech', 'gift', 15, 40, 2],
  ['Backpack', '🎒', 'outdoor', 'summer', 18, 40, 2], ['Tent', '⛺', 'outdoor', 'summer', 40, 110, 4], ['Head Torch', '🔦', 'outdoor', 'winter', 5, 12, 1], ['Hammock', '🌴', 'outdoor', 'summer', 12, 25, 2], ['Charcoal Grill', '🍖', 'outdoor', 'summer', 35, 90, 5], ['Camping Stove', '🔥', 'outdoor', 'summer', 20, 45, 2],
  ['Infrared Heater', '♨️', 'big', 'winter', 120, 350, 8], ['Dehumidifier', '💧', 'big', 'flat', 90, 220, 8], ['E-Bike', '🚴', 'big', 'summer', 700, 1400, 20], ['Pergola', '🏡', 'big', 'summer', 900, 2600, 40], ['Barrel Sauna', '🧖', 'big', 'winter', 2000, 4500, 60], ['Swim Spa', '🏊', 'big', 'summer', 5000, 9000, 80],
];

function makeHub(s) {
  const byCat = {};
  for (const t of TYPES) (byCat[t[2]] ||= []).push(t);
  const chosen = [];
  for (const c of Object.keys(byCat)) chosen.push(...shuffle(s, byCat[c].slice()).slice(0, 4));
  chosen.push(...shuffle(s, TYPES.filter(t => !chosen.includes(t) && t[2] !== 'big')).slice(0, 40 - chosen.length));
  const list = chosen.map(([type, emoji, cat, season, lo, hi, size]) => {
    const C = CATEGORIES[cat];
    const cost = round2(between(s, lo, hi));
    const markup = cost < 10 ? between(s, 2.6, 3.2) : cost < 50 ? between(s, 2.2, 2.7) : cost < 300 ? between(s, 1.8, 2.2) : between(s, 1.5, 1.8);
    const msrp = priceEnding(cost * markup);
    return {
      name: `${pick(s, C.adj)} ${type}`, emoji, cat, season, cost, msrp, price: msrp, size,
      pop: between(s, .6, 1.5) * (rand(s) < .12 ? 1.6 : 1), elast: between(s, 1.4, 2.6), quality: between(s, .55, 1),
      lead: cat === 'big' ? Math.round(between(s, 10, 21)) : Math.round(between(s, 4, 14)),
      moq: clamp(Math.round(400 / cost), 1, 150), ret: C.ret * between(s, .7, 1.3),
      listed: false, auto: true, stock: 0, incoming: [], trend: 1, demand7: [], sold7: [], sold: 0, revenue: 0,
    };
  });
  list.sort((a, b) => a.cost - b.cost);
  list.forEach((p, i) => { p.id = i; });
  return list;
}

// ---- what the store can buy
export const PLANS = {
  basic: { name: 'Basic', price: 39, rate: .029, conv: 1, perk: 'Everything you need to start.' },
  grow: { name: 'Grow', price: 105, rate: .027, conv: 1.02, perk: 'Abandoned-cart emails (+2% conversion) and lower card fees. Needed for a second language.' },
  advanced: { name: 'Advanced', price: 399, rate: .025, conv: 1.04, perk: 'Better reports (+4% conversion overall) and lower fees. Needed for a third language and an ERP link.' },
  plus: { name: 'Plus', price: 2300, rate: .022, conv: 1.05, perk: 'The lowest fees, checkout extensions and better B2B terms.' },
};
export const PLAN_ORDER = ['basic', 'grow', 'advanced', 'plus'];

// perf: how many points of speed score the app's scripts cost
export const APPS = {
  reviews: { name: 'Product reviews', icon: '⭐', price: 15, perf: 4, text: 'Review widgets and review-request emails: +10 trust and 2.5× more reviews.' },
  upsell: { name: 'Upsell pop-up', icon: '🛍️', price: 29, perf: 6, text: '"Frequently bought together" pop-ups: +8% items per order, but the store looks busier (−3 design).' },
  chat: { name: 'Live chat', icon: '💬', price: 19, perf: 5, text: 'A chat bubble on every page: +5% conversion.' },
  popup: { name: 'Email pop-up', icon: '✉️', price: 9, perf: 3, text: 'Collects five times more email addresses, and costs about 3% conversion.' },
  loyalty: { name: 'Loyalty points', icon: '🎟️', price: 49, perf: 4, text: 'Points on every order: +40% returning customers.' },
  builder: { name: 'Page builder', icon: '🧩', price: 25, perf: 9, text: 'Drag-and-drop landing pages: +10 design, heavy scripts.' },
  translate: { name: 'Auto-translate', icon: '🌐', price: 19, perf: 3, text: 'Machine translation into German, French and Italian: +12% visitors. Does nothing once you have proper markets.' },
  booster: { name: 'Speed Booster Pro', icon: '🚀', price: 9, perf: 7, hidden: true, text: 'Promises a faster store. Adds three more scripts to every page.' },
};

// Each level: [cost in CHF, working days]. need: the plan each level requires, if any.
export const PROJECTS = [
  { id: 'design', icon: '🎨', name: 'Custom theme design', levels: [[2000, 10], [6500, 14], [14000, 20]], effect: ['+25 design, +5 trust', '+20 design, +5 trust', '+15 design, +5 trust'],
    text: 'A theme built around your brand instead of a free template.', link: ['/articles/football-club-website-on-one-shopify-theme/', 'A football club\'s whole website on one theme'] },
  { id: 'speed', icon: '⚡', name: 'Speed optimisation', levels: [[1000, 4], [3500, 7], [8000, 10]], effect: ['+15 speed', '+12 speed', '+8 speed'],
    text: 'Smaller images, fewer and later scripts, faster pages.', link: ['/articles/from-16-mb-to-4-mb-product-page/', 'From 16 MB to 4 MB on one product page'] },
  { id: 'seo', icon: '🔎', name: 'SEO foundations', levels: [[1200, 5], [4000, 8], [9000, 12]], effect: ['+18 SEO', '+14 SEO', '+10 SEO'],
    text: 'Clean titles and headings, structured data, sitemaps and pages Google can crawl.', link: ['/articles/six-stores-one-theme/', 'Structured data across six stores'] },
  { id: 'search', icon: '🧭', name: 'Search and filters', levels: [[3000, 7], [8000, 10]], effect: ['Halves the big-catalogue penalty, +4% conversion', 'Removes the big-catalogue penalty, +4% conversion'],
    text: 'Fast search that forgives typos, and filters by colour, size and price.', link: ['/articles/meilisearch-for-shopify-colours-and-markets/', 'Meilisearch for colours and markets'] },
  { id: 'cart', icon: '🛒', name: 'Cart and upsells', levels: [[2000, 5], [5000, 8]], effect: ['+10% items per order', '+10% items per order'],
    text: 'A cart drawer with add-ons and bundles that never drift out of sync.', link: ['/articles/one-jersey-one-cart-line/', 'One jersey, one cart line'] },
  { id: 'consent', icon: '🍪', name: 'Consent-friendly tracking', levels: [[1500, 3]], effect: ['+6 speed, +3 trust, and a cookie banner can no longer break the theme'],
    text: 'Tracking loads only after consent, and the theme code keeps working when a script is blocked.', link: ['/articles/when-a-cookie-banner-breaks-your-theme-javascript/', 'When a cookie banner breaks your theme'] },
  { id: 'fallback', icon: '🛟', name: 'Checkout safety net', levels: [[2000, 4]], effect: ['A payment outage no longer stops checkout'],
    text: 'When a payment or credit check fails, customers see a clear message and another way to pay.', link: ['/articles/when-a-credit-check-outage-looks-like-a-decline/', 'When a credit check outage looks like a decline'] },
  { id: 'markets', icon: '🌍', name: 'Languages and markets', levels: [[4000, 8], [6000, 8], [8000, 8]], need: [null, 'grow', 'advanced'], effect: ['German: +35% visitors', 'French: +35% visitors', 'Italian: +35% visitors'],
    text: 'Properly translated pages, prices and SEO for each language.', link: ['/articles/one-allergen-three-languages/', 'One allergen, three languages'] },
  { id: 'wishlist', icon: '❤️', name: 'Wishlist', levels: [[1800, 4]], effect: ['+25% returning visitors'],
    text: 'A wishlist that survives the reload and follows customers into their account.', link: ['/articles/a-wishlist-that-survives-the-reload/', 'A wishlist that survives the reload'] },
  { id: 'giftcards', icon: '🎁', name: 'Gift cards', levels: [[3500, 7]], effect: ['+5% items per order, and a stronger December'],
    text: 'Gift cards that work online and in the shop.', link: ['/articles/gift-cards-from-the-shop-till-redeemed-online/', 'Gift cards from the shop till'] },
  { id: 'accounts', icon: '🧾', name: 'Customer accounts and invoices', levels: [[2500, 5]], effect: ['+8 trust, +15% returning visitors'],
    text: 'Order history and PDF invoices in the customer account.', link: ['/articles/pdf-invoices-in-the-shopify-customer-account/', 'PDF invoices in the customer account'] },
  { id: 'pricing', icon: '🏷️', name: 'Installation and bundle pricing', levels: [[4000, 7]], effect: ['High-ticket products convert 30% better'],
    text: 'Installation options and bundles priced by discount logic, so the cart always shows the right total.', link: ['/articles/pricing-a-swim-spa-with-shopify-discounts/', 'Pricing a swim spa'] },
  { id: 'apps', icon: '🧹', name: 'Replace apps with theme code', levels: [[5000, 9]], effect: ['Apps slow the store 65% less'],
    text: 'What your apps do, rebuilt inside the theme without their extra scripts.', link: ['/articles/tabs-that-hide-themselves/', 'Rebuilding a design on Dawn'] },
  { id: 'erp', icon: '🔄', name: 'ERP and stock sync', levels: [[12000, 20]], need: ['advanced'], effect: ['Supplier lead times −40%, cheaper fulfilment and storage'],
    text: 'Stock, prices and orders synced with an ERP, so restocks happen on time.', link: ['/projects/ev-zug/', 'ERP-driven prices at EV Zug'] },
  { id: 'checkout', icon: '💳', name: 'Checkout extensions', levels: [[9000, 10]], need: ['plus'], effect: ['+6% conversion, +5% items per order'],
    text: 'Delivery dates, upsells and trust signals right inside the checkout.' },
];
export const project = id => PROJECTS.find(p => p.id === id);

export const listFee = p => Math.round(60 + Math.sqrt(p.msrp) * 6);
export const POST_COST = 250, POST_LIMIT = 20;
export const SALE_DAYS = 4, SALE_COOLDOWN = 21, CAMPAIGN_COOLDOWN = 7;

// ---- a new store
export function newGame(name, seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0) {
  const s = {
    v: 1, name, seed, rng: seed, day: 0, cash: 5000, plan: 'basic', apps: {}, done: {}, dev: [], ads: 0,
    list: 0, customers: 0, rating: 0, reviews: 0, posts: 0, lastPost: -99, seoShift: 0, effects: [],
    campaign: { until: -1, last: -99 }, sale: { pct: 0, until: -1, last: -99 }, pending: null, lastEvent: 0, seen: {},
    history: [], log: [], news: [], totals: { revenue: 0, profit: 0, orders: 0, visitors: 0 }, got: {}, flags: {},
    redDays: 0, over: false, last: null, lastOrders: 0, best: 0,
  };
  s.products = makeHub(s);
  const first = s.products[0];
  first.listed = first.everListed = first.live = true;
  first.stock = first.moq * 2;
  note(s, `${name} is open. Your first product, ${first.emoji} ${first.name}, is live with ${first.stock} units in stock.`);
  return s;
}

export function note(s, text, kind = 'info') {
  s.log.unshift({ d: s.day, text, kind });
  if (s.log.length > 60) s.log.length = 60;
  if (kind === 'win' || kind === 'warn' || kind === 'good') s.news.push({ text, kind });
}

// Timed effects from events: mul multiplies, add adds. key narrows an effect to one product or category.
const mulEff = (s, kind, key) => s.effects.reduce((t, e) => e.kind === kind && (e.key === undefined || e.key === key) ? t * e.mul : t, 1);
const addEff = (s, kind) => s.effects.reduce((t, e) => e.kind === kind ? t + e.add : t, 0);
const addEffect = (s, e) => s.effects.push(e);

const lv = (s, id) => s.done[id] || 0;
const levelSum = (s, id, arr) => sum(arr.slice(0, lv(s, id)));
export const onOrder = p => sum(p.incoming.map(x => x.qty));
export const avgDemand = p => mean(p.demand7);
export const leadOf = (s, p) => Math.max(2, Math.round(p.lead * (s.done.erp ? .6 : 1)));
export const stockValue = s => sum(s.products.map(p => (p.stock + onOrder(p)) * p.cost));
export const netWorth = s => s.cash + stockValue(s);

// ---- the store's scores, worked out from what has been built and installed
export function stats(s) {
  const d = s.done, a = s.apps;
  const listed = s.products.filter(p => p.listed);
  const n = listed.length;
  const appPerf = sum(Object.keys(a).map(k => APPS[k].perf)) * (d.apps ? .35 : 1);
  const seo = clamp(8 + levelSum(s, 'seo', [18, 14, 10]) + Math.min(POST_LIMIT, s.posts) * 1.2 + s.seoShift, 0, 100);
  const perf = clamp(55 + levelSum(s, 'speed', [15, 12, 8]) + (d.consent ? 6 : 0) - appPerf + addEff(s, 'perf'), 5, 100);
  const design = clamp(15 + levelSum(s, 'design', [25, 20, 15]) + (a.builder ? 10 : 0) - (a.upsell ? 3 : 0), 0, 100);
  const ratingBonus = s.reviews ? (s.rating - 4) * 30 : 0;
  const reviewBonus = Math.min(20, Math.log10(1 + s.reviews) * 7);
  const trust = clamp(8 + design * .15 + lv(s, 'design') * 5 + (a.reviews ? 10 : 0) + (d.consent ? 3 : 0) + (d.accounts ? 8 : 0) + ratingBonus + reviewBonus + addEff(s, 'trust'), 0, 100);
  const loadTime = .8 + (100 - perf) * .075;
  const catalogPenalty = n > 12 ? Math.min(.3, (n - 12) * .012) * (1 - lv(s, 'search') / 2) : 0;
  const parts = {
    design: .55 + .6 * design / 100,
    speed: clamp(1.22 - .09 * loadTime, .45, 1.15),
    trust: .65 + .5 * trust / 100,
    catalogue: (1 - catalogPenalty) * (1 + .04 * lv(s, 'search')),
    extras: PLANS[s.plan].conv * (a.chat ? 1.05 : 1) * (a.popup ? .97 : 1) * (d.checkout ? 1.06 : 1),
  };
  const conv = parts.design * parts.speed * parts.trust * parts.catalogue * parts.extras;
  const items = 1.25 + (a.upsell ? .08 : 0) + .1 * lv(s, 'cart') + (d.giftcards ? .05 : 0) + (d.checkout ? .05 : 0);
  return { seo, perf, design, trust, loadTime, conv, parts, items, markets: 1 + .35 * lv(s, 'markets'), n, listed, catalogPenalty, appPerf, cal: calendar(s.day) };
}

// ---- one day
const INTENT = { organic: 1, launch: 1.2, ads: .8, email: 1.5, returning: 2.2, social: 1.3 };
export const CHANNEL_NAMES = { organic: 'Google', launch: 'Launch buzz', ads: 'Ads', email: 'Email', returning: 'Returning', social: 'Word of mouth' };

export function simulateDay(s) {
  if (s.over || s.pending) return null;
  const st = stats(s), m = st.cal.month, doy = st.cal.doy;
  s.effects = s.effects.filter(e => e.until >= s.day);
  const bf = doy >= BLACK_FRIDAY && doy <= BLACK_FRIDAY + 3;

  // visitors by channel
  const n = st.n;
  const organic = (100 + 2200 * (st.seo / 100) ** 2) * (1 + .06 * Math.max(0, n - 1) ** .8) * st.markets
    * (s.apps.translate && !s.done.markets ? 1.12 : 1) * mulEff(s, 'organic');
  const ads = s.cash > 0 ? s.ads : 0;
  const cpc = .38 * (bf ? 1.7 : 1) * (m >= 10 ? 1.25 : 1) * (1 + ads / 1500) ** .6;
  const season = TRAFFIC_SEASON[m] * (bf ? 1.9 : 1) * (doy >= 359 ? .8 : 1) * (s.done.giftcards && m === 11 ? 1.1 : 1);
  const tmul = season * mulEff(s, 'traffic') * between(s, .9, 1.1);
  const ch = {
    organic: organic * tmul,
    launch: s.day < 45 ? 400 * (1 - s.day / 45) * tmul : 0,
    ads: ads / cpc * between(s, .95, 1.05),
    email: s.list * (.012 + (s.campaign.until >= s.day ? .07 : 0)) * tmul,
    returning: s.customers * .003 * (s.apps.loyalty ? 1.4 : 1) * (s.done.wishlist ? 1.25 : 1) * (s.done.accounts ? 1.15 : 1) * tmul,
    social: s.lastOrders * Math.max(0, s.rating - 3.8) * tmul,
  };
  let visitors = 0, weighted = 0;
  for (const k in ch) { ch[k] = Math.round(ch[k]); visitors += ch[k]; weighted += ch[k] * INTENT[k]; }

  // sales, product by product
  const salePct = s.sale.until >= s.day ? s.sale.pct : 0;
  const convDay = st.conv * mulEff(s, 'conv') * (bf ? 1.3 : 1) * (doy >= XMAS_CUTOFF && doy < 359 ? .75 : 1) * (1 + salePct);
  // A product only draws visitors once its first delivery has arrived.
  const interest = st.listed.map(p => !p.live ? 0 : p.pop * (p.msrp / (p.price * (1 - salePct))) ** p.elast * SEASONS[p.season][m] * p.trend * mulEff(s, 'product', p.id) * mulEff(s, 'cat', p.cat));
  const totalInterest = sum(interest) || 1;
  const catF = Math.max(1, n) ** .12;
  let revenue = 0, cogs = 0, orders = 0, units = 0, handling = 0, refunds = 0, lost = 0, wanted = 0, score = 0;
  const top = [];
  st.listed.forEach((p, i) => {
    const itemConv = .035 * (20 / p.msrp) ** .5 * (p.cat === 'big' && s.done.pricing ? 1.3 : 1);
    const o = poisson(s, weighted * interest[i] / totalInterest * catF * itemConv * convDay);
    const want = o ? Math.max(o, poisson(s, o * st.items)) : 0;
    const sold = Math.min(want, p.stock);
    const price = p.price * (1 - salePct);
    p.stock -= sold;
    p.demand7.push(want); if (p.demand7.length > 7) p.demand7.shift();
    p.sold7.push(sold); if (p.sold7.length > 7) p.sold7.shift();
    p.sold += sold; p.revenue += sold * price;
    revenue += sold * price; cogs += sold * p.cost;
    refunds += sold * price * p.ret * .6;
    handling += sold * p.size * .35;
    score += sold * (3.1 + 1.9 * p.quality);
    orders += want ? o * sold / want : 0;
    units += sold; wanted += want; lost += want - sold;
    if (want > sold && !p.out) { p.out = true; note(s, `${p.emoji} ${p.name} sold out.`, 'bad'); }
    if (p.stock > 0) p.out = false;
    if (sold) top.push([p.id, sold]);
  });
  orders = Math.round(orders);

  // money. Stock is paid for when it is ordered, so cogs counts for profit but not for cash.
  const plan = PLANS[s.plan];
  const fulfil = (orders * 1.2 + handling) * (s.done.erp ? .8 : 1);
  const fees = revenue * plan.rate + orders * .3;
  const holding = stockValue(s) * .0004 * (s.done.erp ? .6 : 1);
  const fixed = (plan.price + sum(Object.keys(s.apps).map(k => APPS[k].price))) / 30.4;
  const interestPaid = s.cash < 0 ? -s.cash * .0006 : 0;
  const costs = fulfil + fees + refunds + holding + fixed + ads + interestPaid;
  s.cash += revenue - costs;
  const profit = revenue - cogs - costs;
  const adShare = weighted ? ch.ads * INTENT.ads / weighted : 0;

  // deliveries arrive, then auto-restock orders what is running low
  for (const p of s.products) p.incoming = p.incoming.filter(x => x.day > s.day || ((p.stock += x.qty), (p.live = true), false));
  for (const p of st.listed) if (p.auto) autoReorder(s, p);

  // reviews, email list, customers
  if (units) {
    const fresh = poisson(s, orders * .035 * (s.apps.reviews ? 2.5 : 1));
    if (fresh) {
      const avg = clamp(score / units + (st.design >= 70 ? .1 : 0) - (lost > wanted * .3 ? .35 : 0) + addEff(s, 'review') + (rand(s) - .5) * .3, 1, 5);
      s.rating = (s.rating * s.reviews + avg * fresh) / (s.reviews + fresh);
      s.reviews += fresh;
    }
  }
  // Subscribers and customers drift away over time, so neither grows without limit.
  s.list = s.list * .998 + visitors * (.003 + (s.apps.popup ? .012 : 0));
  s.customers = s.customers * .995 + orders * .85;
  s.lastOrders = orders;

  // Emanuel works on the first project in the queue
  if (s.dev.length && --s.dev[0].left <= 0) {
    const job = s.dev.shift(), P = project(job.id);
    s.done[job.id] = job.level;
    note(s, `${P.icon} Emanuel finished ${P.name}${P.levels.length > 1 ? ` (level ${job.level})` : ''}: ${P.effect[job.level - 1]}.`, 'good');
  }

  // demand drifts: some products warm up, others cool down
  for (const p of s.products) p.trend = clamp(p.trend + (1 - p.trend) * .04 + (rand(s) - .5) * .09, .55, 1.7);

  s.last = { d: s.day, ch, visitors, orders, units, lost, revenue, profit, cogs, fulfil, fees, refunds, holding, fixed, ads, interest: interestPaid, cpc, adRev: revenue * adShare, conv: visitors ? orders / visitors : 0, top: top.sort((a, b) => b[1] - a[1]).slice(0, 3) };
  s.history.push({ d: s.day, v: visitors, o: orders, r: Math.round(revenue), p: Math.round(profit), c: Math.round(s.cash) });
  if (s.history.length > 400) s.history.shift();
  const t = s.totals;
  t.revenue += revenue; t.profit += profit; t.orders += orders; t.visitors += visitors;
  if (bf && lost) s.flags.bfLost = (s.flags.bfLost || 0) + lost;
  if (bf && units) s.flags.bfSold = (s.flags.bfSold || 0) + units;

  s.day++;
  money(s);
  if (!s.over) {
    scheduled(s);
    if (!s.pending) maybeEvent(s);
    milestones(s);
  }
  return s.last;
}

function money(s) {
  s.redDays = s.cash < 0 ? s.redDays + 1 : 0;
  if (s.redDays === 1) note(s, 'Your account is in overdraft. You pay interest every day, and ads stop until you are back in credit.', 'warn');
  if (s.redDays === 30) note(s, 'A month in overdraft. After 45 days, or below CHF −8,000, the bank closes the account.', 'warn');
  if (s.cash < -8000 || s.redDays > 45) {
    s.over = true;
    s.pending = { id: 'over', title: 'The bank closed your account', text: `After ${s.day} days, ${s.name} ran out of money. Revenue so far: CHF ${fmt(s.totals.revenue)} from ${fmt(s.totals.orders)} orders.`, choices: [{ label: 'Open a new store' }] };
  }
}

function autoReorder(s, p) {
  const avg = avgDemand(p), lead = leadOf(s, p), coming = onOrder(p);
  if (p.stock + coming > avg * (lead + 4) && (p.stock + coming > 0 || avg > 0)) return;
  const qty = Math.max(p.moq, Math.ceil(avg * (lead + 14) - p.stock - coming));
  if (!buy(s, p, qty) && qty > p.moq && !buy(s, p, p.moq) && s.day - (p.warned ?? -99) >= 7) {
    p.warned = s.day;
    note(s, `Not enough cash to restock ${p.emoji} ${p.name}.`, 'warn');
  }
}
function buy(s, p, qty, days = leadOf(s, p), price = p.cost) {
  const cost = qty * price;
  if (qty <= 0 || s.cash < cost) return false;
  s.cash -= cost;
  p.incoming.push({ day: s.day + days, qty });
  return true;
}

// ---- events. make() returns what the player sees, resolve() applies the choice.
const listedOf = s => s.products.filter(p => p.listed);
const weightedPick = (s, arr, w) => { let r = rand(s) * sum(arr.map(w)); for (const x of arr) if ((r -= w(x)) <= 0) return x; return arr[arr.length - 1]; };
const EVENTS = [
  { id: 'viral', w: 3, min: 14, cool: 45, ok: s => listedOf(s).some(p => p.stock > 0),
    make(s) {
      const p = weightedPick(s, listedOf(s).filter(p => p.stock > 0), p => p.pop * p.trend);
      const qty = Math.max(p.moq, Math.ceil(Math.max(1, avgDemand(p)) * 4 * 6));
      const cost = Math.round(qty * p.cost * 1.3);
      return { title: `${p.emoji} Your ${p.name} is going viral`, text: `A short video with your ${p.name} is all over social media. Expect about four times the usual demand for five days. You have ${p.stock} in stock.`,
        data: { pid: p.id, qty, cost }, choices: [{ label: `Rush order ${qty} units, here in 2 days`, cost }, { label: 'Sell what I have' }] };
    },
    resolve(s, d, c) {
      addEffect(s, { kind: 'product', key: d.pid, mul: 4, until: s.day + 5 });
      const p = s.products[d.pid];
      if (c === 0) { s.cash -= d.cost; p.incoming.push({ day: s.day + 2, qty: d.qty }); return `Rush order placed: ${d.qty} units of ${p.name} at 30% more than usual.`; }
      return `${p.name} is trending.`;
    } },
  { id: 'delay', w: 2, min: 10, cool: 30, ok: s => s.products.some(p => p.incoming.length),
    make(s) {
      const p = pick(s, s.products.filter(p => p.incoming.length)), days = Math.round(between(s, 4, 8));
      return { title: '🚢 A supplier is running late', text: `The delivery of ${p.emoji} ${p.name} is stuck at the port: it arrives ${days} days later than planned.`, data: { pid: p.id, days }, choices: [{ label: 'OK' }] };
    },
    resolve(s, d) { s.products[d.pid].incoming.forEach(x => { x.day += d.days; }); return `Delivery of ${s.products[d.pid].name} delayed by ${d.days} days.`; } },
  { id: 'core', w: 1.5, min: 40, cool: 120, ok: () => true,
    make(s) {
      const good = stats(s).seo >= 55;
      return { title: '📈 Google rolled out a core update', text: good ? 'Your structured data, speed and clean pages paid off: Google ranks you higher for the next month, and some of it sticks.' : 'Thin pages and weak SEO cost you: Google ranks you lower for the next month, and some of it sticks. SEO work protects against the next one.',
        data: { good }, choices: [{ label: 'OK' }] };
    },
    resolve(s, d) {
      s.seoShift += d.good ? 4 : -4;
      addEffect(s, { kind: 'organic', mul: d.good ? 1.15 : .85, until: s.day + 30 });
      return d.good ? 'Google update: rankings up.' : 'Google update: rankings down.';
    } },
  { id: 'cookie', w: 1.5, min: 25, cool: 90, ok: s => !s.done.consent,
    make() {
      return { title: '🍪 The cookie banner broke your store', text: 'A consent manager update now blocks one of your theme\'s script files. For many visitors the search, cart drawer and sliders stopped working, and conversion dropped by 40%.',
        choices: [{ label: 'Emergency fix by Emanuel, done tomorrow', cost: 900 }, { label: 'Wait for the app vendor (about a week)' }], link: ['/articles/when-a-cookie-banner-breaks-your-theme-javascript/', 'This happened on a real store'] };
    },
    resolve(s, d, c) {
      if (c === 0) { s.cash -= 900; addEffect(s, { kind: 'conv', mul: .6, until: s.day }); return 'Emanuel guarded the theme code: everything works again tomorrow.'; }
      addEffect(s, { kind: 'conv', mul: .6, until: s.day + 6 });
      return 'Waiting for the consent app vendor.';
    } },
  { id: 'payment', w: 1.2, min: 30, cool: 100, ok: () => true,
    make(s) {
      const safe = !!s.done.fallback;
      return { title: '💳 A payment provider went down', text: safe ? 'An invoice and credit-check provider failed for two days. Your checkout safety net showed customers a clear message and another way to pay, so almost nobody noticed.' : 'An invoice and credit-check provider failed for two days. Customers saw what looked like a declined payment and left. Conversion halves until it is back.',
        data: { safe }, choices: [{ label: 'OK' }], link: ['/articles/when-a-credit-check-outage-looks-like-a-decline/', 'This happened on a real store'] };
    },
    resolve(s, d) { if (!d.safe) addEffect(s, { kind: 'conv', mul: .5, until: s.day + 1 }); return d.safe ? 'Payment outage: the safety net held.' : 'Payment outage: two weak days.'; } },
  { id: 'influencer', w: 2, min: 20, cool: 45, ok: s => listedOf(s).length >= 2,
    make(s) {
      const v = s.last ? s.last.visitors : 100;
      const cost = Math.round(clamp(v * .9, 300, 9000) / 50) * 50;
      return { title: '🤳 An influencer wants to feature your store', text: `A creator with a big following offers three days of posts about your store for CHF ${fmt(cost)}. Some of these deals bring a rush of visitors, some bring almost nothing.`,
        data: { cost, hit: rand(s) < .6 }, choices: [{ label: 'Book the posts', cost }, { label: 'No, thanks' }] };
    },
    resolve(s, d, c) {
      if (c !== 0) return 'You declined the influencer deal.';
      s.cash -= d.cost;
      addEffect(s, { kind: 'traffic', mul: d.hit ? 2.2 : 1.15, until: s.day + 2 });
      return d.hit ? 'The influencer posts are landing: lots of new visitors.' : 'The influencer posts went out. Their audience was not very interested.';
    } },
  { id: 'pricewar', w: 1.5, min: 50, cool: 60, ok: s => listedOf(s).length >= 3,
    make(s) {
      const p = pick(s, listedOf(s)), C = CATEGORIES[p.cat];
      return { title: '⚔️ A competitor started a price war', text: `A big competitor cut prices across ${C.name}. For the next three weeks fewer visitors buy your ${C.name.toLowerCase()} products at your current prices.`, data: { cat: p.cat }, choices: [{ label: 'OK' }] };
    },
    resolve(s, d) { addEffect(s, { kind: 'cat', key: d.cat, mul: .65, until: s.day + 20 }); return `Price war in ${CATEGORIES[d.cat].name}.`; } },
  { id: 'b2b', w: 1.5, min: 45, cool: 40, ok: s => listedOf(s).some(p => p.stock >= 30),
    make(s) {
      const p = pick(s, listedOf(s).filter(p => p.stock >= 30));
      const qty = Math.min(Math.floor(p.stock * .6), Math.round(between(s, 20, 200)));
      const off = s.plan === 'plus' ? .1 : .18;
      const price = Math.round(p.price * (1 - off) * qty);
      return { title: '🏢 A company wants to order in bulk', text: `A company asks for ${qty} × ${p.emoji} ${p.name} for its staff, at ${Math.round(off * 100)}% off: CHF ${fmt(price)} in one order.`,
        data: { pid: p.id, qty, price }, choices: [{ label: `Accept, CHF ${fmt(price)}` }, { label: 'Decline' }] };
    },
    resolve(s, d, c) {
      const p = s.products[d.pid];
      if (c !== 0) return 'You declined the bulk order.';
      if (p.stock < d.qty) return `Not enough ${p.name} left to fill the bulk order.`;
      p.stock -= d.qty; p.sold += d.qty; p.revenue += d.price; s.cash += d.price;
      s.totals.revenue += d.price; s.totals.profit += d.price - d.qty * p.cost; s.totals.orders += 1;
      return `Bulk order shipped: ${d.qty} × ${p.name} for CHF ${fmt(d.price)}.`;
    } },
  { id: 'chargeback', w: 1, min: 30, cool: 50, ok: s => s.totals.orders > 30,
    make(s) {
      const amount = Math.round(between(s, 40, 300) * (1 + s.day / 200));
      return { title: '🧾 A chargeback', text: `A customer disputed a payment of CHF ${fmt(amount)} with their bank, and the bank sided with them.`, data: { amount }, choices: [{ label: 'OK' }] };
    },
    resolve(s, d) { s.cash -= d.amount; return `Chargeback: −CHF ${fmt(d.amount)}.`; } },
  { id: 'booster', w: 2, min: 15, cool: 9999, ok: s => !s.apps.booster,
    make() {
      return { title: '🚀 "Make your store 3× faster!"', text: 'An email offers Speed Booster Pro for CHF 9 a month: "One click and your store loads three times faster."', choices: [{ label: 'Install it' }, { label: 'Delete the email' }] };
    },
    resolve(s, d, c) {
      if (c !== 0) return 'You deleted the speed booster email.';
      s.apps.booster = true;
      return 'Speed Booster Pro installed. It added three scripts to every page, so the store got slower. You can remove it under Apps.';
    } },
  { id: 'press', w: 1, min: 60, cool: 90, ok: s => stats(s).design >= 50,
    make() { return { title: '📰 A design blog featured your store', text: 'Your store made a list of beautiful online shops. Expect extra visitors for three days.', choices: [{ label: 'OK' }] }; },
    resolve(s) { addEffect(s, { kind: 'traffic', mul: 1.8, until: s.day + 2 }); return 'Featured on a design blog.'; } },
  { id: 'appupdate', w: 1.2, min: 30, cool: 60, ok: s => Object.keys(s.apps).length >= 2,
    make(s) {
      const hit = s.done.apps ? 3 : 10;
      return { title: '🐢 An app update slowed the store', text: `One of your apps shipped an update that loads a 600 KB script on every page. Speed score −${hit} for ten days.`, data: { hit }, choices: [{ label: 'OK' }] };
    },
    resolve(s, d) { addEffect(s, { kind: 'perf', add: -d.hit, until: s.day + 9 }); return `An app update cost ${d.hit} speed points.`; } },
  { id: 'badreviews', w: 1.5, min: 30, cool: 45, ok: s => s.reviews >= 20 && s.rating < 3.9,
    make() { return { title: '😠 Bad reviews are piling up', text: 'Low-quality products are getting poor reviews, and new visitors read them. Trust −12 for two weeks. Products from better suppliers (more stars in the hub) get better reviews.', choices: [{ label: 'OK' }] }; },
    resolve(s) { addEffect(s, { kind: 'trust', add: -12, until: s.day + 13 }); return 'A wave of bad reviews.'; } },
  { id: 'supplier', w: 1.5, min: 30, cool: 50, ok: s => listedOf(s).some(p => avgDemand(p) > 0),
    make(s) {
      const p = pick(s, listedOf(s).filter(p => avgDemand(p) > 0));
      const qty = Math.max(p.moq, Math.ceil(avgDemand(p) * 28));
      const cost = Math.round(qty * p.cost * .85);
      return { title: '🤝 A supplier offers a discount', text: `Your supplier of ${p.emoji} ${p.name} offers 15% off an order of ${qty} units (about four weeks of sales): CHF ${fmt(cost)}.`,
        data: { pid: p.id, qty, cost }, choices: [{ label: 'Buy', cost }, { label: 'Not now' }] };
    },
    resolve(s, d, c) {
      if (c !== 0) return 'You passed on the supplier discount.';
      const p = s.products[d.pid];
      s.cash -= d.cost; p.incoming.push({ day: s.day + leadOf(s, p), qty: d.qty });
      return `Ordered ${d.qty} × ${p.name} at 15% off.`;
    } },
];

function maybeEvent(s) {
  if (s.day - s.lastEvent < 4 || rand(s) > .06) return;
  const ok = EVENTS.filter(e => s.day >= e.min && s.day - (s.seen[e.id] ?? -9999) >= e.cool && e.ok(s));
  if (!ok.length) return;
  const e = weightedPick(s, ok, e => e.w);
  s.seen[e.id] = s.lastEvent = s.day;
  s.pending = { id: e.id, ...e.make(s) };
}

export function resolveEvent(s, choice) {
  const pe = s.pending;
  if (!pe) return;
  const c = pe.choices[choice];
  if (c && c.cost && s.cash < c.cost) return 'Not enough cash for that.';
  s.pending = null;
  const e = EVENTS.find(x => x.id === pe.id);
  if (e) note(s, e.resolve(s, pe.data || {}, choice), 'info');
}

function scheduled(s) {
  const doy = s.day % YEAR;
  if (doy === BLACK_FRIDAY - 14) note(s, '🛍️ Black Friday is in two weeks. Order stock now: supplier lead times are long, and visitors nearly double that weekend.', 'warn');
  if (doy === BLACK_FRIDAY) note(s, '🛍️ Black Friday weekend has started.', 'good');
  if (doy === BLACK_FRIDAY + 4 && s.flags.bfSold && !s.flags.bfLost) award(s, 'bf', 'Black Friday without a single sold-out product');
  if (doy === BLACK_FRIDAY + 4) { s.flags.bfLost = 0; s.flags.bfSold = 0; }
  if (doy === XMAS_CUTOFF) note(s, '🎄 Christmas delivery cut-off: from today, fewer people order.', 'info');
  if (doy === 0 && s.day > 0) {
    const year = s.day / YEAR, worth = netWorth(s);
    s.best = Math.max(s.best || 0, worth);
    s.pending = { id: 'year', title: `🎉 Year ${year} is over`, text: `${s.name} made CHF ${fmt(s.totals.revenue)} in revenue from ${fmt(s.totals.orders)} orders. Profit: CHF ${fmt(s.totals.profit)}. Net worth (cash plus stock): CHF ${fmt(worth)}.`,
      data: { worth }, choices: [{ label: 'Keep playing' }, { label: 'Open a new store' }] };
  }
}

// ---- milestones
const MILESTONES = [
  ['first', 'First sale', s => s.totals.orders >= 1],
  ['o100', '100 orders', s => s.totals.orders >= 100],
  ['o1k', '1,000 orders', s => s.totals.orders >= 1000],
  ['o10k', '10,000 orders', s => s.totals.orders >= 10000],
  ['r10k', 'CHF 10,000 in revenue', s => s.totals.revenue >= 1e4],
  ['r100k', 'CHF 100,000 in revenue', s => s.totals.revenue >= 1e5],
  ['r1m', 'CHF 1 million in revenue', s => s.totals.revenue >= 1e6],
  ['p10', '10 products in the store', s => listedOf(s).length >= 10],
  ['p40', 'The whole supplier hub in your store', s => listedOf(s).length >= 40],
  ['stars', '4.8 stars from 50+ reviews', s => s.reviews >= 50 && s.rating >= 4.8],
  ['fast', 'Speed score 90 or more', s => stats(s).perf >= 90],
  ['plus', 'On the Plus plan', s => s.plan === 'plus'],
  ['all', 'Every project with Emanuel finished', s => PROJECTS.every(P => lv(s, P.id) === P.levels.length)],
];
function award(s, id, name) {
  if (s.got[id] !== undefined) return;
  s.got[id] = s.day;
  note(s, `🏆 ${name}`, 'win');
}
function milestones(s) { for (const [id, name, ok] of MILESTONES) if (s.got[id] === undefined && ok(s)) award(s, id, name); }
export const milestoneList = () => [...MILESTONES.map(([id, name]) => [id, name]), ['bf', 'Black Friday without a single sold-out product']];

// ---- player actions. Each returns an error message, or nothing when it worked.
export function addProduct(s, id) {
  const p = s.products[id];
  if (!p || p.listed) return;
  if (p.everListed) { p.listed = true; note(s, `${p.emoji} ${p.name} is back in the store.`); return; }
  const cost = listFee(p) + p.moq * p.cost;
  if (s.cash < cost) return `You need CHF ${fmt(cost)} for photos, a product page and a first order.`;
  s.cash -= listFee(p);
  buy(s, p, p.moq);
  p.listed = p.everListed = true;
  note(s, `${p.emoji} ${p.name} added. The first ${p.moq} units arrive in ${leadOf(s, p)} days.`);
}
export function removeProduct(s, id) { const p = s.products[id]; if (p) { p.listed = false; p.everListed = true; note(s, `${p.emoji} ${p.name} taken out of the store. Its stock stays in the warehouse.`); } }
export function setPrice(s, id, price) { const p = s.products[id]; if (p) p.price = clamp(Math.round(price * 10) / 10, round2(p.cost * 1.05), round2(p.msrp * 2)); }
export function toggleAuto(s, id) { const p = s.products[id]; if (p) p.auto = !p.auto; }
export function orderStock(s, id, qty) {
  const p = s.products[id];
  if (!p || !(qty > 0)) return;
  if (!buy(s, p, qty)) return `Not enough cash for ${qty} units (CHF ${fmt(qty * p.cost)}).`;
}
export const restockSuggestion = (s, p) => Math.max(p.moq, Math.ceil(Math.max(avgDemand(p), .5) * (leadOf(s, p) + 14)));

export function setAds(s, amount) { s.ads = clamp(Math.round(amount), 0, 20000); }
export function sendCampaign(s) {
  if (s.list < 50) return 'You need at least 50 subscribers.';
  if (s.day - s.campaign.last < CAMPAIGN_COOLDOWN) return 'Your subscribers got an email this week already.';
  s.campaign = { until: s.day + 1, last: s.day };
  s.list *= .985;
  note(s, `✉️ Newsletter sent to ${fmt(s.list)} subscribers.`);
}
export function writePost(s) {
  if (s.cash < POST_COST) return `A blog post costs CHF ${POST_COST}.`;
  if (s.day - s.lastPost < 3) return 'One post every three days: good posts take time.';
  s.cash -= POST_COST; s.posts++; s.lastPost = s.day;
  note(s, s.posts <= POST_LIMIT ? `📝 Blog post ${s.posts} published (+1.2 SEO).` : '📝 Blog post published. Google has enough of your posts; more no longer move your SEO.');
}
export function startSale(s, pct) {
  if (s.day - s.sale.last < SALE_COOLDOWN) return `Sales lose their pull if you run them too often. Next one in ${SALE_COOLDOWN - (s.day - s.sale.last)} days.`;
  s.sale = { pct, until: s.day + SALE_DAYS - 1, last: s.day };
  note(s, `🏷️ ${Math.round(pct * 100)}% sale on everything for ${SALE_DAYS} days.`);
}

export function projectState(s, P) {
  const done = lv(s, P.id), queued = s.dev.filter(j => j.id === P.id).length, next = done + queued;
  const max = P.levels.length;
  const need = next < max && P.need ? P.need[next] : null;
  return { done, queued, next, max, cost: next < max ? P.levels[next][0] : 0, days: next < max ? P.levels[next][1] : 0, need: need && PLAN_ORDER.indexOf(s.plan) < PLAN_ORDER.indexOf(need) ? need : null };
}
export function bookProject(s, id) {
  const P = project(id), ps = projectState(s, P);
  if (ps.next >= ps.max) return;
  if (ps.need) return `This needs the ${PLANS[ps.need].name} plan.`;
  if (s.dev.length >= 3) return 'Emanuel\'s queue is full. He works on one project at a time.';
  if (s.cash < ps.cost) return `You need CHF ${fmt(ps.cost)}.`;
  s.cash -= ps.cost;
  s.dev.push({ id, level: ps.next + 1, left: ps.days, total: ps.days });
  note(s, `${P.icon} Booked Emanuel: ${P.name}${ps.max > 1 ? ` (level ${ps.next + 1})` : ''}.`);
}
export function installApp(s, id) {
  if (!APPS[id] || s.apps[id]) return;
  s.apps[id] = true;
  note(s, `${APPS[id].icon} Installed ${APPS[id].name}.`);
}
export function removeApp(s, id) { if (s.apps[id]) { delete s.apps[id]; note(s, `Removed ${APPS[id].name}.`); } }
export function setPlan(s, id) { if (PLANS[id] && s.plan !== id) { s.plan = id; note(s, `Switched to the ${PLANS[id].name} plan.`); } }

// ---- advice for the overview, most urgent first
export function advice(s) {
  const st = stats(s), last = s.last, tips = [];
  if (s.cash < 0) tips.push('You are in overdraft and paying interest. Pause ads and let stock sell before buying more.');
  const short = st.listed.filter(p => !p.auto && avgDemand(p) > 0 && p.stock + onOrder(p) < avgDemand(p) * 4);
  if (short.length) tips.push(`${short[0].emoji} ${short[0].name} runs out in a few days and auto-restock is off.`);
  if (last && last.lost > Math.max(3, last.units * .2)) tips.push(`You couldn't fill ${fmt(last.lost)} units yesterday. Restock sooner, or buy bigger batches.`);
  const doy = st.cal.doy;
  if (doy >= BLACK_FRIDAY - 35 && doy < BLACK_FRIDAY) tips.push(`Black Friday is in ${BLACK_FRIDAY - doy} days. Stock up early: lead times are long and visitors nearly double.`);
  if (last && s.ads > 0 && last.adRev < s.ads * 1.5) tips.push(`Ads brought about CHF ${fmt(last.adRev)} in sales for CHF ${fmt(s.ads)}. Raise conversion before you buy more traffic.`);
  if (st.design < 40 && s.day > 3) tips.push('Your store still runs on a free template. A custom design lifts both conversion and trust.');
  if (st.perf < 50) tips.push(`Pages take ${st.loadTime.toFixed(1)} s to load. Every app adds scripts. Speed work, or fewer apps, wins back buyers.`);
  if (st.n > 12 && lv(s, 'search') < 2) tips.push(`${st.n} products without good search: visitors give up looking. Search and filters fix that.`);
  if (st.seo < 30 && s.day > 14) tips.push('Hardly anyone finds you on Google yet. SEO work and blog posts bring visitors you don\'t pay for.');
  if (st.n < 4 && s.cash > 1200) tips.push('A store with one product is a hobby. Add products from the supplier hub.');
  if (!s.apps.reviews && s.totals.orders > 40) tips.push('Customers trust reviews. A reviews app collects them much faster.');
  return tips.slice(0, 3);
}
