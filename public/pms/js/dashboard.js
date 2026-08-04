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

/* ---------- KPI ---------- */
function renderKPIs() {
  const s = stats();
  const dateKey = PMS.state.meta.date;
  const inLast = days => {
    if (!dateKey) return 0;
    const lim = Date.now() - days * 864e5;
    return PMS.state.rows.filter(r => {
      const t = Date.parse(String(r[dateKey]).split('/').reverse().join('-')) || Date.parse(r[dateKey]);
      return t && t >= lim;
    }).length;
  };
  const cards = [
    { l: 'Total Personnel', v: s.total, i: 'people-fill', t: '+' + inLast(30) + ' this month' },
    { l: 'Collected', v: s.collected, i: 'check2-circle', t: s.pct + '% of strength', bar: s.pct },
    { l: 'Remaining', v: s.remaining, i: 'hourglass-split', t: (100 - s.pct).toFixed(1) + '% pending', down: true },
    { l: 'Collection %', v: s.pct, suffix: '%', i: 'graph-up-arrow', gold: true, bar: s.pct },
    { l: 'Total Officers', v: s.officers, i: 'star-fill' },
    { l: 'Total JCO', v: s.jco, i: 'award-fill' },
    { l: 'Total OR', v: s.or, i: 'person-badge' },
    { l: 'Newly Added', v: inLast(7), i: 'plus-circle', t: 'last 7 days' },
    { l: 'Pending Collection', v: s.remaining, i: 'exclamation-triangle', down: true },
    { l: "Today's Update", v: inLast(1), i: 'calendar-day' },
    { l: 'Weekly Update', v: inLast(7), i: 'calendar-week' },
    { l: 'Monthly Update', v: inLast(30), i: 'calendar-month' }
  ];
  $('#kpiGrid').innerHTML = cards.map((c, i) => `
    <article class="kpi" data-aos="fade-up" data-aos-delay="${i * 40}">
      <div class="kpi-top">
        <span class="kpi-lbl">${esc(c.l)}</span>
        <span class="kpi-ico ${c.gold ? 'gold' : ''}"><i class="bi bi-${c.i}"></i></span>
      </div>
      <div class="kpi-val" data-to="${c.v}" data-suffix="${c.suffix || ''}">0</div>
      ${c.t ? `<div class="kpi-trend ${c.down ? 'down' : 'up'}"><i class="bi bi-arrow-${c.down ? 'down' : 'up'}-right"></i> ${esc(c.t)}</div>` : ''}
      ${c.bar !== undefined ? `<div class="kpi-bar"><i data-w="${c.bar}"></i></div>` : ''}
    </article>`).join('');
  $$('#kpiGrid .kpi-val').forEach(el => animateNum(el, Number(el.dataset.to), el.dataset.suffix));
  requestAnimationFrame(() => $$('#kpiGrid .kpi-bar i').forEach(el => el.style.width = el.dataset.w + '%'));
}

/* ---------- section summary ---------- */
function renderSections() {
  const groups = sectionGroups();
  $('#sectionCards').innerHTML = groups.map(([name, rows], i) => {
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
  groups.forEach(([name, rows]) => {
    const cv = $(`canvas[data-spark="${name}"]`); if (!cv) return;
    const st = stats(rows);
    new Chart(cv, {
      type: 'bar',
      data: { labels: ['Collected', 'Remaining'], datasets: [{ data: [st.collected, st.remaining], backgroundColor: ['#2D6A4F', '#D4AF37'], borderRadius: 6, barThickness: 18 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { ticks: { font: { size: 9 } }, grid: { display: false } } } }
    });
  });
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
