import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from './api.js'; import { useAuth } from './App.jsx';

const fmt = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const greet = (d = new Date()) => { const h = d.getHours(); return h >= 5 && h < 12 ? ['Good Morning', '☀️'] : h >= 12 && h < 17 ? ['Good Afternoon', '🌤️'] : h >= 17 && h < 21 ? ['Good Evening', '🌆'] : ['Good Night', '🌙']; };
function useGreeting() { const [g, setG] = useState(greet()); useEffect(() => { const t = setInterval(() => setG(greet()), 60000); return () => clearInterval(t); }, []); return g; } // updates by itself as the day goes on
const Pill = ({ s }) => <span className={'pill ' + s.split(' ')[0].toLowerCase()}>{s}</span>;
const Card = ({ title, action, children }) => <div className="card"><div className="ch"><h3>{title}</h3>{action}</div>{children}</div>;
const Stat = ({ icon, n, label, sub, tone }) => <div className={'stat ' + tone}><div className="si">{icon}</div><div><b>{n}</b><div>{label}</div><small>{sub}</small></div></div>;
const Empty = ({ text }) => <p className="empty">{text}</p>;
const left = x => { const ms = new Date(x) - Date.now(); if (ms <= 0) return 'Closed'; const h = ms / 3600000; return h < 24 ? `${Math.floor(h)}h ${Math.floor(ms / 60000) % 60}m left` : `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h left`; };
function useFetch(path, deps = [], poll = 0) {
  const [data, set] = useState(null); const [err, setErr] = useState('');
  const load = useCallback(() => api(path).then(set).catch(e => setErr(e.message)), [path]);
  useEffect(() => {
    load(); if (!poll) return; const t = setInterval(load, poll), v = () => !document.hidden && load();
    document.addEventListener('visibilitychange', v); return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); };
  }, [load, ...deps]); // poll = real-time refresh
  return [data, err, load];
}
const Bars = ({ items, max }) => <div className="bars">{items.map((b, i) => <div key={i} className="bar"><span>{b.v}</span><i style={{ height: Math.max(4, b.v / max * 140), background: ['#168cab', '#54b7d5', '#7bd3a5', '#f2b64c'][i % 4] }} /><small>{b.l}</small></div>)}</div>;

export function Login() {
  const { dispatch } = useAuth(); const [f, setF] = useState({ email: '', password: '' }); const [err, setErr] = useState(''); const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const ref = useRef();
  useEffect(() => { if (window.matchMedia('(hover:hover)').matches) ref.current?.focus(); }, []); // no auto-focus on phones, so the keyboard does not cover the page
  const go = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await api('/auth/login', { method: 'POST', body: f }); localStorage.setItem('token', r.token); localStorage.setItem('user', JSON.stringify(r.user)); dispatch({ type: 'login', user: r.user }); }
    catch (x) { setErr(x.message); setBusy(false); }
  };
  const demo = [['Admin', 'admin@gmfc.edu', 'admin123'], ['Faculty', 'naik@gmfc.edu', 'faculty123'], ['Student', 'archita@gmfc.edu', 'student123']];
  return <div className="login">
    <section className="lbrand">
      <img src="/admin/collegelogo.png" alt="College logo" />
      <div className="lname"><small>SPES's Shri Gopal Gaonkar Memorial</small><h1>Goa Multi Faculty College</h1><small>Dharbandhora - Goa</small></div>
      <p className="lsys">College Feedback Management System</p>
      <p className="lquote">“Your feedback shapes a better tomorrow.”</p>
    </section>
    <section className="lpanel">
      <form onSubmit={go} className="lbox">
        <div><h2>Welcome back</h2><p className="lsub">Log in to continue</p></div>
        <label>Email<input ref={ref} type="email" inputMode="email" autoComplete="username" placeholder="you@gmfc.edu" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
        <label>Password<span className="pw"><input type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Your password" required value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /><button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button></span></label>
        {err && <div className="err" role="alert">{err}</div>}
        <button className="btn primary lgo" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <div className="demo"><small>Demo accounts, tap to fill:</small><div>{demo.map(([n, em, pw]) => <button type="button" key={n} onClick={() => { setF({ email: em, password: pw }); setErr(''); }}>{n}</button>)}</div></div>
      </form>
    </section>
  </div>;
}

