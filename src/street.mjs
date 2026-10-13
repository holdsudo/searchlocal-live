// Procedural night-time main street, rendered as three seamlessly tiling SVG layers:
//   skyline (far), shops (mid), street furniture (near).
// All layers share a 600-unit-high viewBox; the sidewalk top sits at y = 500.
// Text uses system serif fonts because SVG loaded as an image cannot use web fonts.

const G = 500; // ground line
const H = 600;

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => Math.round(n * 10) / 10;
const SERIF = "Georgia, 'Times New Roman', serif";

// ---------------------------------------------------------------- shops
const SHOPS = [
  { name: 'BAKERY', w: 250, h: 330, facade: '#58372b', brick: true, awning: ['#7a1f1c', '#e9dcc0'], glass: 'amber', interior: 'bread', extra: 'blade', est: 'Est. 1961' },
  { name: 'COFFEE', w: 220, h: 300, facade: '#2e423a', awning: ['#1f3b2e', '#0f1a15'], glass: 'amber', interior: 'cafe', extra: 'neon', est: 'Roasted daily' },
  { name: 'BARBER', w: 200, h: 360, facade: '#2d374e', brick: true, awning: ['#22304d', '#e8e2d2'], glass: 'cool', interior: 'chairs', extra: 'pole', est: 'Hot towel shaves' },
  { name: 'BOOKS', w: 240, h: 410, facade: '#422f42', awning: ['#5a1e34', '#2a0f1a'], glass: 'amber', interior: 'books', extra: 'aframe', est: 'New &amp; used' },
  { name: 'FLORIST', w: 230, h: 320, facade: '#3d422f', awning: ['#2f4a26', '#e8e3cf'], glass: 'peach', interior: 'flowers', extra: 'buckets', est: 'Fresh daily' },
  { name: 'PIZZA', w: 210, h: 350, facade: '#60352d', brick: true, awning: ['#8a231d', '#f0e6cf'], glass: 'amber', interior: 'counter', extra: 'neon', est: 'By the slice' },
  { name: 'HARDWARE', w: 280, h: 380, facade: '#32373d', awning: ['#c9a24a', '#15130e'], glass: 'white', interior: 'tools', extra: 'bench', est: 'Keys cut' },
  { name: 'DELI', w: 210, h: 300, facade: '#493d2b', awning: ['#141210', '#e6d8b5'], glass: 'amber', interior: 'counter', extra: 'blade', est: 'Sandwiches' },
  { name: 'TAILOR', w: 200, h: 430, facade: '#333137', brick: true, awning: ['#3d2140', '#1a0f1b'], glass: 'peach', interior: 'racks', extra: 'none', est: 'Alterations' },
  { name: 'PHARMACY', w: 250, h: 340, facade: '#2a3b42', awning: ['#1d4446', '#e3ece6'], glass: 'white', interior: 'shelves', extra: 'cross', est: 'Prescriptions' },
  { name: 'RECORDS', w: 220, h: 360, facade: '#25252a', awning: ['#141418', '#c9a24a'], glass: 'pink', interior: 'records', extra: 'neon', est: 'Vinyl &amp; tapes' },
  { name: 'DINER', w: 260, h: 300, facade: '#444449', awning: ['#8f1f22', '#f1e9d8'], glass: 'amber', interior: 'cafe', extra: 'aframe', est: 'Open late' },
];

const GLASS = {
  amber: ['#ffd99a', '#f1a24a', '#9a4e1c'],
  peach: ['#ffe2c2', '#f0a27a', '#8c4a35'],
  white: ['#fff4dc', '#e9cf9a', '#7e6440'],
  cool: ['#f6efe0', '#d9c6a0', '#5d5444'],
  pink: ['#ffd1c2', '#e98b7a', '#6e3140'],
};
const NEON = { COFFEE: '#7ff0d0', PIZZA: '#ff9a6b', RECORDS: '#ff7ac8' };

