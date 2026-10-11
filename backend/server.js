const express = require('express'), cors = require('cors'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const db = require('./models'); const mod = require('./moderation'); const { sequelize, M, User, Form, Question, Response } = db;
const SECRET = process.env.JWT_SECRET || 'dev_secret';
const app = express(); app.use(cors(), express.json());
const q = (sql, replacements={}) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
const wrap = fn => (req,res) => fn(req,res).catch(e => { console.error(req.method, req.url, '->', e.parent?.sqlMessage || e.message);
  res.status(e.name?.startsWith('Sequelize') && !e.parent ? 400 : 500).json({ error: e.errors?.[0]?.message || e.parent?.sqlMessage || e.message }); });
const auth = (...roles) => (req,res,next) => {
  try { req.user = jwt.verify((req.headers.authorization||'').replace('Bearer ',''), SECRET); }
  catch { return res.status(401).json({ error:'Please log in again.' }); }
  if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error:'Not allowed.' });
  next();
};
app.post('/api/auth/login', wrap(async (req,res) => {
  const u = await User.findOne({ where:{ email:req.body.email, status:'Active' } });
  if (!u || !bcrypt.compareSync(req.body.password||'', u.password_hash)) return res.status(401).json({ error:'Wrong email or password.' });
  const user = { user_id:u.user_id, name:u.full_name, role:u.role, ref_id:u.ref_id, email:u.email };
  res.json({ token: jwt.sign(user, SECRET, { expiresIn:'8h' }), user });
}));

// Forms visible to a respondent: live query, so new admin forms reach the chosen audience instantly.
// Student: audience Student/All AND (no offering OR enrolled in the offering's batch). Faculty: audience Faculty/All.
const visibleSql = role => role === 'Student' ? `
  SELECT f.*, c.course_name, fa.faculty_name,
   (SELECT COUNT(*) FROM feedback_responses r WHERE r.feedback_id=f.feedback_id AND r.student_id=:me) AS done
  FROM feedback_forms f LEFT JOIN course_offerings o ON o.offering_id=f.offering_id
  LEFT JOIN courses c ON c.course_id=o.course_id LEFT JOIN faculty fa ON fa.faculty_id=o.faculty_id
  WHERE f.status IN ('Published','Closed') AND f.audience_type IN ('Student','All')
  AND (f.offering_id IS NULL OR o.batch_id IN (SELECT batch_id FROM enrollments WHERE student_id=:me AND status='Active'))
  ORDER BY f.created_at DESC` : `
  SELECT f.*, c.course_name, fa.faculty_name,
   (SELECT COUNT(*) FROM feedback_responses r WHERE r.feedback_id=f.feedback_id AND r.faculty_id=:me AND r.respondent_type='Faculty') AS done
  FROM feedback_forms f LEFT JOIN course_offerings o ON o.offering_id=f.offering_id
  LEFT JOIN courses c ON c.course_id=o.course_id LEFT JOIN faculty fa ON fa.faculty_id=o.faculty_id
  WHERE f.status IN ('Published','Closed') AND f.audience_type IN ('Faculty','All') AND f.offering_id IS NULL
  ORDER BY f.created_at DESC`;
const today = () => new Date().toISOString().slice(0,10);
const isOpen = f => f.status==='Published' && f.start_date<=today() && (f.deadline ? new Date(f.deadline) > new Date() : f.end_date>=today());
const tag = f => ({ ...f, done:+f.done>0, open:isOpen(f) });
// Forms with faculty/program names and response counts (expected = people who should answer)
async function formsPlus() {
  const [c] = await q(`SELECT (SELECT COUNT(*) FROM students) students,(SELECT COUNT(*) FROM faculty) faculty`);
  const rows = await q(`SELECT f.*, fa.faculty_name, p.program_name program,
    (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id=o.batch_id AND e.status='Active') batch_students,
    (SELECT COUNT(DISTINCT CONCAT(r.respondent_type,IFNULL(r.student_id,r.faculty_id))) FROM feedback_responses r WHERE r.feedback_id=f.feedback_id) responses
    FROM feedback_forms f LEFT JOIN course_offerings o ON o.offering_id=f.offering_id LEFT JOIN faculty fa ON fa.faculty_id=o.faculty_id
    LEFT JOIN batches b ON b.batch_id=o.batch_id LEFT JOIN programmes p ON p.program_id=b.program_id ORDER BY f.created_at DESC`);
  return rows.map(f => ({ ...f, responses:+f.responses, open:isOpen(f),
    expected:(f.audience_type!=='Faculty' ? (f.offering_id ? +f.batch_students : +c.students) : 0) + (f.audience_type!=='Student' && !f.offering_id ? +c.faculty : 0) }));
}