export function Dashboard() {
  const { user } = useAuth(); const [gt, ge] = useGreeting(); const [d, err] = useFetch('/dashboard', [], 15000);
  if (err) return <div className="err">{err}</div>; if (!d) return <p>Loading…</p>;
  const sub = user.role === 'Admin' ? "Here's an overview of your feedback system." : user.role === 'Faculty' ? 'Your insights help us build a better college.' : '“Small feedback, big changes.”';
  const head = <h2 className="hello">{gt}, {user.role === 'Admin' ? 'Admin' : user.name}! {ge}<small>{sub}</small></h2>;
  if (user.role === 'Admin') {
    const mx = Math.max(10, ...d.monthly.map(m => +m.n));
    return <>{head}<div className="stats">
      <Stat icon="▤" n={d.forms} label="Total Forms" sub={`${d.active} Active | ${d.closed} Closed`} tone="b" /><Stat icon="☺" n={d.responses} label="Total Responses" sub="All forms" tone="g" />
      <Stat icon="♙" n={d.students} label="Total Students" sub={`${d.faculty} faculty`} tone="p" /><Stat icon="★" n={d.avg_rating ?? '-'} label="Average Rating" sub="Overall feedback" tone="o" /></div>
      <div className="grid2"><Card title="Responses Overview">{d.monthly.length ? <Bars items={d.monthly.map(m => ({ l: m.m, v: +m.n }))} max={mx} /> : <Empty text="No responses yet." />}</Card>
        <Card title="Responses by Type">{d.byType.length ? d.byType.map(t => <div key={t.label} className="hbar"><span>{t.label}</span><div><i style={{ width: (t.n / d.responses * 100) + '%' }} /></div><b>{t.n}</b></div>) : <Empty text="No responses yet." />}</Card></div>
      <div className="grid2"><Card title="Recent Feedback Forms" action={<Link to="/forms">View All</Link>}><FormTable rows={d.recent} admin /></Card>
        <Card title="Top Rated Forms">{d.top.length ? d.top.map((t, i) => <div key={t.feedback_id} className="rank"><em>{i + 1}</em>{t.feedback_title}<b>{t.rating} ★</b></div>) : <Empty text="Ratings appear after responses." />}</Card></div></>;
  }
  if (user.role === 'Faculty') {
    const tot = d.forms.reduce((a, f) => a + +f.responses, 0), rated = d.forms.filter(f => f.rating);
    const avg = d.avg != null ? Number(d.avg).toFixed(1) : '-';
    return <>{head}<div className="stats"><Stat icon="▤" n={d.forms.length} label="Forms About You" sub="Course feedback" tone="b" /><Stat icon="☺" n={tot} label="Total Responses" sub="From students" tone="g" /><Stat icon="★" n={avg} label="Verified Rating" sub={d.avgRaw != null ? `Raw ${Number(d.avgRaw).toFixed(1)}${d.flagged ? ' · ' + d.flagged + ' flagged' : ''}` : 'Across your forms'} tone="p" /><Stat icon="✎" n={d.comments} label="Student Comments" sub="View in results" tone="o" /></div>
      <div className="grid2"><Card title="Average Ratings for Your Forms">{rated.length ? <Bars items={rated.map(f => ({ l: f.feedback_title.slice(0, 18), v: +f.rating }))} max={5} /> : <Empty text="No ratings yet." />}</Card>
        <Card title="Upcoming / Pending" action={<Link to="/forms">View All</Link>}>{d.pending.length ? d.pending.map(f => <div key={f.feedback_id} className="rank">{f.feedback_title}<Link className="btn sm primary" to={`/forms/${f.feedback_id}/fill`}>Fill Now</Link></div>) : <Empty text="Nothing pending." />}</Card></div></>;
  }
  const done = d.forms.filter(f => f.done).length, pend = d.forms.filter(f => !f.done && f.open).length, pct = d.forms.length ? Math.round(done / d.forms.length * 100) : 0;
  return <>{head}<div className="stats three"><Stat icon="▤" n={d.forms.length} label="Total Forms Assigned" tone="b" /><Stat icon="✓" n={done} label="Forms Submitted" tone="g" /><Stat icon="◷" n={pend} label="Forms Pending" tone="o" /></div>
    <div className="grid2"><Card title="Your Feedback Forms" action={<Link to="/forms">View All</Link>}><FormTable rows={d.forms.slice(0, 5)} /></Card>
      <Card title="Your Progress"><div className="ring" style={{ background: `conic-gradient(#168cab ${pct * 3.6}deg,#d6e0ee 0)` }}><div><b>{pct}%</b><small>Forms Completed</small></div></div><p className="center">{done} / {d.forms.length} forms submitted. Your feedback helps us improve.</p></Card></div></>;
}

