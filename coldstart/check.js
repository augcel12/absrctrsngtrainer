// Independent checks of the engine. Everything is re-derived by brute force from the definitions.
require('./engine.js');
const E = globalThis.CSE;
const brute = (W, facts) => { const n = W.S.n, out = []; for (let m = 0; m < W.P.length / n; m++) if (facts.every(f => E.val(W, f, W.P, m * n))) out.push(m); return out; };
let bad = [];
for (const held of [false, true]) for (let L = 1; L <= 12; L++) {
  const P = E.params(L, false); let t0 = Date.now();
  const st = { worlds: 0, shapes: new Set(), boards: 0, crackFail: 0, M: [], redundant: 0, unmentioned: 0, short: 0, claimWrong: 0, single: 0, pair: 0, claims: 0, open: 0, heldRel: 0, ms: 0 };
  const NW = L >= 11 ? 3 : 6;
  for (let w = 0; w < NW; w++) {
    const W = E.makeWorld(P, held); st.worlds++; st.shapes.add(W.S.name); st.boards += W.crack.boards.length;
    if (!held && (W.S.held || W.rels.some(r => r.lib[3]))) bad.push('held material in training L' + L);
    if (held && !W.S.held) bad.push('probe on a training shape');
    if (W.rels.some(r => r.lib[3])) st.heldRel++;
    if (!W.rels.some(r => r.k === P.k)) bad.push('no relation at arity ' + P.k);
    // crack: every rival reading must be contradicted by some shown mark
    W.rels.forEach((r, ri) => { for (const p of E.LIB) if (p[1] === r.k) for (const pi of E.argPerms(r.k)) {
      const T = E.tuples(W.S.n, r.k); if (T.every(t => p[2](W.S, ...pi.map(j => t[j])) === r.f(W.S, ...t))) continue;
      const hit = W.crack.boards.some(b => b.items.some(it => it.r === ri && p[2](W.S, ...pi.map(j => b.place[it.a[j]])) !== it.v));
      if (!hit) st.crackFail++; } });
    W.crack.boards.forEach(b => b.items.forEach(it => { if (E.val(W, it, b.place, 0) !== it.v) bad.push('crack mark wrong'); }));
    for (const judge of [false, true]) for (let i = 0; i < 4; i++) {
      const R = E.genRound(W, P.F, judge ? { t: 3, max: 10, min: 2 } : { t: 1, max: 6, min: 1 });
      if (!R) { bad.push('no round L' + L); continue; }
      const n = W.S.n; if (!R.facts.every(f => E.val(W, f, W.P, R.h * n))) bad.push('fact false of h');
      const M = brute(W, R.facts); if (M.join() !== R.M.join()) bad.push('model set mismatch');
      st.M.push(M.length); if (R.facts.length < P.F) st.short++;
      if (new Set(R.facts.flatMap(f => f.a)).size < n) st.unmentioned++;
      if (R.facts.some((_, k) => brute(W, R.facts.filter((_, j) => j !== k)).length === M.length)) st.redundant++;
      if (!E.sat(W, R.facts, E.placeOf(W, R.h)).every(Boolean)) bad.push('h fails grading');
      if (judge) for (const c of E.genClaims(W, R, 3)) {
        st.claims++; const t = M.filter(m => E.val(W, c.f, W.P, m * n)).length, s = t === M.length ? 1 : t === 0 ? 0 : -1;
        if (s !== c.st) st.claimWrong++; if (s === -1) st.open++;
        if (s !== -1) { const dec = fs => { const m = brute(W, fs), q = m.filter(x => E.val(W, c.f, W.P, x * n)).length; return q === 0 || q === m.length; };
          if (R.facts.some(f => dec([f]))) st.single++; else if (R.facts.some((f, a) => R.facts.some((g, b) => b > a && dec([f, g])))) st.pair++; }
      }
      const D = E.disguise(W, R); if (D.M.length !== M.length) bad.push('disguise changed the structure');
    }
    const pi = E.genOp(W, 3); if (new Set(pi).size !== W.S.n || pi.every((v, i) => v === i)) bad.push('bad op');
    const before = W.rels.map(r => r.glyph + ':' + r.neg + ':' + r.ord.join('')).join(), sh = E.shift(W);
    if (before === W.rels.map(r => r.glyph + ':' + r.neg + ':' + r.ord.join('')).join()) bad.push('shift did nothing ' + sh.t);
    const R2 = E.genRound(W, P.F + 1, { t: 1, max: 1, min: 1, bias: [sh.i] }); if (!R2 || brute(W, R2.facts).join() !== R2.M.join()) bad.push('post-shift round wrong');
    E.knownClaims(W, E.placeOf(W, R2.h), 4).forEach(c => { if ((E.val(W, c.f, E.placeOf(W, R2.h), 0) ? 1 : 0) !== c.st) bad.push('known claim wrong'); });
  }
  st.ms = Math.round((Date.now() - t0) / NW);
  const m = st.M.sort((a, b) => a - b);
  const row = (`${held ? 'probe' : 'train'} L${L} k${P.k} n${P.n} F${P.F} | shapes ${[...st.shapes].join('/')} | boards ${(st.boards / st.worlds).toFixed(1)} crackFail ${st.crackFail} | M med ${m[m.length >> 1]} max ${m[m.length - 1]} | redundant ${st.redundant} unment ${st.unmentioned} short ${st.short} | claims ${st.claims} wrong ${st.claimWrong} single ${st.single} pair ${st.pair} open ${st.open} | heldRel ${st.heldRel}/${st.worlds} | ${st.ms}ms`); console.log(row.replace(/ \| shapes [^|]*/, "").replace("crackFail", "cf").replace("redundant","red").replace("heldRel","hr"));
}
console.log('BAD', [...new Set(bad)]);