function defs() {
  const glass = Object.entries(GLASS).map(([k, [a, b, c]]) => `<linearGradient id="g-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`).join('');
  return `<defs>
${glass}
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e2a6"/><stop offset=".5" stop-color="#d6b25e"/><stop offset="1" stop-color="#a8822f"/></linearGradient>
<linearGradient id="upLit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7c978" stop-opacity=".95"/><stop offset="1" stop-color="#b8622a" stop-opacity=".9"/></linearGradient>
<linearGradient id="upDark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#151a24"/><stop offset="1" stop-color="#090b10"/></linearGradient>
<linearGradient id="awnShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".4" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
<linearGradient id="facadeShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".25"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#ffb35c" stop-opacity=".16"/></linearGradient>
<radialGradient id="spill" cx=".5" cy="0" r=".9"><stop offset="0" stop-color="#ffbe6a" stop-opacity=".42"/><stop offset=".55" stop-color="#ff9a3c" stop-opacity=".12"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>
<radialGradient id="bulb" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6dc"/><stop offset=".25" stop-color="#ffd27a" stop-opacity=".8"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
<pattern id="brick" width="24" height="12" patternUnits="userSpaceOnUse"><path d="M0 0.5H24M0 6.5H24M6 0.5V6.5M18 6.5V12.5" stroke="#000" stroke-opacity=".35" stroke-width="1" fill="none"/></pattern>
<pattern id="paver" width="64" height="60" patternUnits="userSpaceOnUse"><path d="M0.5 0V60M32.5 30V60M0 30.5H64" stroke="#000" stroke-opacity=".45" fill="none"/></pattern>
<filter id="neon" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>`;
}

function upperWindows(r, w, top) {
  const bottom = G - 215;
  const rowH = 82;
  const rows = Math.max(0, Math.floor((bottom - (top + 34)) / rowH));
  const cols = Math.max(2, Math.floor((w - 30) / 68));
  const ww = 36, wh = 54;
  const gap = (w - cols * ww) / (cols + 1);
  let s = '';
  for (let ri = 0; ri < rows; ri++) {
    const y = top + 40 + ri * rowH;
    for (let ci = 0; ci < cols; ci++) {
      const x = gap + ci * (ww + gap);
      const lit = r() < 0.46;
      s += `<rect x="${f(x - 4)}" y="${f(y - 5)}" width="${ww + 8}" height="6" fill="#000" opacity=".35"/>`; // lintel
      s += `<rect x="${f(x)}" y="${f(y)}" width="${ww}" height="${wh}" fill="${lit ? 'url(#upLit)' : 'url(#upDark)'}"/>`;
      if (lit) {
        if (r() < 0.5) s += `<rect x="${f(x)}" y="${f(y)}" width="${f(ww * 0.42)}" height="${wh}" fill="#5a2a14" opacity=".55"/>`; // curtain
        if (r() < 0.3) s += `<path d="M${f(x + ww * 0.62)} ${y + wh} v-14 a6 6 0 1 1 6 0 v14z" fill="#3a1d0e" opacity=".7"/>`; // plant
      } else {
        s += `<path d="M${f(x + 4)} ${y + wh - 6} L${f(x + ww - 10)} ${y + 6}" stroke="#9fb4d6" stroke-opacity=".08" stroke-width="5"/>`;
      }
      s += `<rect x="${f(x + ww / 2 - 0.75)}" y="${y}" width="1.5" height="${wh}" fill="#000" opacity=".5"/>`;
      s += `<rect x="${f(x - 3)}" y="${y + wh}" width="${ww + 6}" height="4" fill="#000" opacity=".4"/>`;
      if (lit && r() < 0.35) s += `<rect x="${f(x - 2)}" y="${y + wh - 8}" width="${ww + 4}" height="8" rx="2" fill="#24301c"/><circle cx="${f(x + 6)}" cy="${y + wh - 9}" r="3" fill="#c0503a"/><circle cx="${f(x + 16)}" cy="${y + wh - 10}" r="3" fill="#e6c25a"/><circle cx="${f(x + 27)}" cy="${y + wh - 9}" r="3" fill="#c0503a"/>`;
    }
  }
  return s;
}