app.get('/api/forms', auth(), wrap(async (req,res) => {
  const { role, ref_id } = req.user;
  if (role === 'Admin') return res.json(await formsPlus());
  const fill = (await q(visibleSql(role), { me:ref_id })).map(tag);
  if (role === 'Student') return res.json(fill);
  const mine = await q(`SELECT f.*, c.course_name, (SELECT COUNT(DISTINCT r.student_id) FROM feedback_responses r WHERE r.feedback_id=f.feedback_id) AS responses FROM feedback_forms f JOIN course_offerings o ON o.offering_id=f.offering_id JOIN courses c ON c.course_id=o.course_id WHERE o.faculty_id=:me ORDER BY f.created_at DESC`, { me:ref_id });
  res.json([...mine.map(f => ({ ...f, mine:true })), ...fill]);
}));
app.get('/api/forms/:id', auth(), wrap(async (req,res) => {
  const f = await Form.findByPk(req.params.id, { include:[Question], order:[[Question,'question_number','ASC']] });
  if (!f) return res.status(404).json({ error:'Form not found.' });
  res.json(f);
}));
// rating statistics: raw average vs verified average (ratings that contradict the written comment are excluded)
async function ratingStats(ids) {
  if (ids && !ids.length) return { byForm:{}, all:mod.summary([]) };
  const rows = await q(`SELECT r.feedback_id, r.respondent_type t, IFNULL(r.student_id,0) s, IFNULL(r.faculty_id,0) f, fq.question_type qt, r.answer
    FROM feedback_responses r JOIN feedback_questions fq ON fq.question_id=r.question_id WHERE fq.question_type IN ('Rating','Text')${ids ? ' AND r.feedback_id IN (:ids)' : ''}`, { ids: ids || [0] });
  const list = mod.analyse(rows), byForm = {};
  for (const id of new Set(list.map(x => x.fid))) byForm[id] = mod.summary(list.filter(x => x.fid === id));
  return { byForm, all: mod.summary(list) };
}
// live language check used while typing (A = valid, C = warn, B = blocked)
app.post('/api/moderate', auth(), (req,res) => res.json(mod.classify(String(req.body.text || '').slice(0, 2000))));

app.post('/api/forms', auth('Admin'), wrap(async (req,res) => {
  const { questions=[], ...data } = req.body;
  if (!questions.length) return res.status(400).json({ error:'Add at least one question.' });
  for (const txt of [data.feedback_title, data.description, ...questions.map(x => x.question_text), ...questions.map(x => x.options)].filter(Boolean)) {
    const c = mod.classify(txt); if (c.level !== 'valid') return res.status(400).json({ error: `Please reword "${String(txt).slice(0, 40)}": ${c.message}` }); }
  const dl = new Date(data.deadline);
  if (!data.deadline || isNaN(dl)) return res.status(400).json({ error:'Please set a deadline date and time.' });
  if (dl <= new Date()) return res.status(400).json({ error:'The deadline must be in the future.' });
  data.deadline = dl; data.end_date = dl.toISOString().slice(0,10);
  if (data.start_date > data.end_date) return res.status(400).json({ error:'Start date must be before the deadline.' });
  for (const [i,x] of questions.entries()) {
    if (!String(x.question_text||'').trim()) return res.status(400).json({ error:`Question ${i+1} is empty.` });
    if (x.question_type==='Multiple Choice' && String(x.options||'').split(',').filter(o => o.trim()).length < 2) return res.status(400).json({ error:`Question ${i+1} needs at least 2 options.` });
  }
  const form = await sequelize.transaction(async t => {
    const f = await Form.create({ ...data, offering_id:data.offering_id||null, created_by:req.user.user_id }, { transaction:t });
    await Question.bulkCreate(questions.map((x,i) => ({ ...x, feedback_id:f.feedback_id, question_number:i+1 })), { transaction:t });
    return f;
  });
  res.status(201).json(form);
}));
app.patch('/api/forms/:id/status', auth('Admin'), wrap(async (req,res) => { await Form.update({ status:req.body.status }, { where:{ feedback_id:req.params.id } }); res.json({ ok:true }); }));
app.delete('/api/forms/:id', auth('Admin'), wrap(async (req,res) => { await Form.destroy({ where:{ feedback_id:req.params.id } }); res.json({ ok:true }); }));

