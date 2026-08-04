/* app.js — bootstrap, routing, navigation, settings, global wiring */
'use strict';

/* ---------- master render ---------- */
function renderAll() {
  renderDashboard();
  renderSections();
  renderFilters();
  renderColMenu();
  renderTable();
  renderAnalytics();
  renderReports();
  renderSearchChips();
  if (window.AOS && prefs.anim) AOS.refreshHard();
}

/* ---------- routing ---------- */
const VIEWS = ['dashboard', 'personnel', 'search', 'sections', 'reports', 'analytics', 'print', 'export', 'settings', 'about'];
function go(view) {
  if (!VIEWS.includes(view)) view = 'dashboard';
  PMS.state.view = view;
  VIEWS.forEach(v => $('#view-' + v)?.classList.toggle('d-none', v !== view));
  $$('.sb-link').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  $('#crumb').innerHTML = `<li class="breadcrumb-item">Home</li><li class="breadcrumb-item active">${view[0].toUpperCase() + view.slice(1)}</li>`;
  $('#appShell').classList.remove('mobile-open');
  $('#content').scrollTop = 0;
  history.replaceState(null, '', '#' + view);
  store.set('view', view);
  if (window.AOS && prefs.anim) AOS.refresh();
}

/* ---------- advanced search ---------- */
function renderSearchChips() {
  const keys = ['id', 'name', 'rank', 'section'].map(k => PMS.state.meta[k]).filter(Boolean);
  const extra = PMS.state.headers.filter(h => /trade|district|religion|blood|phone|appointment|category|course|previous|remark/i.test(h));
  $('#searchChips').innerHTML = uniq([...keys, ...extra]).slice(0, 16).map(h => `<span class="chip">${esc(h)}</span>`).join('');
}
function runAdvSearch(q) {
  const box = $('#searchResults');
  if (!q.trim()) { box.innerHTML = '<div class="text-muted small">Start typing to search every column…</div>'; return; }
  const nq = norm(q);
  const hits = PMS.state.rows.filter(r => PMS.state.headers.some(h => norm(r[h]).includes(nq))).slice(0, 60);
  if (!hits.length) { box.innerHTML = '<div class="text-muted small">No records found.</div>'; return; }
  box.innerHTML = hits.map(r => {
    const p = personLabel(r), idx = PMS.state.rows.indexOf(r);
    const match = PMS.state.headers.find(h => norm(r[h]).includes(nq));
    return `<article class="res" data-idx="${idx}"><b>${esc(p.name)}</b>
      <small>${esc(p.rank)} · ${esc(p.id)} · ${esc(p.sec)}</small>
      <small class="d-block mt-1">${esc(match)}: <strong>${esc(na(r[match]))}</strong></small></article>`;
  }).join('');
  $$('#searchResults .res').forEach(el => el.onclick = () => openProfile(Number(el.dataset.idx)));
}

/* ---------- print / export centres ---------- */
function renderCentres() {
  const printTiles = [
    ['Print Personnel Table', 'printer', () => printRows(sortedRows(), 'Personnel Register')],
    ['Print Active Profile', 'person-vcard', () => currentIdx !== null ? printHTML(a4ProfileHTML(PMS.state.rows[currentIdx]), 'Profile') : toast('Open a profile first', 'warning')],
    ['Print Current Report', 'file-earmark-text', () => printHTML(reportHTML(activeReport), 'Report')],
    ['Print Dashboard Summary', 'columns-gap', () => printHTML(reportHTML('summary'), 'Summary')]
  ];
  const exportTiles = [
    ['Export Excel (visible columns)', 'file-earmark-excel', () => exportRows(sortedRows(), 'xlsx')],
    ['Export CSV', 'filetype-csv', () => exportRows(sortedRows(), 'csv')],
    ['Export PDF Register', 'file-earmark-pdf', () => $('#exportPdf').click()],
    ['Download Dashboard Image', 'image', () => downloadDashboard()],
    ['Download All Charts', 'bar-chart', () => Object.keys(PMS.state.charts).forEach(id => downloadChart(id))],
    ['Export Full Sheet (all columns)', 'table', () => { const v = PMS.state.visible; PMS.state.visible = PMS.state.headers; exportRows(sortedRows(), 'xlsx'); PMS.state.visible = v; }]
  ];
  const tile = ([label, icon], i, kind) => `<div class="col-md-6 col-xl-4"><div class="glass tile" data-${kind}="${i}"><i class="bi bi-${icon}"></i><div><strong class="d-block small">${label}</strong><span class="text-muted small">Ready</span></div></div></div>`;
  $('#printGrid').innerHTML = printTiles.map((t, i) => tile(t, i, 'ptile')).join('');
  $('#exportGrid').innerHTML = exportTiles.map((t, i) => tile(t, i, 'etile')).join('');
  $$('[data-ptile]').forEach(el => el.onclick = () => printTiles[el.dataset.ptile][2]());
  $$('[data-etile]').forEach(el => el.onclick = () => exportTiles[el.dataset.etile][2]());
}
function downloadChart(id) {
  const c = PMS.state.charts[id]; if (!c) return;
  const a = document.createElement('a');
  a.href = c.toBase64Image(); a.download = id + '.png'; a.click();
}
function downloadDashboard() {
  loading(true, 'Capturing dashboard…');
  html2canvas($('#view-dashboard'), { scale: 2, useCORS: true, backgroundColor: null }).then(cv => {
    const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'dashboard.png'; a.click();
    loading(false); toast('Dashboard image downloaded');
  }).catch(() => { loading(false); toast('Capture failed', 'error'); });
}

