/* table.js — dynamic personnel table: auto headers, sort, filter, paginate,
   column visibility/resize/reorder, freeze, multi-select, exports */
'use strict';

function renderFilters() {
  const cats = PMS.state.meta.categorical.slice(0, 6);
  $('#filterZone').innerHTML = cats.map(c => `
    <select class="form-select form-select-sm" data-filter="${esc(c)}" aria-label="Filter ${esc(c)}">
      <option value="">${esc(c)}: All</option>
      ${countBy(c).map(([v, n]) => `<option value="${esc(v)}" ${norm(PMS.state.filters[c]) === norm(v) ? 'selected' : ''}>${esc(v)} (${n})</option>`).join('')}
    </select>`).join('');
}

function renderColMenu() {
  $('#colMenu').innerHTML = PMS.state.headers.map(h => `
    <label class="dropdown-item d-flex gap-2 align-items-center">
      <input type="checkbox" class="form-check-input mt-0" data-col="${esc(h)}" ${PMS.state.visible.includes(h) ? 'checked' : ''} />
      <span class="small">${esc(h)}</span>
    </label>`).join('');
}

function renderTable() {
  const s = PMS.state;
  if (!s.headers.length) return;
  const cols = s.visible.length ? s.visible : s.headers.slice(0, 10);
  const rows = sortedRows();
  const pages = Math.max(1, Math.ceil(rows.length / s.pageSize));
  s.page = Math.min(s.page, pages);
  const start = (s.page - 1) * s.pageSize;
  const pageRows = rows.slice(start, start + s.pageSize);

  $('#tHead').innerHTML = `
    <tr>
      <th class="freeze" style="width:38px"><input type="checkbox" class="form-check-input" id="selAll" aria-label="Select all rows" /></th>
      ${cols.map((c, i) => `<th class="${i === 0 ? 'freeze' : ''}" style="left:${i === 0 ? '38px' : 'auto'}" draggable="true" data-key="${esc(c)}">
        ${esc(c)}<i class="bi bi-arrow-${s.sort.key === c ? (s.sort.dir === 1 ? 'up' : 'down') : 'down-up'} sort-i"></i><span class="resizer"></span></th>`).join('')}
    </tr>
    <tr class="filters">
      <th class="freeze"></th>
      ${cols.map(c => `<th><input class="form-control form-control-sm" data-colsearch="${esc(c)}" value="${esc(s.colSearch[c] || '')}" placeholder="filter" aria-label="Search ${esc(c)}" /></th>`).join('')}
    </tr>`;

  $('#tBody').innerHTML = pageRows.map((r, ri) => {
    const idx = s.rows.indexOf(r);
    return `<tr data-idx="${idx}" class="${s.selected.has(idx) ? 'selected' : ''}" style="animation-delay:${Math.min(ri * 12, 240)}ms">
      <td class="freeze"><input type="checkbox" class="form-check-input row-check" data-idx="${idx}" ${s.selected.has(idx) ? 'checked' : ''} aria-label="Select row" /></td>
      ${cols.map((c, i) => {
        const v = na(r[c]);
        const isStat = c === s.meta.collected;
        const cell = isStat ? `<span class="badge-pill ${isCollected(r) ? 'ok' : 'no'}">${esc(v)}</span>` : esc(v);
        return `<td class="${i === 0 ? 'freeze' : ''}" style="left:${i === 0 ? '38px' : 'auto'}">${cell}</td>`;
      }).join('')}
    </tr>`;
  }).join('') || `<tr><td colspan="${cols.length + 1}" class="text-center text-muted py-4">No matching records</td></tr>`;

  $('#rangeLabel').textContent = `${rows.length ? start + 1 : 0}–${Math.min(start + s.pageSize, rows.length)} of ${rows.length.toLocaleString()}`;
  $('#tableMeta').textContent = `${s.rows.length.toLocaleString()} records · ${s.headers.length} columns · ${cols.length} visible`;

  // pager
  const win = [];
  for (let p = Math.max(1, s.page - 2); p <= Math.min(pages, s.page + 2); p++) win.push(p);
  $('#pager').innerHTML = `
    <li class="page-item ${s.page === 1 ? 'disabled' : ''}"><button class="page-link" data-page="1">«</button></li>
    ${win.map(p => `<li class="page-item ${p === s.page ? 'active' : ''}"><button class="page-link" data-page="${p}">${p}</button></li>`).join('')}
    <li class="page-item ${s.page === pages ? 'disabled' : ''}"><button class="page-link" data-page="${pages}">»</button></li>`;

  $('#bulkBar').classList.toggle('d-none', !s.selected.size);
  $('#selCount').textContent = s.selected.size;
  bindTableEvents();
}