app.post('/api/forms/:id/submit', auth('Student','Faculty'), wrap(async (req,res) => {
  const { role, ref_id } = req.user;
  const visible = (await q(visibleSql(role), { me:ref_id })).map(tag).find(f => f.feedback_id == req.params.id);
  if (!visible) return res.status(403).json({ error:'This form is not assigned to you.' });
  if (!visible.open) return res.status(400).json({ error:'This form is closed.' });
  if (visible.done) return res.status(400).json({ error:'You already submitted this form.' });
  const qs = await Question.findAll({ where:{ feedback_id:req.params.id } });
  const ans = Object.fromEntries((req.body.answers||[]).map(a => [a.question_id, a.answer]));
  const unanswered = qs.find(x => !String(ans[x.question_id] ?? '').trim());
  if (unanswered) return res.status(400).json({ error:`All questions are compulsory. Please answer: "${unanswered.question_text}"` });
  for (const x of qs.filter(x => x.question_type === 'Text')) {
    const c = mod.classify(ans[x.question_id]);
    if (c.level !== 'valid') { await db.ModLog.create({ feedback_id:x.feedback_id, question_id:x.question_id, respondent_type:role, level:c.level, kind:c.kind, words:c.words.map(w => w.word).join(', ').slice(0, 300) }).catch(() => {});
      return res.status(422).json({ level:c.level, question_id:x.question_id, error: c.level === 'blocked' ? `Your answer to "${x.question_text}" was discarded: ${c.message}` : `Please reword your answer to "${x.question_text}": ${c.message}` }); }
  }
  const offering = visible.offering_id ? await db.Offering.findByPk(visible.offering_id) : null;
  await Response.bulkCreate(qs.filter(x => ans[x.question_id] !== undefined && ans[x.question_id] !== '').map(x => ({
    feedback_id:x.feedback_id, question_id:x.question_id, answer:String(ans[x.question_id]), respondent_type:role,
    student_id: role==='Student' ? ref_id : null, faculty_id: role==='Faculty' ? ref_id : offering?.faculty_id })));
  res.status(201).json({ ok:true });
}));

// Raw SQL: per-question results (anonymous - no student identity returned)
app.get('/api/forms/:id/results', auth('Admin','Faculty'), wrap(async (req,res) => {
  const questions = await q(`SELECT q.question_id,q.question_text,q.question_type, COUNT(r.response_id) AS n,
    ROUND(AVG(CASE WHEN q.question_type='Rating' THEN CAST(r.answer AS DECIMAL(4,2)) END),2) AS avg_rating
    FROM feedback_questions q LEFT JOIN feedback_responses r ON r.question_id=q.question_id WHERE q.feedback_id=:id GROUP BY q.question_id ORDER BY q.question_number`, { id:req.params.id });
  for (const x of questions) x.answers = x.question_type==='Rating' ? [] : (await q(`SELECT answer FROM feedback_responses WHERE question_id=:id ORDER BY submitted_date DESC LIMIT 100`, { id:x.question_id })).map(a => a.answer);
  const st = await ratingStats([+req.params.id]);
  res.json({ questions, summary: st.byForm[req.params.id] || mod.summary([]) });
}));