let awningCount = 0;
function awning(w, y0, [c1, c2]) {
  const drop = 30, stripe = 18;
  const id = `aw${++awningCount}`;
  const n = Math.max(6, Math.round(w / 26));
  const sw = (w + 4) / n;
  let scallop = `M-2 ${y0 + drop}`;
  for (let i = 0; i < n; i++) scallop += ` a${f(sw / 2)} ${f(sw / 2.6)} 0 0 0 ${f(sw)} 0`;
  return `<clipPath id="${id}"><path d="M8 ${y0} H${w - 8} L${w + 2} ${y0 + drop} L-2 ${y0 + drop}Z"/><path d="${scallop} L${w + 2} ${y0 + drop} L-2 ${y0 + drop}Z"/></clipPath>
<g clip-path="url(#${id})"><rect x="-2" y="${y0}" width="${w + 4}" height="${drop + 14}" fill="${c1}"/>${Array.from({ length: Math.ceil(w / stripe / 2) + 1 }, (_, i) => `<rect x="${f(-2 + i * stripe * 2)}" y="${y0}" width="${stripe}" height="${drop + 14}" fill="${c2}"/>`).join('')}<rect x="-2" y="${y0}" width="${w + 4}" height="${drop + 14}" fill="url(#awnShade)"/></g>
<path d="M8 ${y0} H${w - 8}" stroke="#000" stroke-opacity=".5" stroke-width="2"/>`;
}

