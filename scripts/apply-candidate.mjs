// Gate between the verification agent and the live site.
// Reads automation/result.json, re-checks the accepted listing mechanically,
// and only then appends it to src/data/listings.json. Every candidate the agent
// looked at is recorded in src/data/osm-tried.json so it is never retried.
// Exit 0 = one listing added; exit 2 = nothing added (not an error); exit 1 = failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'src', 'data');
const read = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const write = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');

const result = read(path.join(ROOT, 'automation', 'result.json'), null);
if (!result) { console.error('no automation/result.json'); process.exit(1); }
const candidates = read(path.join(ROOT, 'automation', 'candidates.json'), []);
const listings = read(path.join(DATA, 'listings.json'), []);
const categories = read(path.join(DATA, 'categories.json'), []);
const towns = read(path.join(DATA, 'towns.json'), []);
const tried = read(path.join(DATA, 'osm-tried.json'), {});
const today = new Date().toISOString().slice(0, 10);

for (const r of result.rejected || []) if (r.osm) tried[r.osm] = { name: r.name, result: 'rejected', reason: String(r.reason || '').slice(0, 200), date: today };

const slugify = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const digits = (s) => String(s || '').replace(/\D/g, '');
const BANNED = /\b(best|#1|number one|top[- ]rated|award[- ]winning|leading|premier|finest|world[- ]class|unbeatable|guaranteed|cheapest)\b/i;
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

async function check(l) {
  const fail = (m) => { throw new Error(m); };
  if (!candidates.some((c) => c.osm === l.osm)) fail(`osm ${l.osm} was not one of this run's candidates`);
  for (const k of ['name', 'category', 'town', 'address', 'zip', 'phone', 'website', 'summary', 'description']) if (!l[k] || typeof l[k] !== 'string') fail(`missing ${k}`);
  if (!categories.some((c) => c.slug === l.category)) fail(`unknown category ${l.category}`);
  if (!/^\(\d{3}\) \d{3}-\d{4}$/.test(l.phone)) fail(`bad phone format ${l.phone}`);
  if (!/^08\d{3}$/.test(l.zip)) fail(`zip ${l.zip} is not NJ`);
  if (!/^https:\/\//.test(l.website)) fail('website must be https');
  if (l.summary.length > 160) fail('summary too long');
  if (l.description.length < 120 || l.description.length > 700) fail('description length out of range');
  if (!Array.isArray(l.services) || l.services.length < 2 || l.services.length > 6) fail('services must be 2-6 items');
  for (const t of [l.summary, l.description, ...l.services]) if (BANNED.test(t)) fail(`banned marketing claim in: ${t}`);
  if (l.hours != null) {
    if (typeof l.hours !== 'object') fail('hours must be object or null');
    for (const d of DAYS) { const v = l.hours[d]; if (v !== null && !/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail(`bad hours ${d}=${v}`); }
  }
  if (l.since != null && !(Number.isInteger(l.since) && l.since > 1850 && l.since <= new Date().getFullYear())) fail('bad since');
  if (listings.some((x) => slugify(x.name) === slugify(l.name))) fail('duplicate business');

  // The decisive check: the business's own website must show this phone number and street number.
  const res = await fetch(l.website, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) fail(`website returned ${res.status}`);
  let html = await res.text();
  const contact = html.match(/href="([^"]*contact[^"]*)"/i);
  if (contact) {
    try { html += await (await fetch(new URL(contact[1], res.url), { signal: AbortSignal.timeout(20000) })).text(); } catch { /* home page alone may suffice */ }
  }
  const flat = digits(html);
  if (!flat.includes(digits(l.phone))) fail('phone number not found on the business website');
  const num = (l.address.match(/^\d+/) || [])[0];
  if (num && !new RegExp(`\\b${num}\\b`).test(html)) fail(`street number ${num} not found on the business website`);
}

const accepted = (result.accepted || []).slice(0, 1);
let added = null;
for (const l of accepted) {
  try {
    await check(l);
    let town = towns.find((t) => t.name.toLowerCase() === l.town.toLowerCase());
    if (!town) {
      town = { slug: slugify(l.town), name: l.town, county: 'Ocean County', state: 'NJ' };
      towns.push(town);
      write(path.join(DATA, 'towns.json'), towns);
    }
    added = {
      slug: slugify(l.name), name: l.name, category: l.category, town: town.slug, address: l.address, zip: l.zip, phone: l.phone,
      website: l.website, hours: l.hours ?? null, since: l.since ?? null, featured: false, sample: false, source: 'osm', added: today,
      summary: l.summary, description: l.description, services: l.services,
    };
    listings.push(added);
    write(path.join(DATA, 'listings.json'), listings);
    tried[l.osm] = { name: l.name, result: 'listed', date: today };
  } catch (err) {
    console.error(`GATE REJECTED ${l.name}: ${err.message}`);
    tried[l.osm] = { name: l.name, result: 'gate-rejected', reason: err.message, date: today };
  }
}
write(path.join(DATA, 'osm-tried.json'), tried);
if (added) { console.log(`ADDED ${added.name} (${added.category}, ${added.town})`); process.exit(0); }
console.log('nothing added this run'); process.exit(2);
