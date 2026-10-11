/* Language check + rating verification.
   Word lists live in ./data/*.txt and are re-read automatically when the files change (no restart needed). */
const fs = require('fs'), path = require('path');
const FILES = { blocked: path.join(__dirname, 'data', 'blocked_words.txt'), warn: path.join(__dirname, 'data', 'warning_words.txt') };
const cache = { stamp: '', blocked: [], warn: [] };
const LEET = { '@': 'a', '$': 's', '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '+': 't' };
const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])';
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function pattern(phrase) { // tolerant of repeated letters (fuuuck), symbols for vowels (f*ck) and spaced letters (f u c k)
  const words = phrase.split(/\s+/).map(w => {
    if (/[^\u0000-\u024f]/.test(w)) return esc(w); // non-Latin script (e.g. Devanagari): exact word
    const parts = [...w].map(ch => /[aeiou]/.test(ch) ? `(?:${ch}|[*#@])+` : `${esc(ch)}+`);
    return parts.join(w.length >= 4 ? '[\\s\\-_.]?' : '');
  });
  return new RegExp(B + words.join('\\s+') + E, 'iu');
}
function readList(file, withHints) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => {
    const [w, hint] = l.split('=>').map(x => x.trim()); return { word: w.toLowerCase(), hint: withHints ? hint : undefined, re: pattern(w.toLowerCase()) }; });
}
function rules() {
  try { const stamp = Object.values(FILES).map(f => fs.statSync(f).mtimeMs).join('|');
    if (stamp !== cache.stamp) { cache.blocked = readList(FILES.blocked); cache.warn = readList(FILES.warn, true); cache.stamp = stamp; } }
  catch (e) { console.error('Word list problem:', e.message); }
  return cache;
}
function normalise(text) { // map symbols used to disguise words (sh1t, a$$hole), token by token so plain numbers stay untouched
  return String(text).normalize('NFKC').toLowerCase().split(/(\s+)/).map(t => /[a-z]/.test(t) ? t.replace(/[@$0!1345+7]/g, c => LEET[c]) : t).join('');
}
function looksInvalid(text) {
  const t = text.trim(), letters = (t.match(/\p{L}/gu) || []).length;
  if (letters < 2) return 'Please write a meaningful answer (at least a word).';
  if (/(https?:\/\/|www\.|[\w.-]+@[\w-]+\.\w+|\b\d{10}\b)/i.test(t)) return 'Links, e-mail addresses and phone numbers are not allowed.';
  if (/(.)\1{5,}/u.test(t.replace(/\s/g, ''))) return 'This looks like random characters. Please write a real answer.';
  const toks = t.toLowerCase().split(/[^\p{L}\p{M}]+/u).filter(Boolean), latin = toks.filter(w => /^[a-z]+$/.test(w));
  const mash = w => /(asdf|qwer|zxcv|hjkl|sdfg|dfgh|wasd|qaz|wsx)/.test(w) || (w.length >= 5 && !/[aeiouy]/.test(w));
  if (latin.length && latin.filter(mash).length / latin.length >= 0.5) return 'This looks like random typing. Please write a real answer.';
  if (toks.length >= 5 && new Set(toks).size === 1) return 'The same word repeated is not a valid answer.';
  return null;
}
/* A = valid, C = warn (inappropriate wording, must be reworded), B = blocked (offensive or invalid, discarded) */
function classify(text) {
  const raw = String(text || ''), r = rules(), n = normalise(raw);
  const bad = r.blocked.filter(x => x.re.test(n)).map(x => x.word);
  if (bad.length) return { level: 'blocked', kind: 'offensive', words: [...new Set(bad)].map(w => ({ word: w })), message: 'This answer contains offensive language and cannot be submitted.' };
  const inv = looksInvalid(raw);
  if (inv) return { level: 'blocked', kind: 'invalid', words: [], message: inv };
  const w = r.warn.filter(x => x.re.test(n));
  if (w.length) return { level: 'warn', kind: 'tone', words: w.map(x => ({ word: x.word, suggestion: x.hint })), message: "Some words don't match the language used in this system. Please reword your answer politely." };
  return { level: 'valid', kind: 'ok', words: [], message: 'Looks good.' };
}