function FormTable({ rows, admin }) {
  if (!rows?.length) return <Empty text="No forms yet." />;
  return <div className="tw"><table><thead><tr><th>#</th><th>Form Title</th><th>Category</th><th>Created On</th><th>Status</th>{admin && <th>Responses</th>}<th>Action</th></tr></thead><tbody>
    {rows.map((f, i) => {
      const st = admin ? f.status : f.done ? 'Submitted' : f.open ? 'Pending' : 'Closed';
      return <tr key={f.feedback_id}><td>{i + 1}</td><td>{f.feedback_title}</td><td>{f.feedback_types || '-'}</td><td>{fmt(f.created_at)}</td><td><Pill s={st} /></td>{admin && <td>{f.responses}</td>}
        <td>{admin ? <Link className="btn sm" to={`/forms/${f.feedback_id}/results`}>View</Link> : f.open && !f.done ? <Link className="btn sm primary" to={`/forms/${f.feedback_id}/fill`}>Fill Now</Link> : <span className="muted">—</span>}</td></tr>;
    })}</tbody></table></div>;
}

export function FormsList() {
  const { user } = useAuth(); const [rows, err, load] = useFetch('/forms', [], 15000); const [tab, setTab] = useState('All'); const [msg, setMsg] = useState('');
  const stOf = f => user.role === 'Admin' ? f.status : f.mine ? 'About you' : f.done ? 'Submitted' : f.open ? 'Pending' : 'Closed';
  const view = useMemo(() => (rows || []).filter(f => tab === 'All' || stOf(f) === tab), [rows, tab]);
  const tabs = user.role === 'Admin' ? ['All', 'Draft', 'Published', 'Closed'] : ['All', 'Pending', 'Submitted', 'Closed'];
  const setStatus = async (id, status) => { await api(`/forms/${id}/status`, { method: 'PATCH', body: { status } }); load(); };
  const del = async id => { if (confirm('Delete this form and its responses?')) { await api('/forms/' + id, { method: 'DELETE' }); setMsg('Form deleted.'); load(); } };
  if (err) return <div className="err">{err}</div>; if (!rows) return <p>Loading…</p>;
  return <Card title="Your Feedback Forms" action={user.role === 'Admin' && <Link className="btn primary sm" to="/create">+ Create Form</Link>}>
    {msg && <div className="ok">{msg}</div>}<div className="tabs">{tabs.map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    {!view.length ? <Empty text="No forms here yet." /> : <div className="tw"><table><thead><tr><th>#</th><th>Form Title</th><th>Category</th><th>Audience</th><th>Deadline</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {view.map((f, i) => <tr key={f.feedback_id + (f.mine ? 'm' : '')}><td>{i + 1}</td><td>{f.feedback_title}<br /><small>{f.sub_type}</small></td><td>{f.feedback_types || '-'}</td><td>{f.audience_type}</td><td>{f.deadline ? <>{new Date(f.deadline).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}<br /><small>{f.open ? left(f.deadline) : 'Closed'}</small></> : fmt(f.end_date)}</td><td><Pill s={stOf(f)} /></td>
        <td className="acts">{user.role === 'Admin' ? <><Link className="btn sm" to={`/forms/${f.feedback_id}/results`}>Results ({f.responses})</Link>
          {f.status !== 'Published' && <button className="btn sm primary" onClick={() => setStatus(f.feedback_id, 'Published')}>Publish</button>}
          {f.status === 'Published' && <button className="btn sm" onClick={() => setStatus(f.feedback_id, 'Closed')}>Close</button>}<button className="btn sm danger" onClick={() => del(f.feedback_id)}>Delete</button></>
          : f.mine ? <Link className="btn sm" to={`/forms/${f.feedback_id}/results`}>View</Link> : f.open && !f.done ? <Link className="btn sm primary" to={`/forms/${f.feedback_id}/fill`}>Fill Now</Link> : <span className="muted">{f.done ? 'Done' : 'Closed'}</span>}</td></tr>)}</tbody></table></div>}</Card>;
}

