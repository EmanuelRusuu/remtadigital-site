// Refresh the per-country popularity in data/popularity.json from the Chrome UX Report (CrUX)
// country top lists, as published monthly in github.com/zakird/crux-top-lists. CrUX ranks web
// origins by Chrome page loads in each country and only publishes rank buckets (top 1,000,
// 5,000, 10,000, 50,000, 100,000, 500,000), so each site gets its best bucket per country across
// all origins of its domain (www.example.ch, shop.example.ch, ...).
// Countries: all of Europe plus each project's home market. Downloads are cached in scripts/.cache.
// Usage: node regional.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const ROOT = new URL('../', import.meta.url);
const RAW = 'https://raw.githubusercontent.com/zakird/crux-top-lists/main/data/country';
const EUROPE = 'ad al at ba be bg by ch cy cz de dk ee es fi fr gb gr hr hu ie is it li lt lu lv mc md me mk mt nl no pl pt ro rs se si sk sm ua xk'.split(' ');

const projects = JSON.parse(readFileSync(new URL('data/projects.json', ROOT), 'utf8'));
const path = new URL('data/popularity.json', ROOT);
const pop = JSON.parse(readFileSync(path, 'utf8'));

const registrable = url => new URL(url).host.replace(/^www\./, '').split('.').slice(-2).join('.');
const marketOf = d => (pop.markets || {})[d] || d.split('.').pop();

// Every domain a project's traffic is counted on: its live URL, an alias, and any extra stores.
const domains = new Set();
for (const p of projects.filter(p => p.url)) {
  const d = registrable(p.url);
  domains.add(d);
  if ((pop.aliases || {})[d]) domains.add(pop.aliases[d]);
  for (const x of (pop.extraDomains || {})[p.slug] || []) domains.add(x);
}
const countries = [...new Set([...EUROPE, ...[...domains].map(marketOf).filter(c => c.length === 2)])];

// The newest month published for Switzerland is used for every country.
const listing = await (await fetch('https://api.github.com/repos/zakird/crux-top-lists/contents/data/country/ch')).json();
const month = listing.map(f => f.name).filter(n => /^\d{6}\.csv\.gz$/.test(n)).sort().pop().slice(0, 6);
const cache = new URL(`scripts/.cache/crux-${month}/`, ROOT);
mkdirSync(cache, { recursive: true });

const sites = {};
for (const cc of countries) {
  const file = new URL(`${cc}.csv.gz`, cache);
  if (!existsSync(file)) {
    const res = await fetch(`${RAW}/${cc}/${month}.csv.gz`);
    if (!res.ok) { console.log(`${cc}: no list for ${month}`); continue; }
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  for (const line of gunzipSync(readFileSync(file)).toString().split('\n').slice(1)) {
    const [origin, bucket] = line.split(',');
    if (!origin) continue;
    const host = origin.replace(/^https?:\/\//, '');
    for (const d of domains) {
      if (host !== d && !host.endsWith('.' + d)) continue;
      const s = (sites[d] ||= {});
      s[cc] = Math.min(s[cc] || Infinity, +bucket);
    }
  }
}

for (const d of domains) {
  const s = sites[d] || {};
  console.log(d.padEnd(26), Object.entries(s).sort((a, b) => a[1] - b[1]).map(([c, b]) => `${c}:${b}`).join(' ') || 'not listed');
}

pop.regional = {
  source: 'Chrome UX Report country top lists (github.com/zakird/crux-top-lists), best rank bucket per country across the domain\'s origins',
  month: `${month.slice(0, 4)}-${month.slice(4)}`,
  sites: Object.fromEntries(Object.entries(sites).sort()),
};
writeFileSync(path, JSON.stringify(pop, null, 2) + '\n');
console.log(`saved ${Object.keys(sites).length} of ${domains.size} domains (${countries.length} countries, ${month})`);
