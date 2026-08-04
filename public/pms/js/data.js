/* data.js — Excel ingestion (SheetJS), column auto-detection, derived analytics.
   The uploaded Collection Sheet is the ONLY database. No fixed columns anywhere. */
'use strict';

const SECTION_ORDER = ['HQ BN', '59 COY', '60 COY', '61 COY', 'MTPL', 'EME'];

/* section synonyms used for grouping — matched against the detected section column */
const SECTION_PATTERNS = {
  'HQ BN': ['hq bn', 'hq', 'head quarter', 'headquarter', 'bn hq'],
  '59 COY': ['59'],
  '60 COY': ['60'],
  '61 COY': ['61'],
  'MTPL': ['mtpl', 'mt pl', 'mt platoon', 'mt', 'transport'],
  'EME': ['eme', 'e m e', 'workshop']
};

/* Heuristic detection of "special" columns — purely by header/value inspection. */
function detectMeta(headers, rows) {
  const H = headers.map(h => ({ h, n: norm(h).replace(/[._\-\/]+/g, ' ').replace(/\s+/g, ' ') }));
  /* try exact normalized match first, then "starts with", then "contains" */
  const find = (...pats) => {
    for (const p of pats) { const hit = H.find(x => x.n === p); if (hit) return hit.h; }
    for (const p of pats) { const hit = H.find(x => x.n.startsWith(p)); if (hit) return hit.h; }
    for (const p of pats) { const hit = H.find(x => x.n.includes(p)); if (hit) return hit.h; }
    return undefined;
  };
  const meta = {
    id: find('id no', 'army no', 'ba no', 'personal no', 'pers no', 'service no', 'no', 'id') || headers[0],
    name: find('name', 'full name', 'personnel name'),
    rank: find('rank', 'rk'),
    trade: find('trade', 'trd'),
    section: find('coy', 'coy/section', 'company', 'section', 'sec', 'unit sec', 'sub unit', 'subunit', 'platoon', 'pl'),
    collected: find('collection status', 'collected', 'collection', 'data collection', 'received', 'submitted', 'status'),
    photo: find('photo', 'image', 'picture', 'pic'),
    date: find('last update', 'collection date', 'updated', 'update', 'date of arrival', 'date'),
    district: find('district', 'home district'),
    blood: find('blood group', 'blood'),
    religion: find('religion'),
    phone: find('phone number', 'phone', 'mobile', 'cell'),
    category: find('category', 'cat')
  };

  /* fallback: if no status-like header exists, look for a column whose values are yes/no-ish */
  if (!meta.collected) {
    const probe = rows.slice(0, 400);
    meta.collected = headers.find(h => {
      const vals = probe.map(r => norm(r[h])).filter(Boolean);
      if (vals.length < Math.max(3, probe.length * 0.3)) return false;
      const hits = vals.filter(v => COLLECTED_WORDS.includes(v) || PENDING_WORDS.includes(v)).length;
      return hits / vals.length > 0.8;
    });
  }

  // categorical columns = low cardinality, good for filters + charts
  const probe = rows.length > 3000 ? rows.slice(0, 3000) : rows;
  meta.categorical = headers.filter(h => {
    const set = new Set();
    for (const r of probe) {
      const v = norm(r[h]);
      if (v) set.add(v);
      if (set.size > 60) return false;
    }
    return set.size > 1 && set.size <= Math.max(14, probe.length * 0.35) && set.size < 60;
  });
  return meta;
}

const COLLECTED_WORDS = ['yes', 'y', 'ok', 'collected', 'done', 'complete', 'completed', 'received', 'submitted', 'true', '1', 'হ্যাঁ', 'সংগৃহীত'];
const PENDING_WORDS = ['no', 'n', 'pending', 'not collected', 'incomplete', 'remaining', 'false', '0', 'না', 'বাকি'];

function isCollected(row) {
  const c = PMS.state.meta.collected;
  if (!c) return false;
  const v = norm(row[c]);
  if (!v) return false;
  if (COLLECTED_WORDS.includes(v)) return true;
  if (PENDING_WORDS.includes(v)) return false;
  return /^(collect|receiv|submit|complet|done)/.test(v);
}