export function FillForm() {
  const { id } = useParams(); const nav = useNavigate(); const [form, err] = useFetch('/forms/' + id); const [ans, setAns] = useState({}); const [e2, setE2] = useState(''); const [mod, setMod] = useState({}); const timers = useRef({});
  if (err) return <div className="err">{err}</div>; if (!form) return <p>Loading…</p>;
  const set = (qid, v) => setAns(a => ({ ...a, [qid]: v }));
  const typing = (qid, v) => {
    set(qid, v); clearTimeout(timers.current[qid]); setE2('');
    if (!v.trim()) return setMod(m => ({ ...m, [qid]: null }));
    timers.current[qid] = setTimeout(() => api('/moderate', { method: 'POST', body: { text: v } }).then(r => setMod(m => ({ ...m, [qid]: r }))).catch(() => { }), 350);
  }; // checks the wording while the person types
  const problem = Object.values(mod).some(m => m && m.level !== 'valid');
  const submit = async e => {
    e.preventDefault(); if (problem) return;
    const missing = form.Questions.find(q => q.is_required && !String(ans[q.question_id] ?? '').trim()); if (missing) return setE2('This question is required (*): ' + missing.question_text);
    try { await api(`/forms/${id}/submit`, { method: 'POST', body: { answers: Object.entries(ans).map(([question_id, answer]) => ({ question_id: +question_id, answer })) } }); nav('/forms'); } catch (x) { setE2(x.message); }
  };
  return <Card title={form.feedback_title}><p>{form.description}</p>{form.deadline && <div className="ok">Deadline: {new Date(form.deadline).toLocaleString('en-IN')} · {left(form.deadline)}</div>}<p className="muted">{form.Questions.some(q => q.is_required) ? <>Questions marked <span className="req">*</span> are required.</> : 'All questions on this form are optional.'}</p><form onSubmit={submit}>{form.Questions.map(q => <div key={q.question_id} className="q"><label>{q.question_number}. {q.question_text} {q.is_required ? <span className="req" title="Required">*</span> : <span className="optional-tag">(optional)</span>}</label>
    {q.question_type === 'Rating' && <div className="stars">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} className={ans[q.question_id] >= n ? 'on' : ''} onClick={() => set(q.question_id, n)}>★</button>)}</div>}
    {q.question_type === 'Text' && <>
      <textarea rows="3" className={'lang ' + (mod[q.question_id]?.level || '')} placeholder="Write your answer politely…" onChange={e => typing(q.question_id, e.target.value)} />
      {mod[q.question_id] && <div className={'modmsg ' + mod[q.question_id].level}>
        {mod[q.question_id].level === 'valid' ? '✓ Looks good' : mod[q.question_id].level === 'warn' ? '⚠ ' + mod[q.question_id].message : '✖ ' + mod[q.question_id].message}
        {mod[q.question_id].words?.length > 0 && <div className="chips">{mod[q.question_id].words.map(w => <span key={w.word} className="chip">“{w.word}”{w.suggestion ? <> → try “{w.suggestion}”</> : null}</span>)}</div>}</div>}</>}
    {q.question_type === 'Yes/No' && ['Yes', 'No'].map(v => <label key={v} className="opt"><input type="radio" name={'q' + q.question_id} onChange={() => set(q.question_id, v)} />{v}</label>)}
    {q.question_type === 'Multiple Choice' && (q.options || '').split(',').map(v => <label key={v} className="opt"><input type="radio" name={'q' + q.question_id} onChange={() => set(q.question_id, v.trim())} />{v.trim()}</label>)}</div>)}
    {problem && <div className="err">Please fix the highlighted answers before submitting.</div>}{e2 && <div className="err">{e2}</div>}<button className="btn primary" disabled={problem}>Submit feedback</button></form></Card>;
}

