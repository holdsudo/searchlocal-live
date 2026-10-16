// Picks this week's blog topic from the directory's own verified listings.
// Writes automation/post-brief.json for the writing agent. Exit 0 = brief written; exit 2 = no fresh topic.
// A topic needs at least 3 businesses, at least 2 of them never featured in a post before.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'src', 'data');
const POSTS = path.join(ROOT, 'src', 'posts');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const listings = read('listings.json').filter((l) => !l.sample && l.slug !== 'champion-auto-finance'); // keep CAF out of editorial content
const categoryList = read('categories.json');
const categories = Object.fromEntries(categoryList.map((c) => [c.slug, c.name]));
const queries = Object.fromEntries(categoryList.map((c) => [c.slug, (c.query || c.name).charAt(0).toUpperCase() + (c.query || c.name).slice(1)]));
const towns = Object.fromEntries(read('towns.json').map((t) => [t.slug, t.name]));

const posts = fs.readdirSync(POSTS).filter((f) => f.endsWith('.html')).map((f) => {
  const m = fs.readFileSync(path.join(POSTS, f), 'utf8').match(/^<!--([\s\S]*?)-->/);
  return { slug: f.replace(/\.html$/, ''), ...JSON.parse(m[1]) };
}).sort((a, b) => b.date.localeCompare(a.date));
const featured = new Set(posts.flatMap((p) => p.businesses || []));
const lastType = posts[0]?.topicType || 'category';

const open = (l, d) => l.hours && l.hours[d];
const closesAt = (l, d) => (open(l, d) ? open(l, d).split('-')[1] : null);
const daysAgo = (d) => (Date.now() - new Date(d + 'T12:00:00Z')) / 864e5;

const topics = [];
const add = (type, key, angle, members) => {
  members = [...members].sort((a, b) => featured.has(a.slug) - featured.has(b.slug)).slice(0, 6); // unfeatured first
  if (members.length < 3) return;
  const fresh = members.filter((l) => !featured.has(l.slug)).length;
  if (fresh < 2) return;
  topics.push({ type, key, angle, fresh, members });
};

for (const [slug, name] of Object.entries(categories)) add('category', `category:${slug}`, `${queries[slug]} in Ocean County, NJ: a factual guide to the ${name.toLowerCase()} businesses listed in the directory`, listings.filter((l) => l.category === slug));
for (const [slug, name] of Object.entries(towns)) add('town', `town:${slug}`, `Local businesses in ${name}, NJ: a neighborhood guide to the ${name} listings in the directory`, listings.filter((l) => l.town === slug));
for (const [catSlug, phrase] of Object.entries(queries)) {
  for (const [townSlug, townName] of Object.entries(towns)) {
    add('place', `place:${catSlug}:${townSlug}`, `${phrase} in ${townName}, NJ: a factual guide to the ${phrase.toLowerCase()} the directory lists in ${townName}`, listings.filter((l) => l.category === catSlug && l.town === townSlug));
  }
}
add('hours', 'hours:sunday', 'Open on Sunday: directory businesses whose published hours include Sundays', listings.filter((l) => open(l, 'sun')));
add('hours', 'hours:monday', 'Open on Monday: directory businesses whose published hours include Mondays (many local spots close then)', listings.filter((l) => open(l, 'mon')));
add('hours', 'hours:late', 'Open late: directory businesses whose published hours run to 9 p.m. or later on at least one night', listings.filter((l) => l.hours && Object.keys(l.hours).some((d) => (closesAt(l, d) || '00:00') >= '21:00')));
add('new', `new:${new Date().toISOString().slice(0, 7)}`, 'New on SearchLocal: businesses added to the directory in the last 30 days', listings.filter((l) => l.added && daysAgo(l.added) <= 30));

// Freshest first; break ties by switching away from last week's topic type, then by size.
topics.sort((a, b) => b.fresh - a.fresh || (a.type === lastType) - (b.type === lastType) || b.members.length - a.members.length || a.key.localeCompare(b.key));
const pick = topics[0];
if (!pick) { console.log('No topic with enough unfeatured businesses yet.'); process.exit(2); }

const brief = {
  topicType: pick.type,
  topicKey: pick.key,
  angle: pick.angle,
  today: new Date().toISOString().slice(0, 10),
  existingPostSlugs: posts.map((p) => p.slug),
  recentTitles: posts.slice(0, 10).map((p) => p.title),
  businesses: pick.members.map((l) => ({
    slug: l.slug, name: l.name, category: categories[l.category], town: towns[l.town], address: l.address, phone: l.phone,
    website: l.website, hours: l.hours, since: l.since, summary: l.summary, description: l.description, services: l.services,
    claimed: !!l.claimed,
  })),
};
fs.mkdirSync(path.join(ROOT, 'automation'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'automation', 'post-brief.json'), JSON.stringify(brief, null, 1));
console.log(`topic ${pick.key} (${pick.fresh} new): ${pick.members.map((l) => l.name).join('; ')}`);