app.get('/api/dashboard', auth(), wrap(async (req,res) => {
  const { role, ref_id } = req.user;
  const RESP = `COUNT(DISTINCT r.feedback_id,IFNULL(r.student_id,0),IFNULL(r.faculty_id,0),r.respondent_type)`;
  if (role === 'Admin') {
    const [t] = await q(`SELECT (SELECT COUNT(*) FROM feedback_forms) forms,(SELECT COUNT(*) FROM feedback_forms WHERE status='Published') active,(SELECT COUNT(*) FROM feedback_forms WHERE status='Closed') closed,
      (SELECT ${RESP} FROM feedback_responses r) responses,(SELECT COUNT(*) FROM students) students,(SELECT COUNT(*) FROM faculty) faculty,
      (SELECT ROUND(AVG(CAST(r.answer AS DECIMAL(4,2))),1) FROM feedback_responses r JOIN feedback_questions fq ON fq.question_id=r.question_id WHERE fq.question_type='Rating') avg_rating`);
    const monthly = await q(`SELECT DATE_FORMAT(r.submitted_date,'%b') m, ${RESP} n FROM feedback_responses r GROUP BY YEAR(r.submitted_date),MONTH(r.submitted_date),m ORDER BY YEAR(r.submitted_date),MONTH(r.submitted_date)`);
    const byType = await q(`SELECT IFNULL(f.feedback_types,'Other') label, ${RESP} n FROM feedback_responses r JOIN feedback_forms f ON f.feedback_id=r.feedback_id GROUP BY label`);
    const top = await q(`SELECT f.feedback_id,f.feedback_title, ROUND(AVG(CAST(r.answer AS DECIMAL(4,2))),1) rating FROM feedback_forms f JOIN feedback_questions fq ON fq.feedback_id=f.feedback_id AND fq.question_type='Rating' JOIN feedback_responses r ON r.question_id=fq.question_id GROUP BY f.feedback_id ORDER BY rating DESC LIMIT 5`);
    const recent = await q(`SELECT f.*, (SELECT COUNT(DISTINCT CONCAT(r.respondent_type,IFNULL(r.student_id,r.faculty_id))) FROM feedback_responses r WHERE r.feedback_id=f.feedback_id) responses FROM feedback_forms f ORDER BY created_at DESC LIMIT 5`);
    return res.json({ ...t, monthly, byType, top, recent });
  }
  if (role === 'Faculty') {
    const forms = await q(`SELECT f.feedback_id,f.feedback_title,f.status,f.feedback_types,f.created_at,
      (SELECT COUNT(DISTINCT r.student_id) FROM feedback_responses r WHERE r.feedback_id=f.feedback_id) responses,
      (SELECT ROUND(AVG(CAST(r.answer AS DECIMAL(4,2))),1) FROM feedback_responses r JOIN feedback_questions fq ON fq.question_id=r.question_id WHERE r.feedback_id=f.feedback_id AND fq.question_type='Rating') rating
      FROM feedback_forms f JOIN course_offerings o ON o.offering_id=f.offering_id WHERE o.faculty_id=:me`, { me:ref_id });
    const [c] = await q(`SELECT COUNT(*) n FROM feedback_responses r JOIN feedback_questions fq ON fq.question_id=r.question_id JOIN feedback_forms f ON f.feedback_id=r.feedback_id JOIN course_offerings o ON o.offering_id=f.offering_id WHERE o.faculty_id=:me AND fq.question_type='Text'`, { me:ref_id });
    const pending = (await q(visibleSql('Faculty'), { me:ref_id })).map(tag).filter(f => !f.done && f.open);
    const st = await ratingStats(forms.map(f => f.feedback_id));
    forms.forEach(f => { const x = st.byForm[f.feedback_id]; f.rating = x ? (x.verified ?? x.raw) : null; f.raw = x?.raw ?? null; f.flagged = x?.flagged || 0; });
    return res.json({ forms, comments:c.n, pending, avg: st.all.verified ?? st.all.raw, avgRaw: st.all.raw, flagged: st.all.flagged });
  }
  res.json({ forms:(await q(visibleSql('Student'), { me:ref_id })).map(tag) });
}));

