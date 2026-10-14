// Gate between the writing agent and the live blog.
// Reads automation/post-draft.html, checks it mechanically against automation/post-brief.json,
// and only then writes src/posts/<slug>.html dated today.
// Exit 0 = post added; exit 1 = rejected or failed (reasons printed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const POSTS = path.join(ROOT, 'src', 'posts');
const brief = JSON.parse(fs.readFileSync(path.join(ROOT, 'automation', 'post-brief.json'), 'utf8'));
const draftFile = path.join(ROOT, 'automation', 'post-draft.html');
if (!fs.existsSync(draftFile)) { console.error('no automation/post-draft.html'); process.exit(1); }
const raw = fs.readFileSync(draftFile, 'utf8').trim();

const errors = [];
const fail = (m) => errors.push(m);
const m = raw.match(/^<!--([\s\S]*?)-->/);
if (!m) { console.error('missing front matter'); process.exit(1); }
let meta;
try { meta = JSON.parse(m[1]); } catch (err) { console.error('front matter is not JSON:', err.message); process.exit(1); }
const body = raw.slice(m[0].length).trim();
const text = body.replace(/<[^>]+>/g, ' ').replace(/\{\{card:[^}]+\}\}/g, ' ');
const words = text.split(/\s+/).filter(Boolean).length;

// Front matter
const len = (k, lo, hi) => { if (typeof meta[k] !== 'string' || meta[k].length < lo || meta[k].length > hi) fail(`${k} must be ${lo}-${hi} chars`); };
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.slug || '') || meta.slug.length < 10 || meta.slug.length > 70) fail('bad slug');
if (fs.existsSync(path.join(POSTS, `${meta.slug}.html`)) || brief.existingPostSlugs.includes(meta.slug)) fail('slug already used');
len('title', 30, 90); len('description', 100, 170); len('lead', 60, 240); len('h1', 6, 60);
if (brief.recentTitles.some((t) => t.toLowerCase() === String(meta.title).toLowerCase())) fail('title repeats a recent post');
if (/<(?!\/?em>)[^>]*>/.test(meta.h1 || '')) fail('h1 may only contain <em>');
for (const k of ['title', 'description', 'lead']) if (/[<>]/.test(meta[k] || '')) fail(`${k} must be plain text`);

// Businesses: exactly the brief's, each with one section card
const allowed = new Set(brief.businesses.map((b) => b.slug));
const bizList = Array.isArray(meta.businesses) ? meta.businesses : [];
for (const b of bizList) if (!allowed.has(b)) fail(`business ${b} is not in the brief`);
for (const b of allowed) if (!bizList.includes(b)) fail(`brief business ${b} is missing`);
const cards = [...body.matchAll(/\{\{card:([a-z0-9-]+)\}\}/g)].map((x) => x[1]);
for (const b of allowed) if (cards.filter((c) => c === b).length !== 1) fail(`need exactly one {{card:${b}}}`);
for (const c of cards) if (!allowed.has(c)) fail(`card for unknown business ${c}`);

// Markup: tag + attribute whitelist
const TAGS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div']);
const sites = brief.businesses.map((b) => { try { return new URL(b.website).hostname.replace(/^www\./, ''); } catch { return null; } }).filter(Boolean);
for (const [tag, name, attrs] of body.matchAll(/<\/?([a-zA-Z0-9]+)([^>]*)>/g)) {
  const n = name.toLowerCase();
  if (!TAGS.has(n)) { fail(`tag <${n}> not allowed`); continue; }
  if (tag.startsWith('</')) continue;
  const pairs = [...attrs.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)];
  if (attrs.replace(/([a-zA-Z-]+)\s*=\s*"[^"]*"/g, '').trim()) fail(`malformed attributes in ${tag}`);
  for (const [, a, v] of pairs) {
    const ok = (a === 'href' && n === 'a') || (a === 'scope' && n === 'th' && /^(col|row)$/.test(v))
      || (a === 'class' && ((n === 'p' && v === 'post-note') || (n === 'div' && v === 'table-wrap')));
    if (!ok) fail(`attribute ${a}="${v}" not allowed on <${n}>`);
    if (a === 'href') {
      const internal = /^\/(business\/([a-z0-9-]+)\/|category\/[a-z0-9-]+\/|town\/[a-z0-9-]+\/|blog\/|add-your-business\/)$/.exec(v);
      if (internal) { if (internal[2] && !allowed.has(internal[2])) fail(`link to business not in brief: ${v}`); continue; }
      if (v === 'mailto:hello@searchlocal.live') continue;
      let host = null; try { host = new URL(v).hostname.replace(/^www\./, ''); } catch { /* bad url */ }
      if (!(v.startsWith('https://') && sites.includes(host))) fail(`link not allowed: ${v}`);
    }
  }
  if (n === 'div' && !/class="table-wrap"/.test(attrs)) fail('<div> only allowed as table-wrap');
}

// Honesty checks
const BANNED = /\b(best|#1|number one|top|top[- ]rated|award[- ]winning|leading|premier|finest|world[- ]class|unbeatable|guaranteed|cheapest|fastest|must[- ]try|hidden gem|favou?rite|beloved|famous|renowned|iconic|legendary|delicious|amazing|incredible|perfect)\b/i;
for (const t of [meta.title, meta.h1, meta.description, meta.lead, text]) { const hit = String(t).match(BANNED); if (hit) fail(`banned word "${hit[0]}"`); }
if (/!/.test(text)) fail('no exclamation marks');
const digits = (s) => String(s).replace(/\D/g, '');
const phones = new Set(brief.businesses.map((b) => digits(b.phone)));
for (const p of text.match(/\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g) || []) if (!phones.has(digits(p))) fail(`phone ${p} doesn't belong to a listed business`);
if (/\$\s?\d/.test(text)) fail('no prices (they go stale and are hard to verify)');
if (!/<p class="post-note"><strong>How we wrote this\.<\/strong>/.test(body)) fail('missing "How we wrote this" note');
if (words < 550 || words > 1500) fail(`body is ${words} words (550-1500)`);
if ((body.match(/<h2>/g) || []).length < allowed.size + 1) fail('each business needs its own h2 section, plus an intro/closing');

if (errors.length) { console.error('REJECTED:\n- ' + [...new Set(errors)].join('\n- ')); process.exit(1); }

const front = { title: meta.title, h1: meta.h1, description: meta.description, lead: meta.lead, date: brief.today, topicType: brief.topicType, topicKey: brief.topicKey, businesses: bizList };
fs.writeFileSync(path.join(POSTS, `${meta.slug}.html`), `<!--\n${JSON.stringify(front, null, 1)}\n-->\n${body}\n`);
console.log(`ADDED post ${meta.slug} (${words} words): ${meta.title}`);