function interior(type, x, y, w, h, r) {
  let s = '';
  const dark = '#2a160a';
  const shelfYs = [y + h * 0.42, y + h * 0.72];
  const shelves = () => shelfYs.map((sy) => `<rect x="${x}" y="${f(sy)}" width="${w}" height="2.5" fill="${dark}" opacity=".55"/>`).join('');
  switch (type) {
    case 'bread':
      s += shelves();
      for (const sy of shelfYs) for (let i = 8; i < w - 8; i += 15) s += `<ellipse cx="${f(x + i + 6)}" cy="${f(sy - 5)}" rx="7" ry="5" fill="#8a4a1c" opacity=".8"/>`;
      s += `<rect x="${x}" y="${f(y + h - 14)}" width="${w}" height="14" fill="${dark}" opacity=".6"/>`;
      for (let i = 10; i < w - 20; i += 26) s += `<path d="M${f(x + i)} ${f(y + h - 14)} q8 -14 16 0z" fill="#9c5a24" opacity=".85"/>`;
      break;
    case 'books':
      s += shelves();
      for (const sy of [y + 10, ...shelfYs]) {
        let bx = x + 3;
        while (bx < x + w - 6) {
          const bw = 3 + r() * 4, bh = 14 + r() * 9;
          s += `<rect x="${f(bx)}" y="${f(sy - bh)}" width="${f(bw)}" height="${f(bh)}" fill="${['#5a1e1e', '#1e3a2e', '#2a2a4a', '#6a4a1a', '#3a1a2a'][Math.floor(r() * 5)]}" opacity=".85"/>`;
          bx += bw + 1;
        }
      }
      break;
    case 'cafe':
      for (let i = 0; i < 3; i++) {
        const cx = x + w * (0.2 + i * 0.3);
        s += `<rect x="${f(cx - 11)}" y="${f(y + h - 30)}" width="22" height="3" fill="${dark}" opacity=".75"/><rect x="${f(cx - 1)}" y="${f(y + h - 28)}" width="2" height="28" fill="${dark}" opacity=".75"/>`;
        s += `<circle cx="${f(cx - 14)}" cy="${f(y + h - 44)}" r="5" fill="${dark}" opacity=".55"/><rect x="${f(cx - 19)}" y="${f(y + h - 39)}" width="10" height="16" rx="4" fill="${dark}" opacity=".55"/>`;
      }
      break;
    case 'chairs':
      for (let i = 0; i < 2; i++) {
        const cx = x + w * (0.28 + i * 0.44);
        s += `<rect x="${f(cx - 12)}" y="${f(y + 8)}" width="24" height="30" rx="3" fill="#fff" opacity=".18"/>`; // mirror
        s += `<path d="M${f(cx - 12)} ${f(y + h - 8)} h24 v-6 h-4 v-18 h-16 v18 h-4z M${f(cx - 8)} ${f(y + h - 38)} h16 v8 h-16z" fill="${dark}" opacity=".7"/>`;
      }
      break;
    case 'flowers':
      for (let i = 6; i < w - 6; i += 13) {
        const ph = 18 + r() * 22;
        s += `<path d="M${f(x + i)} ${y + h} v-${f(ph)}" stroke="#1d3a1a" stroke-width="2"/><circle cx="${f(x + i)}" cy="${f(y + h - ph)}" r="${f(4 + r() * 3)}" fill="${['#e2566a', '#f2c14e', '#f6f1e6', '#c45ab3', '#ef8a4a'][Math.floor(r() * 5)]}" opacity=".9"/>`;
      }
      s += `<path d="M${x} ${f(y + 6)} q${f(w / 4)} 16 ${f(w / 2)} 0 q${f(w / 4)} 16 ${f(w / 2)} 0" stroke="#1d3a1a" stroke-width="3" fill="none" opacity=".7"/>`;
      break;
    case 'counter':
      s += `<rect x="${x}" y="${f(y + h - 26)}" width="${w}" height="26" fill="${dark}" opacity=".7"/><rect x="${x}" y="${f(y + h - 30)}" width="${w}" height="4" fill="#d9c7a4" opacity=".5"/>`;
      s += `<rect x="${f(x + 6)}" y="${f(y + 8)}" width="${f(w - 12)}" height="16" fill="${dark}" opacity=".5"/>`; // menu board
      for (let i = 12; i < w - 12; i += 10) s += `<rect x="${f(x + i)}" y="${f(y + 12)}" width="6" height="2" fill="#fff" opacity=".45"/><rect x="${f(x + i)}" y="${f(y + 17)}" width="4" height="2" fill="#fff" opacity=".3"/>`;
      break;
    case 'tools':
      s += `<rect x="${f(x + 4)}" y="${f(y + 6)}" width="${f(w - 8)}" height="${f(h * 0.5)}" fill="${dark}" opacity=".35"/>`;
      for (let i = 10; i < w - 10; i += 14) s += `<rect x="${f(x + i)}" y="${f(y + 12)}" width="2" height="${f(10 + r() * 16)}" fill="${dark}" opacity=".8"/><rect x="${f(x + i - 3)}" y="${f(y + 12)}" width="8" height="4" fill="${dark}" opacity=".8"/>`;
      s += shelves();
      for (let i = 6; i < w - 12; i += 18) s += `<rect x="${f(x + i)}" y="${f(shelfYs[1] - 12)}" width="12" height="12" fill="#7a1e1a" opacity=".7"/>`;
      break;
    case 'racks':
      s += `<rect x="${f(x + 4)}" y="${f(y + 14)}" width="${f(w - 8)}" height="2" fill="${dark}" opacity=".8"/>`;
      for (let i = 10; i < w - 14; i += 16) s += `<path d="M${f(x + i + 6)} ${f(y + 16)} l-8 8 v${f(h * 0.45)} h16 v-${f(h * 0.45)}z" fill="${['#2a1a2a', '#1a2a3a', '#3a2a1a', '#2a2a2a'][Math.floor(r() * 4)]}" opacity=".75"/>`;
      s += `<path d="M${f(x + w - 26)} ${y + h} v-34 a8 8 0 1 1 10 0 v34z" fill="${dark}" opacity=".8"/>`; // dress form
      break;
    case 'shelves':
      s += shelves();
      for (const sy of [y + h * 0.15, ...shelfYs]) for (let i = 6; i < w - 6; i += 9) s += `<rect x="${f(x + i)}" y="${f(sy - 10)}" width="6" height="10" fill="${['#e8e4da', '#5a8a7a', '#c45a4a', '#e8e4da'][Math.floor(r() * 4)]}" opacity=".7"/>`;
      break;
    case 'records':
      for (let i = 0; i < Math.floor(w / 30); i++) {
        const cx = x + 16 + i * 30, cy = y + 22 + (i % 2) * 6;
        s += `<rect x="${f(cx - 13)}" y="${f(cy - 13)}" width="26" height="26" fill="${['#c45ab3', '#3a6ad9', '#f2c14e', '#1a1a1a'][i % 4]}" opacity=".75"/><circle cx="${f(cx)}" cy="${f(cy)}" r="7" fill="#111" opacity=".8"/>`;
      }
      s += `<rect x="${x}" y="${f(y + h - 24)}" width="${w}" height="24" fill="${dark}" opacity=".7"/>`;
      break;
  }
  // pendant lamps
  const lamps = Math.max(2, Math.floor(w / 60));
  for (let i = 0; i < lamps; i++) {
    const lx = x + (w / lamps) * (i + 0.5);
    s += `<path d="M${f(lx)} ${y} v8" stroke="#2a160a" stroke-width="1"/><circle cx="${f(lx)}" cy="${y + 12}" r="16" fill="url(#bulb)"/><path d="M${f(lx - 6)} ${y + 13} h12 l-3 -5 h-6z" fill="#2a160a"/>`;
  }
  return s;
}