/* ---------- sheet selection & merged cells ---------- */
function sheetScore(ws) {
  if (!ws || !ws['!ref']) return 0;
  const r = XLSX.utils.decode_range(ws['!ref']);
  let filled = 0;
  for (let R = r.s.r; R <= Math.min(r.e.r, r.s.r + 120); R++)
    for (let C = r.s.c; C <= r.e.c; C++)
      if (ws[XLSX.utils.encode_cell({ r: R, c: C })]) filled++;
  return filled * 1000 + (r.e.r - r.s.r + 1);
}
function pickSheet(wb) {
  const named = wb.SheetNames.find(n => norm(n).includes('collection'));
  if (named && sheetScore(wb.Sheets[named]) > 0) return named;
  let best = null, bestScore = 0;
  wb.SheetNames.forEach(n => { const s = sheetScore(wb.Sheets[n]); if (s > bestScore) { bestScore = s; best = n; } });
  return bestScore > 0 ? best : null;
}
/* copy the top-left value of every merged range into all its cells so nothing is lost */
function fillMerges(aoa, merges) {
  (merges || []).forEach(m => {
    const v = (aoa[m.s.r] || [])[m.s.c];
    if (v === undefined || v === '') return;
    for (let R = m.s.r; R <= m.e.r; R++) {
      aoa[R] = aoa[R] || [];
      for (let C = m.s.c; C <= m.e.c; C++) if (aoa[R][C] === undefined || aoa[R][C] === '') aoa[R][C] = v;
    }
  });
  return aoa;
}

/* ---------- ingestion ---------- */
function findHeaderRow(aoa) {
  const scan = Math.min(aoa.length, 25);
  let hIdx = 0, best = -1;
  for (let i = 0; i < scan; i++) {
    const row = aoa[i] || [];
    const cells = row.map(c => String(c ?? '').trim());
    const filled = cells.filter(Boolean).length;
    if (!filled) continue;
    const texty = cells.filter(c => c && isNaN(Number(c))).length;
    const uniqCount = new Set(cells.filter(Boolean).map(norm)).size;
    // prefer wide rows of mostly unique text labels
    const score = filled * 2 + texty + uniqCount - (filled === texty ? 0 : 2);
    if (score > best) { best = score; hIdx = i; }
  }
  return hIdx;
}

function ingest(aoa, sourceLabel) {
  aoa = (aoa || []).map(r => Array.isArray(r) ? r : []);
  const hIdx = findHeaderRow(aoa);
  const width = aoa.reduce((w, r) => Math.max(w, r.length), 0);
  const rawHeaders = Array.from({ length: width }, (_, i) => String((aoa[hIdx] || [])[i] ?? '').trim() || `Column ${i + 1}`);
  const seen = new Map();
  const headers = rawHeaders.map(h => {
    const c = (seen.get(h) || 0) + 1; seen.set(h, c);
    return c === 1 ? h : `${h} (${c})`;
  });

  const rows = [];
  for (let i = hIdx + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || !r.some(c => String(c ?? '').trim())) continue;
    const o = {};
    for (let c = 0; c < headers.length; c++) {
      const v = r[c];
      o[headers[c]] = (v === undefined || v === null) ? '' : (typeof v === 'string' ? v.trim() : v);
    }
    rows.push(o);
  }

  if (!headers.length || !rows.length) throw new Error('The worksheet has no readable data rows.');

  PMS.state.headers = headers;
  PMS.state.rows = rows;
  PMS.state.meta = detectMeta(headers, rows);
  const saved = store.get('visible.' + headers.length, null);
  PMS.state.visible = (Array.isArray(saved) && saved.every(h => headers.includes(h)) && saved.length)
    ? saved : headers.slice(0, Math.min(headers.length, 12));
  PMS.state.page = 1;
  PMS.state.filters = {}; PMS.state.colSearch = {}; PMS.state.globalQuery = ''; PMS.state.selected.clear();
  const gs = $('#globalSearch'); if (gs) gs.value = '';
  $('#dataSourceLabel').textContent = `${sourceLabel} · ${rows.length.toLocaleString()} records · ${headers.length} columns auto-detected`;
  renderAll();
}

