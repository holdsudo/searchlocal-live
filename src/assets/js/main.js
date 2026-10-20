/* SearchLocal — front-end behaviour. No dependencies. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const TZ = 'America/New_York';
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  /* ---------- header ---------- */
  const header = $('[data-header]');
  const onScroll = () => header && header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const menuBtn = $('[data-menu-btn]');
  const mobileNav = $('[data-mobile-nav]');
  if (menuBtn && mobileNav) {
    menuBtn.addEventListener('click', () => {
      const open = mobileNav.hidden;
      mobileNav.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1020 && !mobileNav.hidden) { mobileNav.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
    });
  }

  /* ---------- the street: walk as you scroll ---------- */
  const layers = $$('[data-layer]').map((el) => ({ el, speed: Number(el.dataset.speed), aspect: Number(el.dataset.aspect), tile: 0 }));
  const dimEl = $('[data-scene-dim]');
  const moon = $('.moon');
  if (layers.length) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isHome = document.body.classList.contains('page-home');
    const dimBase = isHome ? 0 : 0.4;
    const dimMax = 0.76;
    const measure = () => layers.forEach((l) => {
      l.tile = l.el.offsetHeight * l.aspect;
      l.el.style.width = `${window.innerWidth + l.tile + 2}px`;
    });
    measure();
    window.addEventListener('resize', measure);

    let walk = window.scrollY * 1.1, drift = 0, last = performance.now();
    const frame = (t) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const still = reduce.matches;
      if (!still) drift += dt * 16; // a slow stroll even when idle
      const target = still ? 0 : window.scrollY * 1.1 + drift;
      walk += (target - walk) * Math.min(1, dt * 5);
      for (const l of layers) {
        if (!l.tile) continue;
        const x = (walk * l.speed) % l.tile;
        l.el.style.transform = `translate3d(${(-x).toFixed(2)}px,0,0)`;
      }
      if (dimEl) {
        const p = Math.min(1, window.scrollY / (window.innerHeight * 0.85));
        dimEl.style.setProperty('--dim', (dimBase + (dimMax - dimBase) * p).toFixed(3));
        if (moon) moon.style.opacity = (1 - p).toFixed(3);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* ---------- open now ---------- */
  function nowInTz() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    return { day: parts.weekday.slice(0, 3).toLowerCase(), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  }
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fmt = (t) => { if (t === '23:59' || t === '24:00') return 'midnight'; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`; };

  function openState(hours) {
    const { day, minutes } = nowInTz();
    const today = hours[day];
    if (today) {
      const [o, c] = today.split('-');
      if (minutes >= toMin(o) && minutes < toMin(c)) {
        const left = toMin(c) - minutes;
        return { open: true, label: left <= 60 ? `Closes soon · ${fmt(c)}` : `Open · until ${fmt(c)}` };
      }
      if (minutes < toMin(o)) return { open: false, label: `Opens ${fmt(o)}` };
    }
    const idx = DAYS.indexOf(day);
    for (let i = 1; i <= 7; i++) {
      const d = DAYS[(idx + i) % 7];
      if (hours[d]) return { open: false, label: `Closed · opens ${i === 1 ? 'tomorrow' : d.charAt(0).toUpperCase() + d.slice(1)} ${fmt(hours[d].split('-')[0])}` };
    }
    return { open: false, label: 'Closed' };
  }

  function paintStatus() {
    $$('[data-hours]').forEach((el) => {
      try {
        const s = openState(JSON.parse(el.dataset.hours));
        el.textContent = s.label;
        el.classList.toggle('is-open', s.open);
        el.classList.toggle('is-closed', !s.open);
        el.closest('.card')?.toggleAttribute('data-open', s.open);
      } catch { /* leave blank */ }
    });
    const today = nowInTz().day;
    $$('[data-hours-table] tr').forEach((tr) => tr.classList.toggle('is-today', tr.dataset.day === today));
  }
  paintStatus();
  setInterval(paintStatus, 60_000);

  /* ---------- reveal on scroll ---------- */
  const revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const sibs = [...en.target.parentElement.children].filter((c) => c.hasAttribute('data-reveal'));
        en.target.style.setProperty('--d', `${Math.min(sibs.indexOf(en.target), 6) * 0.06}s`);
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- tile spotlight ---------- */
  $$('.cat-tile').forEach((t) => t.addEventListener('pointermove', (ev) => {
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', `${ev.clientX - r.left}px`);
    t.style.setProperty('--my', `${ev.clientY - r.top}px`);
  }));

  /* ---------- chip filters (category & town pages) ---------- */
  const chipBar = $('[data-chip-filter]');
  const chipResults = $('[data-chip-results]');
  if (chipBar && chipResults) {
    chipBar.addEventListener('click', (ev) => {
      const chip = ev.target.closest('.chip');
      if (!chip) return;
      $$('.chip', chipBar).forEach((c) => c.classList.toggle('is-active', c === chip));
      const key = 'town' in chip.dataset ? 'town' : 'cat';
      const val = chip.dataset[key];
      $$('.card', chipResults).forEach((card) => { card.hidden = !!val && card.dataset[key] !== val; card.classList.add('is-in'); });
    });
  }

  /* ---------- browse ---------- */
  const filters = $('[data-filters]');
  if (filters) {
    const results = $('[data-results]');
    const countEl = $('[data-count]');
    const emptyEl = $('[data-empty]');
    const emptyTitle = emptyEl ? $('[data-empty-title]', emptyEl) : null;
    const emptyLead = emptyEl ? $('[data-empty-lead]', emptyEl) : null;
    const cards = $$('.card', results);
    const cardSlug = (c) => c.dataset.slug || c.getAttribute('href')?.split('/')[2];
    const bySlug = new Map(cards.map((c) => [cardSlug(c), c]));
    const cardName = (c) => (c.querySelector('.card-title')?.textContent || '').trim();
    let index = [];
    let catHints = [];
    try { catHints = JSON.parse(emptyEl?.getAttribute('data-cat-hints') || '[]'); } catch { catHints = []; }

    const params = new URLSearchParams(location.search);
    const catSelect = filters.elements.category;
    let q = (params.get('q') || '').trim();
    // A query that is exactly a category name becomes the category filter.
    const catMatch = [...catSelect.options].find((o) => o.value && o.text.toLowerCase() === q.toLowerCase());
    if (catMatch) { catSelect.value = catMatch.value; q = ''; }
    if (params.get('category')) catSelect.value = params.get('category');
    filters.elements.q.value = q;
    filters.elements.town.value = params.get('town') || '';
    filters.elements.open.checked = params.get('open') === '1';

    function matchHint(qRaw, catSlug) {
      const qLower = (qRaw || '').toLowerCase().trim();
      if (catSlug) return catHints.find((h) => h.slug === catSlug) || null;
      if (!qLower) return null;
      return catHints.find((h) => {
        const name = String(h.name || '').toLowerCase();
        const query = String(h.query || '').toLowerCase();
        return qLower === name || qLower === query
          || name.includes(qLower) || query.includes(qLower)
          || qLower.includes(name.split('&')[0].trim())
          || query.split(/\s+/).some((w) => w.length > 3 && qLower.includes(w));
      }) || null;
    }

    function setEmptyMessage({ qRaw, cat, town, openOnly }) {
      if (!emptyTitle || !emptyLead) return;
      const hint = matchHint(qRaw, cat);
      const townLabel = town
        ? ([...filters.elements.town.options].find((o) => o.value === town)?.text || town)
        : '';
      if (hint && hint.n === 0) {
        const label = (hint.query || hint.name || 'that').toLowerCase();
        emptyTitle.textContent = `No ${label} listed yet.`;
        emptyLead.textContent = townLabel
          ? `We don't have ${label} in ${townLabel} yet — try another category below, or add one.`
          : `Try one of the categories below, or add a ${label.replace(/s$/, '')} you trust.`;
        return;
      }
      if (openOnly && !qRaw && !cat && !town) {
        emptyTitle.textContent = 'Nobody with listed hours is open right now.';
        emptyLead.textContent = 'Clear Open now to see every business, or check back later today.';
        return;
      }
      if (openOnly) {
        emptyTitle.textContent = 'Nothing open matches that search.';
        emptyLead.textContent = 'Turn off Open now, or try a broader category or town.';
        return;
      }
      if (hint && hint.n > 0 && (town || openOnly)) {
        emptyTitle.textContent = `No ${hint.name.toLowerCase()} match those filters.`;
        emptyLead.textContent = 'Clear the town or Open now filter, or browse that whole category.';
        return;
      }
      emptyTitle.textContent = 'Nothing matches — yet.';
      emptyLead.textContent = 'Try a broader search, pick a category below, or suggest a business we should add.';
    }

    function apply() {
      paintStatus();
      const qRaw = filters.elements.q.value.trim();
      const terms = qRaw.toLowerCase().split(/\s+/).filter(Boolean);
      const cat = catSelect.value;
      const town = filters.elements.town.value;
      const openOnly = filters.elements.open.checked;
      const matched = [];
      index.forEach((l) => {
        const card = bySlug.get(l.slug);
        if (!card) return;
        const ok = (!cat || l.category === cat) && (!town || l.town === town) && (!openOnly || card.hasAttribute('data-open')) && terms.every((t) => l.text.includes(t));
        card.hidden = !ok;
        if (ok) {
          card.classList.add('is-in');
          matched.push(card);
        }
      });
      matched.sort((a, b) => {
        const ao = a.hasAttribute('data-open') ? 0 : 1;
        const bo = b.hasAttribute('data-open') ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return cardName(a).localeCompare(cardName(b), undefined, { sensitivity: 'base' });
      });
      matched.forEach((card) => results.appendChild(card));
      const shown = matched.length;
      countEl.textContent = `${shown} ${shown === 1 ? 'business' : 'businesses'}${cat || town || terms.length || openOnly ? ' match' : ''}`;
      emptyEl.hidden = shown > 0;
      results.hidden = shown === 0;
      if (shown === 0) setEmptyMessage({ qRaw, cat, town, openOnly });
      const p = new URLSearchParams();
      if (qRaw) p.set('q', qRaw);
      if (cat) p.set('category', cat);
      if (town) p.set('town', town);
      if (openOnly) p.set('open', '1');
      history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
    }

    fetch('/assets/data/listings.json')
      .then((r) => r.json())
      .then((data) => { index = data; apply(); })
      .catch(() => { index = cards.map((c) => ({ slug: cardSlug(c), text: c.textContent.toLowerCase(), category: '', town: '' })); apply(); });

    filters.addEventListener('input', apply);
    filters.addEventListener('change', apply);
    $('[data-reset]')?.addEventListener('click', () => { filters.reset(); apply(); filters.elements.q.focus(); });
  }

  /* ---------- add-your-business form ---------- */
  const form = $('[data-add-form]');
  if (form) {
    const claim = new URLSearchParams(location.search).get('claim');
    if (claim) {
      const name = claim.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      form.elements.name.value = name;
    }

    $$('[data-counter-for]', form).forEach((hint) => {
      const input = form.elements[form.querySelector(`#${hint.dataset.counterFor}`).name];
      const max = input.maxLength;
      const update = () => { hint.textContent = `${input.value.length} / ${max}`; };
      input.addEventListener('input', update);
      update();
    });

    const errorBox = $('[data-form-error]');
    const success = $('[data-form-success]');

    function validate() {
      let firstBad = null;
      $$('input, select, textarea', form).forEach((el) => {
        if (el.classList.contains('hp')) return;
        const wrap = el.closest('.field, .check');
        const bad = !el.checkValidity();
        wrap?.classList.toggle('is-invalid', bad);
        if (bad && !firstBad) firstBad = el;
      });
      return firstBad;
    }

    form.addEventListener('input', (ev) => {
      const wrap = ev.target.closest('.field, .check');
      if (wrap?.classList.contains('is-invalid') && ev.target.checkValidity()) wrap.classList.remove('is-invalid');
    });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      errorBox.hidden = true;
      if (form.elements.company_url.value) return; // bot
      const bad = validate();
      if (bad) {
        errorBox.textContent = 'A few details need another look — the highlighted fields are required.';
        errorBox.hidden = false;
        bad.focus();
        return;
      }
      const data = Object.fromEntries(new FormData(form));
      delete data.company_url;
      data.catLabel = form.elements.category.selectedOptions[0].text;
      data.townLabel = form.elements.town.selectedOptions[0].text;
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;

      const endpoint = form.dataset.endpoint;
      if (endpoint) {
        try {
          const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
          if (!res.ok) throw new Error(res.status);
        } catch {
          btn.disabled = false;
          errorBox.textContent = "We couldn't send that just now. Please try again in a moment.";
          errorBox.hidden = false;
          return;
        }
      } else {
        // No backend yet: hand the submission to the visitor's email app.
        const body = [
          `Business: ${data.name}`, `Category: ${data.catLabel}`, `Town: ${data.townLabel}`, `Address: ${data.address}`,
          `Phone: ${data.phone}`, `Website: ${data.website || '—'}`, '', `Summary: ${data.summary}`, '', `Description: ${data.description || '—'}`,
          '', `Services: ${data.services || '—'}`, `Hours: ${data.hours || '—'}`, '', `Contact: ${data.contact} <${data.email}>`,
        ].join('\n');
        location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(`New listing: ${data.name}`)}&body=${encodeURIComponent(body)}`;
        $('[data-success-text]').textContent = 'Your email app should open with the listing details filled in — just press send. A real person will review it before it goes live.';
      }
      form.hidden = true;
      success.hidden = false;
      success.focus();
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* ---------- review form (moderated; mailto or formEndpoint) ---------- */
  $$('[data-review-form]').forEach((form) => {
    const panel = form.closest('.reviews-panel') || form.parentElement;
    const errorBox = $('[data-form-error]', form);
    const success = panel ? $('[data-form-success]', panel) : null;

    $$('[data-counter-for]', form).forEach((hint) => {
      const el = form.querySelector(`#${CSS.escape(hint.dataset.counterFor)}`);
      if (!el) return;
      const max = el.maxLength;
      const update = () => { hint.textContent = `${el.value.length} / ${max}`; };
      el.addEventListener('input', update);
      update();
    });

    function validate() {
      let firstBad = null;
      $$('input, select, textarea', form).forEach((el) => {
        if (el.classList.contains('hp')) return;
        const wrap = el.closest('.field, .check');
        const bad = !el.checkValidity();
        wrap?.classList.toggle('is-invalid', bad);
        if (bad && !firstBad) firstBad = el;
      });
      return firstBad;
    }

    form.addEventListener('input', (ev) => {
      const wrap = ev.target.closest('.field, .check');
      if (wrap?.classList.contains('is-invalid') && ev.target.checkValidity()) wrap.classList.remove('is-invalid');
    });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (errorBox) errorBox.hidden = true;
      if (form.elements.company_url?.value) return;
      const bad = validate();
      if (bad) {
        if (errorBox) {
          errorBox.textContent = 'A few details need another look — the highlighted fields are required.';
          errorBox.hidden = false;
        }
        bad.focus();
        return;
      }
      const data = Object.fromEntries(new FormData(form));
      delete data.company_url;
      const btn = form.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;

      const endpoint = form.dataset.endpoint;
      if (endpoint) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ type: 'review', ...data }),
          });
          if (!res.ok) throw new Error(res.status);
        } catch {
          if (btn) btn.disabled = false;
          if (errorBox) {
            errorBox.textContent = "We couldn't send that just now. Please try again in a moment.";
            errorBox.hidden = false;
          }
          return;
        }
      } else {
        const body = [
          `Business: ${data.business || form.dataset.business}`,
          `Listing: ${data.slug || form.dataset.slug}`,
          `Rating: ${data.rating} / 5`,
          `Headline: ${data.title}`,
          '',
          data.body,
          '',
          `Reviewer: ${data.name} <${data.email}>`,
          `Visited checkbox: ${data.visited ? 'yes' : 'no'}`,
        ].join('\n');
        location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(`Review: ${data.business || form.dataset.business} (${data.rating}/5)`)}&body=${encodeURIComponent(body)}`;
        const okText = $('[data-success-text]', success || document);
        if (okText) okText.textContent = 'Your email app should open with the review filled in — press send. A real person will check it before it goes live.';
      }
      form.hidden = true;
      if (success) {
        success.hidden = false;
        success.focus();
        success.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });
})();
