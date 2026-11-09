/* app.js — Le mie spese (web app locale per iPhone) */
(function () {
  'use strict';

  const P = window.SpeseParser;
  const STORE_KEY = 'spese-nexi:v1';
  const METHODS = [
    { id: 'contanti', name: 'Contanti', emoji: '💶' },
    { id: 'carta', name: 'Carta Nexi', emoji: '💳' },
    { id: 'bancomat', name: 'Bancomat', emoji: '🏦' },
    { id: 'altro', name: 'Altro', emoji: '🔹' },
  ];
  const METHOD = Object.fromEntries(METHODS.map(m => [m.id, m]));
  const SOURCE_LABEL = { wallet: 'Nexi · Apple Pay', sms: 'Nexi · SMS', email: 'Nexi · email', testo: 'Nexi · testo incollato',
    ricorrente: 'Ricorrente', manuale: 'Inserita a mano' };

  const ICON = {
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  };

  // ---------------------------------------------------------------------------
  // Stato e salvataggio (solo sul dispositivo: localStorage)
  // ---------------------------------------------------------------------------
  function defaultState() {
    return { version: 1, expenses: [], rules: [], recurring: [], imported: {},
      settings: { budget: 0, lastBackup: null, lastImport: null, installHintDismissed: false } };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && Array.isArray(s.expenses)) {
        const d = defaultState();
        return Object.assign(d, s, { settings: Object.assign(d.settings, s.settings || {}) });
      }
    } catch (e) { /* stato corrotto: si riparte */ }
    return defaultState();
  }
  let state = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Impossibile salvare: memoria del browser piena.'); }
  }


  // ---------------------------------------------------------------------------
  // Utilità
  // ---------------------------------------------------------------------------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const pad = n => String(n).padStart(2, '0');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const round2 = n => Math.round(n * 100) / 100;
  const EURF = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const eur = n => EURF.format(round2(n) || 0);
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function toLocalISO(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function parseLocal(s) {
    const [dp, tp = '00:00'] = String(s).split('T');
    const [y, m, d] = dp.split('-').map(Number);
    const [h, mi] = tp.split(':').map(Number);
    return new Date(y, m - 1, d, h || 0, mi || 0);
  }
  function addMonths(key, n) {
    const [y, m] = key.split('-').map(Number);
    return monthKey(new Date(y, m - 1 + n, 1));
  }
  function monthDate(key) { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1); }
  const monthLabel = key => cap(monthDate(key).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }));
  const monthName = key => monthDate(key).toLocaleDateString('it-IT', { month: 'long' });
  const monthShort = key => monthDate(key).toLocaleDateString('it-IT', { month: 'short' }).replace('.', '');
  const dayLabel = d => d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const shortDate = d => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) + (d.getHours() || d.getMinutes() ? ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '');
  const timeOf = s => s.slice(11, 16);
  const cat = id => P.CAT[id] || P.CAT.altro;
  const isExcluded = e => !!cat(e.category).excluded;

  const ui = { tab: 'mese', month: monthKey(new Date()), filterCat: null, search: '', review: null, chartMonth: null };

  // ---------------------------------------------------------------------------
  // Calcoli
  // ---------------------------------------------------------------------------
  const ofMonth = key => state.expenses.filter(e => e.date.slice(0, 7) === key);
  function totals(list) {
    const t = { total: 0, card: 0, cash: 0, other: 0, withdrawals: 0, byCat: {}, count: 0 };
    list.forEach(e => {
      if (isExcluded(e)) { t.withdrawals += e.amount; return; }
      t.count++;
      t.total += e.amount;
      if (e.method === 'contanti') t.cash += e.amount;
      else if (e.method === 'carta' || e.method === 'bancomat') t.card += e.amount;
      else t.other += e.amount;
      t.byCat[e.category] = (t.byCat[e.category] || 0) + e.amount;
    });
    ['total', 'card', 'cash', 'other', 'withdrawals'].forEach(k => { t[k] = round2(t[k]); });
    return t;
  }

  // Spese ricorrenti: genera le voci dei mesi mancanti fino a oggi.
  function runRecurring() {
    const now = new Date();
    const nowKey = monthKey(now);
    let added = 0;
    state.recurring.forEach(r => {
      if (!r.active) return;
      let k = addMonths(r.lastMonth, 1);
      while (k <= nowKey) {
        const [y, m] = k.split('-').map(Number);
        const dim = new Date(y, m, 0).getDate();
        const d = new Date(y, m - 1, Math.min(r.day, dim), r.hour || 9, r.minute || 0);
        if (d > now) break;
        state.expenses.push({ id: uid(), amount: r.amount, date: toLocalISO(d), category: r.category,
          description: r.description, method: r.method, note: r.note || '', merchant: r.merchant || '',
          source: 'ricorrente', channel: 'Ricorrente', recurringId: r.id,
          reason: 'Aggiunta automaticamente: spesa ricorrente mensile.', createdAt: Date.now() });
        r.lastMonth = k;
        added++;
        k = addMonths(k, 1);
      }
    });
    if (added) save();
    return added;
  }

  // Nome "pulito" di una spesa, senza il prefisso automatico della causale
  const LABEL_PREFIXES = P.CATEGORIES.map(c => c.label).concat(['Rimborso da', 'Prelievo contanti'])
    .sort((a, b) => b.length - a.length);
  function entityKey(e) {
    let s = (e.merchant || e.description || '').trim();
    if (!e.merchant) {
      const low = s.toLowerCase();
      const pre = LABEL_PREFIXES.find(l => low.startsWith(l.toLowerCase() + ' '));
      if (pre) s = s.slice(pre.length + 1);
    }
    return P.merchantKey(s) || P.norm(s);
  }

  function learnRule(merchant, category) {
    const key = P.merchantKey(merchant);
    if (!key || key.length < 3) return null;
    const existing = state.rules.find(r => P.norm(r.match) === key);
    if (existing) existing.category = category;
    else state.rules.push({ id: uid(), match: key, category });
    return key;
  }

  // ---------------------------------------------------------------------------
  // Toast e bottom sheet
  // ---------------------------------------------------------------------------
  let toastTimer = null;
  function toast(msg, actionLabel, actionFn) {
    const el = $('#toast');
    el.textContent = '';
    const span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);
    if (actionLabel) {
      const b = document.createElement('button');
      b.textContent = actionLabel;
      b.onclick = () => { el.classList.remove('show'); actionFn(); };
      el.appendChild(b);
    }
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), actionLabel ? 5500 : 2800);
  }

  function openSheet(opts) {
    const root = $('#sheet-root');
    root.innerHTML = `<div class="sheet-backdrop" data-sheet-close></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(opts.title)}">
        <div class="sheet-head">
          <button class="btn-text" data-sheet-close>${esc(opts.left || 'Annulla')}</button>
          <h3>${esc(opts.title)}</h3>
          ${opts.right ? `<button class="btn-text strong" data-sheet-ok>${esc(opts.right)}</button>` : '<span style="min-width:64px"></span>'}
        </div>
        <div class="sheet-body">${opts.body}</div>
      </div>`;
    $$('[data-sheet-close]', root).forEach(b => { b.onclick = closeSheet; });
    const ok = $('[data-sheet-ok]', root);
    if (ok) ok.onclick = () => { if (opts.onOk() !== false) closeSheet(); };
    document.documentElement.style.overflow = 'hidden';
    if (opts.onMount) opts.onMount($('.sheet-body', root));
  }
  function closeSheet() {
    $('#sheet-root').innerHTML = '';
    document.documentElement.style.overflow = '';
  }

  // ---------------------------------------------------------------------------
  // Vista: Mese
  // ---------------------------------------------------------------------------
  function deltaHtml(key, cur) {
    const prevKey = addMonths(key, -1);
    const isCurrent = key === monthKey(new Date());
    let prevList = ofMonth(prevKey);
    if (isCurrent) {
      const today = new Date().getDate();
      prevList = prevList.filter(e => +e.date.slice(8, 10) <= today);
    }
    const prev = totals(prevList).total;
    if (prev <= 0) return `<div class="delta">Nessuna spesa registrata a ${esc(monthName(prevKey))}</div>`;
    const pct = Math.round((cur - prev) / prev * 100);
    const same = isCurrent ? ' (stesso periodo)' : '';
    if (pct === 0) return `<div class="delta">= come ${esc(monthName(prevKey))}${same}</div>`;
    const up = pct > 0;
    return `<div class="delta ${up ? 'up' : 'down'}"><span class="arrow" aria-hidden="true">${up ? '▲' : '▼'}</span>
      ${up ? '+' : '−'}${Math.abs(pct)}% rispetto a ${esc(monthName(prevKey))}${same} (${eur(prev)})</div>`;
  }

  function budgetHtml(total) {
    const b = +state.settings.budget || 0;
    if (!b) return '';
    const pct = total / b;
    const cls = pct > 1 ? 'over' : pct > 0.8 ? 'warn' : '';
    const right = pct > 1 ? `⚠️ Superato di ${eur(total - b)}` : `Rimangono ${eur(b - total)}`;
    return `<div style="margin-top:14px">
      <div class="meter ${cls}" role="meter" aria-valuemin="0" aria-valuemax="${b}" aria-valuenow="${round2(total)}" aria-label="Budget mensile"><span style="width:${Math.min(100, pct * 100).toFixed(1)}%"></span></div>
      <div class="meter-row"><span>Budget ${eur(b)} · ${Math.round(pct * 100)}%</span><span>${right}</span></div></div>`;
  }

  function bannersHtml() {
    let h = '';
    const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS && !standalone && !state.settings.installHintDismissed) {
      h += `<div class="banner info"><span>📲</span><div><b>Installa l'app:</b> tocca <b>Condividi</b> ⬆︎ in Safari e poi <b>Aggiungi alla schermata Home</b>. Usa sempre l'icona sulla Home: i dati di Safari e dell'app installata sono separati.</div>
        <button class="act" data-action="dismiss-install" aria-label="Chiudi">✕</button></div>`;
    }
    const last = state.settings.lastBackup;
    const days = last ? (Date.now() - last) / 86400000 : Infinity;
    if (state.expenses.length >= 15 && days > 30) {
      h += `<div class="banner"><span>💾</span><div>${last ? 'Ultimo backup ' + Math.floor(days) + ' giorni fa.' : 'Non hai ancora fatto un backup.'} I dati sono solo su questo iPhone: salvane una copia.</div>
        <button class="act" data-action="backup">Backup</button></div>`;
    }
    return h;
  }

  function renderMese() {
    const key = ui.month;
    const nowKey = monthKey(new Date());
    const list = ofMonth(key);
    const t = totals(list);
    const el = $('#view-mese');
    const cats = Object.entries(t.byCat).filter(([, v]) => round2(v) !== 0).sort((a, b) => b[1] - a[1]);
    const maxCat = Math.max(...cats.map(([, v]) => v), 0);

    let h = `<div class="month-nav">
        <button class="icon-btn" data-action="prev-month" aria-label="Mese precedente">${ICON.left}</button>
        <h1>${esc(monthLabel(key))}</h1>
        <button class="icon-btn" data-action="next-month" aria-label="Mese successivo" ${key >= nowKey ? 'disabled' : ''}>${ICON.right}</button>
      </div>`;
    h += bannersHtml();
    h += `<div class="card">
        <div class="hero-label">${key === nowKey ? 'Speso questo mese' : 'Speso a ' + esc(monthName(key))}</div>
        <div class="hero-value">${eur(t.total)}</div>
        ${deltaHtml(key, t.total)}
        <div class="tiles">
          <div class="tile"><div class="label">💳 Carta</div><div class="value">${eur(t.card)}</div></div>
          <div class="tile"><div class="label">💶 Contanti</div><div class="value">${eur(t.cash)}</div></div>
        </div>
        ${t.other ? `<div class="note-line">Altri metodi: ${eur(t.other)}</div>` : ''}
        ${t.withdrawals ? `<div class="note-line">🏧 Prelievi di contanti: ${eur(t.withdrawals)} — non inclusi nel totale (le spese in contanti le aggiungi a mano).</div>` : ''}
        ${budgetHtml(t.total)}
      </div>`;

    if (cats.length) {
      h += `<h2 class="section"><span>Per categoria</span>${ui.filterCat ? '<button class="link" data-action="clear-filter">Mostra tutte</button>' : ''}</h2>
        <div class="card flush" role="list">`;
      cats.forEach(([id, v]) => {
        const c = cat(id);
        const neg = v < 0;
        const w = !neg && maxCat > 0 ? (v / maxCat * 100) : 0;
        const pct = t.total > 0 && !neg ? Math.round(v / t.total * 100) : 0;
        h += `<button class="cat-row ${ui.filterCat === id ? 'active' : ''}" data-action="filter-cat" data-cat="${id}" role="listitem"
            aria-label="${esc(c.name)}: ${neg ? 'rimborsi ' + esc(eur(-v)) : esc(eur(v)) + ', ' + pct + '% del totale'}">
            <span class="ico" aria-hidden="true">${c.emoji}</span>
            <span class="name">${esc(c.name)}</span>
            <span class="amt${neg ? ' refund' : ''}">${neg ? '+' + eur(-v) : eur(v)}</span>
            ${neg ? '<span class="bar small muted">Più rimborsi che acquisti questo mese</span>'
              : `<span class="bar" aria-hidden="true"><span class="track"><span class="fill" style="width:${w.toFixed(1)}%;display:block"></span></span><span class="pct">${pct}%</span></span>`}
          </button>`;
      });
      h += `</div>`;
    }

    h += `<h2 class="section"><span>Movimenti</span><span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${list.length}</span></h2>
      <div class="filter-bar">
        <input class="search" id="search" type="search" placeholder="Cerca…" value="${esc(ui.search)}" aria-label="Cerca nei movimenti">
        ${ui.filterCat ? `<button class="chip-filter" data-action="clear-filter">${cat(ui.filterCat).emoji} ${esc(cat(ui.filterCat).name)} ✕</button>` : ''}
      </div>
      <div id="tx-list"></div>`;
    el.innerHTML = h;
    renderList();
  }

  function renderList() {
    const box = $('#tx-list');
    if (!box) return;
    let list = ofMonth(ui.month);
    if (ui.filterCat) list = list.filter(e => e.category === ui.filterCat);
    const q = P.norm(ui.search);
    if (q) list = list.filter(e => P.norm([e.description, e.merchant, e.note, cat(e.category).name].join(' ')).includes(q));
    list.sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt || 0) - (a.createdAt || 0));
    if (!list.length) {
      const empty = !ofMonth(ui.month).length;
      box.innerHTML = `<div class="card empty"><div class="big">${empty ? '🧾' : '🔎'}</div>
        ${empty ? `Nessuna spesa a ${esc(monthName(ui.month))}.<br>Tocca <b>+</b> per aggiungerne una in contanti oppure importa i pagamenti dalla scheda <b>Nexi</b>.` : 'Nessun movimento corrisponde al filtro.'}</div>`;
      return;
    }
    const groups = [];
    list.forEach(e => {
      const day = e.date.slice(0, 10);
      let g = groups[groups.length - 1];
      if (!g || g.day !== day) { g = { day, items: [], total: 0 }; groups.push(g); }
      g.items.push(e);
      if (!isExcluded(e)) { g.total += e.amount; g.counted = true; }
    });
    let h = '';
    groups.forEach(g => {
      const dayTot = !g.counted ? '' : g.total < 0 ? '+' + eur(-g.total) : eur(g.total);
      h += `<div class="day-head"><span>${esc(dayLabel(parseLocal(g.day)))}</span><span class="tnum">${dayTot}</span></div><div class="card flush">`;
      g.items.forEach(e => {
        const c = cat(e.category);
        const m = METHOD[e.method] || METHOD.altro;
        const sub = [c.name, m.name, timeOf(e.date) !== '00:00' ? timeOf(e.date) : ''].filter(Boolean).join(' · ');
        const cls = e.amount < 0 ? 'refund' : isExcluded(e) ? 'excluded' : '';
        const amt = e.amount < 0 ? '+' + eur(-e.amount) : eur(e.amount);
        const badge = e.source && e.source !== 'manuale' ? `<span class="badge">${e.source === 'ricorrente' ? '↻' : 'Nexi'}</span>` : '';
        h += `<button class="tx" data-action="edit" data-id="${e.id}">
            <span class="ico" aria-hidden="true">${c.emoji}</span>
            <span class="tx-main"><div class="title">${esc(e.description || c.name)}${badge}</div><div class="sub">${esc(sub)}</div></span>
            <span class="amt ${cls}">${amt}</span>
          </button>`;
      });
      h += `</div>`;
    });
    box.innerHTML = h;
  }

  // ---------------------------------------------------------------------------
  // Vista: Andamento
  // ---------------------------------------------------------------------------
  function trendData() {
    const nowKey = monthKey(new Date());
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const k = addMonths(nowKey, -i);
      out.push({ key: k, total: totals(ofMonth(k)).total });
    }
    return out;
  }

  function niceTicks(max) {
    if (max <= 0) return [0, 50, 100];
    const raw = max / 3;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw);
    const ticks = [];
    for (let v = 0; v <= max + step * 0.001 || ticks.length < 2; v += step) ticks.push(round2(v));
    if (ticks[ticks.length - 1] < max) ticks.push(round2(ticks[ticks.length - 1] + step));
    return ticks;
  }

  function colPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function drawChart() {
    const wrap = $('#trend-chart');
    if (!wrap) return;
    const data = trendData();
    const sel = ui.chartMonth || monthKey(new Date());
    const W = Math.max(280, Math.floor(wrap.clientWidth || 320));
    const H = 200, padL = 42, padR = 4, padT = 24, padB = 24;
    const max = Math.max(...data.map(d => d.total), 0);
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1];
    const plotH = H - padT - padB;
    const y = v => padT + plotH * (1 - v / top);
    const band = (W - padL - padR) / data.length;
    const bw = Math.min(24, Math.max(6, band * 0.62));
    const tickLbl = v => (top >= 10000 ? Math.round(v / 1000) + 'k' : Math.round(v).toLocaleString('it-IT'));
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Spese totali degli ultimi 12 mesi, in euro">`;
    ticks.forEach(tv => {
      s += `<line class="${tv === 0 ? 'base' : 'grid'}" x1="${padL}" x2="${W - padR}" y1="${y(tv).toFixed(1)}" y2="${y(tv).toFixed(1)}"/>
        <text class="tick" x="${padL - 8}" y="${(y(tv) + 4).toFixed(1)}" text-anchor="end">${tickLbl(tv)}</text>`;
    });
    data.forEach((d, i) => {
      const cx = padL + band * i + band / 2;
      const v = Math.max(0, d.total);
      const h = plotH * v / top;
      const isSel = d.key === sel;
      if (h > 0.5) s += `<path class="col${isSel ? ' sel' : ''}" d="${colPath(cx - bw / 2, H - padB - h, bw, h, 4)}"/>`;
      s += `<text class="xl${isSel ? ' sel' : ''}" x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(monthShort(d.key))}</text>`;
      if (isSel && v > 0) {
        const anchor = i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle';
        const lx = anchor === 'start' ? cx - bw / 2 : anchor === 'end' ? cx + bw / 2 : cx;
        s += `<text class="vlabel" x="${lx.toFixed(1)}" y="${(H - padB - h - 7).toFixed(1)}" text-anchor="${anchor}">${esc(eur(v).replace(/,\d\d/, ''))}</text>`;
      }
      s += `<rect class="hit" x="${(padL + band * i).toFixed(1)}" y="0" width="${band.toFixed(1)}" height="${H}" tabindex="0" role="button"
        aria-label="${esc(monthLabel(d.key))}: ${esc(eur(d.total))}" data-action="chart-sel" data-key="${d.key}"><title>${esc(monthLabel(d.key))}: ${esc(eur(d.total))}</title></rect>`;
    });
    s += '</svg>';
    wrap.innerHTML = s;
    const selD = data.find(d => d.key === sel) || data[data.length - 1];
    $('#trend-readout').innerHTML = `<div><div class="l">${esc(monthLabel(selD.key))}</div><div class="v">${eur(selD.total)}</div></div>
      <button class="btn small secondary" data-action="goto-month" data-key="${selD.key}">Apri mese ›</button>`;
  }

  function subscriptions() {
    const since = new Date(); since.setDate(since.getDate() - 95);
    const groups = {};
    state.expenses.filter(e => e.category === 'abbonamenti' && e.amount > 0 && parseLocal(e.date) >= since).forEach(e => {
      const k = entityKey(e) || e.id;
      const g = groups[k] || (groups[k] = { items: [] });
      g.items.push(e);
    });
    const recentLimit = new Date(); recentLimit.setDate(recentLimit.getDate() - 45);
    const list = Object.values(groups).map(g => {
      g.items.sort((a, b) => b.date.localeCompare(a.date));
      const last = g.items[0];
      return { name: last.description || last.merchant, amount: last.amount, date: parseLocal(last.date), active: parseLocal(last.date) >= recentLimit };
    }).sort((a, b) => b.amount - a.amount);
    const monthly = round2(list.filter(s => s.active).reduce((a, s) => a + s.amount, 0));
    return { list, monthly };
  }

  function renderAndamento() {
    const el = $('#view-andamento');
    const data = trendData();
    const withData = data.filter(d => d.total > 0);
    const avg = withData.length ? withData.reduce((a, d) => a + d.total, 0) / withData.length : 0;
    const maxD = withData.slice().sort((a, b) => b.total - a.total)[0];
    const subs = subscriptions();

    // Media per categoria sugli ultimi 3 mesi con spese
    const last3 = data.slice(-3).map(d => d.key);
    const catSum = {};
    last3.forEach(k => {
      const t = totals(ofMonth(k));
      Object.entries(t.byCat).forEach(([c, v]) => { catSum[c] = (catSum[c] || 0) + v; });
    });
    const months3 = last3.filter(k => ofMonth(k).length).length || 1;
    const catAvg = Object.entries(catSum).map(([c, v]) => [c, v / months3]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

    let h = `<div class="topbar"><h1>Andamento</h1></div>
      <div class="card">
        <div class="chart-readout" id="trend-readout"></div>
        <div class="chart-wrap" id="trend-chart"></div>
        <div class="note-line">Tocca una colonna per vedere il mese. Prelievi di contanti esclusi.</div>
      </div>
      <div class="stat-grid">
        <div class="tile card"><div class="label">Media mensile</div><div class="value">${eur(avg)}</div><div class="small muted">${withData.length} mesi con spese</div></div>
        <div class="tile card"><div class="label">Mese più caro</div><div class="value">${maxD ? eur(maxD.total) : '—'}</div><div class="small muted">${maxD ? esc(monthLabel(maxD.key)) : 'nessun dato'}</div></div>
      </div>`;

    h += `<h2 class="section"><span>Abbonamenti</span></h2><div class="card flush">`;
    if (subs.list.length) {
      h += `<table class="data"><tbody>`;
      subs.list.forEach(s => {
        h += `<tr><td>${esc(s.name)}<div class="small muted">ultimo addebito ${esc(shortDate(s.date))}${s.active ? '' : ' · non recente'}</div></td><td class="num">${eur(s.amount)}</td></tr>`;
      });
      h += `<tr><th>Stima mensile<div class="small muted" style="font-weight:400">≈ ${eur(subs.monthly * 12)} all'anno</div></th><td class="num"><b>${eur(subs.monthly)}</b></td></tr></tbody></table>`;
    } else {
      h += `<div class="empty small">Nessun abbonamento negli ultimi 3 mesi.</div>`;
    }
    h += `</div>`;

    if (catAvg.length) {
      h += `<h2 class="section"><span>Media al mese per categoria</span><span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">ultimi 3 mesi</span></h2>
        <div class="card flush"><table class="data"><tbody>`;
      catAvg.forEach(([c, v]) => { h += `<tr><td>${cat(c).emoji} ${esc(cat(c).name)}</td><td class="num">${eur(v)}</td></tr>`; });
      h += `</tbody></table></div>`;
    }

    h += `<h2 class="section"><span>Totali mese per mese</span></h2><div class="card flush"><table class="data"><tbody>`;
    data.slice().reverse().forEach(d => {
      h += `<tr class="clickable" data-action="goto-month" data-key="${d.key}"><td>${esc(monthLabel(d.key))}</td><td class="num">${eur(d.total)}</td></tr>`;
    });
    h += `</tbody></table></div>`;
    el.innerHTML = h;
    drawChart();
  }

  // ---------------------------------------------------------------------------
  // Vista: Nexi (importazione)
  // ---------------------------------------------------------------------------
  function renderNexi() {
    const el = $('#view-nexi');
    const last = state.settings.lastImport;
    const importedCount = Object.keys(state.imported).length;
    let h = `<div class="topbar"><h1>Pagamenti Nexi</h1></div>
      <div class="banner info"><span>ℹ️</span><div>iPhone non permette a nessuna app di leggere le notifiche di altre app. I pagamenti Nexi arrivano qui con i <b>Comandi Rapidi</b>: un'automazione li salva in un file mentre paghi, e tu li importi con un tocco.
        <button class="act" style="display:block;margin-top:6px" data-action="guide">Come si configura ›</button></div></div>

      <div class="card">
        <div style="font-weight:600;font-size:17px">📥 Importa i pagamenti salvati</div>
        <p class="secondary small" style="margin:6px 0 12px">Scegli il file <b>spese-nexi.txt</b> in iCloud Drive › Shortcuts. I pagamenti già importati vengono saltati.</p>
        <label class="btn" for="file-import" role="button">Scegli il file</label>
        <input id="file-import" type="file" accept=".txt,text/plain" class="sr-only">
        <p class="small muted" style="margin:10px 0 0">${last ? 'Ultima importazione: ' + esc(new Date(last).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + ' · ' : ''}${importedCount} pagamenti già letti</p>
      </div>

      <div class="card">
        <div style="font-weight:600;font-size:17px">📋 Incolla una notifica o un SMS</div>
        <p class="secondary small" style="margin:6px 0 10px">Copia il testo di un SMS o di un'email Nexi (anche più di uno) e incollalo qui.</p>
        <textarea id="paste-text" class="input" placeholder="Es. Pagamento di 23,40 EUR presso ESSELUNGA MILANO con carta *1234 il 09/11/2026 alle 12:34"></textarea>
        <div class="btn-row">
          <button class="btn secondary" data-action="paste-clip">Incolla</button>
          <button class="btn" data-action="analyze">Analizza</button>
        </div>
      </div>
      <div id="review"></div>`;
    el.innerHTML = h;
    renderReview();
  }

  function findDuplicate(item, pool) {
    const p = item.parsed;
    if (!p.ok || !item.date) return null;
    const amt = item.amount;
    const day = item.date.slice(0, 10);
    const mk = P.merchantKey(p.merchant);
    const first = mk ? mk.split(' ')[0] : '';
    const similar = e => first && P.norm((e.merchant || '') + ' ' + (e.description || '')).includes(first);
    const minutes = (a, b) => Math.abs(parseLocal(a) - parseLocal(b)) / 60000;
    return pool.find(e => {
      if (Math.abs(e.amount - amt) > 0.005) return false;
      if (e.date.slice(0, 10) === day) return similar(e) || !first || !e.merchant || minutes(e.date, item.date) <= 20;
      if (e.recurringId && e.date.slice(0, 7) === day.slice(0, 7)) return similar(e);
      return false;
    }) || null;
  }

  function startReview(content, source) {
    const batch = P.parseBatch(content, { rules: state.rules });
    const items = [];
    let skipped = 0;
    batch.forEach(b => {
      const known = state.imported[b.key];
      if (known && source === 'file') { skipped++; return; }
      const p = b.parsed;
      const date = p.date ? toLocalISO(p.date) : toLocalISO(new Date());
      const item = { key: b.key, raw: b.raw, parsed: p, amount: p.amount != null ? (p.isRefund ? -p.amount : p.amount) : null,
        date, category: p.category, description: p.description, autoDescription: p.description,
        method: 'carta', warnings: p.warnings.slice(), checked: true, known: !!known };
      if (!p.hasDate) item.warnings.push('Data non trovata: impostata a oggi.');
      if (known) item.warnings.push('Questo testo era già stato importato.');
      const pool = state.expenses.concat(items.filter(i => i.checked && i.amount != null).map(i => ({ amount: i.amount, date: i.date, merchant: i.parsed.merchant, description: i.description })));
      const dup = findDuplicate(item, pool);
      if (dup) item.warnings.push('Possibile doppione di «' + (dup.description || dup.merchant) + '» (' + eur(Math.abs(dup.amount)) + ', ' + shortDate(parseLocal(dup.date)) + ').');
      item.checked = p.ok && !p.isDeclined && !dup && !known;
      items.push(item);
    });
    ui.review = { items, skipped, source };
    if (source === 'file') {
      state.settings.lastImport = Date.now();
      save();
    }
    renderReview();
    const box = $('#review');
    if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function catOptions(selected) {
    return P.CATEGORIES.map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.emoji} ${esc(c.name)}</option>`).join('');
  }

  function renderReview() {
    const box = $('#review');
    if (!box) return;
    const r = ui.review;
    if (!r) { box.innerHTML = ''; return; }
    const n = r.items.filter(i => i.checked).length;
    let h = `<h2 class="section"><span>Da controllare</span><button class="link" data-action="review-cancel">Annulla</button></h2>`;
    if (!r.items.length) {
      h += `<div class="card empty"><div class="big">✅</div>${r.skipped ? `Nessun pagamento nuovo: ${r.skipped} erano già stati importati.` : 'Nessun pagamento trovato nel testo.'}</div>`;
      box.innerHTML = h;
      return;
    }
    if (r.skipped) h += `<p class="small muted" style="margin:0 4px 8px">${r.skipped} pagamenti già importati sono stati saltati.</p>`;
    h += `<div class="card flush review">`;
    r.items.forEach((it, i) => {
      const p = it.parsed;
      const meta = [shortDate(parseLocal(it.date)), p.channel, SOURCE_LABEL[p.source] && p.source !== 'wallet' ? SOURCE_LABEL[p.source] : ''].filter(Boolean).join(' · ');
      h += `<div class="rv ${it.checked ? '' : 'off'}">
        <div class="rv-top">
          <input type="checkbox" ${it.checked ? 'checked' : ''} data-rv="${i}" data-field="checked" aria-label="Includi questo pagamento">
          <div class="rv-main">
            <div class="rv-line"><span class="rv-merchant">${esc(p.merchant || 'Esercente sconosciuto')}</span>
              <span class="rv-amt">${it.amount == null ? '—' : (it.amount < 0 ? '+' + eur(-it.amount) : eur(it.amount))}</span></div>
            <div class="rv-meta">${esc(meta)}</div>
          </div>
        </div>
        <div class="grid2">
          <select class="input" data-rv="${i}" data-field="category" aria-label="Categoria">${catOptions(it.category)}</select>
          <input class="input" data-rv="${i}" data-field="description" value="${esc(it.description)}" aria-label="Causale">
          <div class="row2">
            <input class="input" type="text" inputmode="decimal" data-rv="${i}" data-field="amount" value="${it.amount == null ? '' : Math.abs(it.amount).toFixed(2).replace('.', ',')}" aria-label="Importo">
            <input class="input" type="datetime-local" data-rv="${i}" data-field="date" value="${esc(it.date)}" aria-label="Data e ora">
          </div>
        </div>
        <div class="reason">🧠 ${esc(p.reason)}</div>
        ${it.warnings.map(w => `<div class="warn-line">⚠️ ${esc(w)}</div>`).join('')}
      </div>`;
    });
    h += `</div><div class="btn-row"><button class="btn" data-action="review-confirm" ${n ? '' : 'disabled'}>Aggiungi ${n} ${n === 1 ? 'spesa' : 'spese'}</button></div>`;
    box.innerHTML = h;
  }

  function onReviewField(target) {
    const r = ui.review;
    const i = +target.dataset.rv;
    const it = r && r.items[i];
    if (!it) return;
    const f = target.dataset.field;
    if (f === 'checked') { it.checked = target.checked; renderReview(); return; }
    if (f === 'category') {
      const wasAuto = it.description === it.autoDescription;
      it.category = target.value;
      if (wasAuto) {
        it.autoDescription = P.describe(it.category, it.parsed.merchant, it.amount < 0);
        it.description = it.autoDescription;
        const d = target.closest('.rv').querySelector('[data-field=description]');
        if (d) d.value = it.description;
      }
    }
    if (f === 'description') it.description = target.value;
    if (f === 'date' && target.value) it.date = target.value.slice(0, 16);
    if (f === 'amount') {
      const v = P.parseEuroNumber(target.value);
      if (!isNaN(v) && v !== 0) it.amount = it.parsed.isRefund ? -Math.abs(v) : Math.abs(v);
    }
  }

  function confirmReview() {
    const r = ui.review;
    if (!r) return;
    let added = 0;
    const learned = [];
    r.items.forEach(it => {
      if (it.checked && it.amount != null && it.amount !== 0) {
        const p = it.parsed;
        state.expenses.push({ id: uid(), amount: round2(it.amount), date: it.date, category: it.category,
          description: (it.description || '').trim() || P.describe(it.category, p.merchant, it.amount < 0),
          method: 'carta', note: '', merchant: p.merchant, channel: p.channel, source: p.source || 'testo',
          reason: it.category === p.category ? p.reason : 'Categoria scelta da te.', raw: it.raw.slice(0, 400), createdAt: Date.now() });
        if (it.category !== p.category && p.merchant) {
          const k = learnRule(p.merchant, it.category);
          if (k) learned.push(k);
        }
        state.imported[it.key] = 'i';
        added++;
      } else if (r.source === 'file') {
        state.imported[it.key] = 'x';
      }
    });
    save();
    ui.review = null;
    const lastAdded = state.expenses[state.expenses.length - 1];
    if (lastAdded) ui.month = lastAdded.date.slice(0, 7);
    renderNexi();
    toast(`${added} ${added === 1 ? 'spesa aggiunta' : 'spese aggiunte'}` + (learned.length ? ` · ${learned.length} ${learned.length === 1 ? 'regola memorizzata' : 'regole memorizzate'}` : ''),
      added ? 'Vedi' : null, () => switchTab('mese'));
    const pt = $('#paste-text'); if (pt) pt.value = '';
  }

  // ---------------------------------------------------------------------------
  // Vista: Altro (impostazioni)
  // ---------------------------------------------------------------------------
  function renderAltro() {
    const el = $('#view-altro');
    const last = state.settings.lastBackup;
    const activeRec = state.recurring.filter(r => r.active).length;
    el.innerHTML = `<div class="topbar"><h1>Altro</h1></div>
      <h2 class="section"><span>Budget mensile</span></h2>
      <div class="card">
        <div class="field" style="margin-top:0"><label for="budget">Quanto vuoi spendere al massimo ogni mese</label>
          <input id="budget" class="input" inputmode="decimal" placeholder="Es. 1500" value="${state.settings.budget ? esc(String(state.settings.budget).replace('.', ',')) : ''}"></div>
        <p class="small muted" style="margin:8px 2px 0">Lascia vuoto se non vuoi un budget. I prelievi non contano.</p>
      </div>

      <h2 class="section"><span>Automatismi</span></h2>
      <div class="card flush">
        <button class="list-item" data-action="open-rules"><span>🧠 Regole delle categorie<small>Esercenti che hai ricategorizzato</small></span><span class="right">${state.rules.length} ›</span></button>
        <button class="list-item" data-action="open-recurring"><span>↻ Spese ricorrenti<small>Abbonamenti aggiunti ogni mese in automatico</small></span><span class="right">${activeRec} ›</span></button>
        <button class="list-item" data-action="guide"><span>📘 Guida Comandi Rapidi<small>Come collegare i pagamenti Nexi</small></span><span class="chev">›</span></button>
      </div>

      <h2 class="section"><span>I tuoi dati</span></h2>
      <div class="card flush">
        <button class="list-item" data-action="backup"><span>💾 Esporta backup<small>${last ? 'Ultimo backup: ' + esc(new Date(last).toLocaleDateString('it-IT')) : 'Nessun backup ancora'}</small></span><span class="chev">›</span></button>
        <label class="list-item" for="restore-file" role="button"><span>♻️ Ripristina da backup<small>Sostituisce i dati attuali</small></span><span class="chev">›</span></label>
        <input id="restore-file" type="file" accept=".json,application/json" class="sr-only">
        <button class="list-item" data-action="csv-month"><span>📄 Esporta CSV di ${esc(monthName(ui.month))}<small>Apribile con Numbers o Excel</small></span><span class="chev">›</span></button>
        <button class="list-item" data-action="csv-all"><span>📄 Esporta CSV completo</span><span class="chev">›</span></button>
        <button class="list-item" data-action="reset-imports"><span>🔄 Rileggi tutti i pagamenti del file<small>Dimentica quali sono già stati importati</small></span><span class="chev">›</span></button>
        <button class="list-item danger" data-action="wipe"><span>🗑️ Cancella tutti i dati</span></button>
      </div>
      <p class="small muted" style="margin:14px 4px">🔒 Nessun server: le ${state.expenses.length} spese salvate restano solo su questo iPhone. Se elimini l'app dalla schermata Home i dati vengono cancellati, quindi fai un backup ogni tanto (puoi salvarlo su iCloud Drive).</p>`;
  }

  function openRules() {
    const body = () => {
      let h = `<p class="small secondary" style="margin:6px 0 10px">Quando l'esercente contiene la parola indicata, il pagamento va nella categoria scelta. Le regole si creano da sole quando cambi la categoria di un pagamento Nexi, e hanno la precedenza sul riconoscimento automatico.</p>
        <div class="card flush" id="rules-list">`;
      if (!state.rules.length) h += `<div class="empty small">Nessuna regola ancora.</div>`;
      state.rules.forEach(r => {
        h += `<div class="rule-row" data-id="${r.id}">
          <input class="input" data-rule="match" value="${esc(r.match)}" aria-label="Parola dell'esercente">
          <select class="input" data-rule="category" aria-label="Categoria">${catOptions(r.category)}</select>
          <button class="del" data-rule-del aria-label="Elimina regola">✕</button></div>`;
      });
      h += `</div><div class="btn-row"><button class="btn secondary" data-rule-add>+ Aggiungi regola</button></div>`;
      return h;
    };
    const mount = root => {
      root.innerHTML = body();
      root.oninput = root.onchange = ev => {
        const row = ev.target.closest('.rule-row');
        if (!row) return;
        const r = state.rules.find(x => x.id === row.dataset.id);
        if (!r) return;
        if (ev.target.dataset.rule === 'match') r.match = ev.target.value.trim();
        if (ev.target.dataset.rule === 'category') r.category = ev.target.value;
        save();
      };
      root.onclick = ev => {
        if (ev.target.closest('[data-rule-del]')) {
          const row = ev.target.closest('.rule-row');
          state.rules = state.rules.filter(x => x.id !== row.dataset.id);
          save(); mount(root);
        } else if (ev.target.closest('[data-rule-add]')) {
          state.rules.unshift({ id: uid(), match: '', category: 'spesa' });
          save(); mount(root);
          const first = $('.rule-row input', root); if (first) first.focus();
        }
      };
    };
    openSheet({ title: 'Regole categorie', left: 'Fine', body: '', onMount: mount });
  }

  function openRecurring() {
    const mount = root => {
      let h = `<p class="small secondary" style="margin:6px 0 10px">Le spese ricorrenti vengono aggiunte da sole ogni mese, nel giorno indicato. Sono utili per gli abbonamenti addebitati sulla carta senza Apple Pay (es. Netflix, Spotify, palestra). Per crearne una: aggiungi la spesa e attiva <b>Ripeti ogni mese</b>.</p><div class="card flush">`;
      if (!state.recurring.length) h += `<div class="empty small">Nessuna spesa ricorrente.</div>`;
      state.recurring.forEach(r => {
        h += `<div class="list-item" data-id="${r.id}"><span>${cat(r.category).emoji} ${esc(r.description || cat(r.category).name)}
            <small>${eur(r.amount)} · ogni mese il giorno ${r.day} · ${r.active ? 'attiva' : 'interrotta'}</small></span>
            ${r.active ? `<button class="btn small secondary" data-rec-stop="${r.id}">Interrompi</button>` : `<button class="del" data-rec-del="${r.id}" aria-label="Elimina">✕</button>`}</div>`;
      });
      h += `</div>`;
      root.innerHTML = h;
      root.onclick = ev => {
        const stop = ev.target.closest('[data-rec-stop]');
        const del = ev.target.closest('[data-rec-del]');
        if (stop) {
          const r = state.recurring.find(x => x.id === stop.dataset.recStop);
          if (r) r.active = false;
          save(); mount(root); toast('Ricorrenza interrotta: le spese già registrate restano.');
        } else if (del) {
          state.recurring = state.recurring.filter(x => x.id !== del.dataset.recDel);
          save(); mount(root);
        }
      };
    };
    openSheet({ title: 'Spese ricorrenti', left: 'Fine', body: '', onMount: mount });
  }

  // ---------------------------------------------------------------------------
  // Foglio: aggiungi / modifica spesa
  // ---------------------------------------------------------------------------
  function openExpense(existing, preset) {
    const isNew = !existing;
    const e = existing ? Object.assign({}, existing) : Object.assign({ amount: null, date: toLocalISO(new Date()), category: null,
      description: '', method: 'contanti', note: '', source: 'manuale' }, preset || {});
    if (isNew && ui.month !== monthKey(new Date()) && !preset) {
      // Se stai guardando un mese passato, proponi una data in quel mese
      const [y, m] = ui.month.split('-').map(Number);
      e.date = toLocalISO(new Date(y, m - 1, Math.min(new Date().getDate(), new Date(y, m, 0).getDate()), 12, 0));
    }
    let userPickedCat = !isNew;
    const rec = e.recurringId ? state.recurring.find(r => r.id === e.recurringId) : null;
    const suggestions = Array.from(new Set(state.expenses.slice(-300).map(x => x.description).filter(Boolean))).slice(-80);
    const amountStr = e.amount == null ? '' : Math.abs(e.amount).toFixed(2).replace('.', ',');

    const body = `
      <div class="amount-input"><span class="cur">€</span>
        <input id="f-amount" inputmode="decimal" placeholder="0,00" value="${esc(amountStr)}" aria-label="Importo" autocomplete="off"></div>
      <div class="field"><label for="f-desc">Causale (giustificazione)</label>
        <input id="f-desc" class="input" list="desc-list" placeholder="Es. Spesa al mercato, caffè, parrucchiere…" value="${esc(e.description)}" autocomplete="off">
        <datalist id="desc-list">${suggestions.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>
        <div class="hint hidden" id="f-hint"></div></div>
      <div class="field"><span class="label">Categoria</span><div class="chips" id="f-cats">
        ${P.CATEGORIES.map(c => `<button type="button" class="chip ${c.id === e.category ? 'on' : ''}" data-cat="${c.id}"><span class="e">${c.emoji}</span>${esc(c.name)}</button>`).join('')}
      </div></div>
      <div class="field"><span class="label">Pagato con</span><div class="seg" id="f-method">
        ${METHODS.map(m => `<button type="button" class="${m.id === e.method ? 'on' : ''}" data-m="${m.id}">${esc(m.name)}</button>`).join('')}
      </div></div>
      <div class="field"><label for="f-date">Data e ora</label><input id="f-date" class="input" type="datetime-local" value="${esc(e.date)}"></div>
      <div class="field"><label for="f-note">Nota (facoltativa)</label><input id="f-note" class="input" value="${esc(e.note || '')}" placeholder="Dettagli in più"></div>
      <div class="field"><div class="switch-row"><span class="txt">Rimborso<small>Soldi restituiti (es. reso, storno): si sottrae dal totale</small></span>
        <label class="switch"><input type="checkbox" id="f-refund" ${e.amount < 0 ? 'checked' : ''}><span></span></label></div></div>
      ${isNew ? `<div class="field"><div class="switch-row"><span class="txt">Ripeti ogni mese<small>Per abbonamenti e spese fisse: verrà aggiunta da sola ogni mese</small></span>
        <label class="switch"><input type="checkbox" id="f-repeat"><span></span></label></div></div>` : ''}
      ${rec ? `<div class="field"><div class="switch-row"><span class="txt">Aggiorna anche i prossimi mesi<small>Spesa ricorrente ${rec.active ? 'attiva' : 'interrotta'} · giorno ${rec.day}</small></span>
        <label class="switch"><input type="checkbox" id="f-recupd" ${rec.active ? 'checked' : ''}><span></span></label></div></div>` : ''}
      ${!isNew && (e.source && e.source !== 'manuale') ? `<div class="reason">📥 ${esc(SOURCE_LABEL[e.source] || 'Importata')}${e.channel ? ' · ' + esc(e.channel) : ''}${e.merchant ? ' · esercente «' + esc(e.merchant) + '»' : ''}<br>🧠 ${esc(e.reason || '')}</div>` : ''}
      ${!isNew ? `<div class="btn-row"><button type="button" class="btn danger" id="f-delete">Elimina spesa</button></div>` : ''}`;

    openSheet({
      title: isNew ? 'Nuova spesa' : 'Modifica spesa', right: 'Salva', body,
      onMount(root) {
        const amt = $('#f-amount', root);
        const desc = $('#f-desc', root);
        const hint = $('#f-hint', root);
        const setCat = id => {
          e.category = id;
          $$('#f-cats .chip', root).forEach(c => c.classList.toggle('on', c.dataset.cat === id));
        };
        $('#f-cats', root).onclick = ev => {
          const b = ev.target.closest('[data-cat]');
          if (!b) return;
          userPickedCat = true;
          hint.classList.add('hidden');
          setCat(b.dataset.cat);
        };
        $('#f-method', root).onclick = ev => {
          const b = ev.target.closest('[data-m]');
          if (!b) return;
          e.method = b.dataset.m;
          $$('#f-method button', root).forEach(x => x.classList.toggle('on', x === b));
        };
        desc.oninput = () => {
          if (userPickedCat) return;
          const v = desc.value.trim();
          if (v.length < 3) { hint.classList.add('hidden'); return; }
          const r = P.categorize({ merchant: v }, state.rules);
          if (r.category !== 'altro') {
            setCat(r.category);
            hint.textContent = '✨ Categoria suggerita: ' + cat(r.category).name;
            hint.classList.remove('hidden');
          } else {
            hint.classList.add('hidden');
          }
        };
        amt.oninput = () => { amt.value = amt.value.replace(/[^\d.,]/g, ''); };
        const del = $('#f-delete', root);
        if (del) del.onclick = () => { closeSheet(); deleteExpense(existing.id); };
        if (isNew) setTimeout(() => amt.focus(), 250);
      },
      onOk() {
        const root = $('#sheet-root');
        const v = P.parseEuroNumber($('#f-amount', root).value);
        if (isNaN(v) || v <= 0) { toast('Inserisci un importo valido'); $('#f-amount', root).focus(); return false; }
        const refund = $('#f-refund', root).checked;
        const dateVal = ($('#f-date', root).value || toLocalISO(new Date())).slice(0, 16);
        const description = $('#f-desc', root).value.trim();
        const category = e.category || (description ? P.categorize({ merchant: description }, state.rules).category : 'altro');
        const out = Object.assign({}, existing || {}, {
          amount: round2(refund ? -v : v), date: dateVal, category, description: description || cat(category).name,
          method: e.method, note: $('#f-note', root).value.trim(),
        });
        if (isNew) {
          out.id = uid(); out.source = e.source || 'manuale'; out.createdAt = Date.now();
          const repeat = $('#f-repeat', root);
          if (repeat && repeat.checked) {
            const d = parseLocal(out.date);
            const r = { id: uid(), amount: out.amount, category: out.category, description: out.description, method: out.method,
              note: out.note, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), lastMonth: out.date.slice(0, 7), active: true };
            state.recurring.push(r);
            out.recurringId = r.id;
          }
          state.expenses.push(out);
        } else {
          if (existing.category !== out.category) {
            out.reason = 'Categoria scelta da te.';
            if (existing.merchant && existing.source !== 'manuale' && existing.source !== 'ricorrente') {
              const k = learnRule(existing.merchant, out.category);
              if (k) setTimeout(() => toast(`Memorizzato: «${k}» → ${cat(out.category).name}`), 300);
            }
          }
          const upd = $('#f-recupd', root);
          if (rec && upd && upd.checked) Object.assign(rec, { amount: out.amount, category: out.category, description: out.description, method: out.method, note: out.note });
          const idx = state.expenses.findIndex(x => x.id === existing.id);
          if (idx >= 0) state.expenses[idx] = out;
        }
        runRecurring();
        save();
        ui.month = out.date.slice(0, 7);
        if (ui.tab !== 'mese') switchTab('mese'); else render();
        if (isNew) toast('Spesa salvata: ' + eur(Math.abs(out.amount)));
        return true;
      },
    });
  }

  function deleteExpense(id) {
    const idx = state.expenses.findIndex(x => x.id === id);
    if (idx < 0) return;
    const [removed] = state.expenses.splice(idx, 1);
    save();
    render();
    toast('Spesa eliminata', 'Annulla', () => { state.expenses.push(removed); save(); render(); });
  }

  // ---------------------------------------------------------------------------
  // Guida Comandi Rapidi
  // ---------------------------------------------------------------------------
  function openGuide() {
    const code = (txt, label) => `<div class="code"><span>${esc(txt)}</span><button type="button" data-copy="${esc(txt)}">${label || 'Copia'}</button></div>`;
    const body = `<div class="guide">
      <p>Apple non permette a nessuna app di leggere le notifiche di altre app (vale anche per le app dell'App Store). Si usa quindi l'app <b>Comandi</b> già presente sull'iPhone: quando paghi, un'automazione scrive il pagamento nel file <b>spese-nexi.txt</b>; poi nella scheda <b>Nexi</b> tocchi <b>Scegli il file</b> e l'app legge importo, esercente, tipo di pagamento e categoria.</p>

      <h4>A · Pagamenti con Apple Pay (consigliato)</h4>
      <p>Serve la carta Nexi nel Wallet dell'iPhone e iOS 17 o successivo.</p>
      <ol class="steps">
        <li>Apri <b>Comandi</b> › scheda <b>Automazione</b> › tocca <b>+</b>.</li>
        <li>Scegli <b>Transazione</b> (Wallet). Seleziona la tua <b>carta Nexi</b>, lascia tutte le categorie ed esercenti, scegli <b>Esegui immediatamente</b> e tocca <b>Avanti</b>.</li>
        <li>Tocca <b>Nuovo comando vuoto</b> e aggiungi l'azione <b>Testo</b>.</li>
        <li>Nel campo Testo componi questa riga (le parti in blu sono variabili da inserire dalla barra sopra la tastiera):<br>
          ${code('@@W|')}<span class="pill">Data corrente</span> | <span class="pill">Input comando › Importo</span> | <span class="pill">Input comando › Esercente</span><br>
          <span class="small muted">Scrivi <b>@@W|</b>, inserisci <b>Data corrente</b>, scrivi <b>|</b>, inserisci <b>Input comando</b> e toccalo per scegliere <b>Importo</b>, scrivi <b>|</b>, inserisci di nuovo <b>Input comando</b> e scegli <b>Esercente</b>.</span></li>
        <li>Aggiungi l'azione <b>Aggiungi a file di testo</b> (in alcune versioni si chiama <b>Aggiungi al file</b>). Come contenuto usa la variabile <b>Testo</b>, come cartella <b>Shortcuts</b> di iCloud Drive e come percorso:
          ${code('spese-nexi.txt')} Lascia attivo <b>Crea nuova riga</b>.</li>
        <li>Facoltativo: aggiungi <b>Mostra notifica</b> con il testo «Spesa salvata ✓».</li>
        <li>Prima di chiudere tocca ▶︎ (in basso a destra) per una prova: iOS chiederà il permesso di scrivere nel file, tocca <b>Consenti sempre</b>. Cancella poi dal file la riga di prova oppure ignorala in fase di importazione.</li>
      </ol>

      <h4>B · SMS o email di Nexi (anche pagamenti online e abbonamenti)</h4>
      <p>Utile se hai attivo il servizio di avviso via SMS o email di Nexi: cattura anche gli addebiti fatti senza Apple Pay.</p>
      <ol class="steps">
        <li>In <b>Automazione</b> tocca <b>+</b> › <b>Messaggio</b> (oppure <b>Email</b>). Imposta <b>Il messaggio contiene</b>: ${code('Nexi')} oppure scegli il mittente degli SMS Nexi. Scegli <b>Esegui immediatamente</b>.</li>
        <li>Azione <b>Testo</b>: ${code('@@T|')}<span class="pill">Data corrente</span> | <span class="pill">Input comando › Contenuto</span></li>
        <li>Azione <b>Aggiungi a file di testo</b> con lo stesso file <b>spese-nexi.txt</b> nella cartella <b>Shortcuts</b>.</li>
      </ol>

      <h4>C · Importare nell'app</h4>
      <ol class="steps">
        <li>Apri l'app › scheda <b>Nexi</b> › <b>Scegli il file</b> › iCloud Drive › Shortcuts › <b>spese-nexi.txt</b>.</li>
        <li>Controlla le categorie proposte (vedi il motivo sotto ogni pagamento) e tocca <b>Aggiungi</b>. I pagamenti già importati vengono saltati; i possibili doppioni (es. Apple Pay + SMS dello stesso acquisto) sono segnalati e non selezionati.</li>
        <li>Se correggi una categoria, l'app crea una <b>regola</b> e la prossima volta lo stesso esercente andrà nella categoria giusta.</li>
      </ol>

      <h4>Cosa sapere</h4>
      <p>• L'automazione Apple Pay scatta solo quando paghi con iPhone o Apple Watch, non con la carta fisica o inserendo il numero della carta online.</p>
      <p>• Per gli abbonamenti addebitati direttamente sulla carta (Netflix, Spotify, palestra…) usa l'automazione SMS/email oppure aggiungi la spesa una volta attivando <b>Ripeti ogni mese</b>.</p>
      <p>• Le notifiche push dell'app Nexi Pay non si possono leggere né copiare su iPhone: se ti serve, copia il testo di un SMS o di un'email e incollalo nella scheda Nexi.</p>
      <p>• I prelievi al bancomat vanno nella categoria <b>Prelievi contanti</b> e non si sommano al totale, così non conti due volte le spese in contanti che aggiungi a mano.</p>
    </div>`;
    openSheet({
      title: 'Collegare Nexi', left: 'Chiudi', body,
      onMount(root) {
        root.onclick = async ev => {
          const b = ev.target.closest('[data-copy]');
          if (!b) return;
          try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copiato: ' + b.dataset.copy); }
          catch (e) { toast('Copia non riuscita: tieni premuto sul testo per copiarlo'); }
        };
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Backup ed esportazioni
  // ---------------------------------------------------------------------------
  async function saveFile(name, mime, content) {
    const file = new File([content], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return true; }
      catch (e) { if (e && e.name === 'AbortError') return false; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }

  async function exportBackup() {
    const name = 'spese-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    const ok = await saveFile(name, 'application/json', JSON.stringify(state, null, 1));
    if (ok) { state.settings.lastBackup = Date.now(); save(); render(); toast('Backup creato'); }
  }

  function csvOf(list) {
    const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const rows = [['Data', 'Ora', 'Importo', 'Categoria', 'Causale', 'Metodo', 'Tipo pagamento', 'Esercente', 'Origine', 'Nota']];
    list.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
      rows.push([e.date.slice(0, 10).split('-').reverse().join('/'), timeOf(e.date), String(round2(e.amount).toFixed(2)).replace('.', ','),
        cat(e.category).name, e.description, (METHOD[e.method] || METHOD.altro).name, e.channel || '', e.merchant || '',
        SOURCE_LABEL[e.source] || '', e.note || '']);
    });
    return '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
  }

  function restoreBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const s = JSON.parse(reader.result);
        if (!s || !Array.isArray(s.expenses)) throw new Error('formato');
        if (!confirm(`Ripristinare il backup con ${s.expenses.length} spese? I dati attuali verranno sostituiti.`)) return;
        const d = defaultState();
        state = Object.assign(d, s, { settings: Object.assign(d.settings, s.settings || {}) });
        save(); render(); toast('Backup ripristinato');
      } catch (e) { toast('File di backup non valido'); }
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------------------
  // Navigazione e rendering
  // ---------------------------------------------------------------------------
  function render() {
    if (ui.tab === 'mese') renderMese();
    else if (ui.tab === 'andamento') renderAndamento();
    else if (ui.tab === 'nexi') renderNexi();
    else renderAltro();
  }

  function switchTab(tab) {
    ui.tab = tab;
    $$('.tab[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + tab));
    window.scrollTo(0, 0);
    render();
  }

  document.addEventListener('click', ev => {
    const tabBtn = ev.target.closest('.tab[data-tab]');
    if (tabBtn) { switchTab(tabBtn.dataset.tab); return; }
    const a = ev.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    switch (act) {
      case 'add': openExpense(null); break;
      case 'prev-month': ui.month = addMonths(ui.month, -1); ui.filterCat = null; renderMese(); break;
      case 'next-month': if (ui.month < monthKey(new Date())) { ui.month = addMonths(ui.month, 1); ui.filterCat = null; renderMese(); } break;
      case 'filter-cat': ui.filterCat = ui.filterCat === a.dataset.cat ? null : a.dataset.cat; renderMese();
        if (ui.filterCat) { const l = $('#tx-list'); if (l) l.scrollIntoView({ behavior: 'smooth', block: 'start' }); } break;
      case 'clear-filter': ui.filterCat = null; renderMese(); break;
      case 'edit': { const e = state.expenses.find(x => x.id === a.dataset.id); if (e) openExpense(e); break; }
      case 'dismiss-install': state.settings.installHintDismissed = true; save(); renderMese(); break;
      case 'chart-sel': ui.chartMonth = a.dataset.key; drawChart(); break;
      case 'goto-month': ui.month = a.dataset.key; ui.filterCat = null; switchTab('mese'); break;
      case 'guide': openGuide(); break;
      case 'analyze': {
        const txt = ($('#paste-text') || {}).value || '';
        if (!txt.trim()) { toast('Incolla prima il testo di una notifica o di un SMS'); break; }
        startReview(txt, 'paste'); break;
      }
      case 'paste-clip':
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(t => { const ta = $('#paste-text'); if (ta) ta.value = t; if (t.trim()) startReview(t, 'paste'); })
            .catch(() => toast('Tieni premuto nel riquadro e scegli «Incolla»'));
        } else toast('Tieni premuto nel riquadro e scegli «Incolla»');
        break;
      case 'review-cancel': ui.review = null; renderReview(); break;
      case 'review-confirm': confirmReview(); break;
      case 'open-rules': openRules(); break;
      case 'open-recurring': openRecurring(); break;
      case 'backup': exportBackup(); break;
      case 'csv-month': saveFile('spese-' + ui.month + '.csv', 'text/csv', csvOf(ofMonth(ui.month))); break;
      case 'csv-all': saveFile('spese-tutte.csv', 'text/csv', csvOf(state.expenses)); break;
      case 'reset-imports':
        if (confirm('Dimenticare quali pagamenti del file sono già stati importati? Alla prossima importazione li rivedrai tutti (i doppioni verranno comunque segnalati).')) {
          state.imported = {}; save(); render(); toast('Fatto');
        }
        break;
      case 'wipe':
        if (confirm('Cancellare TUTTE le spese, le regole e le impostazioni? L\'operazione non si può annullare.') &&
            confirm('Sei sicuro? Ti consiglio di esportare prima un backup.')) {
          state = defaultState(); save(); ui.review = null; render(); toast('Dati cancellati');
        }
        break;
      default: break;
    }
  });

  document.addEventListener('keydown', ev => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('rect.hit')) {
      ev.preventDefault(); ev.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    if (ev.key === 'Escape' && $('#sheet-root').innerHTML) closeSheet();
  });

  document.addEventListener('input', ev => {
    const t = ev.target;
    if (t.id === 'search') { ui.search = t.value; renderList(); }
    else if (t.dataset && t.dataset.rv != null && t.dataset.field !== 'checked' && t.tagName !== 'SELECT') onReviewField(t);
  });

  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.id === 'file-import' && t.files && t.files[0]) {
      const reader = new FileReader();
      reader.onload = () => startReview(String(reader.result || ''), 'file');
      reader.onerror = () => toast('Impossibile leggere il file');
      reader.readAsText(t.files[0]);
      t.value = '';
    } else if (t.id === 'restore-file' && t.files && t.files[0]) {
      restoreBackup(t.files[0]); t.value = '';
    } else if (t.id === 'budget') {
      const v = P.parseEuroNumber(t.value);
      state.settings.budget = isNaN(v) || v <= 0 ? 0 : round2(v);
      save(); toast(state.settings.budget ? 'Budget impostato: ' + eur(state.settings.budget) : 'Budget rimosso');
    } else if (t.dataset && t.dataset.rv != null) {
      onReviewField(t);
    }
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (ui.tab === 'andamento') drawChart(); }, 150);
  });

  // Quando l'app torna in primo piano (es. il mese è cambiato) aggiorna
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (runRecurring() && ui.tab !== 'nexi') render();
    }
  });

  // ---------------------------------------------------------------------------
  // Avvio
  // ---------------------------------------------------------------------------
  runRecurring();
  render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  // Per i test automatici
  window.__speseApp = { get state() { return state; }, ui, render, switchTab, openExpense, startReview };
})();