let tableBound = false;
function bindTableEvents() {
  // header sort + resize + reorder
  $$('#tHead th[data-key]').forEach(th => {
    th.onclick = e => {
      if (e.target.classList.contains('resizer')) return;
      const k = th.dataset.key;
      PMS.state.sort = { key: k, dir: PMS.state.sort.key === k ? -PMS.state.sort.dir : 1 };
      renderTable();
    };
    const rz = th.querySelector('.resizer');
    if (rz) rz.onmousedown = e => {
      e.stopPropagation(); e.preventDefault();
      const x0 = e.clientX, w0 = th.offsetWidth;
      const mv = ev => { th.style.minWidth = th.style.width = Math.max(60, w0 + ev.clientX - x0) + 'px'; };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    };
    th.ondragstart = e => e.dataTransfer.setData('text/plain', th.dataset.key);
    th.ondragover = e => e.preventDefault();
    th.ondrop = e => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/plain'), to = th.dataset.key;
      const v = [...PMS.state.visible];
      const i = v.indexOf(from), j = v.indexOf(to);
      if (i < 0 || j < 0 || i === j) return;
      v.splice(j, 0, v.splice(i, 1)[0]);
      PMS.state.visible = v; persistVisible(); renderTable();
    };
  });
  $$('#tHead input[data-colsearch]').forEach(inp => {
    inp.oninput = debounce(() => { PMS.state.colSearch[inp.dataset.colsearch] = inp.value; PMS.state.page = 1; renderTable(); }, 250);
    inp.onclick = e => e.stopPropagation();
  });
  $('#selAll').onchange = e => {
    const idxs = sortedRows().slice((PMS.state.page - 1) * PMS.state.pageSize, PMS.state.page * PMS.state.pageSize).map(r => PMS.state.rows.indexOf(r));
    idxs.forEach(i => e.target.checked ? PMS.state.selected.add(i) : PMS.state.selected.delete(i));
    renderTable();
  };
  $$('.row-check').forEach(cb => cb.onclick = e => {
    e.stopPropagation();
    const i = Number(cb.dataset.idx);
    cb.checked ? PMS.state.selected.add(i) : PMS.state.selected.delete(i);
    renderTable();
  });
  $$('#tBody tr[data-idx]').forEach(tr => tr.onclick = () => openProfile(Number(tr.dataset.idx)));
  $$('#pager button[data-page]').forEach(b => b.onclick = () => { PMS.state.page = Number(b.dataset.page); renderTable(); $('#tableScroll').scrollTop = 0; });

  if (tableBound) return;
  tableBound = true;
  $('#pageSize').onchange = e => { PMS.state.pageSize = Number(e.target.value); PMS.state.page = 1; renderTable(); };
  $('#globalSearch').oninput = debounce(e => { PMS.state.globalQuery = e.target.value; PMS.state.page = 1; renderTable(); }, 220);
  $('#resetFilters').onclick = () => {
    PMS.state.filters = {}; PMS.state.colSearch = {}; PMS.state.globalQuery = '';
    $('#globalSearch').value = ''; PMS.state.page = 1;
    store.set('filters', {}); renderFilters(); renderTable(); toast('Filters reset', 'info');
  };
  $('#filterZone').onchange = e => {
    const k = e.target.dataset.filter; if (!k) return;
    PMS.state.filters[k] = e.target.value; PMS.state.page = 1;
    store.set('filters', PMS.state.filters); renderTable();
  };
  $('#colMenu').onchange = e => {
    const c = e.target.dataset.col; if (!c) return;
    const v = new Set(PMS.state.visible);
    e.target.checked ? v.add(c) : v.delete(c);
    PMS.state.visible = PMS.state.headers.filter(h => v.has(h));
    persistVisible(); renderTable();
  };
  $('#bulkClear').onclick = () => { PMS.state.selected.clear(); renderTable(); };
  $('#bulkPrint').onclick = () => printRows(selectedRows(), 'Selected Personnel');
  $('#bulkExport').onclick = () => exportRows(selectedRows(), 'xlsx');
  $('#printTable').onclick = () => printRows(sortedRows(), 'Personnel Register');
  $('#exportXlsx').onclick = () => exportRows(sortedRows(), 'xlsx');
  $('#exportCsv').onclick = () => exportRows(sortedRows(), 'csv');
  $('#exportPdf').onclick = () => {
    const html = tableHTML(sortedRows().slice(0, 400), 'Personnel Register');
    const wrap = document.createElement('div'); wrap.className = 'a4'; wrap.innerHTML = html;
    document.body.appendChild(wrap);
    pdfFromElement(wrap, 'personnel-register.pdf');
    setTimeout(() => wrap.remove(), 2500);
  };
}
function persistVisible() { store.set('visible.' + PMS.state.headers.length, PMS.state.visible); }
function selectedRows() {
  const rs = [...PMS.state.selected].map(i => PMS.state.rows[i]).filter(Boolean);
  return rs.length ? rs : sortedRows();
}

/* ---------- export / print ---------- */
function visibleCols() { return PMS.state.visible.length ? PMS.state.visible : PMS.state.headers; }
function exportRows(rows, kind) {
  const cols = visibleCols();
  const aoa = [cols, ...rows.map(r => cols.map(c => r[c] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Personnel');
  XLSX.writeFile(wb, `35stbn-personnel.${kind === 'csv' ? 'csv' : 'xlsx'}`, kind === 'csv' ? { bookType: 'csv' } : {});
  toast(`${rows.length} rows exported (${kind.toUpperCase()})`);
}
function tableHTML(rows, title) {
  const cols = visibleCols();
  return `<div class="a4-head"><img src="assets/logo.png" alt="" /><div><h1>35 ST Battalion Personnel Management System</h1><h2>${esc(title)} · ${rows.length} records · ${new Date().toLocaleString('en-GB')}</h2></div></div>
    <table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(na(r[c]))}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <div class="sign-row"><div>Prepared By</div><div>Adjutant</div><div>Commanding Officer</div></div>`;
}
function printRows(rows, title) { printHTML(tableHTML(rows, title), title); toast('Sent to printer', 'info'); }