/* ---------- rating verification: does the star rating agree with what the person wrote? ---------- */
const POS = 'good great excellent amazing awesome best helpful clear clean nice friendly supportive engaging interesting informative love loved perfect wonderful fantastic satisfied happy useful easy understandable knowledgeable patient respectful inspiring organized organised punctual brilliant superb outstanding polite accha achha badhiya mast shandar'.split(' ');
const NEG = 'bad worst poor terrible awful boring useless waste horrible hate hated rude slow dirty unclean confusing confused unhelpful careless disappointing disappointed unfair irregular unprofessional pathetic worse bekar bakwas ganda kharab'.split(' ');
const NOT = new Set(['not', 'no', 'never', 'isnt', "isn't", 'dont', "don't", 'didnt', "didn't", 'wasnt', "wasn't", 'cant', "can't", 'hardly', 'nahi', 'nahin']);
/* extra sentiment words (any language) from data/sentiment_words.txt, re-read when the file changes */
const LEXF = path.join(__dirname, 'data', 'sentiment_words.txt'), lexCache = { stamp: '', pos: new Set(POS), neg: new Set(NEG), not: new Set(NOT) };
function lex() {
  try { const st = String(fs.statSync(LEXF).mtimeMs);
    if (st !== lexCache.stamp) { const pos = new Set(POS), neg = new Set(NEG), not = new Set(NOT);
      for (const l of fs.readFileSync(LEXF, 'utf8').split(/\r?\n/)) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const w = t.slice(1).trim().toLowerCase().normalize('NFC'); if (!w) continue; if (t[0] === '+') pos.add(w); else if (t[0] === '-') neg.add(w); else if (t[0] === '!') not.add(w); }
      Object.assign(lexCache, { stamp: st, pos, neg, not }); } } catch (e) { /* file missing: built-in English list only */ }
  return lexCache;
}
function sentiment(text) {
  const L = lex(), toks = String(text).toLowerCase().normalize('NFC').split(/[^\p{L}\p{M}']+/u).filter(Boolean); let pos = 0, neg = 0;
  toks.forEach((w, i) => { const p = L.pos.has(w), n = L.neg.has(w); if (!p && !n) return; const flip = L.not.has(toks[i - 1]) || L.not.has(toks[i - 2]);
    if (p !== flip && p) pos++; else if (n !== flip && n) neg++; else if (flip && p) neg++; else if (flip && n) pos++; });
  return { pos, neg, score: pos + neg ? (pos - neg) / (pos + neg) : 0 };
}
const r1 = x => Math.round(x * 10) / 10;
/* rows: { feedback_id, t, s, f, qt, answer } -> one entry per submission */
function analyse(rows) {
  const subs = new Map();
  for (const r of rows) { const k = [r.feedback_id, r.t, r.s, r.f].join('|'); const o = subs.get(k) || { fid: r.feedback_id, ratings: [], texts: [] }; subs.set(k, o);
    if (r.qt === 'Rating') { const v = Number(r.answer); if (v >= 1 && v <= 5) o.ratings.push(v); } else if (r.qt === 'Text') o.texts.push(r.answer || ''); }
  const out = [];
  for (const o of subs.values()) { if (!o.ratings.length) continue;
    const avg = o.ratings.reduce((a, b) => a + b, 0) / o.ratings.length, text = o.texts.join(' '), s = sentiment(text); let weight = 1, flag = null;
    if ((avg >= 4 && s.score <= -0.5) || (avg <= 2 && s.score >= 0.5)) { weight = 0; flag = 'conflict'; }
    else if (o.ratings.length >= 3 && new Set(o.ratings).size === 1 && text.trim().split(/\s+/).filter(Boolean).length < 3) { weight = 0.5; flag = 'low-effort'; }
    out.push({ fid: o.fid, avg, weight, flag, unknown: text.trim().length > 0 && !s.pos && !s.neg }); }
  return out;
}
function summary(list) {
  const n = list.length; if (!n) return { n: 0, raw: null, verified: null, flagged: 0 };
  const raw = list.reduce((a, x) => a + x.avg, 0) / n, w = list.reduce((a, x) => a + x.weight, 0);
  return { n, raw: r1(raw), verified: w ? r1(list.reduce((a, x) => a + x.avg * x.weight, 0) / w) : null, flagged: list.filter(x => x.flag).length, unverified: list.filter(x => x.unknown).length };
}
module.exports = { classify, analyse, summary, sentiment };