export function Results() {
  const { id } = useParams(); const [res, err] = useFetch(`/forms/${id}/results`); const r = res?.questions, sm = res?.summary; const [f] = useFetch('/forms/' + id);
  if (err) return <div className="err">{err}</div>; if (!r) return <p>Loading…</p>;
  return <Card title={'Results: ' + (f?.feedback_title || '')} action={<Link to="/forms">← Back to forms</Link>}>{sm && sm.n > 0 && <div className="verified"><div><small>Verified rating</small><b>{sm.verified ?? '-'}<span> / 5</span></b></div><div><small>Raw average</small><b>{sm.raw ?? '-'}</b></div><div><small>Responses</small><b>{sm.n}</b></div><div><small>Flagged</small><b>{sm.flagged}</b></div>{sm.unverified > 0 && <div><small>Language not recognised</small><b>{sm.unverified}</b></div>}<p>Ratings that contradict the written comment (e.g. 5 stars with “worst teacher”), and identical ratings with no comment, are down-weighted or excluded from the verified rating. Comments in a language the system does not know yet are counted as normal; add words to <code>backend/data/sentiment_words.txt</code> to teach it.</p></div>}{r.map(x => <div key={x.question_id} className="q"><b>{x.question_text}</b>
    {x.question_type === 'Rating' ? <p>Average <b className="big">{x.avg_rating ?? '-'}</b> / 5 from {x.n} responses</p> : x.answers.length ? <ul>{x.answers.map((a, i) => <li key={i}>{a}</li>)}</ul> : <Empty text="No answers yet." />}</div>)}</Card>;
}

export function CreateForm() {
  const nav = useNavigate(); const [lk] = useFetch('/lookups'); const [err, setErr] = useState('');
  const blank = { question_text: '', question_type: 'Rating', options: '' }; const [qs, setQs] = useState([{ ...blank }]);
  const [f, setF] = useState({ feedback_title: '', description: '', feedback_types: '', audience_type: 'Student', sub_type: '', offering_id: '', start_date: new Date().toISOString().slice(0, 10), end_date: '', status: 'Published' });
  const set = k => e => setF({ ...f, [k]: e.target.value }); const setQ = (i, k, v) => setQs(qs.map((q, j) => j === i ? { ...q, [k]: v } : q));
  const save = async e => { e.preventDefault(); try { await api('/forms', { method: 'POST', body: { ...f, questions: qs.filter(q => q.question_text.trim()) } }); nav('/forms'); } catch (x) { setErr(x.message); } };
  if (!lk) return <p>Loading…</p>;
  return <Card title="Create Feedback Form"><form onSubmit={save} className="fgrid">
    <label>Title<input required value={f.feedback_title} onChange={set('feedback_title')} /></label>
    <label>Feedback type<select required value={f.feedback_types} onChange={set('feedback_types')}><option value="">Select…</option>{lk.types.map(t => <option key={t.type_id}>{t.type_name}</option>)}</select></label>
    <label>Audience<select value={f.audience_type} onChange={set('audience_type')}><option>Student</option><option>Faculty</option><option>All</option></select></label>
    <label>Facility / sub type<select value={f.sub_type} onChange={set('sub_type')}><option value="">None</option>{lk.facilities.map(t => <option key={t.facility_id}>{t.facility_name}</option>)}</select></label>
    <label>Course offering (limits form to that batch; optional)<select value={f.offering_id} onChange={set('offering_id')}><option value="">Everyone in the audience</option>{lk.offerings.map(o => <option key={o.offering_id} value={o.offering_id}>{o.label}</option>)}</select></label>
    <label>Status<select value={f.status} onChange={set('status')}><option>Published</option><option>Draft</option></select></label>
    <label>Start date<input type="date" required value={f.start_date} onChange={set('start_date')} /></label><label>End date<input type="date" required value={f.end_date} onChange={set('end_date')} /></label>
    <label className="full">Description<textarea value={f.description} onChange={set('description')} /></label>
    <div className="full"><h4>Questions</h4>{qs.map((q, i) => <div key={i} className="qrow"><input placeholder={'Question ' + (i + 1)} value={q.question_text} onChange={e => setQ(i, 'question_text', e.target.value)} />
      <select value={q.question_type} onChange={e => setQ(i, 'question_type', e.target.value)}>{['Rating', 'Text', 'Yes/No', 'Multiple Choice'].map(t => <option key={t}>{t}</option>)}</select>
      {q.question_type === 'Multiple Choice' ? <input placeholder="Options, comma separated" value={q.options} onChange={e => setQ(i, 'options', e.target.value)} /> : <span />}
      <button type="button" className="btn sm danger" onClick={() => setQs(qs.filter((_, j) => j !== i))}>Remove</button></div>)}
      <button type="button" className="btn sm" onClick={() => setQs([...qs, { ...blank }])}>+ Add question</button></div>
    {err && <div className="err full">{err}</div>}<button className="btn primary">Save form</button></form></Card>;
}

