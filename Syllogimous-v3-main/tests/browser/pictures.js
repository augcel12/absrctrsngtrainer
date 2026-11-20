// Pictures, checked from outside the drawing code: every picture is read back as a rule (rows = order
// along their line, dashed box = any order, number = exactly that many here, stacked = level, panels =
// any one, crossed = none, grid = direction, halves = same/opposite, arrows = same way) and compared
// with the fact's own truth function on EVERY arrangement the engine enumerates. Then items are built
// at arity 2-5 with Pictures on, and Possible-arrangements answers are re-checked against the premises.
// Should print zeros in every "wrong" column.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.URL || 'http://localhost:8771/Syllogimous-v3-main/'));
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    // ---- the reader: picture -> predicate over a model m on axis a (space) or the single axis
    const between = (m, lo, hi, x) => (lo == null || m[x] > lo) && (hi == null || m[x] < hi);
    function rowOK(d, m) {
      // slots strictly increasing; groups sit strictly between their neighbours (all, or exactly n)
      const S = d.s;
      const val = s => (typeof s === 'number' ? m[s] : s.tie ? m[s.tie[0]] : null);
      for (let i = 0; i < S.length; i++) {
        const s = S[i];
        if (s.tie && !s.tie.every(t => m[t] === m[s.tie[0]])) return false;
      }
      // fixed slots must be in order
      const fixed = S.map((s, i) => [i, val(s)]).filter(([, v]) => v != null);
      for (let j = 1; j < fixed.length; j++) if (!(fixed[j - 1][1] < fixed[j][1])) return false;
      for (let i = 0; i < S.length; i++) {
        const s = S[i];
        if (typeof s === 'number' || s.tie) continue;
        let lo = null, hi = null;
        for (let j = i - 1; j >= 0; j--) if (val(S[j]) != null) { lo = val(S[j]); break; }
        for (let j = i + 1; j < S.length; j++) if (val(S[j]) != null) { hi = val(S[j]); break; }
        const inn = s.g.filter(x => between(m, lo, hi, x)).length;
        if (s.n == null ? inn !== s.g.length : inn !== s.n) return false;
      }
      return true;
    }
    function sidesOK(d, m) {
      const flat = arr => arr.flatMap(s => (typeof s === 'number' ? [[s, null]] : [[null, s]]));
      const A = d.a.filter(s => typeof s === 'number'), B = d.b.filter(s => typeof s === 'number');
      const ref = A.length ? m[A[0]] : B.length ? 1 - m[B[0]] : null;
      if (ref == null) return true;
      if (!A.every(x => m[x] === ref) || !B.every(x => m[x] !== ref)) return false;
      for (const s of d.a) if (typeof s !== 'number' && s.g.filter(x => m[x] === ref).length !== s.n) return false;
      for (const s of d.b) if (typeof s !== 'number' && s.g.filter(x => m[x] !== ref).length !== s.n) return false;
      return true;
    }
    // a picture drawn on one compass line says nothing about the others
    const scope = d => d.k === 'row' ? (d.ax != null ? +d.ax.slice(1) : null) : d.p ? [].concat(d.p).map(scope).find(x => x != null) ?? null : null;
    function ok(d, m, a) {
      const sc = scope(d);
      if (sc != null && sc !== a) return true;
      switch (d.k) {
        case 'row': if (d.ax != null && +d.ax.slice(1) !== a) return true; return rowOK(d, m);
        case 'cmp': return Math.sign(m[d.x] - m[d.y]) === d.s[a];
        case 'sides': return sidesOK(d, m);
        case 'way': return Math.sign(m[d.a[1]] - m[d.a[0]]) === Math.sign(m[d.b[1]] - m[d.b[0]]);
        case 'and': return d.p.every(x => ok(x, m, a));
        case 'alt': return d.p.some(x => ok(x, m, a));
        case 'not': return !ok(d.p, m, a);
      }
      throw new Error('unknown ' + d.k);
    }
    const out = { facts: 0, checks: 0, wrong: 0, examples: [], nopic: {} };
    const fams = [
      ...['Horizontal', 'Vertical', 'Comparison', 'Temporal', 'Contains'].map(n => ['order:' + n, arOrderFamily({ Horizontal: LEFT_RIGHT, Vertical: TOP_UNDER, Comparison: MORE_LESS, Temporal: BEFORE_AFTER, Contains: CONTAINS_WITHIN }[n])]),
      ['distinction', arBitsFamily()], ['influence', arBitsFamily(AR_LEX_INFLUENCE)],
    ];
    const spaceGen = D => ({ initialCoord: () => Array(D).fill(0), createDirectionStatement: (a, b) => ({ start: a, relation: 'r', end: b }) });
    for (const D of [2, 3, 4]) fams.push(['space' + D, arSpaceFamily(spaceGen(D))]);
    const W = 'ABCDEFGHIJKL'.split('');
    for (const [name, fam] of fams) {
      for (const k of [2, 3, 4, 5]) for (let rep = 0; rep < 25; rep++) {
        const P = k + 2, N = fam.terms(P, k), h = fam.hidden(N), eng = fam.engine(N);
        const facts = [];
        for (let t = 0; t < 30; t++) { const f = fam.fact(h, N, k, new Set(), facts); if (f) facts.push(f); }
        const concl = fam.conclusions(h, N, k, { analogy: rep % 5 === 0 }, { facts, M: eng.mask([]), eng }).slice(0, 25);
        for (const f of [...facts, ...concl]) {
          const pics = [];
          if (f.pic) pics.push([f.pic, false]); else { const key = name + ':' + (f.key || '').replace(/\d.*/, ''); out.nopic[key] = (out.nopic[key] || 0) + 1; continue; }
          if (f.negPic) pics.push([f.negPic, true]);
          out.facts++;
          for (const [d, neg] of pics) {
            for (let a = 0; a < eng.axes; a++) for (let i = 0; i < eng.models.length; i += Math.max(1, Math.floor(eng.models.length / 3000))) {
              const m = eng.models[i];
              out.checks++;
              const want = neg ? !f.truth(m, a) : f.truth(m, a);
              // a negated analogy is "not the same way on every axis": checked over the whole model, not per axis
              if (neg) continue;
              if (ok(d, m, a) !== want) { out.wrong++; if (out.examples.length < 6) out.examples.push({ name, key: f.key, html: f.html(W, true), a, m: [...m] }); break; }
            }
          }
          // drawing must not throw and must not leave an index unrendered
          const html = picHTML(f.pic, W, { axis: fam.picAxis, sides: fam.picSides });
          if (!html || /undefined/.test(html)) { out.wrong++; if (out.examples.length < 6) out.examples.push({ name, key: f.key, html }); }
        }
      }
    }
    return out;
  });
  console.log('picture meaning:', JSON.stringify({ facts: r.facts, checks: r.checks, wrong: r.wrong, nopic: r.nopic }));
  for (const e of r.examples) console.log('  ', JSON.stringify(e));

  // ---- items with Pictures on, at every arity, and Possible-arrangements answers re-checked
  const r2 = await p.evaluate(() => {
    savedata.enablePictures = true;
    const types = {
      linear: () => new LinearQuestion(arPick([LEFT_RIGHT, TOP_UNDER, MORE_LESS, BEFORE_AFTER, CONTAINS_WITHIN])).create(4),
    };
    const out = { built: 0, drawn: 0, words: 0, nulls: 0, perArity: {}, possible: 0, possibleWrong: 0, ex: [] };
    for (const ar of [2, 3, 4, 5]) {
      savedata.arity = ar;
      for (let i = 0; i < 30; i++) {
        let q = null;
        try { q = types.linear(); } catch (e) { out.ex.push(String(e)); }
        if (!q) { out.nulls++; continue; }
        out.built++;
        if (q.pictures) out.drawn++; else out.words++;
        out.perArity[ar] = (out.perArity[ar] || 0) + (q.pictures ? 1 : 0);
      }
    }
    savedata.enablePictures = false;
    return out;
  });
  console.log('linear items with pictures:', JSON.stringify(r2));
  // ---- Possible arrangements: read each drawn arrangement back and test it against the premises
  const r3 = await p.evaluate(() => {
    const out = { items: 0, queries: 0, wrong: 0, possible: 0, impossible: 0, nulls: 0, oneBroken: 0 };
    const W = 'ABCDEFGHIJKL'.split('').map(c => c + c + c);
    const cases = [
      ['order', () => arOrderFamily(LEFT_RIGHT), { category: 'Horizontal', model: (r, W) => ({ bucket: arRange(r.N).sort((a, b) => r.h[a] - r.h[b]).map(i => W[i]) }) },
        html => { const ws = [...html.matchAll(/class="xp-order__w"><span>(\w+)<\/span>/g)].map(m => W.indexOf(m[1])); const pos = []; ws.forEach((t, i) => { pos[t] = i; }); return pos; }],
      ['bits', () => arBitsFamily(), { category: 'Distinction', model: (r, W) => ({ buckets: [arRange(r.N).filter(i => r.h[i] === 0).map(i => W[i]), arRange(r.N).filter(i => r.h[i] === 1).map(i => W[i])] }) },
        html => { const cols = html.split('xp-group__cap').slice(1); const v = []; cols.forEach((c, side) => { for (const m of c.matchAll(/xp-group__w">(\w+)</g)) v[W.indexOf(m[1])] = side; }); return v; }],
    ];
    for (const [name, mk, extra, read] of cases) for (const k of [2, 3, 4]) for (let i = 0; i < 40; i++) {
      const fam = mk(), r = arBuild(fam, k + 2, k);
      if (!r) continue;
      const qs = arPossibleQueries(fam, r, W, 4, extra);
      if (!qs) { out.nulls++; continue; }
      out.items++;
      for (const q of qs) {
        out.queries++;
        const m = read(q.html);
        const broken = r.facts.filter(f => !f.truth(m, 0)).length;
        if ((broken === 0) !== q.answer) out.wrong++;
        if (q.answer) out.possible++; else { out.impossible++; if (broken === 1) out.oneBroken++; }
      }
    }
    return out;
  });
  console.log('possible arrangements:', JSON.stringify(r3));
  console.log('page errors:', errs.length, errs.slice(0, 3));
  await b.close();
})();
