// Serves the static site from public/. Requests to www.remtadigital.com are redirected to the
// apex domain with a 301, so search engines see one site instead of two copies.
//
// Cookie-free counter: main.js sends POST /api/hit?e=cv|email (navigator.sendBeacon) when someone
// downloads the CV or clicks an email link. Only the day, the event name and a running count are
// stored, in one SQLite-backed Durable Object: no cookies, no IP address, no user agent.
// GET /api/stats returns the totals as JSON, with the header "Authorization: Bearer <STATS_TOKEN>"
// (set the secret with `npx wrangler secret put STATS_TOKEN`; without it the endpoint is a 404).
import { DurableObject } from 'cloudflare:workers';

const EVENTS = ['cv', 'email'];

export class Counter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS hits (day TEXT NOT NULL, event TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, event))');
    });
  }

  hit(event) {
    const day = new Date().toISOString().slice(0, 10);
    this.ctx.storage.sql.exec('INSERT INTO hits (day, event, n) VALUES (?, ?, 1) ON CONFLICT (day, event) DO UPDATE SET n = n + 1', day, event);
  }

  stats() {
    const rows = this.ctx.storage.sql.exec('SELECT day, event, n FROM hits ORDER BY day DESC, event').toArray();
    const totals = Object.fromEntries(EVENTS.map(e => [e, 0]));
    const days = {};
    for (const { day, event, n } of rows) {
      totals[event] = (totals[event] || 0) + n;
      (days[day] ||= {})[event] = n;
    }
    return { totals, days };
  }
}

const counter = env => env.COUNTER.get(env.COUNTER.idFromName('hits'));

// Compare the bearer token without leaking its length or content through timing.
async function authorised(request, token) {
  const given = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, token].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  return crypto.subtle.timingSafeEqual(a, b);
}

async function api(request, env, url) {
  if (url.pathname === '/api/hit') {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    const event = url.searchParams.get('e');
    if (!EVENTS.includes(event)) return new Response(null, { status: 400 });
    // Only count beacons sent from this site's own pages.
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return new Response(null, { status: 403 });
    await counter(env).hit(event);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }
  if (url.pathname === '/api/stats' && env.STATS_TOKEN) {
    if (!(await authorised(request, env.STATS_TOKEN))) return new Response('Unauthorized\n', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
    return Response.json(await counter(env).stats(), { headers: { 'Cache-Control': 'no-store' } });
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.remtadigital.com') {
      url.hostname = 'remtadigital.com';
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith('/api/')) {
      const res = await api(request, env, url);
      if (res) return res;
    }
    return env.ASSETS.fetch(request);
  },
};
