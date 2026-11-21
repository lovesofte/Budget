/*
 * app.js — Interface de l'application Budget.
 * Organisation :
 *   1. Stockage (sauvegarde locale + sauvegardes automatiques)
 *   2. Outils d'affichage (formatage, icônes, toasts, feuilles, dialogues)
 *   3. Pages (accueil, opérations, statistiques, épargne, crédits, abonnements…)
 *   4. Formulaires
 *   5. Actions (clics) et démarrage
 */
(function () {
  'use strict';

  const C = window.BudgetCalc;
  const KEY = 'budget.data.v1';
  const SNAP_KEY = 'budget.snapshots.v1';
  const MAX_SNAPSHOTS = 10;

  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = C.formatAmount;
  const today = () => C.toISODate(new Date());
  const thisMonth = () => C.monthOf(today());

  let state;
  const ui = {
    filters: { type: 'all', categoryId: '', period: 'month:' + thisMonth(), from: '', to: '', query: '' },
    statsMonth: thisMonth()
  };

  /* =====================================================================
     1. STOCKAGE
     ===================================================================== */

  function readSnapshots() {
    try { return JSON.parse(localStorage.getItem(SNAP_KEY)) || []; } catch (e) { return []; }
  }

  function writeSnapshots(list) {
    for (const size of [MAX_SNAPSHOTS, 5, 2]) {
      try { localStorage.setItem(SNAP_KEY, JSON.stringify(list.slice(0, size))); return; } catch (e) { /* stockage plein : on réduit */ }
    }
  }

  function addSnapshot(label) {
    const list = readSnapshots();
    list.unshift({ day: today(), at: new Date().toISOString(), label, data: JSON.stringify(state) });
    writeSnapshots(list);
  }

  /** Une sauvegarde automatique par jour d'utilisation (les 10 dernières sont conservées). */
  function dailySnapshot() {
    if (!state.settings.onboarded) return;
    const d = today();
    if (!readSnapshots().some((s) => s.label === 'auto' && s.day === d)) addSnapshot('auto');
  }

  let pendingToast = null;

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* navigation privée */ }
    if (!raw) { state = C.createDefaultState(); return; }
    try {
      state = C.normalizeState(JSON.parse(raw));
    } catch (e) {
      try { localStorage.setItem(KEY + '.corrompu', raw); } catch (e2) { /* ignore */ }
      for (const s of readSnapshots()) {
        try { state = C.normalizeState(JSON.parse(s.data)); save(); pendingToast = 'Données restaurées depuis la sauvegarde automatique du ' + C.dateLabel(s.day, true); return; } catch (e3) { /* suivante */ }
      }
      state = C.createDefaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      toast('Enregistrement impossible : stockage plein ou indisponible.');
      return false;
    }
  }

  function commit(fn, message) {
    fn(state);
    save();
    render();
    if (message) toast(message);
  }

  /** Modification annulable pendant quelques secondes (suppression, etc.). */
  function commitUndoable(fn, message) {
    const before = JSON.stringify(state);
    fn(state);
    save();
    render();
    toast(message, { action: 'Annuler', onAction: () => { state = C.normalizeState(JSON.parse(before)); save(); render(); toast('Action annulée'); } });
  }

  /* =====================================================================
     2. OUTILS D'AFFICHAGE
     ===================================================================== */

  const ICONS = {
    back: '<path d="m15 18-6-6 6-6"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    piggy: '<path d="M12 3 3 8h18z"/><path d="M5 10.5v7M9.5 10.5v7M14.5 10.5v7M19 10.5v7M3 20.5h18"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
    repeat: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11V9.5A3.5 3.5 0 0 1 7 6h13.5M7 21.5 3.5 18 7 14.5"/><path d="M20.5 13v1.5A3.5 3.5 0 0 1 17 18H3.5"/>',
    income: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    expense: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    wallet: '<path d="M20 7V5.5A1.5 1.5 0 0 0 18.5 4H5a2 2 0 0 0 0 4h15v11.5a.5.5 0 0 1-.5.5H5a2 2 0 0 1-2-2V6"/><path d="M16.5 14h.01"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M4 4h16"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/>'
  };
  const icon = (name, cls) => `<svg viewBox="0 0 24 24" class="${cls || ''}" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  const catById = (id) => state.categories.find((c) => c.id === id) || state.categories.find((c) => c.id === 'autres');
  const accById = (id) => state.savingsAccounts.find((a) => a.id === id);
  const nameOf = (list, id) => (list.find((x) => x.id === id) || {}).name || '';
  const sourceName = (id) => nameOf(C.INCOME_SOURCES, id) || 'Revenu';
  const paymentName = (id) => nameOf(C.PAYMENT_METHODS, id);
  const kindName = (id) => nameOf(C.SAVINGS_KINDS, id);
  const DIRECTIONS = { in: 'Versement', out: 'Retrait', interest: 'Intérêts' };

  function prettyDay(iso) {
    const t = today();
    const y = C.toISODate(new Date(Date.now() - 864e5));
    if (iso === t) return 'Aujourd’hui';
    if (iso === y) return 'Hier';
    const [yy, mm, dd] = iso.split('-').map(Number);
    const s = new Date(yy, mm - 1, dd).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: yy === new Date().getFullYear() ? undefined : 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** Informations d'affichage d'une opération. */
  function txInfo(t) {
    if (t.type === 'expense') {
      const c = catById(t.categoryId);
      const credit = t.creditId && state.credits.find((x) => x.id === t.creditId);
      const sub = t.subscriptionId && state.subscriptions.find((x) => x.id === t.subscriptionId);
      const title = t.note || (credit && credit.name) || (sub && sub.name) || c.name;
      const extra = [c.name !== title ? c.name : '', paymentName(t.payment)].filter(Boolean).join(' · ');
      return { title, sub: extra || 'Dépense', color: c.color, initial: c.name.charAt(0), sign: '−', cls: '' };
    }
    if (t.type === 'income') {
      const r = t.recurringId && state.recurringIncomes.find((x) => x.id === t.recurringId);
      const title = t.note || (r && r.name) || sourceName(t.source);
      return { title, sub: sourceName(t.source), color: 'var(--pos)', svg: 'income', sign: '+', cls: 'pos' };
    }
    const a = accById(t.accountId);
    const accName = a ? a.name : 'Épargne';
    return {
      title: t.note || DIRECTIONS[t.direction] + ' · ' + accName,
      sub: t.direction === 'interest' ? 'Intérêts ' + accName + ' (hors compte courant)' : 'Épargne · ' + accName,
      color: 'var(--accent)', svg: 'piggy',
      sign: t.direction === 'in' ? '−' : '+', cls: t.direction === 'in' ? 'muted' : 'pos'
    };
  }

  const txSearchLabel = (t) => { const i = txInfo(t); return i.title + ' ' + i.sub; };

  function avatar(info) {
    return `<span class="avatar" style="--c:${info.color}">${info.svg ? icon(info.svg) : esc(info.initial)}</span>`;
  }

  function txRow(t, showDate) {
    const i = txInfo(t);
    return `<button class="row" data-action="edit-tx" data-id="${esc(t.id)}">
      ${avatar(i)}
      <span class="row-main"><span class="row-title">${esc(i.title)}</span><span class="row-sub">${showDate ? esc(C.dateLabel(t.date)) + ' · ' : ''}${esc(i.sub)}</span></span>
      <span class="row-amount ${i.cls}">${i.sign}${fmt(t.amount)}</span>
    </button>`;
  }

  function pageHead(title, opts) {
    opts = opts || {};
    return `<div class="page-head"><div>
        ${opts.back ? `<a class="back" href="${opts.back}">${icon('back')}${esc(opts.backLabel || 'Retour')}</a>` : ''}
        ${opts.eyebrow ? `<span class="eyebrow">${esc(opts.eyebrow)}</span>` : ''}
        <h1>${esc(title)}</h1></div>
        ${opts.action ? `<button class="head-btn" data-action="${opts.action}" aria-label="${esc(opts.actionLabel || 'Ajouter')}">${icon('plus')}</button>` : ''}
      </div>`;
  }

  function emptyState(ic, title, text, btnLabel, action) {
    return `<div class="card empty"><div class="ico">${icon(ic)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>
      ${btnLabel ? `<button class="btn" data-action="${action}">${esc(btnLabel)}</button>` : ''}</div>`;
  }

  const progressBar = (ratio, color) => `<div class="progress"><span style="width:${(Math.max(0, Math.min(1, ratio || 0)) * 100).toFixed(1)}%;${color ? '--c:' + color : ''}"></span></div>`;
  const pct = (r) => Math.round((r || 0) * 100) + ' %';

  /* ---------- Toast ---------- */

  let toastTimer;
  function toast(message, opt) {
    opt = opt || {};
    const el = $('#toast');
    el.innerHTML = `<span>${esc(message)}</span>${opt.action ? `<button type="button">${esc(opt.action)}</button>` : ''}`;
    el.classList.add('show');
    const b = el.querySelector('button');
    if (b) b.onclick = () => { el.classList.remove('show'); opt.onAction(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), opt.action ? 5000 : 2200);
  }

  /* ---------- Feuilles ---------- */

  let sheetClose = null;
  function openSheet(title, body, opts) {
    opts = opts || {};
    const root = $('#sheet-root');
    clearTimeout(sheetClose);
    root.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet-grab"></div>
        <div class="sheet-head"><button type="button" class="link" data-action="close-sheet">Annuler</button><h2>${esc(title)}</h2><span></span></div>
        <div class="sheet-body">${body}</div>
      </div>`;
    document.body.classList.add('locked');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
    if (opts.focus) setTimeout(() => { const f = root.querySelector(opts.focus); if (f) f.focus(); }, 340);
  }

  function setSheetBody(body) {
    const b = $('#sheet-root .sheet-body');
    if (b) b.innerHTML = body;
  }

  function closeSheet() {
    const root = $('#sheet-root');
    root.classList.remove('open');
    document.body.classList.remove('locked');
    sheetClose = setTimeout(() => { root.innerHTML = ''; }, 320);
  }

  /* ---------- Dialogue de confirmation ---------- */

  function confirmDialog(o) {
    return new Promise((resolve) => {
      const root = $('#dialog-root');
      root.innerHTML = `<div class="dialog-backdrop"></div><div class="dialog" role="alertdialog">
        <h3>${esc(o.title)}</h3>${o.message ? `<p>${esc(o.message)}</p>` : ''}
        <div class="dialog-actions"><button type="button" data-d="0">${esc(o.cancel || 'Annuler')}</button>
        <button type="button" data-d="1" class="${o.danger ? 'danger' : 'strong'}">${esc(o.confirm || 'Confirmer')}</button></div></div>`;
      root.classList.add('open');
      root.onclick = (e) => {
        const b = e.target.closest('[data-d]');
        if (!b) return;
        root.classList.remove('open');
        root.innerHTML = '';
        root.onclick = null;
        resolve(b.dataset.d === '1');
      };
    });
  }

  /* ---------- Graphiques (SVG) ---------- */

  function donut(segments, total) {
    const r = 42, c = 2 * Math.PI * r;
    let off = 0;
    const gap = segments.length > 1 ? 1.2 : 0;
    const arcs = segments.map((s) => {
      const len = (s.value / total) * c;
      const vis = Math.max(0.01, len - gap);
      const el = `<circle r="${r}" cx="50" cy="50" fill="none" style="stroke:${s.color}" stroke-width="13" stroke-dasharray="${vis.toFixed(2)} ${(c - vis).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 50 50)"/>`;
      off += len;
      return el;
    }).join('');
    return `<svg viewBox="0 0 100 100" role="img" aria-label="Répartition des dépenses"><circle r="${r}" cx="50" cy="50" fill="none" style="stroke:var(--fill)" stroke-width="13"/>${arcs}</svg>`;
  }

  function niceMax(v) {
    if (v <= 0) return 100;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  const shortEuro = (cents) => {
    const e = cents / 100;
    return Math.abs(e) >= 1000 ? (e / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k€' : Math.round(e) + ' €';
  };

  function barChart(series) {
    const W = 320, H = 150, top = 8, bottom = 22, left = 34;
    const max = niceMax(Math.max(...series.flatMap((s) => [s.income, s.expenses])));
    const ch = H - top - bottom;
    const gw = (W - left) / series.length;
    const bw = Math.min(13, gw / 3.2);
    let out = '';
    for (let i = 0; i <= 2; i++) {
      const y = top + ch - (ch * i) / 2;
      out += `<line class="grid" x1="${left}" x2="${W}" y1="${y}" y2="${y}"/><text x="${left - 6}" y="${y + 3}" text-anchor="end">${shortEuro((max * i) / 2)}</text>`;
    }
    series.forEach((s, i) => {
      const cx = left + gw * i + gw / 2;
      const hi = (s.income / max) * ch, he = (s.expenses / max) * ch;
      out += `<rect x="${cx - bw - 1.5}" y="${top + ch - hi}" width="${bw}" height="${Math.max(hi, 0)}" rx="3" style="fill:var(--pos)"/>`;
      out += `<rect x="${cx + 1.5}" y="${top + ch - he}" width="${bw}" height="${Math.max(he, 0)}" rx="3" style="fill:var(--neg)"/>`;
      out += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${esc(C.monthLabel(s.ym, true).replace('.', ''))}</text>`;
    });
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenus et dépenses par mois">${out}</svg>
      <div class="chart-legend"><span><i class="dot" style="--c:var(--pos)"></i>Revenus</span><span><i class="dot" style="--c:var(--neg)"></i>Dépenses</span></div></div>`;
  }

  function lineChart(series) {
    const W = 320, H = 140, top = 10, bottom = 22, left = 34;
    const vals = series.map((s) => s.savingsTotal);
    const max = niceMax(Math.max(...vals, 1));
    const ch = H - top - bottom;
    const step = (W - left - 8) / Math.max(1, series.length - 1);
    const pts = vals.map((v, i) => [left + 4 + step * i, top + ch - (Math.max(0, v) / max) * ch]);
    let out = '';
    for (let i = 0; i <= 2; i++) {
      const y = top + ch - (ch * i) / 2;
      out += `<line class="grid" x1="${left}" x2="${W}" y1="${y}" y2="${y}"/><text x="${left - 6}" y="${y + 3}" text-anchor="end">${shortEuro((max * i) / 2)}</text>`;
    }
    const line = pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const area = `M${pts[0][0]},${top + ch} L${line.replace(/ /g, ' L')} L${pts[pts.length - 1][0]},${top + ch} Z`;
    out += `<path d="${area}" style="fill:var(--accent);opacity:.1"/>`;
    out += `<polyline points="${line}" fill="none" style="stroke:var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach((p, i) => {
      if (i === pts.length - 1) out += `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" style="fill:var(--accent)"/>`;
      if (i % 2 === (series.length - 1) % 2) out += `<text x="${p[0]}" y="${H - 6}" text-anchor="middle">${esc(C.monthLabel(series[i].ym, true).replace('.', ''))}</text>`;
    });
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution de l’épargne">${out}</svg></div>`;
  }

  /* =====================================================================
     3. PAGES
     ===================================================================== */

  function viewOnboarding() {
    return `<div class="onboard">
      <div class="logo"><img src="icon-192.png" alt=""></div>
      <h1>Bienvenue</h1>
      <p>Deux informations pour démarrer. Tout reste modifiable plus tard, et vos données ne quittent jamais votre téléphone.</p>
      <form class="form" id="onboard-form" novalidate>
        <label class="field"><span>Solde actuel de votre compte courant</span>
          <input class="input num" name="opening" inputmode="decimal" placeholder="Ex. 850,00" autocomplete="off">
          <div class="help">Le montant affiché sur votre application bancaire aujourd’hui.</div></label>
        <label class="field"><span>Solde de votre Livret A (facultatif)</span>
          <input class="input num" name="livret" inputmode="decimal" placeholder="Ex. 1 200,00" autocomplete="off"></label>
        <div class="form-error"></div>
        <button class="btn primary" type="submit">Commencer</button>
      </form>
      <button class="link" data-action="import">Restaurer une sauvegarde existante</button>
    </div>`;
  }

  function viewHome() {
    const t = today(), ym = thisMonth();
    const m = C.monthSummary(state, ym);
    const balance = C.accountBalance(state);
    const due = C.dueItems(state, t);
    const pend = C.pendingTotals(due);
    const rav = balance + pend.income - pend.charges;
    const cats = C.expensesByCategory(state, ym);
    const recent = C.sortTransactions(state.transactions).slice(0, 5);
    const monthName = C.monthLabel(ym).split(' ')[0].toLowerCase();

    const hint = [];
    if (pend.charges) hint.push(fmt(pend.charges) + ' de prélèvements à venir');
    if (pend.income) hint.push(fmt(pend.income) + ' de revenus attendus');

    let html = pageHead('Accueil', { eyebrow: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) });
    html += `<div class="card hero">
        <div class="label">Solde disponible</div>
        <div class="big num ${balance < 0 ? 'neg' : ''}">${fmt(balance)}</div>
        <div class="split"><span class="muted">Reste à vivre fin ${esc(monthName)}</span><strong class="num ${rav < 0 ? 'neg' : ''}">${fmt(rav)}</strong></div>
        <div class="hint">${hint.length ? 'Compte tenu de ' + esc(hint.join(' et ')) + '.' : 'Aucun prélèvement ni revenu prévu restant ce mois-ci.'}</div>
      </div>
      <div class="grid2">
        <button class="card stat" data-action="goto-ops" data-type="income"><div class="label"><i class="dot" style="--c:var(--pos)"></i>Revenus du mois</div><div class="value num">${fmt(m.income)}</div></button>
        <button class="card stat" data-action="goto-ops" data-type="expense"><div class="label"><i class="dot" style="--c:var(--neg)"></i>Dépenses du mois</div><div class="value num">${fmt(m.expenses)}</div></button>
        <a class="card stat" href="#/savings"><div class="label"><i class="dot" style="--c:var(--accent)"></i>Épargne totale</div><div class="value num">${fmt(C.totalSavings(state))}</div></a>
        <a class="card stat" href="#/credits"><div class="label"><i class="dot" style="--c:#B86B6B"></i>Crédits restants</div><div class="value num">${fmt(C.totalCreditsRemaining(state))}</div></a>
      </div>`;
    html += backupBanner();

    if (due.length) {
      html += `<div class="section"><div class="section-head"><h2>À venir ce mois-ci</h2></div><div class="list">` +
        due.map(dueRow).join('') + `</div></div>`;
    }

    html += `<div class="section"><div class="section-head"><h2>Répartition des dépenses</h2><a class="link" href="#/stats">Détails</a></div>`;
    if (m.expenses > 0) {
      const top = cats.slice(0, 5).map((c) => ({ ...c, cat: catById(c.categoryId) }));
      const restTotal = cats.slice(5).reduce((a, c) => a + c.total, 0);
      const segs = top.map((c) => ({ value: c.total, color: c.cat.color, name: c.cat.name }));
      if (restTotal) segs.push({ value: restTotal, color: 'var(--text-3)', name: 'Autres catégories' });
      html += `<div class="card"><div class="donut-wrap">
          <div class="donut">${donut(segs, m.expenses)}<div class="center"><strong class="num">${shortEuro(m.expenses)}</strong><span>${esc(monthName)}</span></div></div>
          <div class="legend">${segs.map((s) => `<div><i class="dot" style="--c:${s.color}"></i><span class="lname">${esc(s.name)}</span><span class="lval">${Math.round((s.value / m.expenses) * 100)} %</span></div>`).join('')}</div>
        </div></div>`;
    } else {
      html += `<div class="card empty-inline">Aucune dépense enregistrée ce mois-ci.</div>`;
    }
    html += `</div>`;

    html += `<div class="section"><div class="section-head"><h2>Dernières opérations</h2>${recent.length ? '<a class="link" href="#/ops">Tout voir</a>' : ''}</div>`;
    html += recent.length ? `<div class="list">${recent.map((tx) => txRow(tx, true)).join('')}</div>`
      : emptyState('list', 'Aucune opération', 'Ajoutez votre première dépense ou votre premier revenu avec le bouton +.', 'Ajouter une opération', 'add');
    html += `</div>`;
    return html;
  }

  function backupBanner() {
    if (state.transactions.length < 10) return '';
    const last = state.settings.lastExport;
    const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 864e5) : null;
    if (days !== null && days < 30) return '';
    return `<a class="banner" href="#/settings"><span class="avatar" style="--c:var(--warn)">${icon('download')}</span>
      <span class="row-main"><strong>Pensez à exporter une sauvegarde</strong><span class="muted small">${days === null ? 'Aucun export réalisé pour l’instant.' : 'Dernier export il y a ' + days + ' jours.'}</span></span>${icon('chev', 'chev')}</a>`;
  }

  function dueRow(it) {
    const meta = { income: ['Revenu attendu', 'var(--pos)', 'income'], credit: ['Crédit', '#B86B6B', 'card'], subscription: ['Abonnement', '#9585BE', 'repeat'] }[it.kind];
    const tag = it.overdue ? '<span class="badge warn">en retard</span>' : it.late ? '<span class="badge">date passée</span>' : '';
    return `<div class="due"><div class="due-top">
        <span class="avatar" style="--c:${meta[1]}">${icon(meta[2])}</span>
        <span class="row-main"><span class="row-title">${esc(it.name)}</span><span class="row-sub">${meta[0]} · ${esc(C.dateLabel(it.date))} ${tag}</span></span>
        <span class="row-amount ${it.kind === 'income' ? 'pos' : ''}">${it.kind === 'income' ? '+' : '−'}${fmt(it.amount)}</span></div>
        <div class="due-actions"><button class="pill" data-action="due-validate" data-kind="${it.kind}" data-id="${esc(it.id)}" data-date="${it.date}">${it.kind === 'income' ? 'Reçu' : 'Payé'}</button>
        <button class="pill ghost" data-action="due-skip" data-kind="${it.kind}" data-id="${esc(it.id)}">${it.kind === 'subscription' ? 'Passer' : 'Pas ce mois-ci'}</button></div></div>`;
  }

  /* ---------- Opérations ---------- */

  function currentFilter() {
    const f = ui.filters;
    const o = { type: f.type, categoryId: f.categoryId, query: f.query, labelOf: txSearchLabel };
    if (f.period.startsWith('month:')) o.month = f.period.slice(6);
    else if (f.period === 'custom') { o.from = f.from; o.to = f.to; }
    return o;
  }

  function viewOps() {
    const f = ui.filters;
    const ym = thisMonth();
    const months = [];
    for (let m = ym, first = C.firstMonth(state, ym); m >= first; m = C.addMonths(m, -1)) months.push(m);
    if (f.period.startsWith('month:') && !months.includes(f.period.slice(6))) months.push(f.period.slice(6));
    const types = [['all', 'Tout'], ['expense', 'Dépenses'], ['income', 'Revenus'], ['saving', 'Épargne']];

    let html = pageHead('Opérations', { action: 'add', actionLabel: 'Ajouter une opération' });
    if (!state.transactions.length) {
      return html + emptyState('list', 'Aucune opération', 'Toutes vos dépenses, revenus et mouvements d’épargne apparaîtront ici.', 'Ajouter une opération', 'add');
    }
    html += `<div class="filters">
      <div class="search">${icon('search')}<input class="input" type="search" placeholder="Rechercher" value="${esc(f.query)}" data-filter="query" autocomplete="off"></div>
      <div class="segmented">${types.map(([v, l]) => `<button type="button" class="${f.type === v ? 'on' : ''}" data-action="filter-type" data-value="${v}">${l}</button>`).join('')}</div>
      <div class="filter-row">
        <select class="input" data-filter="period" aria-label="Période">
          ${months.map((m) => `<option value="month:${m}" ${f.period === 'month:' + m ? 'selected' : ''}>${esc(C.monthLabel(m))}</option>`).join('')}
          <option value="all" ${f.period === 'all' ? 'selected' : ''}>Toutes les dates</option>
          <option value="custom" ${f.period === 'custom' ? 'selected' : ''}>Période personnalisée</option>
        </select>
        <select class="input" data-filter="categoryId" aria-label="Catégorie" ${f.type === 'income' || f.type === 'saving' ? 'disabled' : ''}>
          <option value="">Toutes catégories</option>
          ${state.categories.map((c) => `<option value="${esc(c.id)}" ${f.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      ${f.period === 'custom' ? `<div class="filter-row"><input class="input" type="date" data-filter="from" value="${esc(f.from)}" aria-label="Du"><input class="input" type="date" data-filter="to" value="${esc(f.to)}" aria-label="Au"></div>` : ''}
    </div>
    <div id="ops-list">${opsList()}</div>`;
    return html;
  }

  function opsList() {
    const list = C.sortTransactions(C.filterTransactions(state.transactions, currentFilter()));
    if (!list.length) return `<div class="card empty-inline">Aucune opération ne correspond à ces filtres.</div>`;
    const exp = list.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
    const inc = list.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
    let html = `<p class="small muted" style="margin:6px 4px 0">${list.length} opération${list.length > 1 ? 's' : ''}${exp ? ' · dépenses ' + fmt(exp) : ''}${inc ? ' · revenus ' + fmt(inc) : ''}</p>`;
    let day = null, group = [];
    const flush = () => {
      if (!group.length) return;
      const net = group.reduce((a, t) => a + C.currentAccountEffect(t), 0);
      html += `<div class="day-head"><span>${esc(prettyDay(day))}</span><span class="num">${net > 0 ? '+' : ''}${fmt(net)}</span></div><div class="list">${group.map((t) => txRow(t)).join('')}</div>`;
      group = [];
    };
    for (const t of list) { if (t.date !== day) { flush(); day = t.date; } group.push(t); }
    flush();
    return html;
  }

  /* ---------- Statistiques ---------- */

  function viewStats() {
    const ym = ui.statsMonth;
    const prev = C.addMonths(ym, -1);
    const m = C.monthSummary(state, ym);
    const cats = C.expensesByCategory(state, ym);
    const prevCats = new Map(C.expensesByCategory(state, prev).map((c) => [c.categoryId, c.total]));
    const series6 = C.monthlySeries(state, ym, 6);
    const series12 = C.monthlySeries(state, ym, 12);
    const isCurrent = ym >= thisMonth();

    let html = pageHead('Statistiques');
    html += `<div class="month-nav"><button data-action="stats-month" data-delta="-1" aria-label="Mois précédent">${icon('left')}</button>
      <strong>${esc(C.monthLabel(ym))}</strong>
      <button data-action="stats-month" data-delta="1" aria-label="Mois suivant" ${isCurrent ? 'disabled' : ''}>${icon('right')}</button></div>`;

    html += `<div class="grid2">
      <div class="card stat"><div class="label">Revenus</div><div class="value num pos">${fmt(m.income)}</div></div>
      <div class="card stat"><div class="label">Dépenses</div><div class="value num">${fmt(m.expenses)}</div></div>
      <div class="card stat"><div class="label">Épargne nette</div><div class="value num">${m.savingsNet > 0 ? '+' : ''}${fmt(m.savingsNet)}</div></div>
      <div class="card stat"><div class="label">Revenus − dépenses</div><div class="value num ${m.net < 0 ? 'neg' : ''}">${m.net > 0 ? '+' : ''}${fmt(m.net)}</div></div>
    </div>`;

    html += `<div class="section"><div class="section-head"><h2>Dépenses par catégorie</h2></div>`;
    if (cats.length) {
      const max = cats[0].total;
      html += `<div class="card cat-bars">` + cats.map((c) => {
        const cat = catById(c.categoryId);
        const p = prevCats.get(c.categoryId) || 0;
        const ch = C.percentChange(c.total, p);
        const delta = ch === null ? 'Nouveau ce mois-ci' : ch === 0 ? 'Stable par rapport au mois précédent' : (ch > 0 ? '+' : '') + ch + ' % par rapport à ' + C.monthLabel(prev).split(' ')[0].toLowerCase();
        return `<button class="cat-bar" style="text-align:left;width:100%" data-action="goto-ops" data-type="expense" data-cat="${esc(c.categoryId)}" data-month="${ym}">
          <div class="cat-bar-head"><span class="n"><i class="dot" style="--c:${cat.color}"></i><span>${esc(cat.name)}</span></span>
          <span class="a">${fmt(c.total)} <span class="muted" style="font-weight:400">· ${Math.round((c.total / m.expenses) * 100)} %</span></span></div>
          ${progressBar(c.total / max, cat.color)}<div class="delta">${esc(delta)}</div></button>`;
      }).join('') + `</div>`;
    } else {
      html += `<div class="card empty-inline">Aucune dépense sur ce mois.</div>`;
    }
    html += `</div>`;

    html += `<div class="section"><div class="section-head"><h2>Revenus et dépenses</h2></div><div class="card">${barChart(series6)}</div></div>`;
    html += `<div class="section"><div class="section-head"><h2>Évolution de l’épargne</h2></div><div class="card">${lineChart(series12)}
      <p class="small muted" style="margin:8px 0 0">Total épargné fin ${esc(C.monthLabel(ym).toLowerCase())} : <strong class="num" style="color:var(--text)">${fmt(series12[series12.length - 1].savingsTotal)}</strong></p></div></div>`;

    html += `<div class="section"><div class="section-head"><h2>Comparaison des mois</h2></div><div class="card"><table class="compare">
      <thead><tr><th>Mois</th><th>Revenus</th><th>Dépenses</th><th>Écart</th></tr></thead><tbody>
      ${series6.slice().reverse().map((s) => `<tr class="${s.ym === ym ? 'cur' : ''}"><td>${esc(C.monthLabel(s.ym, true))} ${s.ym.slice(2, 4)}</td><td>${shortEuro(s.income)}</td><td>${shortEuro(s.expenses)}</td><td class="${s.net < 0 ? 'neg' : 'pos'}">${s.net > 0 ? '+' : ''}${shortEuro(s.net)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    return html;
  }

  /* ---------- Plus ---------- */

  function viewMore() {
    const subs = C.subscriptionTotals(state);
    const rows = [
      ['#/savings', 'piggy', 'var(--accent)', 'Épargne', fmt(C.totalSavings(state))],
      ['#/credits', 'card', '#B86B6B', 'Crédits', state.credits.length ? fmt(C.totalCreditsRemaining(state)) : ''],
      ['#/subs', 'repeat', '#9585BE', 'Abonnements', subs.count ? fmt(subs.perMonth) + ' / mois' : ''],
      ['#/incomes', 'income', 'var(--pos)', 'Revenus réguliers', state.recurringIncomes.length ? String(state.recurringIncomes.filter((r) => r.active).length) : '']
    ];
    const rows2 = [
      ['#/categories', 'tag', '#B8A05A', 'Catégories', String(state.categories.length)],
      ['#/settings', 'gear', '#8E8E93', 'Sauvegarde et réglages', '']
    ];
    const menu = (list) => `<div class="list menu">${list.map(([href, ic, col, label, val]) => `<a class="row" href="${href}">
        <span class="icon-tile" style="--c:${col}">${icon(ic)}</span><span class="row-main"><span class="row-title">${label}</span></span>
        <span class="muted num">${esc(val)}</span>${icon('chev', 'chev')}</a>`).join('')}</div>`;
    return pageHead('Plus') + menu(rows) + `<div class="section">${menu(rows2)}</div>` +
      `<p class="footer-note">Vos données sont enregistrées uniquement sur cet appareil.</p>`;
  }

  /* ---------- Épargne ---------- */

  function viewSavings(id) {
    if (id) return viewSavingsDetail(id);
    const total = C.totalSavings(state);
    let html = pageHead('Épargne', { back: '#/more', backLabel: 'Plus', action: 'new-account', actionLabel: 'Nouveau compte' });
    if (!state.savingsAccounts.length) {
      return html + emptyState('piggy', 'Aucun compte d’épargne', 'Ajoutez votre Livret A ou tout autre placement pour suivre son solde et vos objectifs.', 'Ajouter un compte', 'new-account');
    }
    const m = C.monthSummary(state, thisMonth());
    html += `<div class="card hero"><div class="label">Total épargné</div><div class="big num">${fmt(total)}</div>
      <div class="split"><span class="muted">Ce mois-ci</span><strong class="num">${m.savingsNet > 0 ? '+' : ''}${fmt(m.savingsNet)}</strong></div></div>`;
    html += `<div class="section">` + state.savingsAccounts.map((a) => {
      const bal = C.savingsBalance(state, a.id);
      const prog = C.goalProgress(bal, a.goal);
      return `<a class="card item-card" href="#/savings/${esc(a.id)}"><div class="top"><span class="name">${esc(a.name)}</span><span class="amt">${fmt(bal)}</span></div>
        ${prog !== null ? progressBar(prog) + `<div class="meta"><span>Objectif ${fmt(a.goal)}</span><span>${pct(prog)}</span></div>` : `<div class="meta"><span>${esc(kindName(a.kind))}</span><span>Pas d’objectif</span></div>`}</a>`;
    }).join('') + `</div>`;
    html += `<p class="small muted" style="margin:4px 4px 0">Les versements vers l’épargne ne sont pas comptés comme des dépenses : ils sont déduits du solde disponible mais n’apparaissent pas dans les dépenses du mois.</p>`;
    return html;
  }

  function viewSavingsDetail(id) {
    const a = accById(id);
    if (!a) return pageHead('Compte introuvable', { back: '#/savings', backLabel: 'Épargne' });
    const bal = C.savingsBalance(state, a.id);
    const prog = C.goalProgress(bal, a.goal);
    const hist = C.sortTransactions(state.transactions.filter((t) => t.type === 'saving' && t.accountId === a.id));
    let html = pageHead(a.name, { back: '#/savings', backLabel: 'Épargne' });
    html += `<div class="card hero"><div class="label">Solde actuel · ${esc(kindName(a.kind))}</div><div class="big num">${fmt(bal)}</div>
      ${prog !== null ? progressBar(prog) + `<div class="hint">${pct(prog)} de l’objectif de ${fmt(a.goal)}${bal < a.goal ? ' · encore ' + fmt(a.goal - bal) : ' · objectif atteint'}</div>` : '<div class="hint">Aucun objectif défini.</div>'}</div>
      <div class="actions">
        <button class="btn small" data-action="saving-move" data-dir="in" data-id="${esc(a.id)}">Versement</button>
        <button class="btn small" data-action="saving-move" data-dir="out" data-id="${esc(a.id)}">Retrait</button>
        <button class="btn small" data-action="saving-move" data-dir="interest" data-id="${esc(a.id)}">Intérêts</button>
      </div>`;
    html += `<div class="section"><div class="section-head"><h2>Historique</h2></div>`;
    html += hist.length ? `<div class="list">${hist.map((t) => txRow(t, true)).join('')}</div>` : `<div class="card empty-inline">Aucun mouvement pour l’instant.</div>`;
    html += `</div><div class="section"><div class="actions"><button class="btn small" data-action="edit-account" data-id="${esc(a.id)}">Modifier le compte</button></div></div>`;
    return html;
  }

  /* ---------- Crédits ---------- */

  function viewCredits(id) {
    if (id) return viewCreditDetail(id);
    let html = pageHead('Crédits', { back: '#/more', backLabel: 'Plus', action: 'new-credit', actionLabel: 'Nouveau crédit' });
    if (!state.credits.length) {
      return html + emptyState('card', 'Aucun crédit', 'Ajoutez vos crédits pour suivre le restant dû et la progression du remboursement.', 'Ajouter un crédit', 'new-credit');
    }
    const active = state.credits.filter((c) => C.creditRemaining(state, c) > 0);
    const monthly = active.reduce((a, c) => a + c.monthly, 0);
    html += `<div class="card hero"><div class="label">Restant à rembourser</div><div class="big num">${fmt(C.totalCreditsRemaining(state))}</div>
      <div class="split"><span class="muted">Mensualités</span><strong class="num">${fmt(monthly)} / mois</strong></div></div><div class="section">`;
    html += state.credits.map((c) => {
      const rem = C.creditRemaining(state, c);
      const prog = C.creditProgress(c, rem);
      return `<a class="card item-card" href="#/credits/${esc(c.id)}"><div class="top"><span class="name">${esc(c.name)}</span><span class="amt">${fmt(rem)}</span></div>
        ${progressBar(prog, '#B86B6B')}<div class="meta"><span>${rem > 0 ? fmt(c.monthly) + ' le ' + c.day + ' du mois' : 'Remboursé'}</span><span>${pct(prog)} remboursé</span></div></a>`;
    }).join('') + `</div>`;
    return html;
  }

  function viewCreditDetail(id) {
    const c = state.credits.find((x) => x.id === id);
    if (!c) return pageHead('Crédit introuvable', { back: '#/credits', backLabel: 'Crédits' });
    const rem = C.creditRemaining(state, c);
    const prog = C.creditProgress(c, rem);
    const est = C.creditEstimatedEnd(state, c, today());
    const hist = C.sortTransactions(state.transactions.filter((t) => t.type === 'expense' && t.creditId === c.id));
    let html = pageHead(c.name, { back: '#/credits', backLabel: 'Crédits' });
    html += `<div class="card hero"><div class="label">Restant à rembourser</div><div class="big num">${fmt(rem)}</div>
      ${progressBar(prog, '#B86B6B')}<div class="hint">${pct(prog)} remboursé sur ${fmt(c.initial)}</div></div>
      <div class="section"><div class="card kv">
        <div><div class="k">Montant initial</div><div class="v">${fmt(c.initial)}</div></div>
        <div><div class="k">Mensualité</div><div class="v">${fmt(c.monthly)}</div></div>
        <div><div class="k">Prélèvement</div><div class="v">Le ${c.day} du mois</div></div>
        <div><div class="k">Fin ${c.endDate ? 'prévue' : 'estimée'}</div><div class="v">${c.endDate ? esc(C.dateLabel(c.endDate, true)) : est ? esc(C.dateLabel(est, true)) : rem > 0 ? '—' : 'Terminé'}</div></div>
      </div>
      ${c.endDate && est ? `<p class="small muted" style="margin:8px 4px 0">Au rythme actuel, dernière mensualité estimée : ${esc(C.dateLabel(est, true))}.</p>` : ''}</div>
      ${rem > 0 ? `<div class="actions"><button class="btn" data-action="credit-pay" data-id="${esc(c.id)}">Enregistrer une mensualité</button></div>` : ''}`;
    html += `<div class="section"><div class="section-head"><h2>Remboursements</h2></div>`;
    html += hist.length ? `<div class="list">${hist.map((t) => txRow(t, true)).join('')}</div>` : `<div class="card empty-inline">Aucune mensualité enregistrée dans l’application.</div>`;
    html += `</div><div class="section"><div class="actions"><button class="btn small" data-action="edit-credit" data-id="${esc(c.id)}">Modifier le crédit</button></div></div>`;
    return html;
  }

  /* ---------- Abonnements ---------- */

  function viewSubs() {
    const totals = C.subscriptionTotals(state);
    let html = pageHead('Abonnements', { back: '#/more', backLabel: 'Plus', action: 'new-sub', actionLabel: 'Nouvel abonnement' });
    if (!state.subscriptions.length) {
      return html + emptyState('repeat', 'Aucun abonnement', 'Suivez vos abonnements mensuels et annuels et leur prochaine date de prélèvement.', 'Ajouter un abonnement', 'new-sub');
    }
    html += `<div class="grid2" style="margin-top:0">
      <div class="card stat"><div class="label">Par mois</div><div class="value num">${fmt(totals.perMonth)}</div></div>
      <div class="card stat"><div class="label">Par an</div><div class="value num">${fmt(totals.perYear)}</div></div></div>`;
    const row = (s) => `<button class="row" data-action="edit-sub" data-id="${esc(s.id)}">
        <span class="avatar" style="--c:${catById(s.categoryId).color}">${esc(s.name.charAt(0).toUpperCase())}</span>
        <span class="row-main"><span class="row-title">${esc(s.name)}</span><span class="row-sub">${s.active ? 'Prochain prélèvement ' + esc(C.dateLabel(s.nextDate, s.nextDate.slice(0, 4) !== today().slice(0, 4))) : 'Résilié'}</span></span>
        <span class="row-amount">${fmt(s.price)}<small>${s.frequency === 'yearly' ? 'par an' : 'par mois'}</small></span></button>`;
    const active = state.subscriptions.filter((s) => s.active).sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
    const ended = state.subscriptions.filter((s) => !s.active);
    if (active.length) html += `<div class="section"><div class="section-head"><h2>Actifs</h2></div><div class="list">${active.map(row).join('')}</div></div>`;
    if (ended.length) html += `<div class="section"><div class="section-head"><h2>Résiliés</h2></div><div class="list">${ended.map(row).join('')}</div></div>`;
    return html;
  }

  /* ---------- Revenus réguliers ---------- */

  function viewIncomes() {
    let html = pageHead('Revenus réguliers', { back: '#/more', backLabel: 'Plus', action: 'new-income', actionLabel: 'Nouveau revenu' });
    if (!state.recurringIncomes.length) {
      return html + emptyState('income', 'Aucun revenu régulier', 'Déclarez votre salaire ou vos aides avec leur date de versement : l’application vous proposera de les valider chaque mois.', 'Ajouter un revenu', 'new-income');
    }
    const total = state.recurringIncomes.filter((r) => r.active).reduce((a, r) => a + r.amount, 0);
    html += `<div class="card hero"><div class="label">Total mensuel prévu</div><div class="big num pos">${fmt(total)}</div></div>
      <div class="section"><div class="list">${state.recurringIncomes.map((r) => `<button class="row" data-action="edit-income" data-id="${esc(r.id)}">
        <span class="avatar" style="--c:var(--pos)">${icon('income')}</span>
        <span class="row-main"><span class="row-title">${esc(r.name)}</span><span class="row-sub">${esc(sourceName(r.source))} · ${r.active ? 'le ' + r.day + ' du mois' : 'en pause'}</span></span>
        <span class="row-amount pos">${fmt(r.amount)}</span></button>`).join('')}</div></div>
      <p class="small muted" style="margin:10px 4px 0">Chaque mois, ces revenus apparaissent dans « À venir » sur l’accueil. Touchez « Reçu » pour les enregistrer (le montant reste modifiable).</p>`;
    return html;
  }

  /* ---------- Catégories ---------- */

  function viewCategories() {
    const used = new Map();
    for (const t of state.transactions) if (t.type === 'expense') used.set(t.categoryId, (used.get(t.categoryId) || 0) + 1);
    return pageHead('Catégories', { back: '#/more', backLabel: 'Plus', action: 'new-category', actionLabel: 'Nouvelle catégorie' }) +
      `<div class="list">${state.categories.map((c) => `<button class="row" data-action="edit-category" data-id="${esc(c.id)}">
        <span class="avatar" style="--c:${c.color}">${esc(c.name.charAt(0))}</span>
        <span class="row-main"><span class="row-title">${esc(c.name)}</span><span class="row-sub">${used.get(c.id) || 0} opération${(used.get(c.id) || 0) > 1 ? 's' : ''}${c.builtin ? '' : ' · personnalisée'}</span></span>${icon('chev', 'chev')}</button>`).join('')}</div>`;
  }

  /* ---------- Réglages ---------- */

  function viewSettings() {
    const snaps = readSnapshots();
    const last = state.settings.lastExport;
    const themes = [['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']];
    const standalone = window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    let html = pageHead('Réglages', { back: '#/more', backLabel: 'Plus' });
    html += `<div class="section-head"><h2>Apparence</h2></div><div class="segmented">${themes.map(([v, l]) => `<button type="button" class="${state.settings.theme === v ? 'on' : ''}" data-action="theme" data-value="${v}">${l}</button>`).join('')}</div>`;

    html += `<div class="section"><div class="section-head"><h2>Compte courant</h2></div><div class="list plain">
      <button class="row" data-action="adjust-balance"><span class="row-main"><span class="row-title">Corriger le solde disponible</span><span class="row-sub">Aligner l’application sur votre solde bancaire réel</span></span><span class="row-amount">${fmt(C.accountBalance(state))}</span></button></div></div>`;

    html += `<div class="section"><div class="section-head"><h2>Sauvegarde</h2></div><div class="list menu">
      <button class="row" data-action="export-json"><span class="icon-tile" style="--c:var(--accent)">${icon('download')}</span><span class="row-main"><span class="row-title">Exporter une sauvegarde</span><span class="row-sub">${last ? 'Dernier export le ' + esc(C.dateLabel(last.slice(0, 10), true)) : 'Fichier .json à garder dans Fichiers ou iCloud'}</span></span></button>
      <button class="row" data-action="import"><span class="icon-tile" style="--c:#6B9A78">${icon('upload')}</span><span class="row-main"><span class="row-title">Importer une sauvegarde</span><span class="row-sub">Remplace les données actuelles</span></span></button>
      <button class="row" data-action="export-csv"><span class="icon-tile" style="--c:#B8A05A">${icon('list')}</span><span class="row-main"><span class="row-title">Exporter les opérations (CSV)</span><span class="row-sub">Lisible dans Excel ou Numbers</span></span></button>
    </div></div>`;

    html += `<div class="section"><div class="section-head"><h2>Sauvegardes automatiques</h2></div>`;
    html += snaps.length ? `<div class="list plain">${snaps.map((s, i) => {
      let count = '';
      try { count = JSON.parse(s.data).transactions.length + ' opérations'; } catch (e) { count = 'illisible'; }
      return `<button class="row" data-action="restore-snapshot" data-index="${i}"><span class="row-main"><span class="row-title">${esc(prettyDay(s.day))}${s.label !== 'auto' ? ' · ' + esc(s.label) : ''}</span><span class="row-sub">${esc(new Date(s.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))} · ${count}</span></span><span class="link small">Restaurer</span></button>`;
    }).join('')}</div>` : `<div class="card empty-inline">Une copie est créée automatiquement chaque jour d’utilisation.</div>`;
    html += `<p class="small muted" style="margin:8px 4px 0">Ces copies restent sur ce téléphone. Seul l’export vous protège si vous changez d’iPhone ou supprimez l’application.</p></div>`;

    html += `<div class="section"><div class="section-head"><h2>Aide</h2></div>
      <details class="guide" ${standalone ? '' : 'open'}><summary>Installer sur l’iPhone</summary>
        ${standalone ? '<p>L’application est déjà installée sur votre écran d’accueil.</p>' : ''}
        <ol><li>Ouvrez cette page dans <strong>Safari</strong>.</li><li>Touchez le bouton <strong>Partager</strong> (carré avec une flèche vers le haut).</li><li>Choisissez <strong>Sur l’écran d’accueil</strong>, puis <strong>Ajouter</strong>.</li><li>Ouvrez ensuite l’application depuis sa nouvelle icône : elle s’affiche en plein écran et fonctionne hors connexion.</li></ol></details>
      <details class="guide"><summary>Comment sont calculés les montants ?</summary>
        <ul><li><strong>Solde disponible</strong> : solde de départ + revenus − dépenses − versements épargne + retraits épargne.</li>
        <li><strong>Reste à vivre</strong> : solde disponible + revenus réguliers attendus − crédits et abonnements encore à prélever ce mois-ci.</li>
        <li>Un <strong>versement sur le Livret A</strong> réduit le solde disponible mais n’est jamais compté comme une dépense.</li>
        <li>Les <strong>intérêts</strong> augmentent l’épargne sans toucher au compte courant.</li></ul></details>
      <details class="guide"><summary>Où sont mes données ?</summary>
        <p>Uniquement dans le stockage de l’application sur ce téléphone. Rien n’est envoyé à un serveur ni à un tiers. Exportez régulièrement une sauvegarde et enregistrez-la dans Fichiers ou iCloud Drive.</p></details>
    </div>`;

    html += `<div class="section"><div class="actions"><button class="btn danger" data-action="reset-all">Effacer toutes les données</button></div></div>
      <p class="footer-note">Budget · version 1.0</p>`;
    return html;
  }

  /* ---------- Rendu ---------- */

  const VIEWS = { home: viewHome, ops: viewOps, stats: viewStats, more: viewMore, savings: viewSavings, credits: viewCredits, subs: viewSubs, incomes: viewIncomes, categories: viewCategories, settings: viewSettings };
  const TAB_OF = { home: 'home', ops: 'ops', stats: 'stats', more: 'more', savings: 'more', credits: 'more', subs: 'more', incomes: 'more', categories: 'more', settings: 'more' };

  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const name = VIEWS[parts[0]] ? parts[0] : 'home';
    return { name, id: parts[1] ? decodeURIComponent(parts[1]) : null };
  }

  function render() {
    const view = $('#view');
    const tabbar = $('#tabbar');
    if (!state.settings.onboarded) {
      view.innerHTML = viewOnboarding();
      tabbar.classList.add('hidden');
      return;
    }
    tabbar.classList.remove('hidden');
    const r = route();
    view.innerHTML = VIEWS[r.name](r.id);
    const tab = TAB_OF[r.name];
    tabbar.querySelectorAll('a[data-tab]').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  }

  function applyTheme() {
    const pref = state.settings.theme;
    const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  /* =====================================================================
     4. FORMULAIRES
     ===================================================================== */

  const fieldErr = (form, msg) => { const e = form.querySelector('.form-error'); if (e) e.textContent = msg; return false; };
  const opt = (list, sel) => list.map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const amountField = (name, value, ph) => `<div class="amount-field"><input name="${name}" inputmode="decimal" placeholder="${ph || '0,00'}" value="${esc(value)}" autocomplete="off" aria-label="Montant"><span class="cur">€</span></div>`;
  const moneyInput = (name, value, ph) => `<input class="input num" name="${name}" inputmode="decimal" placeholder="${ph || '0,00'}" value="${esc(value)}" autocomplete="off">`;
  const toggle = (name, label, on) => `<label class="toggle-row"><span>${esc(label)}</span><span class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></span></label>`;

  /* ---------- Opération ---------- */

  let draft = null;
  let submitting = false;

  function openTxForm(o) {
    o = o || {};
    if (o.tx) {
      draft = { ...o.tx, amountStr: C.centsToInput(o.tx.amount) };
    } else {
      draft = {
        id: null, type: o.type || 'expense',
        amountStr: o.amount != null ? C.centsToInput(o.amount) : '',
        categoryId: o.categoryId || 'courses', date: o.date || today(), note: o.note || '', payment: o.payment || '',
        source: o.source || 'salaire', accountId: o.accountId || (state.savingsAccounts[0] || {}).id || '', direction: o.direction || 'in',
        creditId: o.creditId, subscriptionId: o.subscriptionId, recurringId: o.recurringId
      };
    }
    draft.lockType = !!(o.tx || o.creditId || o.subscriptionId || o.recurringId || o.lockType);
    const title = o.tx ? 'Modifier l’opération' : o.title || 'Nouvelle opération';
    openSheet(title, txFormHTML(), { focus: o.tx ? null : 'input[name="amount"]' });
  }

  function txFormHTML() {
    const d = draft;
    const types = [['expense', 'Dépense'], ['income', 'Revenu'], ['saving', 'Épargne']];
    let h = '';
    if (!d.lockType) {
      h += `<div class="segmented" style="margin-bottom:6px">${types.map(([v, l]) => `<button type="button" class="${d.type === v ? 'on' : ''}" data-action="tx-type" data-value="${v}">${l}</button>`).join('')}</div>`;
    }
    h += `<form class="form" id="tx-form" novalidate>${amountField('amount', d.amountStr)}`;
    if (d.type === 'expense') {
      h += `<div class="field"><span class="field-label">Catégorie</span><div class="chips">${state.categories.map((c) => `<label class="chip"><input type="radio" name="categoryId" value="${esc(c.id)}" ${d.categoryId === c.id ? 'checked' : ''}><span><i class="dot" style="--c:${c.color}"></i>${esc(c.name)}</span></label>`).join('')}</div></div>
        <div class="field-row"><label class="field"><span>Date</span><input class="input" type="date" name="date" value="${esc(d.date)}"></label>
        <label class="field"><span>Paiement</span><select class="input" name="payment"><option value="">—</option>${opt(C.PAYMENT_METHODS, d.payment)}</select></label></div>`;
    } else if (d.type === 'income') {
      h += `<div class="field-row"><label class="field"><span>Source</span><select class="input" name="source">${opt(C.INCOME_SOURCES, d.source)}</select></label>
        <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${esc(d.date)}"></label></div>`;
    } else {
      if (!state.savingsAccounts.length) {
        return h + `<div class="note-box">Créez d’abord un compte d’épargne (par exemple votre Livret A).</div><button type="button" class="btn" data-action="new-account">Créer un compte d’épargne</button></form>`;
      }
      h += `<div class="segmented">${Object.entries(DIRECTIONS).map(([v, l]) => `<label><input type="radio" name="direction" value="${v}" ${d.direction === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
        <div class="field-row"><label class="field"><span>Compte</span><select class="input" name="accountId">${opt(state.savingsAccounts, d.accountId)}</select></label>
        <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${esc(d.date)}"></label></div>
        <div class="note-box">${d.direction === 'in' ? 'Le montant quitte votre compte courant mais n’est pas compté comme une dépense.' : d.direction === 'out' ? 'Le montant revient sur votre compte courant (ce n’est pas un revenu).' : 'Les intérêts augmentent votre épargne sans modifier le compte courant.'}</div>`;
    }
    h += `<label class="field"><span>Description (facultatif)</span><input class="input" name="note" value="${esc(d.note)}" maxlength="120" placeholder="${d.type === 'expense' ? 'Ex. Carrefour' : d.type === 'income' ? 'Ex. Salaire novembre' : 'Ex. Virement mensuel'}" autocomplete="off"></label>
      <div class="form-error"></div>
      <button class="btn primary" type="submit">${d.id ? 'Enregistrer' : 'Ajouter'}</button>
      ${d.id ? '<button type="button" class="btn danger" data-action="delete-tx">Supprimer l’opération</button>' : ''}
    </form>`;
    return h;
  }

  function syncDraft(form) {
    if (!form) return;
    const fd = new FormData(form);
    for (const k of ['amount', 'categoryId', 'date', 'payment', 'source', 'accountId', 'direction', 'note']) {
      if (fd.has(k)) draft[k === 'amount' ? 'amountStr' : k] = String(fd.get(k));
    }
  }

  async function submitTx(form) {
    if (submitting) return;
    syncDraft(form);
    const d = draft;
    const amount = C.parseAmount(d.amountStr);
    if (!amount) return fieldErr(form, 'Saisissez un montant valide, par exemple 12,50.');
    if (!C.isValidISODate(d.date)) return fieldErr(form, 'Choisissez une date valide.');
    const tx = { id: d.id || C.uid(), type: d.type, amount, date: d.date, note: (d.note || '').trim(), createdAt: d.createdAt || Date.now() };
    if (d.type === 'expense') {
      tx.categoryId = catById(d.categoryId) ? d.categoryId : 'autres';
      tx.payment = d.payment || '';
      if (d.creditId) {
        tx.creditId = d.creditId;
        const credit = state.credits.find((c) => c.id === d.creditId);
        if (credit) {
          const rem = C.creditRemaining(state, credit, d.id);
          if (amount > rem) return fieldErr(form, 'Le montant dépasse le restant dû (' + fmt(rem) + ').');
        }
      }
      if (d.subscriptionId) tx.subscriptionId = d.subscriptionId;
    } else if (d.type === 'income') {
      tx.source = d.source || 'autres';
      if (d.recurringId) tx.recurringId = d.recurringId;
    } else {
      if (!accById(d.accountId)) return fieldErr(form, 'Choisissez un compte d’épargne.');
      tx.accountId = d.accountId;
      tx.direction = DIRECTIONS[d.direction] ? d.direction : 'in';
      if (tx.direction === 'out') {
        const bal = C.savingsBalance(state, tx.accountId, null, d.id);
        if (amount > bal) return fieldErr(form, 'Retrait supérieur au solde du compte (' + fmt(bal) + ').');
      }
    }
    if (!d.id) {
      const dup = C.findDuplicate(state, tx);
      if (dup) {
        const ok = await confirmDialog({ title: 'Opération en double ?', message: 'Une opération identique de ' + fmt(amount) + ' existe déjà le ' + C.dateLabel(tx.date, true) + '.', confirm: 'Ajouter' });
        if (!ok) return;
      }
    }
    submitting = true;
    const isEdit = !!d.id;
    const advanceSub = !isEdit && d.subscriptionId;
    commit((s) => {
      if (isEdit) {
        const i = s.transactions.findIndex((x) => x.id === tx.id);
        if (i > -1) s.transactions[i] = tx; else s.transactions.push(tx);
      } else {
        s.transactions.push(tx);
        if (advanceSub) {
          const sub = s.subscriptions.find((x) => x.id === d.subscriptionId);
          if (sub) sub.nextDate = C.addPeriod(sub.nextDate, sub.frequency, sub.anchorDay);
        }
      }
    }, isEdit ? 'Opération modifiée' : 'Opération ajoutée');
    closeSheet();
    setTimeout(() => { submitting = false; }, 400);
  }

  /* ---------- Compte d'épargne ---------- */

  function openAccountForm(id) {
    const a = id ? accById(id) : null;
    const bal = a ? C.savingsBalance(state, a.id) : null;
    const hasLivretA = state.savingsAccounts.some((x) => x.kind === 'livretA');
    const kind = a ? a.kind : hasLivretA ? 'perso' : 'livretA';
    openSheet(a ? 'Modifier le compte' : 'Nouveau compte', `<form class="form" id="account-form" data-id="${a ? esc(a.id) : ''}" novalidate>
      <label class="field"><span>Type</span><select class="input" name="kind">${opt(C.SAVINGS_KINDS, kind)}</select></label>
      <label class="field"><span>Nom</span><input class="input" name="name" maxlength="60" value="${esc(a ? a.name : kindName(kind))}" autocomplete="off"></label>
      <label class="field"><span>Solde actuel</span>${moneyInput('balance', a ? C.centsToInput(bal) : '')}${a ? '<div class="help">Modifier ce montant ajuste le solde sans créer d’opération.</div>' : ''}</label>
      <label class="field"><span>Objectif d’épargne (facultatif)</span>${moneyInput('goal', a && a.goal ? C.centsToInput(a.goal) : '', 'Ex. 5 000')}</label>
      <div class="form-error"></div>
      <button class="btn primary" type="submit">${a ? 'Enregistrer' : 'Créer le compte'}</button>
      ${a ? '<button type="button" class="btn danger" data-action="delete-account" data-id="' + esc(a.id) + '">Supprimer le compte</button>' : ''}
    </form>`);
  }

  function submitAccount(form) {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const name = String(fd.get('name') || '').trim();
    const balStr = String(fd.get('balance') || '').trim();
    const goalStr = String(fd.get('goal') || '').trim();
    const balance = balStr ? C.parseAmount(balStr) : 0;
    const goal = goalStr ? C.parseAmount(goalStr) : null;
    if (!name) return fieldErr(form, 'Donnez un nom au compte.');
    if (balance === null) return fieldErr(form, 'Solde invalide.');
    if (goalStr && !goal) return fieldErr(form, 'Objectif invalide.');
    const kind = String(fd.get('kind'));
    if (id) {
      commit((s) => {
        const a = s.savingsAccounts.find((x) => x.id === id);
        a.name = name; a.kind = kind; a.goal = goal || null;
        a.initialBalance = balance - C.savingsMovementNet(s, id);
      }, 'Compte modifié');
    } else {
      const newId = C.uid();
      commit((s) => { s.savingsAccounts.push({ id: newId, name, kind, initialBalance: balance, goal: goal || null }); }, 'Compte créé');
      // Si le compte a été créé depuis le formulaire d'opération, on y revient directement.
      if (pendingSavingForm) {
        pendingSavingForm = false;
        openTxForm({ type: 'saving', accountId: newId });
        return;
      }
    }
    closeSheet();
  }
  let pendingSavingForm = false;

  /* ---------- Crédit ---------- */

  function openCreditForm(id) {
    const c = id ? state.credits.find((x) => x.id === id) : null;
    const rem = c ? C.creditRemaining(state, c) : null;
    openSheet(c ? 'Modifier le crédit' : 'Nouveau crédit', `<form class="form" id="credit-form" data-id="${c ? esc(c.id) : ''}" novalidate>
      <label class="field"><span>Nom du crédit</span><input class="input" name="name" maxlength="60" value="${esc(c ? c.name : '')}" placeholder="Ex. Prêt auto" autocomplete="off"></label>
      <div class="field-row"><label class="field"><span>Montant initial</span>${moneyInput('initial', c ? C.centsToInput(c.initial) : '')}</label>
      <label class="field"><span>Restant dû</span>${moneyInput('remaining', c ? C.centsToInput(rem) : '', 'Identique')}</label></div>
      <div class="field-row"><label class="field"><span>Mensualité</span>${moneyInput('monthly', c ? C.centsToInput(c.monthly) : '')}</label>
      <label class="field"><span>Jour de prélèvement</span><input class="input num" name="day" type="number" inputmode="numeric" min="1" max="31" value="${c ? c.day : ''}" placeholder="Ex. 5"></label></div>
      <label class="field"><span>Date de fin (facultatif)</span><input class="input" type="date" name="endDate" value="${c && c.endDate ? c.endDate : ''}"><div class="help">Laissée vide, elle est estimée à partir du restant dû et de la mensualité.</div></label>
      <div class="form-error"></div>
      <button class="btn primary" type="submit">${c ? 'Enregistrer' : 'Ajouter le crédit'}</button>
      ${c ? '<button type="button" class="btn danger" data-action="delete-credit" data-id="' + esc(c.id) + '">Supprimer le crédit</button>' : ''}
    </form>`);
  }

  function submitCredit(form) {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const name = String(fd.get('name') || '').trim();
    const initial = C.parseAmount(String(fd.get('initial') || ''));
    const remStr = String(fd.get('remaining') || '').trim();
    const remaining = remStr ? C.parseAmount(remStr) : initial;
    const monthly = C.parseAmount(String(fd.get('monthly') || ''));
    const day = parseInt(fd.get('day'), 10);
    const endDate = String(fd.get('endDate') || '');
    if (!name) return fieldErr(form, 'Donnez un nom au crédit.');
    if (!initial) return fieldErr(form, 'Montant initial invalide.');
    if (remaining === null) return fieldErr(form, 'Restant dû invalide.');
    if (!monthly) return fieldErr(form, 'Mensualité invalide.');
    if (!(day >= 1 && day <= 31)) return fieldErr(form, 'Jour de prélèvement entre 1 et 31.');
    if (endDate && !C.isValidISODate(endDate)) return fieldErr(form, 'Date de fin invalide.');
    commit((s) => {
      const data = { name, initial, monthly, day, endDate: endDate || null };
      if (id) {
        const c = s.credits.find((x) => x.id === id);
        Object.assign(c, data, { remainingStart: remaining + C.creditPaid(s, id) });
      } else {
        s.credits.push({ id: C.uid(), ...data, remainingStart: remaining });
      }
    }, id ? 'Crédit modifié' : 'Crédit ajouté');
    closeSheet();
  }

  /* ---------- Abonnement ---------- */

  function openSubForm(id) {
    const s = id ? state.subscriptions.find((x) => x.id === id) : null;
    const freq = s ? s.frequency : 'monthly';
    openSheet(s ? 'Modifier l’abonnement' : 'Nouvel abonnement', `<form class="form" id="sub-form" data-id="${s ? esc(s.id) : ''}" novalidate>
      <label class="field"><span>Nom</span><input class="input" name="name" maxlength="60" value="${esc(s ? s.name : '')}" placeholder="Ex. Spotify" autocomplete="off"></label>
      <div class="field-row"><label class="field"><span>Prix</span>${moneyInput('price', s ? C.centsToInput(s.price) : '')}</label>
      <div class="field"><span class="field-label">Fréquence</span><div class="segmented" style="height:42px;align-items:stretch">
        <label style="display:grid"><input type="radio" name="frequency" value="monthly" ${freq === 'monthly' ? 'checked' : ''}><span style="display:grid;place-items:center;margin:0;padding:0">Mensuel</span></label>
        <label style="display:grid"><input type="radio" name="frequency" value="yearly" ${freq === 'yearly' ? 'checked' : ''}><span style="display:grid;place-items:center;margin:0;padding:0">Annuel</span></label></div></div></div>
      <div class="field-row"><label class="field"><span>Prochain prélèvement</span><input class="input" type="date" name="nextDate" value="${s ? s.nextDate : today()}"></label>
      <label class="field"><span>Catégorie</span><select class="input" name="categoryId">${opt(state.categories, s ? s.categoryId : 'abonnements')}</select></label></div>
      ${toggle('active', 'Abonnement actif', s ? s.active : true)}
      <div class="form-error"></div>
      <button class="btn primary" type="submit">${s ? 'Enregistrer' : 'Ajouter l’abonnement'}</button>
      ${s && s.active ? '<button type="button" class="btn" data-action="sub-pay" data-id="' + esc(s.id) + '">Enregistrer un paiement</button>' : ''}
      ${s ? '<button type="button" class="btn danger" data-action="delete-sub" data-id="' + esc(s.id) + '">Supprimer l’abonnement</button>' : ''}
    </form>`);
  }

  function submitSub(form) {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const name = String(fd.get('name') || '').trim();
    const price = C.parseAmount(String(fd.get('price') || ''));
    const nextDate = String(fd.get('nextDate') || '');
    if (!name) return fieldErr(form, 'Donnez un nom à l’abonnement.');
    if (!price) return fieldErr(form, 'Prix invalide.');
    if (!C.isValidISODate(nextDate)) return fieldErr(form, 'Date de prélèvement invalide.');
    const data = { name, price, frequency: fd.get('frequency') === 'yearly' ? 'yearly' : 'monthly', nextDate, anchorDay: Number(nextDate.slice(8, 10)), categoryId: String(fd.get('categoryId')), active: fd.get('active') === 'on' };
    commit((s) => {
      if (id) Object.assign(s.subscriptions.find((x) => x.id === id), data);
      else s.subscriptions.push({ id: C.uid(), ...data });
    }, id ? 'Abonnement modifié' : 'Abonnement ajouté');
    closeSheet();
  }

  /* ---------- Revenu régulier ---------- */

  function openIncomeForm(id) {
    const r = id ? state.recurringIncomes.find((x) => x.id === id) : null;
    openSheet(r ? 'Modifier le revenu' : 'Nouveau revenu régulier', `<form class="form" id="income-form" data-id="${r ? esc(r.id) : ''}" novalidate>
      <label class="field"><span>Nom</span><input class="input" name="name" maxlength="60" value="${esc(r ? r.name : '')}" placeholder="Ex. Salaire d’alternance" autocomplete="off"></label>
      <label class="field"><span>Source</span><select class="input" name="source">${opt(C.INCOME_SOURCES, r ? r.source : 'alternance')}</select></label>
      <div class="field-row"><label class="field"><span>Montant habituel</span>${moneyInput('amount', r ? C.centsToInput(r.amount) : '')}</label>
      <label class="field"><span>Jour de versement</span><input class="input num" name="day" type="number" inputmode="numeric" min="1" max="31" value="${r ? r.day : ''}" placeholder="Ex. 28"></label></div>
      ${toggle('active', 'Revenu actif', r ? r.active : true)}
      <div class="form-error"></div>
      <button class="btn primary" type="submit">${r ? 'Enregistrer' : 'Ajouter le revenu'}</button>
      ${r ? '<button type="button" class="btn danger" data-action="delete-income" data-id="' + esc(r.id) + '">Supprimer</button>' : ''}
    </form>`);
  }

  function submitIncome(form) {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const name = String(fd.get('name') || '').trim();
    const amount = C.parseAmount(String(fd.get('amount') || ''));
    const day = parseInt(fd.get('day'), 10);
    if (!name) return fieldErr(form, 'Donnez un nom à ce revenu.');
    if (!amount) return fieldErr(form, 'Montant invalide.');
    if (!(day >= 1 && day <= 31)) return fieldErr(form, 'Jour de versement entre 1 et 31.');
    const data = { name, source: String(fd.get('source')), amount, day, active: fd.get('active') === 'on' };
    commit((s) => {
      if (id) Object.assign(s.recurringIncomes.find((x) => x.id === id), data);
      else s.recurringIncomes.push({ id: C.uid(), ...data });
    }, id ? 'Revenu modifié' : 'Revenu ajouté');
    closeSheet();
  }

  /* ---------- Catégorie ---------- */

  function openCategoryForm(id) {
    const c = id ? catById(id) : null;
    const used = new Set(state.categories.map((x) => x.color));
    const color = c ? c.color : C.CATEGORY_COLORS.find((x) => !used.has(x)) || C.CATEGORY_COLORS[0];
    openSheet(c ? 'Modifier la catégorie' : 'Nouvelle catégorie', `<form class="form" id="category-form" data-id="${c ? esc(c.id) : ''}" novalidate>
      <label class="field"><span>Nom</span><input class="input" name="name" maxlength="40" value="${esc(c ? c.name : '')}" placeholder="Ex. Animaux" autocomplete="off"></label>
      <div class="field"><span class="field-label">Couleur</span><div class="swatches">${C.CATEGORY_COLORS.map((x) => `<label class="swatch"><input type="radio" name="color" value="${x}" ${x === color ? 'checked' : ''}><span style="--c:${x}"></span></label>`).join('')}</div></div>
      <div class="form-error"></div>
      <button class="btn primary" type="submit">${c ? 'Enregistrer' : 'Créer la catégorie'}</button>
      ${c && !c.builtin ? '<button type="button" class="btn danger" data-action="delete-category" data-id="' + esc(c.id) + '">Supprimer la catégorie</button>' : ''}
      ${c && c.builtin ? '<p class="small muted" style="text-align:center;margin:0">Catégorie de base : elle peut être renommée mais pas supprimée.</p>' : ''}
    </form>`, { focus: c ? null : 'input[name="name"]' });
  }

  function submitCategory(form) {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const name = String(fd.get('name') || '').trim();
    const color = String(fd.get('color') || '#8E8E93');
    if (!name) return fieldErr(form, 'Donnez un nom à la catégorie.');
    if (state.categories.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) return fieldErr(form, 'Cette catégorie existe déjà.');
    commit((s) => {
      if (id) Object.assign(s.categories.find((x) => x.id === id), { name, color });
      else s.categories.push({ id: 'c-' + C.uid(), name, color, builtin: false });
    }, id ? 'Catégorie modifiée' : 'Catégorie créée');
    closeSheet();
  }

  /* ---------- Solde ---------- */

  function openBalanceForm() {
    openSheet('Corriger le solde', `<form class="form" id="balance-form" novalidate>
      <p class="muted small" style="margin:0">Saisissez le solde réel de votre compte courant aujourd’hui. L’application ajuste son point de départ sans créer d’opération.</p>
      ${amountField('balance', C.centsToInput(C.accountBalance(state)))}
      <div class="form-error"></div>
      <button class="btn primary" type="submit">Enregistrer</button></form>`, { focus: 'input[name="balance"]' });
  }

  function submitBalance(form) {
    const v = C.parseSignedAmount(String(new FormData(form).get('balance') || ''));
    if (v === null) return fieldErr(form, 'Montant invalide (ex. 850,00 ou -120,00).');
    commit((s) => { s.settings.openingBalance += v - C.accountBalance(s); }, 'Solde mis à jour');
    closeSheet();
  }

  /* ---------- Bienvenue ---------- */

  function submitOnboarding(form) {
    const fd = new FormData(form);
    const openStr = String(fd.get('opening') || '').trim();
    const livStr = String(fd.get('livret') || '').trim();
    const opening = openStr ? C.parseSignedAmount(openStr) : 0;
    const livret = livStr ? C.parseAmount(livStr) : 0;
    if (opening === null) return fieldErr(form, 'Solde du compte invalide (ex. 850,00).');
    if (livret === null) return fieldErr(form, 'Solde du Livret A invalide.');
    commit((s) => {
      s.settings.openingBalance = opening;
      s.settings.onboarded = true;
      if (livStr) s.savingsAccounts.push({ id: C.uid(), name: 'Livret A', kind: 'livretA', initialBalance: livret, goal: null });
    });
    location.hash = '#/home';
    dailySnapshot();
  }

  /* ---------- Import / export ---------- */

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const file = typeof File === 'function' ? new File([blob], name, { type }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: name }).then(() => true).catch((e) => (e && e.name === 'AbortError' ? false : fallback()));
    }
    return Promise.resolve(fallback());
    function fallback() {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    }
  }

  async function exportJSON() {
    const payload = JSON.stringify({ app: 'budget', format: 1, exportedAt: new Date().toISOString(), data: state }, null, 2);
    const ok = await downloadFile('budget-sauvegarde-' + today() + '.json', payload, 'application/json');
    if (ok) commit((s) => { s.settings.lastExport = new Date().toISOString(); }, 'Sauvegarde exportée');
  }

  function exportCSV() {
    downloadFile('budget-operations-' + today() + '.csv', C.toCSV(state), 'text/csv');
  }

  async function importFile(file) {
    let parsed;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      parsed = C.normalizeState(obj && obj.data ? obj.data : obj);
    } catch (e) {
      toast(e instanceof SyntaxError ? 'Fichier illisible : ce n’est pas une sauvegarde JSON.' : e.message);
      return;
    }
    parsed.settings.onboarded = true;
    if (state.settings.onboarded) {
      const ok = await confirmDialog({ title: 'Remplacer les données ?', message: 'La sauvegarde contient ' + parsed.transactions.length + ' opérations. Vos données actuelles seront remplacées (une copie de sécurité est conservée).', confirm: 'Remplacer', danger: true });
      if (!ok) return;
      addSnapshot('avant import');
    }
    state = parsed;
    save();
    applyTheme();
    location.hash = '#/home';
    render();
    toast('Sauvegarde importée');
  }

  /* =====================================================================
     5. ACTIONS
     ===================================================================== */

  const ACTIONS = {
    'add': () => { if (state.settings.onboarded) openTxForm(); },
    'close-sheet': () => closeSheet(),
    'edit-tx': (el) => { const t = state.transactions.find((x) => x.id === el.dataset.id); if (t) openTxForm({ tx: t }); },
    'tx-type': (el) => { syncDraft($('#tx-form')); draft.type = el.dataset.value; setSheetBody(txFormHTML()); },
    'delete-tx': () => {
      const id = draft.id;
      closeSheet();
      commitUndoable((s) => { s.transactions = s.transactions.filter((t) => t.id !== id); }, 'Opération supprimée');
    },

    'goto-ops': (el) => {
      ui.filters = { type: el.dataset.type || 'all', categoryId: el.dataset.cat || '', period: 'month:' + (el.dataset.month || thisMonth()), from: '', to: '', query: '' };
      location.hash = '#/ops';
    },
    'filter-type': (el) => { ui.filters.type = el.dataset.value; if (ui.filters.type !== 'expense' && ui.filters.type !== 'all') ui.filters.categoryId = ''; render(); },
    'stats-month': (el) => {
      const next = C.addMonths(ui.statsMonth, Number(el.dataset.delta));
      if (next <= thisMonth()) { ui.statsMonth = next; render(); }
    },

    'due-validate': (el) => {
      const { kind, id } = el.dataset;
      const date = el.dataset.date <= today() ? el.dataset.date : today();
      if (kind === 'income') {
        const r = state.recurringIncomes.find((x) => x.id === id);
        if (r) openTxForm({ type: 'income', amount: r.amount, source: r.source, note: r.name, recurringId: r.id, date, title: 'Revenu reçu' });
      } else if (kind === 'credit') {
        const c = state.credits.find((x) => x.id === id);
        if (c) openTxForm({ type: 'expense', amount: Math.min(c.monthly, C.creditRemaining(state, c)), categoryId: 'credit', note: c.name, creditId: c.id, payment: 'prelevement', date, title: 'Mensualité' });
      } else {
        const s = state.subscriptions.find((x) => x.id === id);
        if (s) openTxForm({ type: 'expense', amount: s.price, categoryId: s.categoryId, note: s.name, subscriptionId: s.id, payment: 'prelevement', date, title: 'Paiement abonnement' });
      }
    },
    'due-skip': (el) => {
      const { kind, id } = el.dataset;
      commitUndoable((s) => {
        if (kind === 'subscription') {
          const sub = s.subscriptions.find((x) => x.id === id);
          if (sub) sub.nextDate = C.addPeriod(sub.nextDate, sub.frequency, sub.anchorDay);
        } else {
          s.skips[C.skipKey(kind, id, thisMonth())] = true;
        }
      }, kind === 'subscription' ? 'Échéance passée' : 'Ignoré pour ce mois-ci');
    },

    'new-account': () => { pendingSavingForm = !!$('#tx-form'); openAccountForm(); },
    'edit-account': (el) => openAccountForm(el.dataset.id),
    'saving-move': (el) => openTxForm({ type: 'saving', accountId: el.dataset.id, direction: el.dataset.dir, lockType: true, title: DIRECTIONS[el.dataset.dir] }),
    'delete-account': async (el) => {
      const id = el.dataset.id;
      const n = state.transactions.filter((t) => t.type === 'saving' && t.accountId === id).length;
      const ok = await confirmDialog({ title: 'Supprimer ce compte ?', message: n ? 'Ses ' + n + ' mouvements seront aussi supprimés et votre solde disponible sera recalculé.' : 'Cette action est définitive.', confirm: 'Supprimer', danger: true });
      if (!ok) return;
      closeSheet();
      location.hash = '#/savings';
      commitUndoable((s) => {
        s.savingsAccounts = s.savingsAccounts.filter((a) => a.id !== id);
        s.transactions = s.transactions.filter((t) => !(t.type === 'saving' && t.accountId === id));
      }, 'Compte supprimé');
    },

    'new-credit': () => openCreditForm(),
    'edit-credit': (el) => openCreditForm(el.dataset.id),
    'credit-pay': (el) => {
      const c = state.credits.find((x) => x.id === el.dataset.id);
      if (c) openTxForm({ type: 'expense', amount: Math.min(c.monthly, C.creditRemaining(state, c)), categoryId: 'credit', note: c.name, creditId: c.id, payment: 'prelevement', title: 'Mensualité' });
    },
    'delete-credit': async (el) => {
      const id = el.dataset.id;
      const ok = await confirmDialog({ title: 'Supprimer ce crédit ?', message: 'Les mensualités déjà enregistrées restent dans vos dépenses.', confirm: 'Supprimer', danger: true });
      if (!ok) return;
      closeSheet();
      location.hash = '#/credits';
      commitUndoable((s) => {
        s.credits = s.credits.filter((c) => c.id !== id);
        s.transactions.forEach((t) => { if (t.creditId === id) delete t.creditId; });
      }, 'Crédit supprimé');
    },

    'new-sub': () => openSubForm(),
    'edit-sub': (el) => openSubForm(el.dataset.id),
    'sub-pay': (el) => {
      const s = state.subscriptions.find((x) => x.id === el.dataset.id);
      if (s) openTxForm({ type: 'expense', amount: s.price, categoryId: s.categoryId, note: s.name, subscriptionId: s.id, payment: 'prelevement', date: s.nextDate <= today() ? s.nextDate : today(), title: 'Paiement abonnement' });
    },
    'delete-sub': async (el) => {
      const id = el.dataset.id;
      const ok = await confirmDialog({ title: 'Supprimer cet abonnement ?', message: 'Astuce : vous pouvez plutôt le marquer comme résilié pour garder une trace. Les paiements passés restent dans vos dépenses.', confirm: 'Supprimer', danger: true });
      if (!ok) return;
      closeSheet();
      commitUndoable((s) => {
        s.subscriptions = s.subscriptions.filter((x) => x.id !== id);
        s.transactions.forEach((t) => { if (t.subscriptionId === id) delete t.subscriptionId; });
      }, 'Abonnement supprimé');
    },

    'new-income': () => openIncomeForm(),
    'edit-income': (el) => openIncomeForm(el.dataset.id),
    'delete-income': async (el) => {
      const id = el.dataset.id;
      const ok = await confirmDialog({ title: 'Supprimer ce revenu régulier ?', message: 'Les versements déjà enregistrés sont conservés.', confirm: 'Supprimer', danger: true });
      if (!ok) return;
      closeSheet();
      commitUndoable((s) => {
        s.recurringIncomes = s.recurringIncomes.filter((x) => x.id !== id);
        s.transactions.forEach((t) => { if (t.recurringId === id) delete t.recurringId; });
      }, 'Revenu supprimé');
    },

    'new-category': () => openCategoryForm(),
    'edit-category': (el) => openCategoryForm(el.dataset.id),
    'delete-category': async (el) => {
      const id = el.dataset.id;
      const n = state.transactions.filter((t) => t.categoryId === id).length;
      const ok = await confirmDialog({ title: 'Supprimer la catégorie ?', message: n ? n + ' opération(s) seront déplacées dans « Autres ».' : 'Cette catégorie n’est utilisée par aucune opération.', confirm: 'Supprimer', danger: true });
      if (!ok) return;
      closeSheet();
      commitUndoable((s) => {
        s.categories = s.categories.filter((c) => c.id !== id);
        s.transactions.forEach((t) => { if (t.categoryId === id) t.categoryId = 'autres'; });
        s.subscriptions.forEach((x) => { if (x.categoryId === id) x.categoryId = 'abonnements'; });
      }, 'Catégorie supprimée');
    },

    'theme': (el) => { commit((s) => { s.settings.theme = el.dataset.value; }); applyTheme(); },
    'adjust-balance': () => openBalanceForm(),
    'export-json': () => exportJSON(),
    'export-csv': () => exportCSV(),
    'import': () => { const i = $('#import-input'); i.value = ''; i.click(); },
    'restore-snapshot': async (el) => {
      const snap = readSnapshots()[Number(el.dataset.index)];
      if (!snap) return;
      let parsed;
      try { parsed = C.normalizeState(JSON.parse(snap.data)); } catch (e) { toast('Cette sauvegarde est illisible.'); return; }
      const ok = await confirmDialog({ title: 'Restaurer cette sauvegarde ?', message: 'Retour à l’état du ' + C.dateLabel(snap.day, true) + ' (' + parsed.transactions.length + ' opérations). L’état actuel est conservé comme copie.', confirm: 'Restaurer', danger: true });
      if (!ok) return;
      addSnapshot('avant restauration');
      state = parsed;
      save(); applyTheme(); render();
      toast('Sauvegarde restaurée');
    },
    'reset-all': async () => {
      const ok = await confirmDialog({ title: 'Effacer toutes les données ?', message: 'Toutes vos opérations, comptes et réglages seront supprimés de ce téléphone.', confirm: 'Continuer', danger: true });
      if (!ok) return;
      const ok2 = await confirmDialog({ title: 'Vraiment tout effacer ?', message: 'Une copie de sécurité sera gardée dans « Sauvegardes automatiques », mais exportez d’abord si vous voulez la conserver ailleurs.', confirm: 'Tout effacer', danger: true });
      if (!ok2) return;
      addSnapshot('avant effacement');
      state = C.createDefaultState();
      save(); applyTheme();
      location.hash = '#/home';
      render();
    }
  };

  const FORMS = {
    'tx-form': submitTx, 'account-form': submitAccount, 'credit-form': submitCredit, 'sub-form': submitSub,
    'income-form': submitIncome, 'category-form': submitCategory, 'balance-form': submitBalance, 'onboard-form': submitOnboarding
  };

  function bindEvents() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const fn = ACTIONS[el.dataset.action];
      if (!fn) return;
      e.preventDefault();
      fn(el, e);
    });

    document.addEventListener('submit', (e) => {
      const fn = FORMS[e.target.id];
      if (!fn) return;
      e.preventDefault();
      fn(e.target);
    });

    // Filtres de la page Opérations
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.filter === 'query') {
        ui.filters.query = el.value;
        const box = $('#ops-list');
        if (box) box.innerHTML = opsList();
      }
      if (el.name === 'kind' && el.closest('#account-form')) {
        const nameInput = el.form.querySelector('[name="name"]');
        const names = C.SAVINGS_KINDS.map((k) => k.name);
        if (!nameInput.value.trim() || names.includes(nameInput.value.trim())) nameInput.value = kindName(el.value);
      }
    });
    document.addEventListener('change', (e) => {
      const el = e.target;
      const key = el.dataset.filter;
      if (key && key !== 'query') {
        ui.filters[key] = el.value;
        if (key === 'period' && el.value === 'custom' && !ui.filters.from) {
          ui.filters.from = thisMonth() + '-01';
          ui.filters.to = today();
        }
        render();
      }
      if (el.id === 'import-input' && el.files && el.files[0]) importFile(el.files[0]);
      // Le texte d'aide de l'épargne suit le type de mouvement choisi
      if (el.name === 'direction' && el.closest('#tx-form')) { syncDraft(el.form); setSheetBody(txFormHTML()); }
    });

    window.addEventListener('hashchange', () => { closeSheetIfOpen(); render(); window.scrollTo(0, 0); });
    if (window.matchMedia) {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => { if (state.settings.theme === 'auto') applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    }
    // Revenir sur l'app un autre jour : on recalcule (mois courant, échéances…)
    let lastDay = today();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && today() !== lastDay) {
        lastDay = today();
        ui.statsMonth = thisMonth();
        dailySnapshot();
        render();
      }
    });
    // Autre onglet ouvert sur la même app : on recharge les données.
    window.addEventListener('storage', (e) => {
      if (e.key === KEY && e.newValue) { try { state = C.normalizeState(JSON.parse(e.newValue)); render(); } catch (err) { /* ignore */ } }
    });
  }

  function closeSheetIfOpen() {
    if ($('#sheet-root').classList.contains('open')) closeSheet();
  }

  /* ---------- Démarrage ---------- */

  function start() {
    load();
    applyTheme();
    bindEvents();
    render();
    dailySnapshot();
    if (pendingToast) toast(pendingToast);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  start();
})();