/* ---------- notifications ---------- */
function renderNotifs() {
  const s = stats();
  const items = [
    ['success', `${s.collected} collection records verified`],
    ['warning', `${s.remaining} personnel pending collection`],
    ['info', `${PMS.state.headers.length} Excel columns auto-mapped`]
  ];
  $('#notifList').innerHTML = `<li class="dropdown-header">Notifications</li>` +
    items.map(([t, m]) => `<li><span class="dropdown-item small"><i class="bi bi-circle-fill me-2 ${t === 'warning' ? 'text-warning' : t === 'success' ? 'text-success' : 'text-primary'}" style="font-size:.5rem"></i>${esc(m)}</span></li>`).join('');
}

/* ---------- settings ---------- */
function wireSettings() {
  const accents = ['#D4AF37', '#2D6A4F', '#2F6690', '#B7410E', '#7048A8'];
  $('#accentSwatches').innerHTML = accents.map(c => `<button style="background:${c}" data-accent="${c}" class="${c === prefs.accent ? 'active' : ''}" aria-label="Accent ${c}"></button>`).join('');
  $('#setCompact').checked = prefs.compact;
  $('#setAnim').checked = prefs.anim;
  $('#setContrast').checked = prefs.contrast;
  $('#setDensity').value = prefs.density;
  $('#setRadius').value = prefs.radius;
  $$('[data-theme]').forEach(b => b.classList.toggle('active', b.dataset.theme === prefs.theme));
  $$('[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === prefs.lang));

  $('#view-settings').addEventListener('click', e => {
    const t = e.target.closest('[data-theme],[data-accent],[data-lang]');
    if (!t) return;
    if (t.dataset.theme) prefs.theme = t.dataset.theme;
    if (t.dataset.accent) prefs.accent = t.dataset.accent;
    if (t.dataset.lang) { prefs.lang = t.dataset.lang; toast(prefs.lang === 'bn' ? 'ভাষা: বাংলা (আংশিক)' : 'Language: English', 'info'); }
    applyPrefs(); wireSettingsState(); renderDashCharts();
  });
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
  on('#setCompact', 'change', e => { prefs.compact = e.target.checked; applyPrefs(); });
  on('#setAnim', 'change', e => { prefs.anim = e.target.checked; applyPrefs(); renderAll(); });
  on('#setContrast', 'change', e => { prefs.contrast = e.target.checked; applyPrefs(); });
  on('#setDensity', 'change', e => { prefs.density = e.target.value; applyPrefs(); });
  on('#setRadius', 'input', e => { prefs.radius = Number(e.target.value); applyPrefs(); });
  on('#clearStore', 'click', () => { store.clear(); toast('Local storage cleared', 'warning'); });
}
function wireSettingsState() {
  $$('[data-theme]').forEach(b => b.classList.toggle('active', b.dataset.theme === prefs.theme));
  $$('[data-accent]').forEach(b => b.classList.toggle('active', b.dataset.accent === prefs.accent));
  $$('[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === prefs.lang));
}

/* ---------- login ---------- */
function bootApp() {
  $('#loginScreen').classList.add('d-none');
  $('#welcomeScreen').classList.remove('d-none');
  setTimeout(() => {
    $('#welcomeScreen').classList.add('d-none');
    $('#appShell').classList.remove('d-none');
    applyPrefs();
    startClock();
    // load last upload if remembered, else sample dataset
    const last = store.get('lastUpload', null);
    if (last?.headers?.length) {
      PMS.state.headers = last.headers; PMS.state.rows = last.rows;
      PMS.state.meta = detectMeta(last.headers, last.rows);
      PMS.state.visible = store.get('visible.' + last.headers.length, null) || last.headers.slice(0, 12);
      PMS.state.filters = store.get('filters', {});
      $('#dataSourceLabel').textContent = `Excel: ${last.name} · ${last.rows.length.toLocaleString()} records · ${last.headers.length} columns (restored)`;
      renderAll();
      toast(`Restored last upload: ${last.name}`, 'info');
    } else {
      ingest(sampleData(), 'Sample dataset');
    }
    renderCentres(); renderNotifs(); wireSettings();
    go(location.hash.replace('#', '') || store.get('view', 'dashboard'));
    if (window.AOS) AOS.init({ duration: 600, once: true, disable: !prefs.anim });
  }, 1900);
}

document.addEventListener('DOMContentLoaded', () => {
  applyPrefs();
  const remembered = store.get('remember', null);
  if (remembered) { $('#username').value = remembered; $('#rememberMe').checked = true; }

  $('#togglePw').onclick = () => {
    const p = $('#password');
    p.type = p.type === 'password' ? 'text' : 'password';
    $('#togglePw').innerHTML = `<i class="bi bi-eye${p.type === 'password' ? '' : '-slash'}"></i>`;
  };
  $('#loginForm').onsubmit = e => {
    e.preventDefault();
    $('#loginSpin').classList.remove('d-none');
    $('#loginText').textContent = 'Authenticating…';
    store.set('remember', $('#rememberMe').checked ? $('#username').value : null);
    setTimeout(bootApp, 900);
  };

  /* global shell wiring (app shell exists in DOM already) */
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-view]');
    if (nav) { e.preventDefault(); go(nav.dataset.view); }
    const dl = e.target.closest('[data-dlchart]');
    if (dl) downloadChart(dl.dataset.dlchart);
    const rep = e.target.closest('[data-report]');
    if (rep) { activeReport = rep.dataset.report; renderReports(); }
  });
  $('#sidebarToggle').onclick = () => {
    if (window.innerWidth < 992) $('#appShell').classList.toggle('mobile-open');
    else { prefs.collapsed = !prefs.collapsed; applyPrefs(); }
  };
  $('#themeToggle').onclick = () => { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; applyPrefs(); wireSettingsState(); renderDashCharts(); renderAnalytics(); };
  $('#fsBtn').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  $('#logoutBtn').onclick = () => location.reload();
  $('#quickSearch').oninput = debounce(e => {
    PMS.state.globalQuery = e.target.value; PMS.state.page = 1;
    if (PMS.state.view !== 'personnel') go('personnel');
    $('#globalSearch').value = e.target.value; renderTable();
  }, 250);
  $('#advSearch').oninput = debounce(e => runAdvSearch(e.target.value), 200);
  $('#excelInput').onchange = e => e.target.files[0] && readWorkbook(e.target.files[0]);
  $$('.excel-alt').forEach(i => i.onchange = e => e.target.files[0] && readWorkbook(e.target.files[0]));
  $('#panelClose').onclick = closeProfile;
  $('#panelBackdrop').onclick = closeProfile;
  $('#openFull').onclick = openFullProfile;
  $('#panelPrint').onclick = () => currentIdx !== null && printHTML(a4ProfileHTML(PMS.state.rows[currentIdx]), 'Profile');
  $('#panelPdf').onclick = () => { openFullProfile(); setTimeout(() => pdfFromElement($('#a4Sheet'), 'personnel-profile.pdf'), 500); };
  $('#fullPrint').onclick = () => printHTML($('#a4Sheet').innerHTML, 'Profile');
  $('#fullPdf').onclick = () => pdfFromElement($('#a4Sheet'), 'personnel-profile.pdf');
  $('#printReport').onclick = () => printHTML(reportHTML(activeReport), 'Report');
  $('#reportPdf').onclick = () => pdfFromElement($('#reportSheet'), 'report.pdf');

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeProfile();
    if (e.key === '/' && e.target === document.body) { e.preventDefault(); $('#quickSearch')?.focus(); }
  });
  window.addEventListener('hashchange', () => go(location.hash.replace('#', '')));
});