function extra(kind, name, w, r) {
  switch (kind) {
    case 'pole': {
      const x = w - 8, y = G - 112;
      let stripes = '';
      for (let i = -4; i < 12; i++) stripes += `<path d="M${x - 6} ${f(y + i * 9)} l12 -7 v5 l-12 7z" fill="${i % 2 ? '#c42b2b' : '#2b4bc4'}"/>`;
      return `<clipPath id="pole"><rect x="${x - 6}" y="${y}" width="12" height="60" rx="6"/></clipPath><rect x="${x - 6}" y="${y}" width="12" height="60" rx="6" fill="#f2efe8"/><g clip-path="url(#pole)">${stripes}</g><rect x="${x - 8}" y="${y - 8}" width="16" height="8" rx="3" fill="#c9a24a"/><rect x="${x - 8}" y="${y + 60}" width="16" height="8" rx="3" fill="#c9a24a"/><circle cx="${x}" cy="${y + 30}" r="26" fill="url(#bulb)" opacity=".35"/>`;
    }
    case 'neon': {
      const c = NEON[name];
      return `<g filter="url(#neon)"><rect x="${f(w * 0.18)}" y="${G - 106}" width="54" height="22" rx="11" fill="none" stroke="${c}" stroke-width="2"/><text x="${f(w * 0.18 + 27)}" y="${G - 90}" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="1.5" fill="${c}" text-anchor="middle">OPEN</text></g>`;
    }
    case 'blade':
      return `<rect x="${w - 6}" y="${G - 250}" width="34" height="3" fill="#15110b"/><path d="M${w + 22} ${G - 247} v6" stroke="#15110b"/><rect x="${w + 4}" y="${G - 241}" width="36" height="44" rx="4" fill="#0e0c09" stroke="#b8913f" stroke-width="1.5"/><text x="${w + 22}" y="${G - 213}" font-family="${SERIF}" font-style="italic" font-size="18" fill="url(#gold)" text-anchor="middle">${name[0]}</text>`;
    case 'cross':
      return `<g filter="url(#neon)"><rect x="${w - 2}" y="${G - 262}" width="40" height="40" rx="5" fill="#0a1512" stroke="#7ff0b0" stroke-width="1.5"/><path d="M${w + 13} ${G - 254} h10 v9 h9 v10 h-9 v9 h-10 v-9 h-9 v-10 h9z" fill="#7ff0b0"/></g><rect x="${w - 8}" y="${G - 244}" width="8" height="3" fill="#15110b"/>`;
    case 'aframe':
      return `<path d="M${f(w * 0.3)} ${G + 34} l12 -44 h26 l12 44" fill="#14110d" stroke="#3a3127" stroke-width="2"/><rect x="${f(w * 0.3 + 14)}" y="${G - 4}" width="22" height="30" fill="#1c1f1c"/><path d="M${f(w * 0.3 + 17)} ${G + 4} h16 M${f(w * 0.3 + 17)} ${G + 11} h12 M${f(w * 0.3 + 17)} ${G + 18} h14" stroke="#efe8d8" stroke-opacity=".7" stroke-width="1.5"/>`;
    case 'buckets':
      return Array.from({ length: 4 }, (_, i) => {
        const bx = w * 0.12 + i * 22;
        const blooms = Array.from({ length: 4 }, (_, j) => `<circle cx="${f(bx + 3 + j * 4 + r() * 2)}" cy="${f(G + 8 - r() * 10)}" r="4" fill="${['#e2566a', '#f2c14e', '#f6f1e6', '#c45ab3'][(i + j) % 4]}"/>`).join('');
        return `<path d="M${f(bx)} ${G + 14} h18 l-2 18 h-14z" fill="#3a3a3e"/>${blooms}`;
      }).join('');
    case 'bench':
      return `<rect x="${f(w * 0.2)}" y="${G + 12}" width="70" height="5" rx="2" fill="#3b2a18"/><rect x="${f(w * 0.2)}" y="${G}" width="70" height="4" rx="2" fill="#3b2a18"/><path d="M${f(w * 0.2 + 6)} ${G + 17} v14 M${f(w * 0.2 + 64)} ${G + 17} v14" stroke="#15130e" stroke-width="3"/>`;
    default:
      return '';
  }
}

