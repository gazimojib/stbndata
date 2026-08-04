/* data.js — Excel ingestion (SheetJS), column auto-detection, derived analytics.
   The uploaded Collection Sheet is the ONLY database. No fixed columns anywhere. */
'use strict';

const SECTION_ORDER = ['HQ BN', '59 COY', '60 COY', '61 COY', 'MTPL', 'EME'];

/* Heuristic detection of "special" columns — purely by header/value inspection. */
function detectMeta(headers, rows) {
  const find = (...pats) => headers.find(h => pats.some(p => norm(h).includes(p)));
  const meta = {
    id: find('personal no', 'army no', 'ba no', 'id', 'no.') || headers[0],
    name: find('name'),
    rank: find('rank'),
    section: find('coy', 'company', 'section', 'sec ', 'unit sec'),
    collected: find('collect', 'status', 'received', 'submit'),
    photo: find('photo', 'image', 'picture'),
    date: find('date', 'update')
  };
  // categorical columns = low cardinality, good for filters + charts
  meta.categorical = headers.filter(h => {
    const vals = uniq(rows.map(r => norm(r[h])).filter(Boolean));
    return vals.length > 1 && vals.length <= Math.max(14, rows.length * 0.25) && vals.length < 40;
  });
  return meta;
}

function isCollected(row) {
  const c = PMS.state.meta.collected;
  if (!c) return false;
  const v = norm(row[c]);
  return ['yes', 'y', 'collected', 'done', 'complete', 'completed', '1', 'true', 'received', 'হ্যাঁ', 'সংগৃহীত'].includes(v);
}

/* ---------- ingestion ---------- */
function ingest(aoa, sourceLabel) {
  // find the first row that looks like a header (most non-empty cells)
  let hIdx = 0, best = -1;
  aoa.slice(0, 8).forEach((r, i) => {
    const filled = r.filter(c => String(c ?? '').trim()).length;
    if (filled > best) { best = filled; hIdx = i; }
  });
  const rawHeaders = (aoa[hIdx] || []).map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`);
  const headers = rawHeaders.map((h, i) => rawHeaders.indexOf(h) === i ? h : `${h} (${i + 1})`);
  const rows = aoa.slice(hIdx + 1)
    .filter(r => r.some(c => String(c ?? '').trim()))
    .map(r => { const o = {}; headers.forEach((h, i) => o[h] = r[i] ?? ''); return o; });

  PMS.state.headers = headers;
  PMS.state.rows = rows;
  PMS.state.meta = detectMeta(headers, rows);
  PMS.state.visible = store.get('visible.' + headers.length, null) || headers.slice(0, Math.min(headers.length, 12));
  PMS.state.page = 1;
  PMS.state.filters = {}; PMS.state.colSearch = {}; PMS.state.selected.clear();
  $('#dataSourceLabel').textContent = `${sourceLabel} · ${rows.length.toLocaleString()} records · ${headers.length} columns auto-detected`;
  renderAll();
}

function readWorkbook(file) {
  loading(true, 'Reading Collection Sheet…');
  const fr = new FileReader();
  fr.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      ingest(aoa, `Excel: ${file.name}`);
      store.set('lastUpload', { name: file.name, at: Date.now(), headers: PMS.state.headers, rows: PMS.state.rows.slice(0, 4000) });
      toast(`${PMS.state.rows.length} records imported from ${file.name}`);
    } catch (err) {
      console.error(err); toast('Could not read that file', 'error');
    } finally { loading(false); }
  };
  fr.onerror = () => { loading(false); toast('File read error', 'error'); };
  fr.readAsArrayBuffer(file);
}

/* ---------- derived analytics ---------- */
function filteredRows() {
  const s = PMS.state;
  const g = norm(s.globalQuery || '');
  return s.rows.filter(r => {
    if (g && !s.headers.some(h => norm(r[h]).includes(g))) return false;
    for (const [k, v] of Object.entries(s.filters)) if (v && norm(r[k]) !== norm(v)) return false;
    for (const [k, v] of Object.entries(s.colSearch)) if (v && !norm(r[k]).includes(norm(v))) return false;
    return true;
  });
}
function sortedRows() {
  const { sort } = PMS.state;
  const rows = filteredRows();
  if (!sort.key) return rows;
  return [...rows].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    const nx = num(x), ny = num(y);
    const bothNum = String(x).trim() !== '' && String(y).trim() !== '' && !isNaN(Number(x)) && !isNaN(Number(y));
    return (bothNum ? nx - ny : norm(x).localeCompare(norm(y))) * sort.dir;
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
function sectionGroups() {
  const key = PMS.state.meta.section;
  const groups = new Map();
  SECTION_ORDER.forEach(s => groups.set(s, []));
  PMS.state.rows.forEach(r => {
    const raw = na(r[key]).toUpperCase();
    const match = SECTION_ORDER.find(s => raw.includes(s.toUpperCase())) ||
      SECTION_ORDER.find(s => raw.includes(s.split(' ')[0])) || raw;
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
