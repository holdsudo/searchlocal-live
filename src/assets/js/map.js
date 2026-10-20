/* SearchLocal — a small slippy map. No dependencies.
   Web Mercator tiles from OpenStreetMap, gold pins, popups, "Near me" sorting.
   A container looks like: <div class="slmap" data-map data-points='[{slug,name,cat,town,lat,lng,href,hours}]'></div> */
(() => {
  const TILE = 256;
  const MIN_Z = 8, MAX_Z = 18;
  const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const SL = window.SearchLocal || {};

  const clampLat = (lat) => Math.max(-85.05, Math.min(85.05, lat));
  const project = (lat, lng, z) => {
    const s = TILE * Math.pow(2, z);
    const x = ((lng + 180) / 360) * s;
    const r = (clampLat(lat) * Math.PI) / 180;
    const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s;
    return { x, y };
  };
  const unproject = (x, y, z) => {
    const s = TILE * Math.pow(2, z);
    const lng = (x / s) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / s;
    return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng };
  };
  const haversineMi = (a, b) => {
    const R = 3958.8, toR = (d) => (d * Math.PI) / 180;
    const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" fill="currentColor"/><circle cx="12" cy="10" r="2.8" fill="#120e05"/></svg>';
  const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  class SLMap {
    constructor(el, points, opts = {}) {
      this.el = el;
      this.points = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      this.opts = opts;
      this.z = 11;
      this.center = { lat: 39.98, lng: -74.2 };
      this.tiles = new Map();
      this.pinPos = [];
      this.build();
      this.fit(this.points, 40);
      this.render();
      new ResizeObserver(() => this.render()).observe(el);
    }

    build() {
      const el = this.el;
      el.classList.add('is-ready');
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'application');
      el.setAttribute('aria-label', el.getAttribute('aria-label') || 'Map of listings');
      el.innerHTML = `
<div class="slmap-world" data-world>
  <div class="slmap-tiles" data-tiles></div>
  <div class="slmap-pins" data-pins></div>
</div>
<div class="slmap-ctl" data-ctl>
  <button type="button" class="slmap-btn" data-zoom="1" aria-label="Zoom in">+</button>
  <button type="button" class="slmap-btn" data-zoom="-1" aria-label="Zoom out">−</button>
  ${this.opts.near === false ? '' : `<button type="button" class="slmap-btn slmap-near" data-near aria-label="Show businesses near me" title="Near me">${CROSS}</button>`}
</div>
<div class="slmap-pop" data-pop hidden></div>
<a class="slmap-attr" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>`;
      this.world = el.querySelector('[data-world]');
      this.tileLayer = el.querySelector('[data-tiles]');
      this.pinLayer = el.querySelector('[data-pins]');
      this.pop = el.querySelector('[data-pop]');
      this.nearBtn = el.querySelector('[data-near]');

      // pins
      this.pins = this.points.map((p, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'slmap-pin';
        b.dataset.i = String(i);
        b.setAttribute('aria-label', p.name);
        b.innerHTML = PIN;
        b.addEventListener('click', (ev) => { ev.stopPropagation(); this.select(i); });
        this.pinLayer.appendChild(b);
        return b;
      });

      // controls
      el.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => this.zoomBy(Number(b.dataset.zoom))));
      if (this.nearBtn) this.nearBtn.addEventListener('click', () => this.nearMe());

      // pan
      let drag = null, moved = false;
      const pointers = new Map();
      let pinchStart = null;
      el.addEventListener('pointerdown', (ev) => {
        if (ev.target.closest('[data-ctl], [data-pop], .slmap-attr')) return;
        pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        el.setPointerCapture(ev.pointerId);
        if (pointers.size === 1) { drag = { x: ev.clientX, y: ev.clientY, cx: this.center }; moved = false; el.classList.add('is-dragging'); }
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.z, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
          drag = null;
        }
      });
      el.addEventListener('pointermove', (ev) => {
        if (!pointers.has(ev.pointerId)) return;
        pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (pinchStart && pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const ratio = Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.d;
          if (ratio > 1.6) { pinchStart.d *= 1.6; this.zoomBy(1, pinchStart.mid); }
          else if (ratio < 0.62) { pinchStart.d *= 0.62; this.zoomBy(-1, pinchStart.mid); }
          return;
        }
        if (!drag) return;
        const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        const c = project(drag.cx.lat, drag.cx.lng, this.z);
        this.center = unproject(c.x - dx, c.y - dy, this.z);
        this.render();
      });
      const up = (ev) => {
        pointers.delete(ev.pointerId);
        if (pointers.size < 2) pinchStart = null;
        if (pointers.size === 0) { drag = null; el.classList.remove('is-dragging'); if (!moved && !ev.target.closest('.slmap-pin')) this.closePop(); }
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);

      // wheel zoom (steps, anchored at the cursor)
      let wheelAcc = 0, wheelT = 0;
      el.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        wheelAcc += ev.deltaY;
        clearTimeout(wheelT);
        const fire = () => { const dir = wheelAcc < 0 ? 1 : -1; wheelAcc = 0; this.zoomBy(dir, { x: ev.clientX, y: ev.clientY }); };
        if (Math.abs(wheelAcc) > 40) fire(); else wheelT = setTimeout(fire, 80);
      }, { passive: false });
      el.addEventListener('dblclick', (ev) => { if (!ev.target.closest('[data-ctl]')) this.zoomBy(1, { x: ev.clientX, y: ev.clientY }); });

      // keyboard
      el.addEventListener('keydown', (ev) => {
        const step = 80;
        const k = ev.key;
        if (k === '+' || k === '=') this.zoomBy(1);
        else if (k === '-' || k === '_') this.zoomBy(-1);
        else if (k.startsWith('Arrow')) {
          const c = project(this.center.lat, this.center.lng, this.z);
          const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
          this.center = unproject(c.x + d[0], c.y + d[1], this.z);
          this.render();
        } else if (k === 'Escape') this.closePop();
        else return;
        ev.preventDefault();
      });
    }

    size() { const r = this.el.getBoundingClientRect(); return { w: r.width, h: r.height }; }

    fit(points, pad = 32) {
      if (!points.length) return;
      const { w, h } = this.size();
      if (!w || !h) return;
      const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
      const b = { n: Math.max(...lats), s: Math.min(...lats), e: Math.max(...lngs), w: Math.min(...lngs) };
      let z = MAX_Z;
      for (; z > MIN_Z; z--) {
        const a = project(b.n, b.w, z), c = project(b.s, b.e, z);
        if (c.x - a.x <= w - pad * 2 && c.y - a.y <= h - pad * 2) break;
      }
      this.z = Math.min(z, points.length === 1 ? 15 : 14);
      const a = project(b.n, b.w, this.z), c = project(b.s, b.e, this.z);
      this.center = unproject((a.x + c.x) / 2, (a.y + c.y) / 2, this.z);
    }

    zoomBy(d, anchor) {
      const nz = Math.max(MIN_Z, Math.min(MAX_Z, this.z + d));
      if (nz === this.z) return;
      const { w, h } = this.size();
      const r = this.el.getBoundingClientRect();
      const ax = anchor ? anchor.x - r.left : w / 2, ay = anchor ? anchor.y - r.top : h / 2;
      // keep the point under the anchor fixed
      const c = project(this.center.lat, this.center.lng, this.z);
      const under = unproject(c.x + (ax - w / 2), c.y + (ay - h / 2), this.z);
      const u2 = project(under.lat, under.lng, nz);
      this.center = unproject(u2.x - (ax - w / 2), u2.y - (ay - h / 2), nz);
      const scale = Math.pow(2, nz - this.z);
      this.z = nz;
      this.closePop();
      if (!reduce.matches && this.tiles.size) {
        // Scale the old tiles around the anchor while the new zoom's tiles load.
        this.zooming = true;
        this.tileLayer.style.transformOrigin = `${ax}px ${ay}px`;
        this.tileLayer.style.transition = 'transform .22s cubic-bezier(.2,.7,.2,1)';
        this.tileLayer.style.transform = `scale(${scale})`;
        this.renderPins();
        clearTimeout(this.zoomT);
        this.zoomT = setTimeout(() => {
          this.zooming = false;
          this.tileLayer.style.transition = '';
          this.tileLayer.style.transform = '';
          this.tiles.clear(); this.tileLayer.innerHTML = '';
          this.render();
        }, 230);
      } else {
        this.tiles.clear(); this.tileLayer.innerHTML = ''; this.render();
      }
    }

    setVisible(slugs) {
      this.points.forEach((p, i) => this.pins[i].classList.toggle('is-off', !!slugs && !slugs.has(p.slug)));
      if (this.selected != null && slugs && !slugs.has(this.points[this.selected].slug)) this.closePop();
    }

    render() {
      const { w, h } = this.size();
      if (!w || !h) return;
      if (this.zooming) { this.renderPins(); return; }
      const zTiles = this.z;
      const c = project(this.center.lat, this.center.lng, zTiles);
      const left = c.x - w / 2, top = c.y - h / 2;
      const n = Math.pow(2, zTiles);
      const x0 = Math.floor(left / TILE), x1 = Math.floor((left + w) / TILE);
      const y0 = Math.max(0, Math.floor(top / TILE)), y1 = Math.min(n - 1, Math.floor((top + h) / TILE));
      const keep = new Set();
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const key = `${zTiles}/${x}/${y}`;
        keep.add(key);
        let img = this.tiles.get(key);
        if (!img) {
          img = new Image();
          img.alt = '';
          img.draggable = false;
          img.decoding = 'async';
         
          img.className = 'slmap-tile';
          img.src = TILE_URL(zTiles, ((x % n) + n) % n, y);
          img.onload = () => img.classList.add('is-in');
          this.tiles.set(key, img);
          this.tileLayer.appendChild(img);
        }
        img.style.transform = `translate3d(${Math.round(x * TILE - left)}px,${Math.round(y * TILE - top)}px,0)`;
      }
      for (const [key, img] of this.tiles) if (!keep.has(key)) { img.remove(); this.tiles.delete(key); }
      this.renderPins();
    }

    renderPins() {
      const { w, h } = this.size();
      const z = this.z;
      const c = project(this.center.lat, this.center.lng, z);
      this.points.forEach((p, i) => {
        const q = project(p.lat, p.lng, z);
        const x = q.x - c.x + w / 2, y = q.y - c.y + h / 2;
        this.pinPos[i] = { x, y };
        this.pins[i].style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      });
      if (this.you) {
        const q = project(this.you.lat, this.you.lng, z);
        this.youEl.style.translate = `${(q.x - c.x + w / 2).toFixed(1)}px ${(q.y - c.y + h / 2).toFixed(1)}px`;
      }
      if (this.selected != null && !this.pop.hidden) this.placePop();
    }

    select(i) {
      const p = this.points[i];
      this.selected = i;
      this.pins.forEach((b, j) => b.classList.toggle('is-active', j === i));
      let status = '';
      if (p.hours && SL.openState) { try { const s = SL.openState(p.hours); status = `<span class="status ${s.open ? 'is-open' : 'is-closed'}">${esc(s.label)}</span>`; } catch { /* no status */ } }
      const dist = p.dist != null ? `<span class="slmap-pop-dist">${p.dist < 10 ? p.dist.toFixed(1) : Math.round(p.dist)} mi away</span>` : '';
      this.pop.innerHTML = `<p class="slmap-pop-cat">${esc(p.cat)} · ${esc(p.town)}</p><h3 class="slmap-pop-name">${esc(p.name)}</h3><div class="slmap-pop-meta">${status}${dist}</div><a class="btn btn-gold btn-sm" href="${esc(p.href)}">View listing →</a>`;
      this.pop.hidden = false;
      this.placePop();
      this.el.dispatchEvent(new CustomEvent('slmap:select', { bubbles: true, detail: { slug: p.slug } }));
    }
    placePop() {
      const pos = this.pinPos[this.selected];
      if (!pos) return;
      const { w } = this.size();
      const x = Math.max(128, Math.min(w - 128, pos.x));
      this.pop.style.left = `${x}px`;
      this.pop.style.top = `${pos.y - 36}px`;
    }
    closePop() { this.pop.hidden = true; this.selected = null; this.pins.forEach((b) => b.classList.remove('is-active')); this.el.dispatchEvent(new CustomEvent('slmap:clear', { bubbles: true })); }

    focus(slug) {
      const i = this.points.findIndex((p) => p.slug === slug);
      if (i < 0) return;
      this.center = { lat: this.points[i].lat, lng: this.points[i].lng };
      if (this.z < 13) { this.z = 14; this.tiles.clear(); this.tileLayer.innerHTML = ''; }
      this.render();
      this.select(i);
    }

    nearMe() {
      if (!navigator.geolocation) { this.nearState('Location not available'); return; }
      this.nearBtn.classList.add('is-busy');
      this.nearBtn.disabled = true;
      navigator.geolocation.getCurrentPosition((pos) => {
        this.you = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!this.youEl) {
          this.youEl = document.createElement('span');
          this.youEl.className = 'slmap-you';
          this.youEl.setAttribute('aria-label', 'Your location');
          this.pinLayer.appendChild(this.youEl);
        }
        this.points.forEach((p) => { p.dist = haversineMi(this.you, p); });
        const nearest = [...this.points].sort((a, b) => a.dist - b.dist).slice(0, 6);
        this.fit([this.you, ...nearest], 48);
        this.tiles.clear(); this.tileLayer.innerHTML = '';
        this.render();
        this.nearBtn.classList.remove('is-busy');
        this.nearBtn.classList.add('is-on');
        this.nearBtn.disabled = false;
        this.el.dispatchEvent(new CustomEvent('slmap:near', { bubbles: true, detail: { you: this.you, dist: Object.fromEntries(this.points.map((p) => [p.slug, p.dist])) } }));
      }, () => {
        this.nearBtn.classList.remove('is-busy');
        this.nearBtn.disabled = false;
        this.nearState('Turn on location to sort by distance');
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    }
    nearState(msg) {
      let t = this.el.querySelector('.slmap-toast');
      if (!t) { t = document.createElement('p'); t.className = 'slmap-toast'; t.setAttribute('role', 'status'); this.el.appendChild(t); }
      t.textContent = msg;
      t.classList.add('is-in');
      clearTimeout(this.toastT);
      this.toastT = setTimeout(() => t.classList.remove('is-in'), 3200);
    }
  }

  /* ---------- wire every map on the page ---------- */
  const maps = [...document.querySelectorAll('[data-map]')];
  if (!maps.length) return;
  const boot = (el) => {
    if (el.slmap) return;
    let points = [];
    try { points = JSON.parse(el.dataset.points || '[]'); } catch { points = []; }
    el.slmap = new SLMap(el, points, { near: el.dataset.near !== 'off' });

    // cards on the same page: hover/select sync + distance sorting
    const grid = el.dataset.cards ? document.querySelector(el.dataset.cards) : null;
    if (grid) {
      el.addEventListener('slmap:select', (ev) => {
        grid.querySelectorAll('.card').forEach((c) => c.classList.toggle('is-pinned', c.dataset.slug === ev.detail.slug));
        const card = grid.querySelector(`.card[data-slug="${CSS.escape(ev.detail.slug)}"]`);
        if (card && el.dataset.scroll !== 'off') card.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'nearest' });
      });
      el.addEventListener('slmap:clear', () => grid.querySelectorAll('.card.is-pinned').forEach((c) => c.classList.remove('is-pinned')));
      grid.addEventListener('pointerenter', (ev) => {
        const card = ev.target.closest?.('.card');
        if (!card) return;
        const i = el.slmap.points.findIndex((p) => p.slug === card.dataset.slug);
        el.slmap.pins.forEach((b, j) => b.classList.toggle('is-hover', j === i));
      }, true);
      grid.addEventListener('pointerleave', () => el.slmap.pins.forEach((b) => b.classList.remove('is-hover')), true);
      el.addEventListener('slmap:near', (ev) => {
        const dist = ev.detail.dist;
        const cards = [...grid.querySelectorAll('.card')].filter((c) => dist[c.dataset.slug] != null);
        cards.sort((a, b) => dist[a.dataset.slug] - dist[b.dataset.slug]);
        cards.forEach((c) => {
          let tag = c.querySelector('.card-dist');
          if (!tag) { tag = document.createElement('span'); tag.className = 'card-dist'; c.querySelector('.card-foot')?.appendChild(tag); }
          const d = dist[c.dataset.slug];
          c.dataset.dist = String(d);
          tag.textContent = `${d < 10 ? d.toFixed(1) : Math.round(d)} mi`;
          grid.appendChild(c);
          c.classList.add('is-in');
        });
        grid.closest('section')?.querySelector('[data-near-note]')?.removeAttribute('hidden');
      });
    }
    // "Show on map" links/buttons anywhere on the page
    document.querySelectorAll('[data-map-focus]').forEach((b) => b.addEventListener('click', (ev) => {
      ev.preventDefault();
      el.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'center' });
      el.slmap.focus(b.dataset.mapFocus);
    }));
  };
  // Build lazily: tiles only load once the map is near the viewport.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { boot(en.target); io.unobserve(en.target); } }), { rootMargin: '400px 0px' });
    maps.forEach((m) => io.observe(m));
  } else maps.forEach(boot);
  window.SLMap = SLMap;
})();