function shop(s, r) {
  const { w, h } = s;
  const top = G - h;
  const doorW = 40;
  const winX = 20, winY = G - 116, winW = w - 40 - doorW - 8, winH = 92;
  const doorX = w - 20 - doorW;
  const g = GLASS[s.glass];
  const fit = Math.min(22, (w - 44) / (s.name.length * 0.95));
  const sign = s.extra === 'neon'
    ? `<rect x="14" y="${G - 200}" width="${w - 28}" height="40" fill="#0a0908"/><g filter="url(#neon)"><text x="${w / 2}" y="${f(G - 180 + fit * 0.36)}" font-family="${SERIF}" font-style="italic" font-size="${f(fit * 1.15)}" fill="none" stroke="${NEON[s.name]}" stroke-width="1.4" text-anchor="middle" letter-spacing="2">${s.name.charAt(0) + s.name.slice(1).toLowerCase()}</text></g>`
    : `<rect x="14" y="${G - 200}" width="${w - 28}" height="40" fill="#0b0a08"/><rect x="18" y="${G - 196}" width="${w - 36}" height="32" fill="none" stroke="#b8913f" stroke-opacity=".7"/><text x="${w / 2}" y="${f(G - 180 + fit * 0.36)}" font-family="${SERIF}" font-size="${f(fit)}" fill="url(#gold)" text-anchor="middle" letter-spacing="${f(fit * 0.22)}">${s.name}</text>`;

  return `
<rect x="0" y="${top}" width="${w}" height="${h}" fill="${s.facade}"/>
${s.brick ? `<rect x="0" y="${top}" width="${w}" height="${h - 210}" fill="url(#brick)"/>` : `<rect x="0" y="${top}" width="9" height="${h}" fill="#fff" opacity=".035"/><rect x="${w - 9}" y="${top}" width="9" height="${h}" fill="#000" opacity=".25"/>`}
<rect x="0" y="${top}" width="${w}" height="${h}" fill="url(#facadeShade)"/>
<rect x="-3" y="${top - 8}" width="${w + 6}" height="12" fill="#000" opacity=".55"/>
<rect x="-3" y="${top + 4}" width="${w + 6}" height="3" fill="#cfd8ff" opacity=".09"/>
${Array.from({ length: Math.floor(w / 14) }, (_, i) => `<rect x="${4 + i * 14}" y="${top + 7}" width="7" height="5" fill="#000" opacity=".35"/>`).join('')}
${upperWindows(r, w, top)}
<rect x="0" y="${G - 208}" width="${w}" height="8" fill="#000" opacity=".4"/>
${sign}
${awning(w, G - 158, s.awning)}
<rect x="10" y="${G - 126}" width="${w - 20}" height="126" fill="#110d0a"/>
<rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" fill="url(#g-${s.glass})"/>
${interior(s.interior, winX, winY, winW, winH, r)}
<path d="M${winX + 6} ${winY + winH - 4} L${winX + winW * 0.45} ${winY + 4} h${f(winW * 0.12)} L${winX + 6 + winW * 0.12} ${winY + winH - 4}z" fill="#fff" opacity=".07"/>
<rect x="${f(winX + winW / 2 - 1)}" y="${winY}" width="2" height="${winH}" fill="#110d0a"/>
<text x="${f(winX + winW / 2)}" y="${winY + winH - 8}" font-family="${SERIF}" font-style="italic" font-size="10" fill="url(#gold)" text-anchor="middle" opacity=".9">${s.est}</text>
<rect x="${winX}" y="${G - 22}" width="${winW}" height="22" fill="#0b0907"/><rect x="${winX + 4}" y="${G - 18}" width="${winW - 8}" height="14" fill="none" stroke="#fff" stroke-opacity=".05"/>
<rect x="${doorX}" y="${G - 116}" width="${doorW}" height="116" fill="#0b0907"/>
<rect x="${doorX + 5}" y="${G - 110}" width="${doorW - 10}" height="60" fill="url(#g-${s.glass})" opacity=".85"/>
<rect x="${doorX + 5}" y="${G - 122}" width="${doorW - 10}" height="5" fill="${g[0]}" opacity=".6"/>
<rect x="${doorX + doorW - 11}" y="${G - 56}" width="3" height="14" rx="1" fill="#c9a24a"/>
`;
}
const front = (s, r) => `<ellipse cx="${s.w / 2}" cy="${G}" rx="${f(s.w * 0.62)}" ry="52" fill="url(#spill)" clip-path="url(#groundClip)"/>${extra(s.extra, s.name, s.w, r)}`;

