// Serves the static site from public/. Requests to www.remtadigital.com are redirected to the
// apex domain with a 301, so search engines see one site instead of two copies.
//
// Cookie-free counter: main.js sends POST /api/hit?e=cv|email (navigator.sendBeacon) when someone
// downloads the CV or clicks an email link. Only the day, the event name and a running count are
// stored, in one SQLite-backed Durable Object: no cookies, no IP address, no user agent.
// GET /api/stats returns the totals as JSON, with the header "Authorization: Bearer <STATS_TOKEN>"
// (set the secret with `npx wrangler secret put STATS_TOKEN`; without it the endpoint is a 404).
//
// Contact form: POST /api/contact (the form on every page with a contact section) is checked and sent
// as a plain-text email through Cloudflare Email Routing (the MAILER binding) to CONTACT_TO, a secret
// holding a verified Email Routing destination, so no address is kept in the repository. Nothing is
// stored; a sent message only adds one to the "form" count. main.js asks for JSON; a browser without
// JavaScript gets a redirect to /thanks/ (or /de/danke/).
import { DurableObject } from 'cloudflare:workers';
import { EmailMessage } from 'cloudflare:email';

const EVENTS = ['cv', 'email', 'form'];

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

const FROM = 'website@remtadigital.com';
const BUDGETS = { 'unsure': 'Not sure yet', 'under-1k': 'Under €1,000', '1k-3k': '€1,000 to €3,000', '3k-10k': '€3,000 to €10,000', 'over-10k': 'Over €10,000' };
const EMAIL = /^[^\s@<>()[\]",;:\\]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

// UTF-8 text as base64, for the encoded subject and display names and for the message body.
const base64 = s => { let bin = ''; for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b); return btoa(bin); };
const encodedWord = s => `=?UTF-8?B?${base64(s)}?=`;
// Control characters out of one-line fields; the message keeps its line breaks and tabs.
const oneLine = s => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
const multiLine = s => s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();

async function contact(request, env, url) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return new Response(null, { status: 403 });
  let form = null;
  try { form = await request.formData(); } catch { /* not a form post */ }
  const lang = form && form.get('lang') === 'de' ? 'de' : 'en';
  const json = (request.headers.get('Accept') || '').includes('application/json');
  const reply = (ok, error) => json
    ? Response.json(ok ? { ok } : { ok, error }, { status: ok ? 200 : error === 'unavailable' ? 503 : 400, headers: { 'Cache-Control': 'no-store' } })
    : Response.redirect(new URL(ok ? (lang === 'de' ? '/de/danke/' : '/thanks/') : (lang === 'de' ? '/de/#kontakt' : '/#contact'), url.origin).toString(), 303);
  if (!form) return reply(false, 'invalid');
  // Bots fill the hidden "website" field; they get the same answer as a person, and nothing is sent.
  if (String(form.get('website') || '')) return reply(true);

  const get = k => String(form.get(k) || '');
  const name = oneLine(get('name')), email = oneLine(get('email')), store = oneLine(get('store'));
  const message = multiLine(get('message')), budget = BUDGETS[get('budget')] || BUDGETS.unsure;
  if (!name || name.length > 100 || !EMAIL.test(email) || email.length > 200 || store.length > 200 || message.length < 10 || message.length > 5000) return reply(false, 'invalid');
  if (!env.MAILER || !env.CONTACT_TO) return reply(false, 'unavailable');

  let page = '';
  try { page = new URL(request.headers.get('Referer') || '').pathname; } catch { /* no referer */ }
  const body = [`Name: ${name}`, `Email: ${email}`, `Store: ${store || '-'}`, `Budget: ${budget}`, `Page: ${page || '-'} (${lang})`, '', message, ''].join('\n');
  const raw = [
    `From: ${encodedWord('remtadigital.com')} <${FROM}>`,
    `To: <${env.CONTACT_TO}>`,
    `Reply-To: ${encodedWord(name)} <${email}>`,
    `Subject: ${encodedWord(`Website enquiry from ${name}`)}`,
    `Message-ID: <${crypto.randomUUID()}@remtadigital.com>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64(body.replace(/\n/g, '\r\n')).replace(/.{1,76}/g, '$&\r\n'),
  ].join('\r\n');
  try {
    await env.MAILER.send(new EmailMessage(FROM, env.CONTACT_TO, raw));
  } catch (e) {
    console.error('contact form: sending failed', e && e.message);
    return reply(false, 'unavailable');
  }
  await counter(env).hit('form');
  return reply(true);
}

async function api(request, env, url) {
  if (url.pathname === '/api/contact') return contact(request, env, url);
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
