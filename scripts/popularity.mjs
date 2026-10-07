// Refresh data/popularity.json with each project domain's latest rank in the Tranco list
// (https://tranco-list.eu), used by the "Most visited site" sort. The API is rate limited,
// so domains are queried one at a time with a pause in between.
// Usage: node popularity.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const projects = JSON.parse(readFileSync(new URL('data/projects.json', ROOT), 'utf8'));
const path = new URL('data/popularity.json', ROOT);
const prev = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
const aliases = prev.aliases || {};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const domains = [...new Set(projects.filter(p => p.url).map(p => {
  const d = new URL(p.url).host.replace(/^www\./, '').split('.').slice(-2).join('.');
  return aliases[d] || d;
}))];

const ranks = {};
let date = prev.date || null;
for (const d of domains) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://tranco-list.eu/api/ranks/domain/${d}`);
    if (res.status === 429) { await sleep(6000); continue; }
    const j = await res.json();
    ranks[d] = j.ranks && j.ranks.length ? j.ranks[0].rank : null;
    if (j.ranks && j.ranks.length) date = j.ranks[0].date;
    break;
  }
  console.log(d.padEnd(28), ranks[d] ?? 'not listed');
  await sleep(2500);
}

writeFileSync(path, JSON.stringify({
  source: 'Tranco list (tranco-list.eu), latest daily rank of the registrable domain',
  date, ranks, aliases,
}, null, 2) + '\n');
console.log(`saved ${Object.values(ranks).filter(Boolean).length} ranks (${date})`);
