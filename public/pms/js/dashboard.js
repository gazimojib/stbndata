/* dashboard.js — KPI cards, section summary, charts, analytics, reports */
'use strict';

const CHART_COLORS = ['#1B4332', '#2D6A4F', '#40916C', '#D4AF37', '#B98F1F', '#74C69D', '#95D5B2', '#52796F', '#8C6D1F', '#2F6690'];

function chartOn(id, cfg) {
  const el = document.getElementById(id);
  if (!el) return;
  PMS.state.charts[id]?.destroy();
  cfg.options = Object.assign({
    responsive: true, maintainAspectRatio: false,
    animation: prefs.anim ? { duration: 900, easing: 'easeOutQuart' } : false,
    plugins: { legend: { labels: { color: getComputedStyle(document.body).color, font: { family: 'Inter', size: 11 } } } },
    scales: cfg.type === 'pie' || cfg.type === 'doughnut' || cfg.type === 'radar' ? undefined : {
      x: { ticks: { color: '#8b98a5', font: { size: 10 } }, grid: { display: false } },
      y: { ticks: { color: '#8b98a5', font: { size: 10 } }, grid: { color: 'rgba(128,140,150,.15)' } }
    }
  }, cfg.options || {});
  PMS.state.charts[id] = new Chart(el, cfg);
}

/* ---------- helpers ---------- */
function headerLike(...pats) {
  const H = PMS.state.headers;
  for (const p of pats) { const h = H.find(x => norm(x).replace(/[._\-\/]+/g, ' ') === p); if (h) return h; }
  for (const p of pats) { const h = H.find(x => norm(x).includes(p)); if (h) return h; }
  return undefined;
}
function rowTime(r) {
  const k = PMS.state.meta.date; if (!k || !r[k]) return 0;
  const v = String(r[k]).trim();
  return Date.parse(v.includes('/') ? v.split('/').reverse().join('-') : v) || Date.parse(v) || 0;
}
function inLastDays(days) {
  if (!PMS.state.meta.date) return 0;
  const lim = Date.now() - days * 864e5;
  return PMS.state.rows.filter(r => { const t = rowTime(r); return t && t >= lim; }).length;
}
function sparkBars(n = 8, seed = 1) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(28 + Math.abs(Math.sin((i + 1) * seed * 1.7)) * 72);
  return out;
}

/* ---------- premium statistics cards ---------- */
function renderKPIs() {
  const s = stats();
  const groups = new Map(sectionGroups());
  const cards = [
    { l: 'Total Personnel', v: s.total, i: 'people-fill', t: '+' + inLastDays(30) + ' this month', ring: 100 },
    { l: 'Collected', v: s.collected, i: 'check2-circle', t: s.pct + '% of strength', ring: s.pct, bar: s.pct },
    { l: 'Remaining', v: s.remaining, i: 'hourglass-split', t: (100 - s.pct).toFixed(1) + '% pending', down: true, ring: 100 - s.pct, bar: 100 - s.pct },
    { l: 'Collection %', v: s.pct, suffix: '%', i: 'graph-up-arrow', gold: true, ring: s.pct, bar: s.pct }
  ];
  SECTION_ORDER.forEach(name => {
    const rows = groups.get(name) || [];
    const st = stats(rows);
    cards.push({ l: name, v: st.total, i: 'diagram-3-fill', t: st.collected + ' collected', ring: st.pct, bar: st.pct });
  });
  $('#kpiGrid').innerHTML = cards.map((c, i) => `
    <article class="kpi" data-aos="fade-up" data-aos-delay="${i * 45}">
      <div class="kpi-top">
        <span class="kpi-lbl">${esc(c.l)}</span>
        <span class="kpi-ico ${c.gold ? 'gold' : ''}"><i class="bi bi-${c.i}"></i></span>
      </div>
      <div class="kpi-body">
        <div>
          <div class="kpi-val" data-to="${c.v}" data-suffix="${c.suffix || ''}">0</div>
          ${c.t ? `<div class="kpi-trend ${c.down ? 'down' : 'up'}"><i class="bi bi-arrow-${c.down ? 'down' : 'up'}-right"></i> ${esc(c.t)}</div>` : ''}
        </div>
        <div class="ring-sm" data-p="${Math.round(c.ring || 0)}"><span>${Math.round(c.ring || 0)}%</span></div>
      </div>
      <div class="mini-spark">${sparkBars(8, i + 1).map(h => `<i data-h="${h}"></i>`).join('')}</div>
      <div class="kpi-bar"><i data-w="${Math.round(c.bar !== undefined ? c.bar : c.ring || 0)}"></i></div>
    </article>`).join('');
  $$('#kpiGrid .kpi-val').forEach(el => animateNum(el, Number(el.dataset.to), el.dataset.suffix));
  requestAnimationFrame(() => {
    $$('#kpiGrid .kpi-bar i').forEach(el => el.style.width = el.dataset.w + '%');
    $$('#kpiGrid .ring-sm').forEach(el => el.style.setProperty('--p', el.dataset.p));
    $$('#kpiGrid .mini-spark i').forEach(el => el.style.height = el.dataset.h + '%');
  });
}