const FIELDS = { departments: ['department_name'], programmes: ['program_name', 'dept_id'], faculty: ['faculty_name', 'dept_id', 'email', 'designation'], batches: ['batch_name', 'academic_year', 'semester', 'program_id'], students: ['roll_no', 'student_name', 'email'], enrollments: ['student_id', 'batch_id', 'status'], courses: ['course_code', 'course_name', 'credits', 'semester'], offerings: ['course_id', 'faculty_id', 'batch_id', 'academic_year', 'semester'], types: ['type_name'], facilities: ['facility_name'] };
export function Manage() {
  const { entity } = useParams(); const [tick, setTick] = useState(0); const [rows, err] = useFetch('/master/' + entity, [tick]); const [f, setF] = useState({}); const [msg, setMsg] = useState(''); const [e2, setE2] = useState('');
  useEffect(() => { setF({}); setMsg(''); setE2(''); }, [entity]);
  const cols = FIELDS[entity]; const pk = rows?.[0] && Object.keys(rows[0])[0];
  const add = async e => { e.preventDefault(); setE2(''); try { await api('/master/' + entity, { method: 'POST', body: f }); setF({}); setMsg('Saved.'); setTick(t => t + 1); } catch (x) { setE2(x.message); } };
  const del = async id => { if (confirm('Delete this record?')) { try { await api(`/master/${entity}/${id}`, { method: 'DELETE' }); setTick(t => t + 1); } catch { setE2('Cannot delete: other records use it.'); } } };
  return <Card title={entity[0].toUpperCase() + entity.slice(1)}><form onSubmit={add} className="inline">{cols.map(c => <input key={c} required={c !== 'designation'} placeholder={c.replace(/_/g, ' ')} value={f[c] || ''} onChange={e => setF({ ...f, [c]: e.target.value })} />)}<button className="btn primary">Add</button></form>
    {(entity === 'students' || entity === 'faculty') && <small>A login is created automatically (default password: {entity === 'students' ? 'student123' : 'faculty123'}).</small>}{msg && <div className="ok">{msg}</div>}{(e2 || err) && <div className="err">{e2 || err}</div>}
    {!rows ? <p>Loading…</p> : !rows.length ? <Empty text="Nothing here yet. Add the first record above." /> : <div className="tw"><table><thead><tr><th>ID</th>{cols.map(c => <th key={c}>{c.replace(/_/g, ' ')}</th>)}<th /></tr></thead><tbody>{rows.map(r => <tr key={r[pk]}><td>{r[pk]}</td>{cols.map(c => <td key={c}>{String(r[c] ?? '')}</td>)}<td><button className="btn sm danger" onClick={() => del(r[pk])}>Delete</button></td></tr>)}</tbody></table></div>}</Card>;
}