export function shopsLayer() {
  const r = rng(7);
  let x = 0, body = '', fronts = '';
  for (const s of SHOPS) {
    body += `<g transform="translate(${x} 0)">${shop(s, r)}</g>`;
    fronts += `<g transform="translate(${x} 0)">${front(s, r)}</g>`;
    x += s.w;
    if (r() < 0.35) { // narrow alley
      body += `<rect x="${x}" y="${G - 300}" width="14" height="300" fill="#060608"/>`;
      x += 14;
    }
  }
  const W = Math.ceil(x / 64) * 64;
  if (W > x) body += `<rect x="${x}" y="${G - 300}" width="${W - x}" height="300" fill="#060608"/>`;
  body += fronts;
  const ground = `<clipPath id="groundClip"><rect x="-400" y="${G}" width="1200" height="${H - G}"/></clipPath>
<rect x="0" y="${G}" width="${W}" height="62" fill="#1a1918"/>
<rect x="0" y="${G}" width="${W}" height="62" fill="url(#paver)"/>
<rect x="0" y="${G}" width="${W}" height="2" fill="#fff" opacity=".06"/>
<rect x="0" y="${G + 62}" width="${W}" height="8" fill="#2c2b2a"/>
<rect x="0" y="${G + 62}" width="${W}" height="1.5" fill="#fff" opacity=".08"/>
<rect x="0" y="${G + 70}" width="${W}" height="${H - G - 70}" fill="#0b0b0c"/>`;
  return { width: W, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMinYMax meet">${defs()}${ground}${body}</svg>` };
}

// ---------------------------------------------------------------- skyline
export function skylineLayer() {
  const r = rng(21);
  const W = 1920;
  let x = 0, body = '';
  while (x < W) {
    const bw = Math.min(W - x, 70 + Math.floor(r() * 130));
    const top = 70 + Math.floor(r() * 230);
    const shade = ['#0d0f15', '#10131a', '#13161e', '#0f1118'][Math.floor(r() * 4)];
    body += `<rect x="${x}" y="${top}" width="${bw}" height="${H - top}" fill="${shade}"/>`;
    if (r() < 0.35 && bw > 60) { // setback
      const sw = bw * 0.5;
      body += `<rect x="${f(x + bw * 0.25)}" y="${top - 40}" width="${f(sw)}" height="40" fill="${shade}"/>`;
    }
    if (r() < 0.3) { // water tower
      const tx = x + 14 + r() * (bw - 40);
      body += `<path d="M${f(tx)} ${top} l4 -16 M${f(tx + 22)} ${top} l-4 -16" stroke="${shade}" stroke-width="2"/><rect x="${f(tx)}" y="${top - 38}" width="22" height="22" fill="${shade}"/><path d="M${f(tx - 2)} ${top - 38} l13 -10 l13 10z" fill="${shade}"/>`;
    } else if (r() < 0.25) { // antenna
      const ax = x + bw / 2;
      body += `<path d="M${f(ax)} ${top} v-40" stroke="${shade}" stroke-width="2"/><circle cx="${f(ax)}" cy="${top - 41}" r="2" fill="#ff5a4a"/><circle cx="${f(ax)}" cy="${top - 41}" r="7" fill="#ff5a4a" opacity=".18"/>`;
    }
    for (let wy = top + 14; wy < H - 20; wy += 16) {
      for (let wx = x + 8; wx < x + bw - 8; wx += 12) {
        if (r() < 0.11) body += `<rect x="${wx}" y="${wy}" width="4" height="6" fill="#f3c77a" opacity="${f(0.35 + r() * 0.55)}"/>`;
      }
    }
    x += bw;
  }
  return { width: W, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMinYMax meet">${body}</svg>` };
}

// ---------------------------------------------------------------- street furniture
function lamp(x) {
  const top = 150;
  return `
<circle cx="${x}" cy="${top + 16}" r="130" fill="url(#lampGlow)"/>
<ellipse cx="${x}" cy="${G + 40}" rx="140" ry="26" fill="url(#lampPool)"/>
<rect x="${x - 3.5}" y="${top + 30}" width="7" height="${G + 46 - top - 30}" fill="#0a0a0b"/>
<rect x="${x - 2}" y="${top + 30}" width="1.5" height="${G + 46 - top - 30}" fill="#d6b25e" opacity=".25"/>
<path d="M${x - 9} ${G + 46} h18 l-2 -22 h-14z" fill="#0a0a0b"/>
<path d="M${x - 14} ${top + 30} h28 l-4 -8 h-20z" fill="#0a0a0b"/>
<path d="M${x - 11} ${top + 22} l3 -24 h16 l3 24z" fill="#ffe2a6" opacity=".95"/>
<path d="M${x - 11} ${top + 22} l3 -24 h16 l3 24z" fill="none" stroke="#0a0a0b" stroke-width="2.5"/>
<path d="M${x} ${top - 2} v24" stroke="#0a0a0b" stroke-width="1.5"/>
<path d="M${x - 13} ${top - 2} h26 l-13 -14z" fill="#0a0a0b"/>
<circle cx="${x}" cy="${top - 18}" r="3" fill="#0a0a0b"/>`;
}

function tree(x) {
  const leaves = [[0, -300, 54], [-42, -272, 44], [40, -278, 46], [-16, -332, 40], [24, -336, 38], [0, -252, 40]]
    .map(([dx, dy, rr]) => `<circle cx="${x + dx}" cy="${G + 30 + dy}" r="${rr}" fill="#07090a"/>`).join('');
  return `<rect x="${x - 26}" y="${G + 40}" width="52" height="8" fill="#0d0c0b"/><path d="M${x - 5} ${G + 42} l2 -280 h6 l2 280z" fill="#0a0908"/>${leaves}
<path d="M${x - 52} ${G - 262} a54 54 0 0 1 36 -66" stroke="#d6a85a" stroke-opacity=".25" stroke-width="2" fill="none"/>`;
}

export function nearLayer() {
  const W = 1920;
  const body = [lamp(140), tree(560), lamp(780), `<g>${hydrant(1080)}</g>`, lamp(1420), tree(1740)].join('');
  const d = `<defs><radialGradient id="lampGlow"><stop offset="0" stop-color="#ffd58a" stop-opacity=".55"/><stop offset=".25" stop-color="#ffb84d" stop-opacity=".18"/><stop offset="1" stop-color="#ffb84d" stop-opacity="0"/></radialGradient><radialGradient id="lampPool"><stop offset="0" stop-color="#ffc36a" stop-opacity=".35"/><stop offset="1" stop-color="#ffc36a" stop-opacity="0"/></radialGradient></defs>`;
  return { width: W, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMinYMax meet">${d}${body}</svg>` };
}

function hydrant(x) {
  return `<path d="M${x - 9} ${G + 46} v-30 a9 9 0 0 1 18 0 v30z" fill="#6e1a17"/><rect x="${x - 13}" y="${G + 24}" width="26" height="6" rx="3" fill="#6e1a17"/><rect x="${x - 11}" y="${G + 44}" width="22" height="4" fill="#3a0e0c"/><path d="M${x - 4} ${G + 8} v38" stroke="#ff9a7a" stroke-opacity=".2" stroke-width="2"/>`;
}