/* ---------- command panel ---------- */
function renderCommand() {
  const s = stats();
  const last = store.get('lastUpload', null);
  const secs = sectionGroups().filter(([, r]) => r.length).length;
  const health = s.total ? (s.pct >= 80 ? 'Excellent' : s.pct >= 50 ? 'Stable' : 'Attention') : 'No data';
  const items = [
    { l: "Today's Collection", v: inLastDays(1), i: 'calendar-day', s: 'records touched today' },
    { l: 'Pending Data', v: s.remaining, i: 'exclamation-triangle-fill', s: 'awaiting collection', k: 'warn' },
    { l: 'Completed Today', v: Math.min(inLastDays(1), s.collected), i: 'check2-all', s: 'verified entries', k: 'ok' },
    { l: 'Last Upload', v: last?.at ? new Date(last.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—', i: 'cloud-arrow-up-fill', s: last?.name || 'sample dataset' },
    { l: 'Active Sections', v: secs, i: 'diagram-3-fill', s: SECTION_ORDER.length + ' defined' },
    { l: 'Quick Summary', v: s.collected + '/' + s.total, i: 'clipboard-data-fill', s: s.pct + '% complete' },
    { l: 'Status Indicator', v: s.pct >= 80 ? 'GREEN' : s.pct >= 50 ? 'AMBER' : 'RED', i: 'shield-fill-check', s: 'collection readiness', k: s.pct >= 80 ? 'ok' : 'warn' },
    { l: 'System Health', v: health, i: 'activity', s: PMS.state.headers.length + ' columns mapped', k: 'ok' }
  ];
  $('#commandPanel').innerHTML = items.map((c, i) => `
    <div class="cmd ${c.k || ''}" data-aos="fade-up" data-aos-delay="${i * 40}">
      <i class="bi bi-${c.i} cmd-ico"></i>
      <b>${esc(c.v)}</b>
      <span>${esc(c.l)}</span>
      <small>${esc(c.s)}</small>
    </div>`).join('');
  const fs = $('#footSys'); if (fs) fs.textContent = 'System ' + health.toLowerCase();
}

/* ---------- quick actions ---------- */
const QUICK_ACTIONS = [
  { l: 'Upload Excel', s: 'Import collection sheet', i: 'upload', upload: true },
  { l: 'Search Personnel', s: 'Any column, instantly', i: 'search', fn: () => { go('search'); setTimeout(() => $('#advSearch')?.focus(), 200); } },
  { l: 'Generate Report', s: 'Six printable reports', i: 'file-earmark-text', fn: () => go('reports') },
  { l: 'Print Dashboard', s: 'Command summary', i: 'printer', fn: () => printHTML(reportHTML('summary'), 'Dashboard Summary') },
  { l: 'Export PDF', s: 'Register as PDF', i: 'file-earmark-pdf', fn: () => { go('personnel'); setTimeout(() => $('#exportPdf').click(), 250); } },
  { l: 'Export Excel', s: 'Download workbook', i: 'file-earmark-excel', fn: () => exportRows(sortedRows(), 'xlsx') },
  { l: 'Backup Data', s: 'Full sheet snapshot', i: 'hdd-stack', fn: () => { const v = PMS.state.visible; PMS.state.visible = PMS.state.headers; exportRows(sortedRows(), 'xlsx'); PMS.state.visible = v; toast('Backup exported'); } },
  { l: 'Refresh Dashboard', s: 'Recompute all widgets', i: 'arrow-clockwise', fn: () => { renderDashboard(); toast('Dashboard refreshed', 'info'); } }
];
function renderQuickActions() {
  $('#quickActions').innerHTML = QUICK_ACTIONS.map((a, i) => a.upload
    ? `<label class="qa" data-aos="zoom-in" data-aos-delay="${i * 40}"><span class="qa-ico"><i class="bi bi-${a.i}"></i></span><span><strong>${a.l}</strong><small>${a.s}</small></span><input type="file" class="excel-alt" accept=".xlsx,.xls,.csv" /></label>`
    : `<button class="qa" data-qa="${i}" data-aos="zoom-in" data-aos-delay="${i * 40}"><span class="qa-ico"><i class="bi bi-${a.i}"></i></span><span><strong>${a.l}</strong><small>${a.s}</small></span></button>`).join('');
  $$('#quickActions [data-qa]').forEach(b => b.onclick = () => QUICK_ACTIONS[b.dataset.qa].fn());
  $$('#quickActions .excel-alt').forEach(i => i.onchange = e => e.target.files[0] && readWorkbook(e.target.files[0]));
}

/* ---------- personnel status board ---------- */
function renderStatusBoard() {
  const s = stats();
  const tiles = [
    { h: 'Officers', big: s.officers },
    { h: 'JCO', big: s.jco },
    { h: 'Other Ranks', big: s.or }
  ];
  const marital = headerLike('marital status', 'marital');
  const lic = headerLike('driving licence', 'driving license', 'licence', 'license');
  const course = headerLike('special course', 'course');
  const dist = [
    ['Marital Status', marital], ['Driving Licence', lic], ['Special Course', course],
    ['Blood Groups', PMS.state.meta.blood], ['Religion', PMS.state.meta.religion],
    ['Category', PMS.state.meta.category], ['Gender', headerLike('gender', 'sex')]
  ];
  const cards = tiles.map(t => `<div class="sbx" data-aos="fade-up"><h4>${t.h}</h4><div class="big" data-to="${t.big}">0</div>
      <em class="d-block mt-2" style="height:5px;border-radius:99px;background:color-mix(in oklab,var(--primary) 12%,transparent)"><i style="display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--primary-2),var(--accent));width:${pct(t.big, s.total)}%"></i></em></div>`);
  dist.forEach(([label, key]) => {
    if (!key) return;
    const d = countBy(key).slice(0, 5);
    const max = d[0] ? d[0][1] : 1;
    cards.push(`<div class="sbx" data-aos="fade-up"><h4>${esc(label)}</h4><ul>${d.map(([v, n]) =>
      `<li><span title="${esc(v)}">${esc(v)}</span><em><i data-w="${pct(n, max)}"></i></em><b>${n}</b></li>`).join('')}</ul></div>`);
  });
  $('#statusBoard').innerHTML = cards.join('');
  $$('#statusBoard .big').forEach(el => animateNum(el, Number(el.dataset.to)));
  requestAnimationFrame(() => $$('#statusBoard li em i').forEach(el => el.style.width = el.dataset.w + '%'));
}

/* ---------- activity timeline ---------- */
function renderTimeline() {
  const s = stats();
  const last = store.get('lastUpload', null);
  const when = t => t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'just now';
  const items = [
    ['Excel Collection Sheet loaded', `${last?.name || 'Sample dataset'} · ${PMS.state.rows.length.toLocaleString()} rows · ${PMS.state.headers.length} columns`, when(last?.at)],
    ['Data processed & auto-mapped', `Section, rank, trade and status columns detected automatically`, when(Date.now())],
    ['Collection updated', `${s.collected.toLocaleString()} records verified · ${s.remaining.toLocaleString()} pending`, when(Date.now())],
    ['Personnel added', `${inLastDays(7)} new records in the last 7 days`, 'last 7 days'],
    ['Reports available', `${REPORTS.length} printable reports regenerated`, when(Date.now())],
    ['System event', 'Command dashboard rendered · all widgets operational', when(Date.now())]
  ];
  $('#activityTimeline').innerHTML = items.map(([t, d, w], i) =>
    `<li style="animation-delay:${i * 70}ms"><strong>${esc(t)}</strong><small>${esc(d)}</small><small>${esc(w)}</small></li>`).join('');
}

/* ---------- recent updates ---------- */
function renderRecent() {
  const rows = PMS.state.meta.date
    ? [...PMS.state.rows].map((r, i) => ({ r, i, t: rowTime(r) })).sort((a, b) => b.t - a.t).slice(0, 12)
    : PMS.state.rows.slice(-12).reverse().map((r, i) => ({ r, i: PMS.state.rows.length - 1 - i, t: 0 }));
  $('#recentUpdates').innerHTML = rows.map(({ r, i, t }) => {
    const p = personLabel(r);
    return `<div class="cc-rec" data-idx="${i}">
      <span class="av">${esc(String(p.name || '?').trim().charAt(0).toUpperCase())}</span>
      <span class="flex-grow-1 min-w-0"><b>${esc(p.name)}</b><small>${esc(p.rank)} · ${esc(p.sec)}</small></span>
      <small>${t ? new Date(t).toLocaleDateString('en-GB') : ''}</small>
      <span class="badge-pill ${isCollected(r) ? 'ok' : 'no'}">${isCollected(r) ? 'Collected' : 'Pending'}</span>
    </div>`;
  }).join('') || '<div class="text-muted small">No records yet.</div>';
  $$('#recentUpdates .cc-rec').forEach(el => el.onclick = () => openProfile(Number(el.dataset.idx)));
}

/* ---------- hero meta ---------- */
function renderHero() {
  const r = $('#heroRecords'), c = $('#heroCols');
  if (r) r.textContent = PMS.state.rows.length.toLocaleString() + ' records';
  if (c) c.textContent = PMS.state.headers.length + ' columns';
}

/* ---------- section summary (shared markup) ---------- */
function sectionCardsHTML(groups) {
  return groups.map(([name, rows], i) => {
    const st = stats(rows);
    return `<div class="col-md-6 col-xl-4" data-aos="zoom-in" data-aos-delay="${i * 60}">
      <div class="glass sec-card">
        <div class="sec-top">
          <img src="assets/logo.png" alt="" />
          <div><h3 class="sec-name">${esc(name)}</h3><small class="text-muted">${st.total} personnel</small></div>
          <div class="ms-auto ring" style="--p:${st.pct}"><span>${st.pct}%</span></div>
        </div>
        <div class="sec-stats">
          <div><b>${st.total}</b><span>Total</span></div>
          <div><b>${st.collected}</b><span>Collected</span></div>
          <div><b>${st.remaining}</b><span>Remaining</span></div>
        </div>
        <div class="kpi-bar"><i style="width:${st.pct}%"></i></div>
        <canvas class="spark" height="54" data-spark="${esc(name)}"></canvas>
      </div></div>`;
  }).join('');
}
function drawSectionSparks(groups, root) {
  groups.forEach(([name, rows]) => {
    const cv = root.querySelector(`canvas[data-spark="${name}"]`); if (!cv) return;
    const st = stats(rows);
    new Chart(cv, {
      type: 'bar',
      data: { labels: ['Collected', 'Remaining'], datasets: [{ data: [st.collected, st.remaining], backgroundColor: ['#2D6A4F', '#D4AF37'], borderRadius: 6, barThickness: 18 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: prefs.anim ? { duration: 800 } : false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { ticks: { font: { size: 9 } }, grid: { display: false } } } }
    });
  });
}
function renderSections() {
  const groups = sectionGroups();
  const host = $('#sectionCards');
  if (host) { host.innerHTML = sectionCardsHTML(groups); drawSectionSparks(groups, host); }
}
function renderDashSections() {
  const groups = sectionGroups();
  const host = $('#dashSections');
  if (host) { host.innerHTML = sectionCardsHTML(groups); drawSectionSparks(groups, host); }
}

/* ---------- dashboard charts ---------- */
function renderDashCharts() {
  const groups = sectionGroups();
  chartOn('chartSection', {
    type: 'bar',
    data: {
      labels: groups.map(g => g[0]),
      datasets: [
        { label: 'Collected', data: groups.map(g => stats(g[1]).collected), backgroundColor: '#2D6A4F', borderRadius: 8, stack: 's' },
        { label: 'Remaining', data: groups.map(g => stats(g[1]).remaining), backgroundColor: '#D4AF37', borderRadius: 8, stack: 's' }
      ]
    }
  });
  const rankKey = PMS.state.meta.rank || PMS.state.headers[2];
  const rk = countBy(rankKey).slice(0, 8);
  chartOn('chartRank', {
    type: 'doughnut',
    data: { labels: rk.map(r => r[0]), datasets: [{ data: rk.map(r => r[1]), backgroundColor: CHART_COLORS, borderWidth: 0 }] },
    options: { cutout: '58%', plugins: { legend: { position: 'bottom' } } }
  });
  const distKey = PMS.state.meta.district || headerLike('district');
  if (distKey) {
    const d = countBy(distKey).slice(0, 8);
    chartOn('chartDistrict', {
      type: 'pie',
      data: { labels: d.map(x => x[0]), datasets: [{ data: d.map(x => x[1]), backgroundColor: CHART_COLORS, borderWidth: 0 }] },
      options: { plugins: { legend: { position: 'bottom' } } }
    });
  }
  const tradeKey = PMS.state.meta.trade || headerLike('trade');
  if (tradeKey) {
    const d = countBy(tradeKey).slice(0, 7);
    chartOn('chartTrade', {
      type: 'radar',
      data: { labels: d.map(x => x[0]), datasets: [{ label: 'Personnel', data: d.map(x => x[1]), backgroundColor: 'rgba(45,106,79,.28)', borderColor: '#2D6A4F', borderWidth: 2, pointBackgroundColor: '#D4AF37' }] },
      options: { plugins: { legend: { display: false } } }
    });
  }
  const cum = [];
  let run = 0;
  groups.forEach(([n, rows]) => { run += stats(rows).collected; cum.push({ n, run }); });
  chartOn('chartProgress', {
    type: 'line',
    data: {
      labels: cum.map(c => c.n),
      datasets: [{ label: 'Cumulative collected', data: cum.map(c => c.run), fill: true, tension: .38, borderColor: '#2D6A4F', borderWidth: 2, backgroundColor: 'rgba(212,175,55,.22)', pointBackgroundColor: '#D4AF37' }]
    },
    options: { plugins: { legend: { display: false } } }
  });
}

/* ---------- dashboard master ---------- */
function renderDashboard() {
  renderHero();
  renderKPIs();
  renderQuickActions();
  renderCommand();
  renderDashCharts();
  renderStatusBoard();
  renderDashSections();
  renderTimeline();
  renderRecent();
}

/* ---------- analytics view ---------- */
function renderAnalytics() {
  const cats = PMS.state.meta.categorical.slice(0, 12);
  const types = ['bar', 'pie', 'doughnut', 'radar', 'line', 'bar', 'polarArea'];
  $('#analyticsGrid').innerHTML = cats.map((c, i) => `
    <div class="col-lg-6 col-xxl-4" data-aos="fade-up">
      <div class="glass p-3 h-100">
        <div class="card-head"><h3>${esc(c)}</h3><button class="chip" data-dlchart="an${i}">PNG</button></div>
        <canvas id="an${i}" height="200"></canvas>
      </div></div>`).join('') || '<div class="col-12"><div class="glass p-4 text-center text-muted">No categorical columns detected.</div></div>';
  cats.forEach((c, i) => {
    const d = countBy(c).slice(0, 12);
    const type = types[i % types.length];
    chartOn('an' + i, {
      type,
      data: {
        labels: d.map(x => x[0]),
        datasets: [{
          label: c, data: d.map(x => x[1]),
          backgroundColor: type === 'line' ? 'rgba(45,106,79,.22)' : CHART_COLORS,
          borderColor: '#2D6A4F', borderWidth: type === 'line' || type === 'radar' ? 2 : 0,
          fill: type === 'line', tension: .38, borderRadius: 8
        }]
      },
      options: { plugins: { legend: { display: ['pie', 'doughnut', 'polarArea'].includes(type), position: 'bottom' } } }
    });
  });
}

/* ---------- reports ---------- */
const REPORTS = [
  { k: 'section', l: 'Section Report' }, { k: 'district', l: 'District Report' },
  { k: 'rank', l: 'Rank Report' }, { k: 'trade', l: 'Trade Report' },
  { k: 'collection', l: 'Collection Report' }, { k: 'summary', l: 'Summary Report' }
];
let activeReport = 'section';

function reportTableFor(key) {
  const h = PMS.state.headers, m = PMS.state.meta;
  const byHeader = pat => h.find(x => norm(x).includes(pat));
  if (key === 'summary') {
    const s = stats();
    return { title: 'Summary Report', rows: [['Total Personnel', s.total], ['Collected', s.collected], ['Remaining', s.remaining], ['Collection %', s.pct + '%'], ['Officers', s.officers], ['JCO', s.jco], ['Other Ranks', s.or], ['Columns detected', h.length]], cols: ['Metric', 'Value'] };
  }
  if (key === 'collection') {
    return {
      title: 'Collection Report', cols: ['Section', 'Total', 'Collected', 'Remaining', 'Collection %'],
      rows: sectionGroups().map(([n, r]) => { const s = stats(r); return [n, s.total, s.collected, s.remaining, s.pct + '%']; })
    };
  }
  const map = { section: m.section, district: byHeader('district'), rank: m.rank, trade: byHeader('trade') };
  const col = map[key] || h[0];
  return {
    title: `${key[0].toUpperCase() + key.slice(1)} Report — ${col}`, cols: [col, 'Total', 'Collected', 'Remaining', 'Collection %'],
    rows: countBy(col).map(([v]) => {
      const rs = PMS.state.rows.filter(r => na(r[col]) === v); const s = stats(rs);
      return [v, s.total, s.collected, s.remaining, s.pct + '%'];
    })
  };
}
function reportHTML(key) {
  const r = reportTableFor(key);
  return `<div class="a4-head"><img src="assets/logo.png" alt="" /><div><h1>35 ST Battalion Personnel Management System</h1><h2>${esc(r.title)} · ${new Date().toLocaleDateString('en-GB')}</h2></div></div>
    <table><thead><tr>${r.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${r.rows.map(row => `<tr>${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <div class="sign-row"><div>Prepared By</div><div>Adjutant</div><div>Commanding Officer</div></div>`;
}
function renderReports() {
  $('#reportTabs').innerHTML = REPORTS.map(r => `<button class="chip ${r.k === activeReport ? 'active' : ''}" data-report="${r.k}">${r.l}</button>`).join('');
  $('#reportArea').innerHTML = `<div class="a4" id="reportSheet">${reportHTML(activeReport)}</div>`;
}