app.get('/api/lookups', auth(), wrap(async (req,res) => res.json({
  types: await db.FType.findAll(), facilities: await db.Facility.findAll(),
  offerings: await q(`SELECT o.offering_id, CONCAT(c.course_name,' - ',fa.faculty_name,' (',b.batch_name,')') label FROM course_offerings o JOIN courses c USING(course_id) JOIN faculty fa USING(faculty_id) JOIN batches b USING(batch_id)`) })));

// Generic master-data CRUD (admin). Creating student/faculty also creates a login with a default password.
app.get('/api/master/:e', auth('Admin'), wrap(async (req,res) => res.json(await M[req.params.e][0].findAll({ order:[[M[req.params.e][1],'DESC']] }))));
app.post('/api/master/:e', auth('Admin'), wrap(async (req,res) => {
  const [Model,pk] = M[req.params.e]; const row = await Model.create(req.body);
  if (['students','faculty'].includes(req.params.e)) {
    const s = req.params.e === 'students';
    await User.create({ full_name: row[s?'student_name':'faculty_name'], email:row.email, role:s?'Student':'Faculty', ref_id:row[pk], password_hash:bcrypt.hashSync(s?'student123':'faculty123',8) });
  }
  res.status(201).json(row);
}));
app.delete('/api/master/:e/:id', auth('Admin'), wrap(async (req,res) => { const [Model,pk] = M[req.params.e]; await Model.destroy({ where:{ [pk]:req.params.id } }); res.json({ ok:true }); }));

// ================= ADMIN: who answered, lists, overview =================
const nameMaps = async () => ({
  s: Object.fromEntries((await q(`SELECT student_id,student_name,roll_no FROM students`)).map(x => [x.student_id,x])),
  f: Object.fromEntries((await q(`SELECT faculty_id,faculty_name,email,designation FROM faculty`)).map(x => [x.faculty_id,x])) });
app.get('/api/forms/:id/respondents', auth('Admin'), wrap(async (req,res) => {
  const [f] = await q(`SELECT f.*, o.batch_id FROM feedback_forms f LEFT JOIN course_offerings o ON o.offering_id=f.offering_id WHERE f.feedback_id=:id`, { id:req.params.id });
  if (!f) return res.status(404).json({ error:'Form not found.' });
  const got = await q(`SELECT respondent_type t, student_id, faculty_id, MIN(submitted_date) at_ FROM feedback_responses WHERE feedback_id=:id GROUP BY respondent_type, student_id, faculty_id ORDER BY at_ DESC`, { id:req.params.id });
  const nm = await nameMaps();
  const answered = got.map(g => g.t==='Student' ? { type:'Student', name:nm.s[g.student_id]?.student_name, ref:nm.s[g.student_id]?.roll_no, submitted:g.at_ } : { type:'Faculty', name:nm.f[g.faculty_id]?.faculty_name, ref:nm.f[g.faculty_id]?.email, submitted:g.at_ });
  const doneS = new Set(got.filter(g => g.t==='Student').map(g => g.student_id)), doneF = new Set(got.filter(g => g.t==='Faculty').map(g => g.faculty_id));
  let pending = [];
  if (f.audience_type !== 'Faculty') pending.push(...(await q(f.offering_id ? `SELECT s.student_id,s.student_name name,s.roll_no ref FROM students s JOIN enrollments e ON e.student_id=s.student_id AND e.status='Active' WHERE e.batch_id=:b` : `SELECT student_id,student_name name,roll_no ref FROM students`, { b:f.batch_id })).filter(x => !doneS.has(x.student_id)).map(x => ({ type:'Student', name:x.name, ref:x.ref })));
  if (f.audience_type !== 'Student' && !f.offering_id) pending.push(...(await q(`SELECT faculty_id,faculty_name name,email ref FROM faculty`)).filter(x => !doneF.has(x.faculty_id)).map(x => ({ type:'Faculty', name:x.name, ref:x.ref })));
  res.json({ form:{ title:f.feedback_title, deadline:f.deadline, open:isOpen(f) }, answered, pending });
}));

