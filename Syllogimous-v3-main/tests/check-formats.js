// check-formats.js — verifies the generative formats.
//   1. The evaluator (fmtStatus / fmtConsistent) is compared with an independent brute force
//      that enumerates every model, on thousands of random small premise sets per family.
//   2. Generated items are checked: premise count, the keyed answer, that the generator's own
//      answer is accepted, that trivial answers are rejected, and that the rendered premises
//      (with negation and reversal) read back as exactly the premises the engine used.
// usage (from the repo root):  node tests/check-formats.js . 200
const fs = require('fs'), vm = require('vm');
const ROOT = process.argv[2] || '.';
const N = +process.argv[3] || 150;
const files = ['js/constants.js','js/generators/utils.js','js/generators/junk-emojis.js','js/generators/direction-pair-chooser.js',
 'js/generators/direction.js','js/generators/meta.js','js/generators/distinction.js','js/generators/extra-relations.js',
 'js/generators/linear.js','js/generators/banned.js','js/generators/stimuli.js','js/generators/premise-html.js',
 'js/generators/premise-reorder.js','js/generators/formats.js'];
const ctx = {console, Math, Date, JSON, structuredClone, Set, Map, Object, Array, Error, Number, String, document:{}, window:{}};
vm.createContext(ctx);
let src = files.map(f => fs.readFileSync(ROOT + '/' + f, 'utf8')).join('\n;\n');
src = src.replace(/^const /gm, 'var ').replace(/^let /gm, 'var ').replace(/^class (\w+)/gm, 'var $1 = class $1');
vm.runInContext(src, ctx);
const C = ctx;
function fail(msg, obj) { console.log('FAIL:', msg); console.log(JSON.stringify(obj, null, 1).slice(0, 4000)); process.exit(1); }
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];

// ---------------------------------------------------------------- 1. evaluator vs brute force
function* product(domain, n) { const idx = Array(n).fill(0); const total = domain.length ** n;
  for (let t = 0; t < total; t++) { let x = t; for (let i = 0; i < n; i++) { idx[i] = x % domain.length; x = Math.floor(x / domain.length); } yield idx.map(i => domain[i]); } }
function perms(a) { if (a.length <= 1) return [a]; return a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])); }

function holds(fam, s, m) {
  s = C.fmtCanon(fam, s);
  switch (fam.kind) {
    case 'parity': return (m[s.a] ^ m[s.b]) === s.rel;
    case 'contexts': return (m[s.ctx || '_'][s.a] ^ m[s.ctx || '_'][s.b]) === s.rel;
    case 'order': return m[s.a] < m[s.b];
    case 'require': return !m[s.a] || m[s.b];
    case 'vector': { const v = s.rel.split(',').map(Number); return m[s.a].every((x, i) => x - m[s.b][i] === v[i]); }
    case 'ratio': return Math.abs(s.p * m[s.a] - s.q * m[s.b]) < 1e-9 * Math.max(m[s.a], m[s.b]);
  }
}
function queryHolds(fam, q, m) {
  if (fam.kind === 'vector') { q = C.fmtCanon(fam, q); const v = q.rel.split(',').map(Number); return m[q.a].every((x, i) => Math.sign(x - m[q.b][i]) === v[i]); }
  return holds(fam, q, m);
}
function models(fam, words, contexts) {
  const n = words.length, out = [];
  const asObj = vals => Object.fromEntries(words.map((w, i) => [w, vals[i]]));
  if (fam.kind === 'parity' || fam.kind === 'require') for (const v of product([0, 1], n)) out.push(asObj(v));
  if (fam.kind === 'order') for (const p of perms([...Array(n).keys()])) out.push(asObj(p));
  if (fam.kind === 'contexts') for (const v1 of product([0, 1], n)) for (const v2 of product([0, 1], n))
    out.push({ [contexts[0]]: asObj(v1), [contexts[1]]: asObj(v2) });
  if (fam.kind === 'vector') {
    const r = fam.dim === 2 ? 3 : 2, axis = []; for (let i = -r; i <= r; i++) axis.push(i);
    const pts = [...product(axis, fam.dim)];
    for (const rest of product(pts, n - 1)) out.push(asObj([Array(fam.dim).fill(0), ...rest]));
  }
  if (fam.kind === 'ratio') {
    const ws = []; for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) ws.push(2 ** i * 3 ** j);
    for (const rest of product(ws, n - 1)) out.push(asObj([1, ...rest]));
  }
  return out;
}
function randomStmt(fam, words, contexts) {
  let a = pick(words), b = pick(words.filter(w => w !== a));
  if (fam.kind === 'ratio') return { a, b, p: pick([1, 2, 3]), q: pick([1, 2, 3]) };
  const s = { a, b, rel: pick(fam.rels).key };
  if (fam.kind === 'contexts' && Math.random() < 0.6) s.ctx = pick(contexts);
  return s;
}
function brute(fam, stmts, q, words, contexts) {
  const ms = models(fam, words, contexts).filter(m => {
    if (fam.kind !== 'contexts') return stmts.every(s => holds(fam, s, m));
    // a statement without ctx holds in both contexts
    return stmts.every(s => s.ctx ? holds(fam, s, m) : contexts.every(c => holds(fam, { ...s, ctx: c }, m)));
  });
  if (!ms.length) return 'inconsistent';
  const qh = m => fam.kind === 'contexts' ? holds(fam, q, m) : queryHolds(fam, q, m);
  const t = ms.filter(qh).length;
  return t === ms.length ? 'necessary' : t === 0 ? 'impossible' : 'possible';
}
const fams = C.fmtAllFamilies();
for (const fam of fams) {
  const sizes = { parity: [3, 4, 5], contexts: [3, 4], order: [3, 4, 5], require: [3, 4, 5], vector: fam.dim === 2 ? [3, 4] : [3], ratio: [3] }[fam.kind];
  const tests = fam.kind === 'vector' ? 120 : 600;
  let count = 0;
  for (let t = 0; t < tests; t++) {
    const n = pick(sizes), words = 'ABCDEFG'.slice(0, n).split(''), contexts = ['X', 'Y'];
    const stmts = Array.from({ length: 1 + rnd(n) }, () => randomStmt(fam, words, contexts));
    let q = randomStmt(fam, words, contexts);
    if (fam.kind === 'contexts') q.ctx = pick(contexts);
    const e = C.fmtStatus(fam, stmts, q), bf = brute(fam, stmts, q, words, contexts);
    if (e !== bf) fail(`evaluator disagrees with brute force (${fam.id}): engine ${e}, brute ${bf}`, { stmts, q });
    count++;
  }
  console.log('evaluator ok:', fam.id.padEnd(18), count, 'random premise sets');
}

