/* core.js — utilities, storage, toasts, theme, clock, navigation helpers */
'use strict';

const PMS = {
  state: {
    headers: [],        // every column detected in the sheet
    rows: [],           // array of objects keyed by header
    visible: [],        // visible column keys
    filters: {},        // column -> value
    colSearch: {},      // column -> text
    sort: { key: null, dir: 1 },
    page: 1,
    pageSize: 25,
    selected: new Set(),
    view: 'dashboard',
    charts: {},
    meta: {}            // detected special columns
  },
  LS: 'pms35.v1'
};

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(PMS.LS + '.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(PMS.LS + '.' + k, JSON.stringify(v)); } catch { /* quota */ } },
  clear() { Object.keys(localStorage).filter(k => k.startsWith(PMS.LS)).forEach(k => localStorage.removeItem(k)); }
};

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const na = v => (v === null || v === undefined || String(v).trim() === '') ? 'N/A' : String(v).trim();
const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; };
const pct = (a, b) => b ? Math.round((a / b) * 1000) / 10 : 0;
const norm = s => String(s ?? '').toLowerCase().trim();
const debounce = (fn, ms = 220) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const uniq = arr => [...new Set(arr)];

/* ---------- toast / loader ---------- */
function toast(msg, type = 'success') {
  const icons = { success: 'check-circle', warning: 'exclamation-triangle', error: 'x-octagon', info: 'info-circle' };
  const el = document.createElement('div');
  el.className = `t-toast t-${type}`;
  el.innerHTML = `<i class="bi bi-${icons[type] || 'info-circle'}"></i><span>${esc(msg)}</span>`;
  $('#toastStack').appendChild(el);
  setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 300); }, 3200);
}
function loading(on, text = 'Working…') {
  $('#loaderText').textContent = text;
  $('#loader').classList.toggle('d-none', !on);
}

/* ---------- animated counter ---------- */
function animateNum(el, to, suffix = '') {
  if (document.body.classList.contains('no-anim')) { el.textContent = to.toLocaleString() + suffix; return; }
  const dur = 900, t0 = performance.now(), from = 0;
  const step = t => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    const v = from + (to - from) * e;
    el.textContent = (Number.isInteger(to) ? Math.round(v).toLocaleString() : v.toFixed(1)) + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- theme & prefs ---------- */
const prefs = Object.assign({
  theme: 'light', compact: false, anim: true, density: 'cozy',
  contrast: false, accent: '#D4AF37', radius: 18, lang: 'en', collapsed: false
}, store.get('prefs', {}));

function applyPrefs() {
  document.documentElement.setAttribute('data-bs-theme', prefs.theme);
  document.body.classList.toggle('compact', prefs.compact);
  document.body.classList.toggle('no-anim', !prefs.anim);
  document.body.classList.toggle('contrast', prefs.contrast);
  document.documentElement.style.setProperty('--accent', prefs.accent);
  document.documentElement.style.setProperty('--radius', prefs.radius + 'px');
  document.documentElement.style.setProperty('--row', { compact: '34px', cozy: '44px', relaxed: '56px' }[prefs.density]);
  $('#appShell')?.classList.toggle('collapsed', prefs.collapsed);
  const ti = $('#themeToggle i');
  if (ti) ti.className = prefs.theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
  store.set('prefs', prefs);
}

/* ---------- live clock ---------- */
function startClock() {
  const tick = () => {
    const d = new Date();
    $('#clockTime').textContent = d.toLocaleTimeString('en-GB');
    $('#clockDate').textContent = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    const ht = $('#heroTime'), hd = $('#heroDate');
    if (ht) ht.textContent = d.toLocaleTimeString('en-GB');
    if (hd) hd.textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  };
  tick(); setInterval(tick, 1000);
}

/* ---------- print helper ---------- */
function printHTML(html, title = 'Report') {
  const mount = $('#printMount');
  mount.innerHTML = `<div class="a4">${html}</div>`;
  const prev = document.title; document.title = title;
  mount.classList.remove('d-none');
  window.print();
  setTimeout(() => { mount.classList.add('d-none'); mount.innerHTML = ''; document.title = prev; }, 400);
}
function pdfFromElement(el, name) {
  loading(true, 'Rendering PDF…');
  html2pdf().set({
    margin: 8, filename: name, image: { type: 'jpeg', quality: .96 },
    html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(el).save().then(() => { loading(false); toast('PDF downloaded'); })
    .catch(() => { loading(false); toast('PDF export failed', 'error'); });
}