function readWorkbook(file) {
  if (!file) { toast('No file selected', 'error'); return; }
  if (!/\.(xlsx|xlsm|xlsb|xls|csv)$/i.test(file.name)) {
    toast(`Unsupported format "${file.name.split('.').pop()}" — please upload an .xlsx, .xls or .csv file`, 'error');
    return;
  }
  if (!file.size) { toast('That file is empty (0 bytes) — please re-export the Collection Sheet', 'error'); return; }

  loading(true, 'Reading Collection Sheet…');
  const fr = new FileReader();
  fr.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true, dense: false });
      if (!wb.SheetNames || !wb.SheetNames.length) throw new Error('The workbook contains no worksheets.');
      const name = pickSheet(wb);
      if (!name) throw new Error('No worksheet in this workbook contains any data.');
      const ws = wb.Sheets[name];
      let aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
      aoa = fillMerges(aoa, ws['!merges']);
      ingest(aoa, `${file.name} · sheet "${name}"`);
      try {
        store.set('lastUpload', { name: file.name, at: Date.now(), headers: PMS.state.headers, rows: PMS.state.rows.slice(0, 4000) });
      } catch { /* storage quota — data stays in memory */ }
      toast(`${PMS.state.rows.length.toLocaleString()} records · ${PMS.state.headers.length} columns imported from ${file.name}`);
    } catch (err) {
      console.error(err);
      const msg = /zip|central directory|corrupt|end of data|Unsupported/i.test(String(err && err.message))
        ? 'This file appears damaged or is not a real Excel workbook. Open it in Excel and use "Save As → .xlsx", then upload again.'
        : (err && err.message) || 'Unknown error while reading the workbook.';
      toast('Excel import failed: ' + msg, 'error');
    } finally { loading(false); }
  };
  fr.onerror = () => { loading(false); toast('The browser could not read this file — check that it is not open in another program', 'error'); };
  fr.readAsArrayBuffer(file);
}