app.get('/api/admin/responses', auth('Admin'), wrap(async (req,res) => {
  const rows = await q(`SELECT f.feedback_id, f.feedback_title title, f.feedback_types category, r.respondent_type t, r.student_id, r.faculty_id, MIN(r.submitted_date) at_ FROM feedback_responses r JOIN feedback_forms f ON f.feedback_id=r.feedback_id GROUP BY f.feedback_id, f.feedback_title, f.feedback_types, r.respondent_type, r.student_id, r.faculty_id ORDER BY at_ DESC LIMIT 500`);
  const nm = await nameMaps(); const forms = await formsPlus();
  const pend = forms.filter(f => f.status!=='Draft').reduce((a,f) => { const p = Math.max(0, f.expected-f.responses); f.open ? a.open += p : a.missed += p; return a; }, { open:0, missed:0 });
  res.json({ rows: rows.map(r => ({ ...r, name: r.t==='Student' ? nm.s[r.student_id]?.student_name : nm.f[r.faculty_id]?.faculty_name, ref: r.t==='Student' ? nm.s[r.student_id]?.roll_no : 'Faculty' })), forms, pend });
}));

app.get('/api/admin/students', auth('Admin'), wrap(async (req,res) => res.json(await q(`SELECT s.student_id,s.roll_no,s.student_name,s.email, IFNULL(u.status,'Active') status,
  (SELECT p.program_name FROM enrollments e JOIN batches b ON b.batch_id=e.batch_id JOIN programmes p ON p.program_id=b.program_id WHERE e.student_id=s.student_id ORDER BY e.enrollment_id DESC LIMIT 1) program,
  (SELECT b.batch_name FROM enrollments e JOIN batches b ON b.batch_id=e.batch_id WHERE e.student_id=s.student_id ORDER BY e.enrollment_id DESC LIMIT 1) batch,
  (SELECT COUNT(DISTINCT r.feedback_id) FROM feedback_responses r WHERE r.student_id=s.student_id) submitted
  FROM students s LEFT JOIN users u ON u.role='Student' AND u.ref_id=s.student_id ORDER BY s.student_id DESC`))));
app.get('/api/admin/faculty', auth('Admin'), wrap(async (req,res) => res.json(await q(`SELECT fa.faculty_id,fa.faculty_name,fa.email,fa.designation, d.department_name dept, IFNULL(u.status,'Active') status,
  (SELECT COUNT(DISTINCT r.feedback_id) FROM feedback_responses r WHERE r.respondent_type='Faculty' AND r.faculty_id=fa.faculty_id) submitted
  FROM faculty fa LEFT JOIN departments d ON d.department_id=fa.dept_id LEFT JOIN users u ON u.role='Faculty' AND u.ref_id=fa.faculty_id ORDER BY fa.faculty_id DESC`))));
app.get('/api/admin/staff', auth('Admin'), wrap(async (req,res) => res.json(await q(`SELECT * FROM staff ORDER BY staff_id DESC`))));

