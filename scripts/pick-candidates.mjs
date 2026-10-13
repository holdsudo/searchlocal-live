// Picks the next few OpenStreetMap businesses for the weekly auto-add.
// Refreshes the OSM pool at most once every 30 days (Overpass is a shared, free service).
// Writes automation/candidates.json — the agent tries them in order until one verifies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AUTO = path.join(ROOT, 'automation');
const DATA = path.join(ROOT, 'src', 'data');
const POOL = path.join(AUTO, 'osm-pool.json');
const TRIED = path.join(DATA, 'osm-tried.json');
const COUNT = Number(process.argv[2] || 5);

const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const QUERY = `[out:json][timeout:120];
area["name"="Ocean County"]["admin_level"="6"]->.a;
(nwr(area.a)["name"]["shop"];nwr(area.a)["name"]["amenity"~"restaurant|cafe|fast_food|bar|pub|dentist|doctors|clinic|veterinary|car_repair|ice_cream"];nwr(area.a)["name"]["craft"];nwr(area.a)["name"]["office"~"lawyer|estate_agent|accountant|insurance|financial"];nwr(area.a)["name"]["leisure"="fitness_centre"];);
out tags center;`;

// Rough OSM tag -> directory category, used only to prioritise (the agent makes the final call).
const KIND_TO_CAT = {
  restaurant: 'restaurants', fast_food: 'restaurants', bar: 'restaurants', pub: 'restaurants', ice_cream: 'cafes-bakeries',
  cafe: 'cafes-bakeries', bakery: 'cafes-bakeries', plumber: 'plumbing', hvac: 'hvac', electrician: 'electricians',
  car_repair: 'auto-repair', tyres: 'auto-repair', hairdresser: 'salons-barbers', beauty: 'salons-barbers', fitness_centre: 'fitness',
  dentist: 'health-dental', doctors: 'health-dental', clinic: 'health-dental', lawyer: 'legal', estate_agent: 'real-estate',
  gardener: 'landscaping', veterinary: 'pets', pet: 'pets', pet_grooming: 'pets', insurance: 'finance-insurance', accountant: 'finance-insurance',
  financial: 'finance-insurance', cleaning: 'cleaning', dry_cleaning: 'cleaning', laundry: 'cleaning',
};
const SKIP_KINDS = new Set(['massage', 'pawnbroker', 'money_lender', 'e-cigarette', 'tobacco', 'cannabis', 'adult', 'erotic', 'weapons', 'funeral_directors', 'vacant']);

async function refreshPool() {
  const fresh = fs.existsSync(POOL) && Date.now() - fs.statSync(POOL).mtimeMs < 30 * 864e5;
  if (fresh) return JSON.parse(fs.readFileSync(POOL, 'utf8'));
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'searchlocal.live directory (hello@searchlocal.live)' }, body: new URLSearchParams({ data: QUERY }), signal: AbortSignal.timeout(180000) });
      const text = await res.text();
      if (!text.startsWith('{')) continue;
      const els = JSON.parse(text).elements;
      const pool = els
        .filter((e) => !e.tags.brand && !e.tags['brand:wikidata'])
        .filter((e) => e.tags['addr:street'] && (e.tags.phone || e.tags['contact:phone']) && (e.tags.website || e.tags['contact:website']))
        .map((e) => {
          const t = e.tags;
          const kind = t.amenity || t.shop || t.craft || t.office || t.leisure;
          return {
            osm: `${e.type}/${e.id}`, name: t.name, kind, hint: KIND_TO_CAT[kind] || null,
            address: `${t['addr:housenumber'] || ''} ${t['addr:street']}`.trim(), city: t['addr:city'] || null, zip: t['addr:postcode'] || null,
            phone: t.phone || t['contact:phone'], website: t.website || t['contact:website'], hours: t.opening_hours || null,
          };
        })
        .filter((c) => !SKIP_KINDS.has(c.kind));
      fs.mkdirSync(AUTO, { recursive: true });
      fs.writeFileSync(POOL, JSON.stringify(pool, null, 1));
      return pool;
    } catch { /* try next mirror */ }
  }
  if (fs.existsSync(POOL)) return JSON.parse(fs.readFileSync(POOL, 'utf8')); // stale beats nothing
  throw new Error('Overpass unavailable and no cached pool');
}

const pool = await refreshPool();
const listings = JSON.parse(fs.readFileSync(path.join(DATA, 'listings.json'), 'utf8'));
const tried = fs.existsSync(TRIED) ? JSON.parse(fs.readFileSync(TRIED, 'utf8')) : {};
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const listedNames = new Set(listings.map((l) => norm(l.name)));
const catCount = {};
for (const l of listings) catCount[l.category] = (catCount[l.category] || 0) + 1;

// Prefer categories with the fewest listings; unknown categories rank after known empty ones.
const score = (c) => (c.hint ? catCount[c.hint] || 0 : 4) + (c.hint === 'restaurants' ? 3 : 0);
const open = pool.filter((c) => !tried[c.osm] && !listedNames.has(norm(c.name)));
// Seeded by week so retries in the same week see the same order.
const week = Math.floor(Date.now() / (7 * 864e5));
const jitter = (s) => { let h = week; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 1000) / 1000; };
open.sort((a, b) => score(a) - score(b) || jitter(a.osm) - jitter(b.osm));

const picks = open.slice(0, COUNT);
fs.mkdirSync(AUTO, { recursive: true });
fs.writeFileSync(path.join(AUTO, 'candidates.json'), JSON.stringify(picks, null, 1));
console.log(`pool ${pool.length}, untried ${open.length}, picked ${picks.length}: ${picks.map((p) => `${p.name} [${p.hint || p.kind}]`).join('; ')}`);