// free-response vocabulary: every relation parses back to itself and no two collide
for (const fam of fams) {
  const norms = fam.rels.map(r => C.fmtNormalizeRelation(r.text));
  if (new Set(norms).size !== norms.length) fail('vocabulary collision in ' + fam.id, norms);
  for (const r of fam.rels) { const s = C.fmtParseRelation(fam, r.text, 'A', 'B'); if (!s || s.rel !== r.key) fail('parse ' + r.text, s); }
}
console.log('vocabulary ok');

// ---------------------------------------------------------------- 2. generated items
const subj = h => [...h.matchAll(/<span class="subject">(.*?)<\/span>/g)].map(m => m[1]);
function parsePremise(fam, html) {
  let ctxName;
  const m = html.match(/^<span class="is-connector">Under<\/span> <span class="subject">(.*?)<\/span>: /);
  if (m) { ctxName = m[1]; html = html.slice(m[0].length); }
  const s = subj(html);
  if (fam.kind === 'ratio') { const t = html.replace(/<[^>]+>/g, '').trim().split(/\s+/); return { a: s[0], b: s[1], p: +t[0], q: +t[3] }; }
  const neg = /is-negated/.test(html);
  const text = html.match(/<span class="relation">(?:<span class="is-negated">)?(.*?)<\/span>/)[1];
  const r = fam.rels.find(x => x.text === text); if (!r) fail('unknown relation text ' + text, html);
  let st = { a: s[0], b: s[1], rel: r.key };
  if (neg) {
    if (fam.kind === 'parity' || fam.kind === 'contexts') st.rel = 1 - st.rel;
    else if (fam.kind === 'vector') st.rel = C.fmtVecNeg(st.rel);
    else st.rel = st.rel === 'fwd' ? 'bwd' : 'fwd';
  }
  if (ctxName) st.ctx = ctxName;
  return st;
}
function checkRendering(fam, item) {
  const shown = item.premises.filter(p => !/negation-explainer/.test(p)).map(p => parsePremise(fam, p));
  if (shown.length !== item.stmts.length) fail('rendered count', item);
  for (const s of item.stmts) if (!shown.some(t => C.fmtSameClaim(fam, s, t))) fail('premise rendered wrongly: ' + JSON.stringify(s), { shown, item });
}
const stats = {};
const settings = [{}, { enableNegation: true }, { enableNegation: true, scrambleFactor: 100 }];
for (const cfg of settings) {
  Object.assign(C.savedata, { enableNegation: false, scrambleFactor: 80, minimalMode: false, enableConnectionBranching: true }, cfg);
  for (const fam of fams) for (const format of Object.keys(C.FMT_MAKERS)) {
    if (!C.fmtSupports(format, fam)) continue;
    for (let L = 2; L <= 10; L++) for (let i = 0; i < Math.ceil(N / 9); i++) {
      const item = C.FMT_MAKERS[format](fam, L);
      const key = format + ' ' + fam.id; stats[key] = stats[key] || { made: 0, tried: 0, keys: {} }; stats[key].tried++;
      if (!item) continue;
      stats[key].made++;
      const expectCount = fam.kind === 'contexts' ? Math.max(3, L) : format === 'repair' ? Math.max(3, L) : L;
      if (item.stmts.length !== expectCount) fail(`premise count ${item.stmts.length} != ${expectCount}`, item);
      if (!C.fmtConsistent(fam, item.stmts) && format !== 'repair') fail('shown premises inconsistent', item);
      checkRendering(fam, item);
      if (format === 'judge') {
        const st = C.fmtStatus(fam, item.stmts, item.target);
        if (st !== item.answerKey) fail('judge key', item);
        if (!C.fmtCheckJudge(item, item.answerKey).correct) fail('judge check', item);
        stats[key].keys[st] = (stats[key].keys[st] || 0) + 1;
      }
      if (format === 'name') {
        const t = C.fmtTrueRelation(fam, item.stmts, item.a, item.b, item.ctx);
        if (JSON.stringify(t) !== JSON.stringify(item.answer)) fail('name answer', item);
        if (t && !C.fmtCheckName(item, t).correct) fail('name accepts truth', item);
        if (t && C.fmtCheckName(item, 'cant').correct) fail('name accepts cant when determined', item);
        if (!t && !C.fmtCheckName(item, 'cant').correct) fail('name rejects cant', item);
        if (t && fam.kind !== 'ratio') for (const r of fam.rels) {             // exactly one relation is right
          const ok = C.fmtCheckName(item, { a: item.a, b: item.b, rel: r.key, ...(item.ctx && { ctx: item.ctx }) }).correct;
          if (ok !== C.fmtSameClaim(fam, { a: item.a, b: item.b, rel: r.key, ...(item.ctx && { ctx: item.ctx }) }, t)) fail('name relation check', item);
        }
        stats[key].keys[t ? 'determined' : 'cant'] = (stats[key].keys[t ? 'determined' : 'cant'] || 0) + 1;
      }
      if (format === 'build' || format === 'missing') {
        const ex = item.isValid.slice(5);
        const removedOk = format === 'build' ? C.fmtCheckBuild : C.fmtCheckMissing;
        // reconstruct the generator's removed premise from every candidate and confirm one is accepted
        let accepted = 0, total = 0;
        for (const a of item.words) for (const b of item.words) {
          if (a === b) continue;
          const cands = fam.kind === 'ratio' ? [[1,1],[1,2],[2,1],[1,3],[3,1],[2,3],[3,2]].map(([p,q]) => ({a,b,p,q})) : fam.rels.map(r => ({ a, b, rel: r.key }));
          for (const s of cands) {
            const r = removedOk(item, s); if (r.error) continue; total++;
            if (r.correct) {
              accepted++;
              // independent confirmation: adding it really forces the target / facts
              const all = [...item.stmts, s];
              const goals = format === 'build' ? [item.target] : item.observations;
              if (!goals.every(g => C.fmtStatus(fam, all, g) === 'necessary')) fail('accepted answer does not force goal', { item, s });
            }
          }
        }
        if (!accepted) fail('no accepted answer exists (' + ex + ')', item);
        if (format === 'build' && C.fmtStatus(fam, item.stmts, item.target) === 'necessary') fail('build target already forced', item);
        if (format === 'build' && !C.fmtCheckBuild(item, item.target).error) fail('build accepts the target itself', item);
        if (format === 'missing' && item.observations.some(o => C.fmtStatus(fam, item.stmts, o) === 'necessary')) fail('fact already forced', item);
        stats[key].keys.acceptRate = ((stats[key].keys.acceptRate || 0) + accepted / total);
      }
      if (format === 'repair') {
        if (C.fmtConsistent(fam, item.stmts)) fail('repair premises are consistent', item);
        let fixes = 0;
        for (const p of item.stmts) {
          const cands = fam.kind === 'ratio' ? [[1,1],[1,2],[2,1],[1,3],[3,1],[2,3],[3,2],[1,4],[4,1],[1,6],[6,1],[1,9],[9,1]].map(([x,y]) => ({a:p.a,b:p.b,p:x,q:y})) : fam.rels.map(r => ({ a: p.a, b: p.b, rel: r.key }));
          const rest = item.stmts.filter(x => x !== p);
          const implied = C.fmtTrueRelation(fam, rest, p.a, p.b);
          if (implied && fam.kind === 'vector') cands.push({ a: p.a, b: p.b, rel: implied.rel });
          if (implied && fam.kind === 'ratio') cands.push(implied);
          for (const s of cands) { const r = C.fmtCheckRepair(item, s); if (!r.error && r.correct) fixes++; }
        }
        if (!fixes) fail('repair has no fix', item);
      }
    }
  }
}
for (const [k, v] of Object.entries(stats)) {
  const keys = Object.entries(v.keys).map(([a, b]) => a === 'acceptRate' ? `accepted ${(b / v.made * 100).toFixed(0)}% of candidate answers` : `${a} ${b}`).join(', ');
  console.log(k.padEnd(30), `made ${v.made}/${v.tried}`, keys);
}
console.log('ALL FORMAT CHECKS PASSED');
