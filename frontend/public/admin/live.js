/* Live data layer for the admin pages: login guard, API calls, real-time refresh (every 15 s), forms, modals. */
(() => {
  const T = localStorage.getItem('token'), U = JSON.parse(localStorage.getItem('user') || 'null');
  if (!T || !U || U.role !== 'Admin') { location.replace('/login'); return; }
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PAGE = document.body.className.split(' ')[0];
  const COLORS = ['#168cab', '#54b7d5', '#7bd3a5', '#f2b64c', '#8b8ee8', '#f08a6c'];

  async function api(path, o = {}) {
    const r = await fetch('/api' + path, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T }, body: o.body && JSON.stringify(o.body) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { localStorage.clear(); location.replace('/login'); }
    if (!r.ok) throw new Error(d.error || 'Something went wrong.');
    return d;
  }
  const dt = x => x ? new Date(x).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  const dOnly = x => x ? new Date(x).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const ago = x => { const m = Math.max(0, (Date.now() - new Date(x)) / 60000); return m < 1 ? 'Just now' : m < 60 ? `${Math.floor(m)} min ago` : m < 1440 ? `${Math.floor(m / 60)} hours ago` : `${Math.floor(m / 1440)} days ago`; };
  const left = x => { const ms = new Date(x) - Date.now(); if (ms <= 0) return 'Closed'; const h = ms / 3600000; return h < 24 ? `${Math.floor(h)}h ${Math.floor(ms / 60000) % 60}m left` : `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h left`; };
  const stCls = f => f.status === 'Draft' ? 'pending' : f.open ? 'active' : 'inactive';
  const stTxt = f => f.status === 'Draft' ? 'Draft' : f.open ? 'Active' : 'Closed';
  const fill = (sel, html, cols = 8) => { const b = $(sel); if (b) b.innerHTML = html || `<tr><td colspan="${cols}" class="empty-row">Nothing here yet.</td></tr>`; };
  const pct = (n, t) => t ? Math.round(n / t * 100) : 0;

  function toast(msg, bad) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(t._h); t._h = setTimeout(() => t.className = '', 3200); }
  window.showToast = toast;
  function live(fn, ms = 15000) { const run = () => fn().catch(e => toast(e.message, true)); run(); setInterval(run, ms); document.addEventListener('visibilitychange', () => !document.hidden && run()); }
  function donut(el, items) { if (!el) return; const tot = items.reduce((a, i) => a + i.n, 0); let acc = 0; el.style.background = tot ? `conic-gradient(${items.map((i, k) => { const s = acc / tot * 360; acc += i.n; return `${COLORS[k % 6]} ${s}deg ${acc / tot * 360}deg`; }).join(',')})` : '#dfe8eb'; }
  function chart(id, cfg) { const c = document.getElementById(id); if (!c || !window.Chart) return; Chart.getChart(c)?.destroy(); new Chart(c, cfg); }
  const dot = k => `<span class="dot" style="background:${COLORS[k % 6]}"></span>`;
  window.exportReport = () => {
    const t = $$('table').sort((a, b) => b.rows.length - a.rows.length)[0]; if (!t) return toast('Nothing to export.', true);
    const csv = [...t.rows].map(r => [...r.cells].map(c => '"' + c.innerText.replace(/"/g, '""').trim() + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = PAGE + '-report.csv'; a.click(); toast('Report downloaded.');
  };

  /* ---------- shared shell: clock, greeting, hamburger, logout ---------- */
  /* Greeting by time of day: 5-12 morning, 12-17 afternoon, 17-23 evening, 23-5 late night */
  const greeting = (d = new Date()) => { const h = d.getHours(); return h >= 5 && h < 12 ? ['Good Morning', '☀️'] : h >= 12 && h < 17 ? ['Good Afternoon', '🌤️'] : h >= 17 && h < 21 ? ['Good Evening', '🌆'] : ['Good Night', '🌙']; };
  function shell() {
    const nm = $('.common-admin-name'); if (nm) nm.textContent = U.name;
    const nav = $('.common-navbar');
    if (nav) {
      nav.insertAdjacentHTML('afterbegin', '<button id="menuBtn" class="menu-btn" aria-label="Menu" type="button">☰</button>'); document.body.insertAdjacentHTML('beforeend', '<div id="navShade"></div>');
      $('#menuBtn').addEventListener('click', () => { document.body.classList.toggle('nav-open'); }); $('#navShade').addEventListener('click', () => { document.body.classList.remove('nav-open'); });
    }
    $$('.common-logout').forEach(a => a.onclick = e => { e.preventDefault(); localStorage.clear(); location.href = '/login'; });
    const tick = () => {
      const n = new Date(), d = n.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), t = n.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      ['currentDate', 'studentCurrentDate'].forEach(i => { const e = document.getElementById(i); if (e) e.textContent = d; });['currentTime', 'studentCurrentTime'].forEach(i => { const e = document.getElementById(i); if (e) e.textContent = t; });
      const g = $('.greeting h2'); if (g && /^\s*(Good|Hello)/.test(g.textContent)) { const [t, e] = greeting(n); g.textContent = `${t}, ${(U.name || 'Admin').split(' ')[0]}! ${e}`; }
    };
    tick(); setInterval(tick, 30000);
    $$('.date-dropdown,.date-picker').forEach(e => e.style.display = 'none');
  }

  /* ---------- modal helpers ---------- */
  function modal(html) {
    $('#cfmsModal')?.remove(); document.body.insertAdjacentHTML('beforeend', `<div class="add-faculty-modal show" id="cfmsModal"><div class="add-faculty-dialog wide"><button class="modal-close" type="button" aria-label="Close">×</button>${html}</div></div>`);
    const m = $('#cfmsModal'); const close = () => m.remove(); $('.modal-close', m).addEventListener('click', close); m.addEventListener('click', e => { if (e.target === m) close(); }); return m;
  }

  const ENT = {
    departments: { t: 'Departments', pk: 'department_id', f: [['department_name', 'Department name']] },
    programmes: { t: 'Programmes', pk: 'program_id', f: [['program_name', 'Programme name'], ['dept_id', 'Department', 'ref:departments:department_name']] },
    faculty: { t: 'Faculty', pk: 'faculty_id', f: [['faculty_name', 'Faculty name'], ['dept_id', 'Department', 'ref:departments:department_name'], ['email', 'Email', 'email'], ['designation', 'Designation']] },
    students: { t: 'Students', pk: 'student_id', f: [['roll_no', 'Roll no.'], ['student_name', 'Student name'], ['email', 'Email', 'email']] },
    batches: { t: 'Batches', pk: 'batch_id', f: [['batch_name', 'Batch name'], ['academic_year', 'Academic year (e.g. 2026-27)'], ['semester', 'Semester', 'number'], ['program_id', 'Programme', 'ref:programmes:program_name'], ['faculty_id', 'Class faculty (coordinator)', 'ref:faculty:faculty_name', true]] },
    enrollments: { t: 'Enrollments', pk: 'enrollment_id', f: [['student_id', 'Student', 'ref:students:student_name'], ['batch_id', 'Batch', 'ref:batches:batch_name'], ['status', 'Status', 'sel:Active,Inactive']] },
    courses: { t: 'Courses', pk: 'course_id', f: [['course_code', 'Course code'], ['course_name', 'Course name'], ['credits', 'Credits', 'number'], ['semester', 'Semester', 'number']] },
    offerings: { t: 'Course Offerings', pk: 'offering_id', f: [['course_id', 'Course', 'ref:courses:course_name'], ['faculty_id', 'Faculty', 'ref:faculty:faculty_name'], ['batch_id', 'Batch', 'ref:batches:batch_name'], ['academic_year', 'Academic year'], ['semester', 'Semester', 'number']] },
    types: { t: 'Feedback Types', pk: 'type_id', f: [['type_name', 'Type name']] },
    facilities: { t: 'Facilities', pk: 'facility_id', f: [['facility_name', 'Facility name']] },
    staff: { t: 'Staff', pk: 'staff_id', f: [['staff_name', 'Staff name'], ['email', 'Email', 'email'], ['designation', 'Designation'], ['dept_id', 'Department', 'ref:departments:department_name', true]] }
  };

  const SING = { Departments: 'Department', Programmes: 'Programme', Faculty: 'Faculty', Students: 'Student', Batches: 'Batch', Enrollments: 'Enrollment', Courses: 'Course', 'Course Offerings': 'Course Offering', 'Feedback Types': 'Feedback Type', Facilities: 'Facility', Staff: 'Staff' };
  const one = E => SING[E.t] || E.t;
  async function openAdd(ent, done) {
    const E = ENT[ent]; const refs = {};
    for (const [, , ty] of E.f) if (ty?.startsWith('ref:')) { const e = ty.split(':')[1]; refs[e] = refs[e] || await api('/master/' + e); }
    const field = ([k, l, ty, opt]) => {
      let inp;
      if (ty?.startsWith('ref:')) { const [, e, lab] = ty.split(':'), pk = ENT[e].pk; inp = `<select name="${k}" ${opt ? '' : 'required'}><option value="">${opt ? 'None (optional)' : 'Select…'}</option>${refs[e].map(r => `<option value="${r[pk]}">${esc(r[lab])}${e === 'students' ? ' (' + esc(r.roll_no) + ')' : ''}</option>`).join('')}</select>`; }
      else if (ty?.startsWith('sel:')) inp = `<select name="${k}">${ty.slice(4).split(',').map(o => `<option>${o}</option>`).join('')}</select>`;
      else inp = `<input name="${k}" type="${ty || 'text'}" ${opt || k === 'designation' ? '' : 'required'}/>`;
      return `<label>${l}${inp}</label>`;
    };
    const m = modal(`<h2>Add ${one(E)}</h2><p class="modal-subtitle">${ent === 'students' || ent === 'faculty' || ent === 'staff' ? 'A login is created automatically (default password: ' + ent.replace('students', 'student').replace('faculty', 'faculty').replace('staff', 'staff') + '123).' : 'Fill in the details below.'}</p><form class="add-faculty-form"><div class="form-grid">${E.f.map(field).join('')}</div><div class="form-error" id="mErr"></div><div class="modal-actions"><button class="cancel-btn" type="button" id="mCancel">Cancel</button><button class="save-student-btn" type="submit">Save</button></div></form>`);
    $('#mCancel', m).onclick = () => m.remove();
    $('form', m).onsubmit = async e => {
      e.preventDefault(); const body = Object.fromEntries([...new FormData(e.target)].filter(([, v]) => v !== ''));
      try { await api('/master/' + ent, { method: 'POST', body }); m.remove(); toast(one(E) + ' added.'); done && done(); } catch (x) { $('#mErr', m).textContent = x.message; }
    };
  }
  function addButton(host, ent, label, done) { if (!host || $('#addBtn')) return; host.insertAdjacentHTML('beforeend', `<button class="export-btn student-export-btn" id="addBtn" type="button"><span class="download-icon">+</span> ${label}</button>`); $('#addBtn').onclick = () => openAdd(ent, done); }

  /* ---------- who answered ---------- */
  async function showWho(id) {
    const d = await api(`/forms/${id}/respondents`); const rows = (a, k) => a.length ? a.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.ref)}</td><td>${r.type}</td>${k ? `<td>${dt(r.submitted)}</td>` : ''}</tr>`).join('') : `<tr><td colspan="5" class="empty-row">No one yet.</td></tr>`;
    const m = modal(`<h2>${esc(d.form.title)}</h2><p class="modal-subtitle">${d.form.deadline ? 'Deadline: ' + dt(d.form.deadline) + ' · ' + left(d.form.deadline) : ''}</p>
    <div class="tabs"><button class="tab active" data-t="a">Answered (${d.answered.length})</button><button class="tab" data-t="p">Not answered yet (${d.pending.length})</button></div>
    <div class="mt-wrap" id="tA"><table class="mt-table"><thead><tr><th>#</th><th>Name</th><th>Roll no. / Email</th><th>Type</th><th>Submitted</th></tr></thead><tbody>${rows(d.answered, 1)}</tbody></table></div>
    <div class="mt-wrap" id="tP" style="display:none"><table class="mt-table"><thead><tr><th>#</th><th>Name</th><th>Roll no. / Email</th><th>Type</th></tr></thead><tbody>${rows(d.pending)}</tbody></table></div>`);
    $$('.tab', m).forEach(b => b.onclick = () => { $$('.tab', m).forEach(x => x.classList.toggle('active', x === b)); $('#tA', m).style.display = b.dataset.t === 'a' ? '' : 'none'; $('#tP', m).style.display = b.dataset.t === 'p' ? '' : 'none'; });
  }
  const renderActs = (list) => list.map(a => ({ ...a }));
  const actA = list => list.map(a => `<div class="activity"><div class="activity-icon">${a.icon}</div><div class="activity-text"><strong>${esc(a.title)}</strong>${esc(a.text)}<div class="activity-time">${ago(a.ts)}</div></div></div>`).join('') || '<p class="empty-row">No activity yet.</p>';

  /* ---------- pages ---------- */
  const PAGES = {
    dashboard() {
      live(async () => {
        const d = await api('/admin/overview');
        const cards = [[d.forms, 'Total Feedback Forms', `${d.active} active · ${d.closed} closed${d.draft ? ' · ' + d.draft + ' draft' : ''}`, 'feedbackform.html'],
        [d.students, 'Total Students', `${d.studentsActive} active · ${d.faculty} faculty`, 'studentform.html'],
        [d.rate + '%', 'Response Rate', `${d.responses} of ${d.expected} expected responses`, 'responses.html'],
        [d.avg != null ? Number(d.avg).toFixed(1) : '-', 'Verified Rating', d.ratingCount ? `raw ${d.avgRaw != null ? Number(d.avgRaw).toFixed(1) : '-'}${d.flagged ? ' · ' + d.flagged + ' flagged' : ''} · ${d.blockedAnswers + d.warnedAnswers} language blocks` : 'No ratings yet', 'analytics.html']];
        $$('.stats .stat-card').forEach((c, i) => {
          const [v, label, sub, href] = cards[i]; $('h3', c).textContent = v; $('p', c).innerHTML = `${label}<small>${esc(sub)}</small>`;
          if (!c.dataset.go) { c.dataset.go = 1; c.tabIndex = 0; c.setAttribute('role', 'link'); c.onclick = () => location.href = href; c.onkeydown = e => { if (e.key === 'Enter') location.href = href; }; }
        });
        chart('responseChart', { type: 'bar', data: { labels: d.monthly.map(m => m.label), datasets: [{ label: 'Responses', data: d.monthly.map(m => m.n), backgroundColor: '#168cab', borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
        fill('.table-section tbody', d.recent.map(f => `<tr><td>${esc(f.feedback_title)}</td><td>${esc(f.faculty_name || f.audience_type)}</td><td>${esc(f.program || 'All')}</td><td>${f.responses} / ${f.expected}</td><td><span class="status ${stCls(f)}">${stTxt(f)}</span></td></tr>`).join(''), 5);
        const tot = d.byProgram.reduce((a, i) => a + +i.n, 0); donut($('.program-section .donut'), d.byProgram.map(i => ({ n: +i.n })));
        const lg = $('.program-section .legend'); if (lg) lg.innerHTML = d.byProgram.map((i, k) => `<div class="legend-item">${dot(k)}${esc(i.label)} - ${pct(i.n, tot)}%</div>`).join('') || '<div class="legend-item">No student responses yet</div>';
        const ac = $('.activities'); if (ac) { $$('.activity', ac).forEach(e => e.remove()); ac.insertAdjacentHTML('beforeend', actA(d.activity)); }
      });
    },

    feedbackform() {
      const load = async () => {
        const d = await api('/admin/overview'), F = d.allForms; const st = $$('.stat-text');
        const set = (i, h) => st[i] && (st[i].innerHTML = h); set(0, `<strong>${d.forms}</strong> Total forms<br/>Active ${d.active} | Closed ${d.closed}`); set(1, `<strong>${d.responses}</strong> Total Responses`); set(2, `<strong>${d.active}</strong> Active Forms`); set(3, `<strong>${d.avg ?? '-'}</strong> Avg. Rating`);
        const tr = $('.forms thead tr'); if (tr && tr.cells.length === 6) tr.insertAdjacentHTML('beforeend', '<th>Deadline</th><th>Actions</th>');
        fill('.forms tbody', F.map((f, i) => `<tr><td>${i + 1}</td><td>${esc(f.feedback_title)}<br/><small>${esc(f.sub_type || f.audience_type)}</small></td><td>${esc(f.feedback_types || '-')}</td><td>${dOnly(f.created_at)}</td><td><span class="status ${stCls(f)}">${stTxt(f)}</span></td><td>${f.responses} / ${f.expected}</td><td>${f.deadline ? dt(f.deadline) + '<br/><small>' + left(f.deadline) + '</small>' : dOnly(f.end_date)}</td>
    <td class="row-actions"><button class="mini" data-a="who" data-id="${f.feedback_id}">Who answered</button>${f.status === 'Published' ? `<button class="mini" data-a="Closed" data-id="${f.feedback_id}">Close</button>` : `<button class="mini ok" data-a="Published" data-id="${f.feedback_id}">Publish</button>`}<button class="mini bad" data-a="del" data-id="${f.feedback_id}">Delete</button></td></tr>`).join(''), 8);
        const byT = {}; F.forEach(f => byT[f.feedback_types || 'Other'] = (byT[f.feedback_types || 'Other'] || 0) + 1); const it = Object.entries(byT).map(([l, n]) => ({ l, n }));
        donut($('.forms ~ .right-column .donut, .right-column .donut'), it); const lg = $('.right-column .legend'); if (lg) lg.innerHTML = it.map((i, k) => `<div>${dot(k)} ${esc(i.l)} (${i.n})</div>`).join('');
        const ac = $('.activity-card'); if (ac) { $$('.activity', ac).forEach(e => e.remove()); ac.insertAdjacentHTML('beforeend', d.activity.map(a => `<div class="activity"><div class="activity-icon green-icon">${a.icon}</div><div class="activity-text">${esc(a.title)}<br/><small>${esc(a.text)}</small></div><div class="activity-time">${ago(a.ts)}</div></div>`).join('')); }
      };
      $('.forms')?.addEventListener('click', async e => {
        const b = e.target.closest('button[data-a]'); if (!b) return; const { a, id } = b.dataset;
        try { if (a === 'who') return await showWho(id); if (a === 'del') { if (!confirm('Delete this form and all its responses?')) return; await api('/forms/' + id, { method: 'DELETE' }); toast('Form deleted.'); } else { await api(`/forms/${id}/status`, { method: 'PATCH', body: { status: a } }); toast(`Form ${a === 'Closed' ? 'closed' : 'published'}.`); } load(); } catch (x) { toast(x.message, true); }
      });
      live(load);
    },

    createform() {
      Promise.all([api('/lookups'), Promise.resolve()]).then(([lk]) => {
        $('#feedbackType').innerHTML = '<option value="">Select feedback type</option>' + lk.types.map(t => `<option>${esc(t.type_name)}</option>`).join('');
        const fg = $('#facilityGroup'); fg.style.display = ''; $('label', fg).textContent = 'Facility (optional)'; $('#facility').innerHTML = '<option value="">None</option>' + lk.facilities.map(t => `<option>${esc(t.facility_name)}</option>`).join('');
        fg.insertAdjacentHTML('afterend', `<div class="form-group"><label>Limit to a course offering <small>(optional)</small></label><select id="offering"><option value="">Everyone in the selected audience</option>${lk.offerings.map(o => `<option value="${o.offering_id}">${esc(o.label)}</option>`).join('')}</select><div class="date-help">Only students of that batch will see the form.</div></div><div class="form-group"><label>Status</label><select id="fStatus"><option>Published</option><option>Draft</option></select></div>`);
      });
      const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); $('#startDate').value = now.toISOString().slice(0, 10); $('#deadline').min = now.toISOString().slice(0, 16);
      const qHtml = n => `<div class="question-card"><div class="question-top"><div class="question-number"><span class="q-badge">Q${n}</span><span>Question ${n}</span></div><button class="delete-question" onclick="deleteQuestion(this)" type="button">🗑 Delete</button></div><div class="question-body"><div class="question-grid"><div class="form-group"><label>Question <span class="required">*</span></label><input class="question-text" placeholder="Enter your question" type="text"/></div><div class="form-group"><label>Question Type</label><select class="question-type" onchange="changeQuestionType(this)"><option value="Rating">Rating (1-5)</option><option value="Text">Short Answer</option><option value="Yes/No">Yes / No</option><option value="Multiple Choice">Multiple Choice</option></select></div></div><div class="form-group q-options" style="display:none"><label>Options, comma separated <span class="required">*</span></label><input class="question-options" placeholder="e.g. Excellent, Good, Average, Poor"/></div><div class="answer-preview"><div class="answer-preview-title">Preview</div><div class="prev" style="display:flex;gap:8px;flex-wrap:wrap"><span class="rating-box">1</span><span class="rating-box">2</span><span class="rating-box">3</span><span class="rating-box">4</span><span class="rating-box">5</span></div></div></div></div>`;
      const renum = () => { const c = $$('.question-card'); c.forEach((q, i) => { $('.q-badge', q).textContent = 'Q' + (i + 1); $('.question-number span:last-child', q).textContent = 'Question ' + (i + 1); }); $('#questionCount').textContent = `${c.length} Question${c.length > 1 ? 's' : ''} · all compulsory`; };
      $('#questionList').innerHTML = qHtml(1); renum();
      window.addQuestion = () => { $('#questionList').insertAdjacentHTML('beforeend', qHtml($$('.question-card').length + 1)); renum(); };
      window.deleteQuestion = b => { if ($$('.question-card').length < 2) return toast('A form needs at least one question.', true); b.closest('.question-card').remove(); renum(); };
      window.changeQuestionType = s => {
        const c = s.closest('.question-card'), v = s.value; $('.q-options', c).style.display = v === 'Multiple Choice' ? '' : 'none';
        $('.prev', c).innerHTML = v === 'Rating' ? [1, 2, 3, 4, 5].map(n => `<span class="rating-box">${n}</span>`).join('') : v === 'Yes/No' ? '<span class="rating-box">Yes</span><span class="rating-box">No</span>' : v === 'Text' ? '<div class="short-preview" style="width:100%"></div>' : '<span class="muted">Options appear as radio buttons.</span>';
      };
      window.cancelForm = () => location.href = 'feedbackform.html';
      window.createForm = async () => {
        const aud = $$('input[name="targetAudience"]:checked').map(i => i.value); const get = id => $('#' + id)?.value || '';
        if (!get('feedbackTitle').trim() || !get('feedbackType') || !get('startDate') || !get('deadline')) return toast('Please fill title, type, start date and deadline.', true);
        if (!aud.length) return toast('Choose at least one audience.', true);
        const questions = $$('.question-card').map(c => ({ question_text: $('.question-text', c).value.trim(), question_type: $('.question-type', c).value, options: $('.question-options', c).value.trim() }));
        try {
          await api('/forms', { method: 'POST', body: { feedback_title: get('feedbackTitle').trim(), feedback_types: get('feedbackType'), description: get('description'), start_date: get('startDate'), deadline: new Date(get('deadline')).toISOString(), audience_type: aud.length === 2 ? 'All' : aud[0], sub_type: get('facility'), offering_id: get('offering') || null, status: get('fStatus') || 'Published', questions } });
          toast('Form created. It is now visible to the selected audience.'); setTimeout(() => location.href = 'feedbackform.html', 900);
        } catch (x) { toast(x.message, true); }
      };
    },

    responses() {
      let rows = []; const draw = () => { const q = ($('#searchInput').value || '').toLowerCase(); fill('#responseTable tbody', rows.filter(r => `${r.title} ${r.name} ${r.ref}`.toLowerCase().includes(q)).map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.title)}</td><td><span class="category">${esc(r.category || '-')}</span></td><td>${esc(r.name || 'Unknown')} <small>(${r.t}${r.t === 'Student' ? ' · ' + esc(r.ref) : ''})</small></td><td>${dt(r.at_)}</td><td><span class="status completed">Completed</span></td></tr>`).join(''), 6); };
      $('#searchInput').addEventListener('input', draw);
      live(async () => {
        const d = await api('/admin/responses'); rows = d.rows; const n = d.rows.length, tot = n + d.pend.open + d.pend.missed;
        [n, n, d.pend.open, d.pend.missed].forEach((v, i) => { const e = $$('.summary-number')[i]; if (e) e.textContent = v; }); $$('.summary-change').forEach(e => e.style.display = 'none');
        const lb = $$('.summary-label'); if (lb[2]) lb[2].textContent = 'Pending (open forms)'; if (lb[3]) lb[3].textContent = 'Missed (closed forms)'; draw();
        const byT = {}; d.forms.forEach(f => byT[f.feedback_types || 'Other'] = (byT[f.feedback_types || 'Other'] || 0) + f.responses); const it = Object.entries(byT).map(([l, n]) => ({ l, n }));
        donut($('.donut-wrapper .donut'), it); const c = $('.donut-center'); if (c) c.innerHTML = `${n}<span>Total<br/>Responses</span>`;
        const lg = $('.right-card .legend'); if (lg) lg.innerHTML = it.map((i, k) => `<div class="legend-item"><span class="legend-dot" style="background:${COLORS[k % 6]}"></span><span>${esc(i.l)}</span><span class="legend-value">${pct(i.n, n)}%</span></div>`).join('');
        const sr = $$('.status-row');[[n, 'Completed'], [d.pend.open, 'Pending'], [d.pend.missed, 'Missed']].forEach(([v], i) => { if (!sr[i]) return; $('.status-fill', sr[i]).style.width = pct(v, tot) + '%'; $('.status-value', sr[i]).textContent = `${v} ${pct(v, tot)}%`; });
        const names = $$('.status-name'); if (names[1]) names[1].textContent = 'Pending (open)'; if (names[2]) names[2].textContent = 'Missed (closed)';
        const card = $$('.right-card')[2]; if (card) { $$('.form-item', card).forEach(e => e.remove()); card.insertAdjacentHTML('beforeend', d.forms.slice(0, 8).map((f, k) => `<div class="form-item"><div class="form-icon ${['blue', 'purple', 'green', 'orange', 'cyan'][k % 5]}">▣</div><div class="form-name">${esc(f.feedback_title)}</div><div class="form-count">${f.responses}/${f.expected}</div></div>`).join('')); }
      });
    },

    studentform() {
      let rows = []; const draw = () => { const q = ($('.filter.search').value || '').toLowerCase(); fill('.table-container tbody', rows.filter(r => `${r.student_name} ${r.roll_no} ${r.program} ${r.email}`.toLowerCase().includes(q)).map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.student_name)}</td><td>${esc(r.roll_no)}</td><td>${esc(r.email)}</td><td>${esc(r.program || '-')}</td><td>${esc(r.batch || '-')}</td><td><span class="status ${r.status === 'Active' ? 'active' : 'inactive'}">${r.status}</span></td></tr>`).join(''), 7); };
      const th = $$('.table-container th').find(t => /Enrollment/.test(t.textContent)); if (th) th.textContent = 'Email';
      $('.filter.search').addEventListener('input', draw); const load = async () => {
        const [s, o] = await Promise.all([api('/admin/students'), api('/admin/overview')]); rows = s; draw();
        const act = s.filter(x => x.status === 'Active').length, sub = s.reduce((a, x) => a + +x.submitted, 0);[s.length, act, s.length - act, sub].forEach((v, i) => { const e = $$('.cards .card-number')[i]; if (e) e.textContent = v; });
        const tot = o.byProgram.reduce((a, i) => a + +i.n, 0); donut($('.donut-wrapper .donut'), o.byProgram.map(i => ({ n: +i.n }))); const t = $('.donut-total'); if (t) t.textContent = tot;
        const lg = $('.overview .legend'); if (lg) lg.innerHTML = o.byProgram.map((i, k) => `<div>${dot(k)} ${esc(i.label)} - ${pct(i.n, tot)}%</div>`).join('');
        const p = $$('.right-panel .panel')[1]; if (p) { $$('.activity', p).forEach(e => e.remove()); p.insertAdjacentHTML('beforeend', o.activity.map(a => `<div class="activity"><div class="activity-left"><div class="activity-icon">${a.icon}</div><span>${esc(a.text)}</span></div><span class="time">${ago(a.ts)}</span></div>`).join('')); }
      };
      addButton($('.student-top-actions'), 'students', 'Add Student', load); live(load);
    },

    facultyform() { peopleMaster('faculty', '/admin/faculty', 'Add Faculty', r => `<td>${esc(r.faculty_name)}</td><td>${esc(r.dept || '-')}</td><td>${esc(r.designation || '-')}</td><td>${esc(r.email)}</td>`, r => r.dept || 'No department', r => +r.submitted > 0, 6); },
    staffform() { peopleMaster('staff', '/admin/staff', 'Add Staff', r => `<td>${esc(r.staff_name)}</td><td>${esc(r.designation || '-')}</td><td>${esc(r.email)}</td>`, r => r.designation || 'Staff', () => false, 5); },

    analytics() {
      live(async () => {
        const d = await api('/admin/overview');[d.responses, d.students, d.faculty, d.avg ?? '-', d.staff].forEach((v, i) => { const e = $$('.summary-number')[i]; if (e) e.textContent = v; });
        const m = d.monthly, max = Math.max(5, ...m.map(x => x.n)), W = 500, H = 130, pts = m.map((x, i) => [i * W / (m.length - 1), H - 10 - x.n / max * (H - 30)]);
        const svg = $('.line-chart'); if (svg) svg.innerHTML = `<defs><linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#63b4ff" stop-opacity=".35"/><stop offset="100%" stop-color="#63b4ff" stop-opacity=".03"/></linearGradient></defs><polygon fill="url(#areaGradient)" points="${pts.map(p => p.join(',')).join(' ')} ${W},${H} 0,${H}"/><polyline fill="none" stroke="#2687ed" stroke-width="2.5" points="${pts.map(p => p.join(',')).join(' ')}"/>${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#2687ed"><title>${m[i].label}: ${m[i].n}</title></circle>`).join('')}`;
        $$('.chart-card > span').forEach(s => s.remove()); const mo = $('.months'); if (mo) mo.innerHTML = m.map(x => `<span>${x.label} (${x.n})</span>`).join(''); const yl = $('.y-labels'); if (yl) yl.innerHTML = [max, Math.round(max * .75), Math.round(max / 2), Math.round(max / 4), 0].map(v => `<span>${v}</span>`).join('');
        const tot = d.byType.reduce((a, i) => a + +i.n, 0); donut($('.category-donut'), d.byType.map(i => ({ n: +i.n }))); const cl = $('.category-legend'); if (cl) cl.innerHTML = d.byType.map((i, k) => `<div class="legend-line"><span class="legend-dot" style="background:${COLORS[k % 6]}"></span><span>${esc(i.label)}</span><span class="legend-percent">${pct(i.n, tot)}%</span></div>`).join('') || '<p class="empty-row">No responses yet.</p>';
        const rc = $('.recent-card'); if (rc) { $$('.activity', rc).forEach(e => e.remove()); rc.insertAdjacentHTML('beforeend', d.activity.map(a => `<div class="activity"><div class="activity-icon">${a.icon}</div><div class="activity-info"><div class="activity-name">${esc(a.text)}</div><div class="activity-time">${ago(a.ts)}</div></div></div>`).join('')); }
        const dm = Math.max(5, ...d.byDept.map(x => +x.n)); const ba = $('.bar-area'); if (ba) ba.innerHTML = d.byDept.map(x => `<div class="bar" style="height:${Math.max(6, x.n / dm * 100)}%"><span class="bar-value">${x.n}</span></div>`).join(''); const bl = $('.bar-labels'); if (bl) bl.innerHTML = d.byDept.map(x => `<span>${esc(x.label)}</span>`).join('');
        const ya = $('.bar-y-axis'); if (ya) ya.innerHTML = [dm, Math.round(dm * 2 / 3), Math.round(dm / 3), 0].map(v => `<span>${v}</span>`).join('');
        const fc = $('.feedback-card'); if (fc) fc.innerHTML = d.areas.map((a, k) => `<div class="feedback-row"><div class="feedback-name">${esc(a.label)}</div><div class="progress"><div class="progress-fill ${['', 'blue', 'yellow'][k % 3]}" style="width:${Math.round(a.avg / 5 * 100)}%"></div></div><div class="feedback-value">${a.avg}/5</div></div>`).join('') || '<p class="empty-row">Ratings appear after responses.</p>';
      });
    },

    setting() {
      const S = JSON.parse(localStorage.getItem('cfs_settings') || '{}');
      window.showTab = (n, b) => { $$('.tab').forEach(t => t.classList.toggle('active', t === b)); $$('.tab-content').forEach(c => c.style.display = c.id === n ? '' : 'none'); };
      window.saveSetting = (k, v) => { S[k] = v; localStorage.setItem('cfs_settings', JSON.stringify(S)); };
      window.editCollege = () => { const n = prompt('College name', $('.college-title').textContent), p = prompt('Place', $('.college-place').textContent); if (n) { S.college = n; $('.college-title').textContent = n; } if (p) { S.place = p; $('.college-place').textContent = p; } window.saveSetting('x', 1); toast('College info updated.'); };
      if (S.college) $('.college-title').textContent = S.college; if (S.place) $('.college-place').textContent = S.place;
      $('#saveAllSettings')?.addEventListener('click', () => { window.saveSetting('saved', Date.now()); toast('Settings saved on this device.'); });
    },

    master() {
      let cur = new URLSearchParams(location.search).get('e'); if (!ENT[cur]) cur = 'students';
      $('#entTabs').innerHTML = Object.entries(ENT).map(([k, v]) => `<button class="tab ${k === cur ? 'active' : ''}" data-k="${k}">${v.t}</button>`).join(''); $('#entTabs').onclick = e => { const b = e.target.closest('.tab'); if (b) location.search = '?e=' + b.dataset.k; };
      const E = ENT[cur]; $('#entTitle').textContent = E.t; $('#openAdd').textContent = `＋ Add ${one(E)}`; $('#openAdd').onclick = () => openAdd(cur, load);
      $('#entHead').innerHTML = `<tr><th>ID</th>${E.f.map(f => `<th>${f[1]}</th>`).join('')}<th></th></tr>`;
      async function load() {
        const rows = await api('/master/' + cur), refs = {}; for (const [, , ty] of E.f) if (ty?.startsWith('ref:')) { const e = ty.split(':')[1]; refs[e] = refs[e] || Object.fromEntries((await api('/master/' + e)).map(r => [r[ENT[e].pk], r])); }
        $('#entCount').textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`; fill('#entBody', rows.map(r => `<tr><td>${r[E.pk]}</td>${E.f.map(([k, , ty]) => { let v = r[k]; if (ty?.startsWith('ref:')) { const [, e, lab] = ty.split(':'); v = refs[e][v]?.[lab] ?? ''; } return `<td>${esc(v ?? '')}</td>`; }).join('')}<td><button class="mini bad" data-id="${r[E.pk]}">Delete</button></td></tr>`).join(''), 9);
      }
      $('#entBody').onclick = async e => { const b = e.target.closest('button[data-id]'); if (!b || !confirm('Delete this record?')) return; try { await api(`/master/${cur}/${b.dataset.id}`, { method: 'DELETE' }); toast('Deleted.'); load(); } catch { toast('Cannot delete: other records still use it.', true); } };
      live(load);
    }
  };

  function peopleMaster(ent, path, label, cells, groupOf, answered, cols) {
    let rows = [];
    const load = async () => {
      rows = await api(path); const act = rows.filter(r => r.status === 'Active').length;
      fill('.table-wrapper tbody', rows.map((r, i) => `<tr><td>${i + 1}</td>${cells(r)}<td><span class="status ${r.status === 'Active' ? 'active' : 'inactive'}">${r.status}</span></td></tr>`).join(''), cols);
      const rate = rows.length && ent === 'faculty' ? pct(rows.filter(answered).length, rows.length) + '%' : '—';[rows.length, act, rows.length - act, rate].forEach((v, i) => { const h = $$('.stats .stat-card h3')[i]; if (h) h.textContent = v; });
      const g = {}; rows.forEach(r => g[groupOf(r)] = (g[groupOf(r)] || 0) + 1); const it = Object.entries(g).map(([l, n]) => ({ l, n }));
      const cv = $('.program-section canvas'); if (cv && window.Chart) { Chart.getChart(cv)?.destroy(); new Chart(cv, { type: 'doughnut', data: { labels: it.map(i => i.l), datasets: [{ data: it.map(i => i.n), backgroundColor: COLORS }] }, options: { cutout: '68%', plugins: { legend: { display: false } } } }); }
      const cs = $('.chart-center strong'); if (cs) cs.textContent = rate;
      const lg = $('.program-section .legend'); if (lg) lg.innerHTML = it.map((i, k) => `<div class="legend-item"><div class="legend-left">${dot(k)}<span>${esc(i.l)}</span></div><span class="percentage">${pct(i.n, rows.length)}%</span></div>`).join('');
      const o = await api('/admin/overview'); const ac = $('.activities'); if (ac) { $$('.activity', ac).forEach(e => e.remove()); ac.insertAdjacentHTML('beforeend', actA(o.activity)); }
    };
    const host = $('.top-actions'); const old = $('#openAddStaff'); if (old) { old.onclick = () => openAdd(ent, load); } else addButton(host, ent, label, load); live(load);
  }

  /* ---------- handlers for buttons that existed only in the old demo script ---------- */
  window.toggleMenu = () => { document.body.classList.toggle('nav-open'); };
  window.toggleMonthDropdown = window.toggleDatePicker = window.selectMonth = () => { };
  window.showAllForms = async () => { try { const d = await api('/admin/overview'); modal(`<h2>All forms</h2><div class="mt-wrap"><table class="mt-table"><thead><tr><th>#</th><th>Form</th><th>Answered</th><th>Status</th></tr></thead><tbody>${d.allForms.map((f, i) => `<tr><td>${i + 1}</td><td>${esc(f.feedback_title)}</td><td>${f.responses} / ${f.expected}</td><td>${stTxt(f)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-row">No forms yet.</td></tr>'}</tbody></table></div>`); } catch (x) { toast(x.message, true); } };
  window.generateReport = () => window.exportReport();
  window.downloadBackup = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([localStorage.getItem('cfs_settings') || '{}'], { type: 'application/json' })); a.download = 'settings-backup.json'; a.click(); toast('Settings backup downloaded.'); };
  window.restoreData = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = async () => { try { JSON.parse(await i.files[0].text()); localStorage.setItem('cfs_settings', await i.files[0].text()); toast('Settings restored. Reloading…'); setTimeout(() => location.reload(), 800); } catch { toast('That file is not a valid backup.', true); } }; i.click(); };

  shell(); (PAGES[PAGE.replace('-page', '')] || (() => { }))();
})();