app.get('/api/admin/overview', auth('Admin'), wrap(async (req,res) => {
  const forms = await formsPlus(); const live = forms.filter(f => f.status!=='Draft'); const rs = await ratingStats();
  const blocked = await q(`SELECT COUNT(*) n FROM moderation_log WHERE level='blocked'`).then(r => +r[0].n).catch(() => 0), warned = await q(`SELECT COUNT(*) n FROM moderation_log WHERE level='warn'`).then(r => +r[0].n).catch(() => 0);
  const exp = live.reduce((a,f) => a+f.expected,0), got = live.reduce((a,f) => a+f.responses,0);
  const [t] = await q(`SELECT (SELECT COUNT(*) FROM students) students,(SELECT COUNT(*) FROM faculty) faculty,(SELECT COUNT(*) FROM staff) staff,
    (SELECT ROUND(AVG(CAST(r.answer AS DECIMAL(4,2))),1) FROM feedback_responses r JOIN feedback_questions fq ON fq.question_id=r.question_id WHERE fq.question_type='Rating') avg_rating,
    (SELECT COUNT(*) FROM feedback_responses r JOIN feedback_questions fq ON fq.question_id=r.question_id WHERE fq.question_type='Rating') rating_n,
    (SELECT COUNT(*) FROM students s JOIN users u ON u.role='Student' AND u.ref_id=s.student_id WHERE u.status='Active') students_active`);
  const mon = await q(`SELECT DATE_FORMAT(submitted_date,'%Y-%m') ym, COUNT(DISTINCT feedback_id,IFNULL(student_id,0),IFNULL(faculty_id,0),respondent_type) n FROM feedback_responses GROUP BY ym`);
  const monthly = [...Array(6)].map((_,i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-(5-i)); const ym = d.toISOString().slice(0,7); return { label:d.toLocaleString('en',{month:'short'}), n:+(mon.find(m => m.ym===ym)?.n || 0) }; });
  const C = `COUNT(DISTINCT r.feedback_id,r.student_id)`, J = `FROM feedback_responses r JOIN enrollments e ON e.student_id=r.student_id JOIN batches b ON b.batch_id=e.batch_id JOIN programmes p ON p.program_id=b.program_id`;
  const byProgram = await q(`SELECT IFNULL(p.program_name,'Not enrolled') label, ${C} n FROM feedback_responses r LEFT JOIN enrollments e ON e.student_id=r.student_id LEFT JOIN batches b ON b.batch_id=e.batch_id LEFT JOIN programmes p ON p.program_id=b.program_id WHERE r.respondent_type='Student' GROUP BY label`);
  const byDept = await q(`SELECT d.department_name label, ${C} n ${J} JOIN departments d ON d.department_id=p.dept_id GROUP BY d.department_id,d.department_name`);
  const byType = await q(`SELECT IFNULL(f.feedback_types,'Other') label, COUNT(DISTINCT r.feedback_id,IFNULL(r.student_id,0),IFNULL(r.faculty_id,0),r.respondent_type) n FROM feedback_responses r JOIN feedback_forms f ON f.feedback_id=r.feedback_id GROUP BY label`);
  const areas = await q(`SELECT IFNULL(f.feedback_types,'Other') label, ROUND(AVG(CAST(r.answer AS DECIMAL(4,2))),2) avg FROM feedback_responses r JOIN feedback_questions fq ON fq.question_id=r.question_id AND fq.question_type='Rating' JOIN feedback_forms f ON f.feedback_id=r.feedback_id GROUP BY label ORDER BY avg DESC LIMIT 5`);
  const subs = await q(`SELECT f.feedback_title t, r.respondent_type rt, r.student_id, r.faculty_id, MIN(r.submitted_date) ts FROM feedback_responses r JOIN feedback_forms f ON f.feedback_id=r.feedback_id GROUP BY f.feedback_title, r.feedback_id, r.respondent_type, r.student_id, r.faculty_id ORDER BY ts DESC LIMIT 6`);
  const nm = await nameMaps();
  const activity = [...subs.map(x => ({ icon:'✓', title:'New feedback submitted', text:`${(x.rt==='Student' ? nm.s[x.student_id]?.student_name : nm.f[x.faculty_id]?.faculty_name) || 'Someone'} answered ${x.t}`, ts:x.ts })),
    ...forms.slice(0,5).map(f => ({ icon:'＋', title:'New feedback form created', text:f.feedback_title, ts:f.created_at }))].sort((a,b) => new Date(b.ts)-new Date(a.ts)).slice(0,6);
  res.json({ forms:forms.length, active:forms.filter(f => f.open).length, closed:forms.filter(f => f.status==='Closed' || (f.status==='Published' && !f.open)).length, responses:got,
    students:t.students, faculty:t.faculty, staff:t.staff, avg:rs.all.verified ?? rs.all.raw, avgRaw:rs.all.raw, flagged:rs.all.flagged, blockedAnswers:blocked, warnedAnswers:warned, rate: exp ? Math.min(100, Math.round(got/exp*100)) : 0, expected:exp, ratingCount:+t.rating_n, studentsActive:+t.students_active, draft:forms.filter(f => f.status==='Draft').length, monthly, byProgram, byDept, byType, areas, activity, recent:forms.slice(0,5), allForms:forms });
}));

