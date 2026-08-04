/* profile.js — slide panel profile, QR/barcode, A4 full profile */
'use strict';

let currentIdx = null;

/* group Excel columns into logical sections by header keywords */
const GROUPS = [
  ['Personal Information', ['name', 'father', 'mother', 'birth', 'gender', 'religion', 'blood', 'marital', 'nid', 'height', 'weight']],
  ['Military Information', ['rank', 'trade', 'coy', 'company', 'section', 'appointment', 'category', 'army', 'personal no', 'ba no', 'enroll', 'seniority']],
  ['Family Information', ['spouse', 'wife', 'child', 'family', 'dependent']],
  ['Address', ['address', 'district', 'thana', 'upazila', 'village', 'post', 'division']],
  ['Education', ['education', 'qualification', 'institute', 'result']],
  ['Training', ['course', 'training', 'cadre']],
  ['Service', ['service', 'unit', 'posting', 'previous', 'joining', 'promotion']],
  ['Documents', ['document', 'passport', 'certificate', 'photo', 'file']],
  ['Emergency Contact', ['emergency', 'phone', 'mobile', 'contact', 'email']],
  ['Bank Information', ['bank', 'account', 'salary', 'pay']],
  ['Nominee', ['nominee']],
  ['Medical', ['medical', 'shape', 'disease', 'health']],
  ['Awards', ['award', 'commendation', 'medal']],
  ['Punishment', ['punish', 'discipline', 'red ink']],
  ['Collection & Remarks', ['collect', 'status', 'remark', 'note', 'update', 'date']]
];

function groupColumns() {
  const used = new Set(), out = [];
  GROUPS.forEach(([title, keys]) => {
    const cols = PMS.state.headers.filter(h => !used.has(h) && keys.some(k => norm(h).includes(k)));
    cols.forEach(c => used.add(c));
    if (cols.length) out.push([title, cols]);
  });
  const rest = PMS.state.headers.filter(h => !used.has(h));
  if (rest.length) out.push(['Other Information', rest]);
  return out;
}

function qrDataURL(text) {
  try {
    const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    return qr.createDataURL(5, 8);
  } catch { return ''; }
}
function barcodeSVG(text) {
  // lightweight pseudo Code-39 style bar rendering (visual barcode, no extra library)
  let bars = '', x = 0;
  for (const ch of String(text).slice(0, 24)) {
    const c = ch.charCodeAt(0);
    for (let b = 0; b < 6; b++) {
      const w = ((c >> b) & 1) ? 3 : 1.4;
      bars += `<rect x="${x}" y="0" width="${w}" height="46" fill="#111"/>`;
      x += w + 1.6;
    }
  }
  return `<svg class="barcode" viewBox="0 0 ${Math.max(x, 10)} 58" preserveAspectRatio="none" role="img" aria-label="Barcode ${esc(text)}">${bars}<text x="0" y="56" font-size="7" fill="#111">${esc(text)}</text></svg>`;
}

function personLabel(r) {
  const m = PMS.state.meta;
  return { id: na(r[m.id]), name: na(r[m.name] || r[PMS.state.headers[1]]), rank: na(r[m.rank]), sec: na(r[m.section]) };
}
function photoOf(r) {
  const p = PMS.state.meta.photo && String(r[PMS.state.meta.photo] || '');
  return p && /^https?:|^data:/.test(p) ? p : 'assets/logo.png';
}

function openProfile(idx) {
  const r = PMS.state.rows[idx]; if (!r) return;
  currentIdx = idx;
  const p = personLabel(r);
  const groups = groupColumns();
  $('#panelBody').innerHTML = `
    <div class="prof-hero animate__animated animate__fadeIn">
      <img class="prof-photo" src="${esc(photoOf(r))}" alt="Photograph of ${esc(p.name)}" loading="lazy" />
      <div>
        <span class="rank-badge">${esc(p.rank)}</span>
        <h3 class="mb-0 mt-1">${esc(p.name)}</h3>
        <div class="small opacity-75">${esc(p.id)} · ${esc(p.sec)}</div>
        <div class="mt-1"><span class="badge-pill ${isCollected(r) ? 'ok' : 'no'}">${isCollected(r) ? 'Collected' : 'Pending'}</span></div>
      </div>
    </div>
    <div class="codes">
      <img src="${qrDataURL([p.id, p.name, p.rank, p.sec].join(' | '))}" alt="QR code" width="86" height="86" />
      ${barcodeSVG(p.id)}
    </div>
    ${groups.map(([title, cols]) => `
      <section class="grp"><h4>${esc(title)}</h4>
        <div class="kv">${cols.map(c => `<div><span>${esc(c)}</span><b>${esc(na(r[c]))}</b></div>`).join('')}</div>
      </section>`).join('')}
    <section class="grp"><h4>Timeline / Service History</h4>
      <ul class="timeline ps-3">${PMS.state.headers.filter(h => /date|enroll|joining|promotion|update/i.test(h))
        .map(h => `<li><strong>${esc(h)}</strong> — ${esc(na(r[h]))}</li>`).join('') || '<li>N/A</li>'}</ul>
    </section>`;
  $('#slidePanel').classList.add('open');
  $('#slidePanel').setAttribute('aria-hidden', 'false');
  $('#panelBackdrop').classList.remove('d-none');
}
function closeProfile() {
  $('#slidePanel').classList.remove('open');
  $('#slidePanel').setAttribute('aria-hidden', 'true');
  $('#panelBackdrop').classList.add('d-none');
}

function a4ProfileHTML(r) {
  const p = personLabel(r);
  return `<div class="a4-head">
      <img src="assets/logo.png" alt="" />
      <div style="flex:1"><h1>35 ST Battalion Personnel Management System</h1><h2>Personnel Full Profile — ${esc(p.id)}</h2></div>
      <img src="${esc(photoOf(r))}" alt="Photograph" style="width:84px;height:100px;object-fit:cover;border:1px solid #999" />
      <img src="${qrDataURL([p.id, p.name, p.rank].join(' | '))}" alt="QR code" style="width:74px;height:74px" />
    </div>
    ${groupColumns().map(([title, cols]) => `
      <div class="sec-t">${esc(title)}</div>
      <table><tbody>${cols.map(c => `<tr><th>${esc(c)}</th><td>${esc(na(r[c]))}</td></tr>`).join('')}</tbody></table>`).join('')}
    <div class="sign-row"><div>Signature of Individual</div><div>Officer Signature</div><div>Commanding Officer</div></div>`;
}
function openFullProfile() {
  const r = PMS.state.rows[currentIdx]; if (!r) return;
  $('#a4Sheet').innerHTML = a4ProfileHTML(r);
  bootstrap.Modal.getOrCreateInstance($('#fullModal')).show();
}