/* ---------- derived analytics ---------- */
function filteredRows() {
  const s = PMS.state;
  const g = norm(s.globalQuery || '');
  const fEntries = Object.entries(s.filters).filter(([, v]) => v);
  const cEntries = Object.entries(s.colSearch).filter(([, v]) => v).map(([k, v]) => [k, norm(v)]);
  if (!g && !fEntries.length && !cEntries.length) return s.rows;
  return s.rows.filter(r => {
    if (g) {
      let hit = false;
      for (const h of s.headers) { if (norm(r[h]).includes(g)) { hit = true; break; } }
      if (!hit) return false;
    }
    for (const [k, v] of fEntries) if (norm(r[k]) !== norm(v)) return false;
    for (const [k, v] of cEntries) if (!norm(r[k]).includes(v)) return false;
    return true;
  });
}
function sortedRows() {
  const { sort } = PMS.state;
  const rows = filteredRows();
  if (!sort.key) return rows;
  return [...rows].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    const sx = String(x ?? '').trim(), sy = String(y ?? '').trim();
    const bothNum = sx !== '' && sy !== '' && !isNaN(Number(sx)) && !isNaN(Number(sy));
    return (bothNum ? Number(sx) - Number(sy) : norm(x).localeCompare(norm(y))) * sort.dir;
  });
}
function countBy(key, rows = PMS.state.rows) {
  const m = new Map();
  rows.forEach(r => { const v = na(r[key]); m.set(v, (m.get(v) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function stats(rows = PMS.state.rows) {
  const total = rows.length;
  const collected = rows.filter(isCollected).length;
  const rankKey = PMS.state.meta.rank;
  const isRank = (r, pats) => pats.some(p => norm(r[rankKey]).includes(p));
  const officers = rankKey ? rows.filter(r => isRank(r, ['lt', 'capt', 'maj', 'col', 'brig', 'gen'])).length : 0;
  const jco = rankKey ? rows.filter(r => isRank(r, ['wo', 'sw', 'mwo', 'jco', 'sgt'])).length : 0;
  return { total, collected, remaining: total - collected, pct: pct(collected, total), officers, jco, or: Math.max(0, total - officers - jco) };
}
function sectionOf(row) {
  const key = PMS.state.meta.section;
  const raw = norm(key ? row[key] : '');
  if (!raw) return 'Unassigned';
  for (const [label, pats] of Object.entries(SECTION_PATTERNS)) if (pats.some(p => raw.includes(p))) return label;
  return String(row[key]).trim().toUpperCase();
}
function sectionGroups() {
  const groups = new Map();
  SECTION_ORDER.forEach(s => groups.set(s, []));
  PMS.state.rows.forEach(r => {
    const match = sectionOf(r);
    if (!groups.has(match)) groups.set(match, []);
    groups.get(match).push(r);
  });
  return [...groups.entries()].filter(([k, v]) => v.length || SECTION_ORDER.includes(k));
}


/* ---------- sample dataset (used until an Excel file is uploaded) ---------- */
function sampleData() {
  const ranks = ['Maj', 'Capt', 'Lt', 'WO', 'Sgt', 'Cpl', 'LCpl', 'Sldr'];
  const trades = ['Clerk', 'Driver', 'Technician', 'Signaller', 'Storeman', 'Medic', 'Cook'];
  const dists = ['Dhaka', 'Chattogram', 'Rangpur', 'Khulna', 'Sylhet', 'Barishal', 'Rajshahi', 'Mymensingh'];
  const blood = ['A+', 'B+', 'O+', 'AB+', 'A-', 'O-'];
  const rel = ['Islam', 'Hindu', 'Buddhist', 'Christian'];
  const status = ['Collected', 'Pending'];
  const headers = ['Personal No', 'Name', 'Rank', 'Trade', 'COY', 'District', 'Religion', 'Blood Group',
    'Marital Status', 'Gender', 'Phone', 'Appointment', 'Category', 'Course', 'Special Course',
    'Previous Unit', 'Date of Birth', 'Enrollment Date', 'Education', 'Emergency Contact',
    'Bank Account', 'Nominee', 'Awards', 'Punishment', 'Medical', 'Address', 'Collection Status', 'Last Update', 'Remarks'];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rows = Array.from({ length: 240 }, (_, i) => {
    const coy = SECTION_ORDER[i % SECTION_ORDER.length];
    const d = new Date(Date.now() - Math.floor(Math.random() * 40) * 864e5);
    return {
      'Personal No': 'BA-' + (100000 + i * 7),
      'Name': ['Md', 'Abul', 'Rafiq', 'Kamal', 'Jashim', 'Nazrul', 'Sohel', 'Ripon'][i % 8] + ' ' + ['Hossain', 'Islam', 'Rahman', 'Ahmed', 'Karim', 'Uddin'][i % 6],
      'Rank': pick(ranks), 'Trade': pick(trades), 'COY': coy, 'District': pick(dists),
      'Religion': pick(rel), 'Blood Group': pick(blood), 'Marital Status': pick(['Married', 'Unmarried']),
      'Gender': 'Male', 'Phone': '01' + (700000000 + i * 13579),
      'Appointment': pick(['Coy Clerk', 'MT Driver', 'Store NCO', 'Sig Op', 'Nursing Asst']),
      'Category': pick(['Combatant', 'Non-Combatant']), 'Course': pick(['Basic', 'Advanced', 'Cadre', 'NCO']),
      'Special Course': pick(['UN Mission', 'Commando', 'Driving', '']), 'Previous Unit': pick(['12 EB', '24 BIR', '5 ST', '9 SIG']),
      'Date of Birth': new Date(1985 + (i % 18), i % 12, (i % 27) + 1).toLocaleDateString('en-GB'),
      'Enrollment Date': new Date(2008 + (i % 12), i % 12, (i % 27) + 1).toLocaleDateString('en-GB'),
      'Education': pick(['SSC', 'HSC', 'Graduate', 'Masters']), 'Emergency Contact': '017' + (10000000 + i * 977),
      'Bank Account': '20' + (1000000000 + i * 31), 'Nominee': pick(['Father', 'Mother', 'Spouse']),
      'Awards': pick(['', 'COAS Commendation', 'GOC Award']), 'Punishment': pick(['', 'Nil', 'Minor']),
      'Medical': pick(['SHAPE-1', 'SHAPE-2']), 'Address': pick(dists) + ', Bangladesh',
      'Collection Status': Math.random() > .32 ? status[0] : status[1],
      'Last Update': d.toLocaleDateString('en-GB'), 'Remarks': pick(['', 'Verified', 'Docs pending'])
    };
  });
  return [headers, ...rows.map(r => headers.map(h => r[h]))];
}