async function seed() {
  if (await User.count()) return;
  await sequelize.sync({ force:true }); // no users = setup never finished, so start from clean tables
  const h = p => bcrypt.hashSync(p,8);
  const dep = await db.Department.create({ department_name:'Computer Applications' });
  const prog = await db.Programme.create({ program_name:'BCA', dept_id:dep.department_id });
  const fac = await db.Faculty.create({ faculty_name:'Prof. R. Naik', dept_id:dep.department_id, email:'naik@gmfc.edu', designation:'Assistant Professor' });
  const batch = await db.Batch.create({ batch_name:'SY BCA', academic_year:'2026-27', semester:3, program_id:prog.program_id, faculty_id:fac.faculty_id });
  await db.Staff.create({ staff_name:'Ramesh Gaonkar', dept_id:dep.department_id, email:'ramesh@gmfc.edu', designation:'Lab Assistant' });
  const stu = await db.Student.create({ roll_no:'BCA2301', student_name:'Archita Gawde', email:'archita@gmfc.edu' });
  await db.Enrollment.create({ student_id:stu.student_id, batch_id:batch.batch_id });
  const course = await db.Course.create({ course_code:'BCA301', course_name:'Web Technology', credits:4, semester:3 });
  const off = await db.Offering.create({ course_id:course.course_id, faculty_id:fac.faculty_id, batch_id:batch.batch_id, academic_year:'2026-27', semester:3 });
  await db.FType.bulkCreate(['Course','Teaching','Non-Teaching','Sports','Counselling','Library Facilities'].map(type_name => ({ type_name })));
  await db.Facility.bulkCreate(['Canteen','Transport','Labs','Infrastructure','Library','Hostel','Sports Ground','Wi-Fi & Internet','Cleanliness','Administration Office'].map(facility_name => ({ facility_name })));
  await User.bulkCreate([
    { full_name:'Admin', email:'admin@gmfc.edu', password_hash:h('admin123'), role:'Admin' },
    { full_name:fac.faculty_name, email:fac.email, password_hash:h('faculty123'), role:'Faculty', ref_id:fac.faculty_id },
    { full_name:stu.student_name, email:stu.email, password_hash:h('student123'), role:'Student', ref_id:stu.student_id }]);
  const f = await Form.create({ offering_id:off.offering_id, feedback_title:'Faculty Feedback - Web Technology', description:'Rate your teaching experience.', start_date:'2026-01-01', end_date:'2027-12-31', deadline:new Date('2027-12-31T12:00:00Z'), status:'Published', feedback_types:'Teaching', audience_type:'Student', sub_type:'Course' });
  await Question.bulkCreate([['How clear were the lectures?','Rating'],['How helpful is the teacher with doubts?','Rating'],['Any suggestions?','Text']].map(([question_text,question_type],i) => ({ feedback_id:f.feedback_id, question_text, question_type, question_number:i+1 })));
  console.log('Seeded demo data.');
}
const autoClose = () => sequelize.query("UPDATE feedback_forms SET status='Closed' WHERE status='Published' AND deadline IS NOT NULL AND deadline < NOW()").catch(() => {});
sequelize.sync().then(seed).then(() => { autoClose(); setInterval(autoClose, 60000); return app.listen(process.env.PORT||5000, () => console.log('API on :'+(process.env.PORT||5000))); })
  .catch(e => { console.error('DB error:', e.message, e.errors?.map(x => x.message) || '', e.parent?.sqlMessage || ''); process.exit(1); });
