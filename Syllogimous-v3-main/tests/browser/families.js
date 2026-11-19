// Difference, Intervals and Perspective, checked from outside their own code.
//
//  wording   every premise and conclusion shape (negation on and off) is rendered, read back by a reader
//            written from the English, and compared with the fact's own meaning on random arrangements
//  answers   items built at arity 2-5: the answer re-derived independently — exact rational elimination
//            for Difference, every endpoint order for Intervals, every arrangement (positions on both
//            axes together with every way of facing) for Perspective up to four terms and a per-heading
//            search without bitsets at five — plus: the hidden arrangement satisfies every premise, the
//            support holds a top-arity premise, and no single premise settles the conclusion
// Should print zeros in every "wrong" column.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.URL || 'http://localhost:8771/Syllogimous-v3-main/'));
  await p.waitForTimeout(400);
  const REPS = +(process.argv[2] || 5);
  const r = await p.evaluate((REPS) => {
    const out = {};
    const plainText = h => h.replace(/<span class="is-negated">(.*?)<\/span>/g, '[$1]').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const W = 'ABCDEFGHIJKL'.split('').map(c => c + c + c);
    const T = w => W.indexOf(w);
    const listOf = s => s.replace(/ together$/, '').split(/, | and /).map(T);

    // ---------------- readers: English -> meaning, written without the generators' code
    // Difference: returns a function of the values
    function readDiff(t) {
      let m;
      const side = s => listOf(s.trim());
      const sum = (v, xs) => xs.reduce((a, i) => a + v[i], 0);
      if ((m = t.match(/^(\w+) (\[?)is (not )?halfway between(\]?) (\w+) and (\w+)$/))) {
        const neg = !!m[3], red = !!m[2];
        const [a, b2, c] = [T(m[1]), T(m[5]), T(m[6])];
        return v => ((2 * v[a] === v[b2] + v[c]) !== neg) !== red;
      }
      if ((m = t.match(/^(\w+) (\[?)is as much (more|less) than(\]?) (\w+) as (\w+) is more than (\w+)$/))) {
        let more = m[3] === 'more'; if (m[2]) more = !more;
        const [a, b2, c, d] = [T(m[1]), T(m[5]), T(m[6]), T(m[7])];
        return v => more ? (v[a] - v[b2] === v[c] - v[d] && v[c] > v[d]) : (v[b2] - v[a] === v[c] - v[d] && v[c] > v[d]);
      }
      if ((m = t.match(/^(.+?) (\[?)(?:is|are) (\d+) (more|less) than(\]?) (.+)$/))) {
        let more = m[4] === 'more'; if (m[2]) more = !more;
        const L = side(m[1]), R = side(m[6]), d = +m[3];
        return v => sum(v, L) - sum(v, R) === (more ? d : -d);
      }
      if ((m = t.match(/^(.+?) (\[?)(equals|equal|does not equal|do not equal)(\]?) (.+)$/))) {
        let eq = !/not/.test(m[3]); if (m[2]) eq = !eq;
        const L = side(m[1]), R = side(m[5]);
        return v => (sum(v, L) === sum(v, R)) === eq;
      }
      return null;
    }
    // Intervals: returns a function of {s, e}
    function readIv(t) {
      let m;
      const S = (q, i) => q.s[i], E = (q, i) => q.e[i];
      const ov = (q, x, y) => S(q, x) < E(q, y) && S(q, y) < E(q, x);
      const btw = (q, a, b2, c) => (E(q, b2) < S(q, a) && E(q, a) < S(q, c)) || (E(q, c) < S(q, a) && E(q, a) < S(q, b2));
      const basic = {
        'is wholly before': (q, x, y) => E(q, x) < S(q, y), 'is wholly after': (q, x, y) => E(q, y) < S(q, x),
        'overlaps the start of': (q, x, y) => S(q, x) < S(q, y) && S(q, y) < E(q, x) && E(q, x) < E(q, y),
        'overlaps the end of': (q, x, y) => S(q, y) < S(q, x) && S(q, x) < E(q, y) && E(q, y) < E(q, x),
        'lies within': (q, x, y) => S(q, y) < S(q, x) && E(q, x) < E(q, y), 'covers all of': (q, x, y) => S(q, x) < S(q, y) && E(q, y) < E(q, x),
      };
      for (const [k, f] of Object.entries(basic)) {
        if ((m = t.match(new RegExp(`^(\\w+) ${k} (\\w+)$`)))) { const [x, y] = [T(m[1]), T(m[2])]; return q => f(q, x, y); }
      }
      if ((m = t.match(/^(\w+) (\[?)(starts|ends) (before|after)(\]?) (\w+) (starts|ends)$/))) {
        let before = m[4] === 'before'; if (m[2]) before = !before;
        const P = m[3] === 'starts' ? S : E, x = T(m[1]), y = T(m[6]);
        return q => before ? P(q, x) < P(q, y) : P(q, x) > P(q, y);
      }
      if ((m = t.match(/^(\w+) and (\w+) (\[?)(overlap|do not overlap)(\]?)$/))) {
        let yes = m[4] === 'overlap'; if (m[3]) yes = !yes;
        const [x, y] = [T(m[1]), T(m[2])];
        return q => ov(q, x, y) === yes;
      }
      if ((m = t.match(/^(\w+) (\[?)(comes between|does not come between)(\]?) (\w+) and (\w+)$/))) {
        let yes = m[3] === 'comes between'; if (m[2]) yes = !yes;
        const [a, b2, c] = [T(m[1]), T(m[5]), T(m[6])];
        return q => btw(q, a, b2, c) === yes;
      }
      if ((m = t.match(/^(\w+) overlaps (\w+) or (\w+)$/))) { const [a, b2, c] = [T(m[1]), T(m[2]), T(m[3])]; return q => ov(q, a, b2) || ov(q, a, c); }
      if ((m = t.match(/^(\w+) \[overlaps neither\] (\w+) nor (\w+)$/))) { const [a, b2, c] = [T(m[1]), T(m[2]), T(m[3])]; return q => ov(q, a, b2) || ov(q, a, c); }
      if ((m = t.match(/^(\w+) lies within (\w+) or (\w+)$/))) { const [a, b2, c] = [T(m[1]), T(m[2]), T(m[3])]; return q => basic['lies within'](q, a, b2) || basic['lies within'](q, a, c); }
      if ((m = t.match(/^(\w+), (\w+) and (\w+) (\[?)(are never all going at once|are all going at some moment)(\]?)$/))) {
        let never = /never/.test(m[5]); if (m[4]) never = !never;
        const xs = [T(m[1]), T(m[2]), T(m[3])];
        return q => (Math.max(...xs.map(i => S(q, i))) < Math.min(...xs.map(i => E(q, i)))) !== never;
      }
      if ((m = t.match(/^(\w+) (overlaps|does not overlap) (\w+) exactly when (\w+) (\[?)(overlaps|does not overlap)(\]?) (\w+)$/))) {
        const s1 = m[2] === 'overlaps'; let s2 = m[6] === 'overlaps'; if (m[5]) s2 = !s2;
        const [w, x, y, z] = [T(m[1]), T(m[3]), T(m[4]), T(m[8])];
        return q => (ov(q, w, x) === s1) === (ov(q, y, z) === s2);
      }
      if ((m = t.match(/^(\w+) (starts|ends) before (\w+) (starts|ends) exactly when (\w+) (starts|ends) before (\w+) (starts|ends)$/))) {
        const P1 = m[2] === 'starts' ? S : E, P2 = m[6] === 'starts' ? S : E;
        const [w, x, y, z] = [T(m[1]), T(m[3]), T(m[5]), T(m[7])];
        return q => (P1(q, w) < P1(q, x)) === (P2(q, y) < P2(q, z));
      }
      if ((m = t.match(/^(None of|Exactly one of|Exactly (\d) of) (.+) (overlaps|overlap) (\w+)$/))) {
        const n = m[1] === 'None of' ? 0 : m[1] === 'Exactly one of' ? 1 : +m[2];
        const xs = listOf(m[3]), a = T(m[5]);
        return q => xs.filter(x => ov(q, a, x)).length === n;
      }
      if ((m = t.match(/^(Exactly one of|Exactly (\d) of) (.+) (comes|come) between (\w+) and (\w+)$/))) {
        const n = m[1] === 'Exactly one of' ? 1 : +m[2];
        const xs = listOf(m[3]), c = T(m[5]), d = T(m[6]);
        return q => xs.filter(x => btw(q, x, c, d)).length === n;
      }
      return null;
    }
    // Perspective: returns a function of {x, y, H} (coordinates and headings 0..3 = N E S W)
    function readPv(t) {
      let m;
      const FWD = [[0, 1], [1, 0], [0, -1], [-1, 0]], RIGHT = [[1, 0], [0, -1], [-1, 0], [0, 1]];
      const sg = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
      const rel = (q, a, o) => {          // [right, ahead] signs of o as a faces
        const dx = q.x[o] - q.x[a], dy = q.y[o] - q.y[a], h = q.H[a];
        return [sg(dx * RIGHT[h][0] + dy * RIGHT[h][1]), sg(dx * FWD[h][0] + dy * FWD[h][1])];
      };
      const dirs = { 'straight ahead of': [0, 1], 'straight behind': [0, -1], 'directly to the left of': [-1, 0], 'directly to the right of': [1, 0],
        'ahead and to the left of': [-1, 1], 'ahead and to the right of': [1, 1], 'behind and to the left of': [-1, -1], 'behind and to the right of': [1, -1] };
      if ((m = t.match(/^(\w+) is (\[?)(.+?)(\]?) (\w+)$/)) && dirs[m[3]]) {
        let [lat, fwd] = dirs[m[3]]; if (m[2]) lat = -lat;
        const o = T(m[1]), a = T(m[5]);
        return q => { const [L, F] = rel(q, a, o); return L === lat && F === fwd; };
      }
      const turns = { 'faces the same way as': 0, 'faces a quarter turn right of': 1, 'faces the opposite way to': 2, 'faces a quarter turn left of': 3 };
      if ((m = t.match(/^(\w+) (\[?)(faces .+? (?:as|of|to))(\]?) (\w+)$/)) && turns[m[3]] !== undefined) {
        let tt = turns[m[3]]; if (m[2]) tt = (tt + 2) % 4;
        const a = T(m[1]), b2 = T(m[5]);
        return q => (q.H[a] - q.H[b2] + 4) % 4 === tt;
      }
      if (!(m = t.match(/^From (\w+): (.+)$/))) return null;
      const A = T(m[1]), body = m[2];
      if ((m = body.match(/^(\w+) and (\w+) (\[?)are on (the same side|opposite sides)(\]?)$/))) {
        let same = m[4] === 'the same side'; if (m[3]) same = !same;
        const B = T(m[1]), C = T(m[2]);
        return q => { const lb = rel(q, A, B)[0], lc = rel(q, A, C)[0]; return lb !== 0 && lc !== 0 && (lb === lc) === same; };
      }
      if ((m = body.match(/^(\w+) (\[?)is further (left|right|ahead|back) than(\]?) (\w+)$/))) {
        let w = m[3]; if (m[2]) w = { left: 'right', right: 'left', ahead: 'back', back: 'ahead' }[w];
        const B = T(m[1]), C = T(m[5]);
        const ix = (w === 'left' || w === 'right') ? 0 : 1, sign = (w === 'left' || w === 'back') ? -1 : 1;
        return q => { const vb = rel(q, A, B)[ix] , vc = rel(q, A, C)[ix];
          // compare coordinates along the axis, not just signs relative to A
          const h = q.H[A], v = ix === 0 ? RIGHT[h] : FWD[h];
          const pb = q.x[B] * v[0] + q.y[B] * v[1], pc = q.x[C] * v[0] + q.y[C] * v[1];
          return sign > 0 ? pb > pc : pb < pc; };
      }
      if ((m = body.match(/^(\w+) (\[?)(is between|is not between)(\]?) (\w+) and (\w+), (left to right|front to back)$/))) {
        let yes = m[3] === 'is between'; if (m[2]) yes = !yes;
        const B = T(m[1]), C = T(m[5]), D = T(m[6]);
        return q => { const h = q.H[A], v = m[7] === 'left to right' ? RIGHT[h] : FWD[h];
          const pr = i => q.x[i] * v[0] + q.y[i] * v[1];
          return ((pr(C) < pr(B) && pr(B) < pr(D)) || (pr(D) < pr(B) && pr(B) < pr(C))) === yes; };
      }
      if ((m = body.match(/^(none of|exactly one of|exactly (\d) of) (.+) (is|are) (on the left|ahead)$/))) {
        const n = m[1] === 'none of' ? 0 : m[1] === 'exactly one of' ? 1 : +m[2];
        const xs = listOf(m[3]), lat = m[5] === 'on the left';
        return q => xs.filter(x => { const [L, F] = rel(q, A, x); return lat ? L < 0 : F > 0; }).length === n;
      }
      return null;
    }

    // ---------------- random arrangements in each family's own shape and in the readers' shape
    const rndDiff = N => arRange(N).map(() => Math.floor(Math.random() * 7));
    const rndIv = N => { const h = arIntervalsFamily().hidden(N); return { h, q: { s: arRange(N).map(i => h[2 * i]), e: arRange(N).map(i => h[2 * i + 1]) } }; };
    const rndPv = N => {
      const x = Int8Array.from(arRange(N).map(() => Math.floor(Math.random() * 3)));
      const y = Int8Array.from(arRange(N).map(() => Math.floor(Math.random() * 3)));
      const H = Int8Array.from(arRange(N).map(i => (i === 0 ? 0 : Math.floor(Math.random() * 4))));
      return { h: { p: [x, y], H }, q: { x, y, H } };
    };
    const diffTruth = (f, v) => { let s = f.vec[v.length]; for (let i = 0; i < v.length; i++) s += f.vec[i] * v[i]; return s === 0; };

    // ---------------- wording
    const wording = { diff: { n: 0, unread: 0, wrong: 0, ex: [] }, span: { n: 0, unread: 0, wrong: 0, ex: [] }, frame: { n: 0, unread: 0, wrong: 0, ex: [] } };
    for (const neg of [false, true]) {
      savedata.enableNegation = neg;
      for (let rep = 0; rep < 60; rep++) {
        for (const [id, fam, reader, rnd, truth] of [
          ['diff', arDifferenceFamily(), readDiff, N => { const v = rndDiff(N); return { h: v, q: v }; }, (f, h) => diffTruth(f, h)],
          ['span', arIntervalsFamily(), readIv, rndIv, (f, h) => f.truth(h)],
          ['frame', arPerspectiveFamily(), readPv, rndPv, (f, h) => f.truth(h)],
        ]) {
          const N = 5, h0 = fam.hidden(N), facts = [];
          for (const k of [2, 3, 4, 5]) {
            const used = new Set([0]);
            for (let i = 0; i < 6; i++) { const f = fam.fact(h0, N, k, used, facts); if (f) facts.push(f); }
          }
          const ctxFacts = facts.slice(0, 4);
          const pool = [...facts, ...shuffle(fam.conclusions(h0, N, 5, {}, { facts: ctxFacts, eng: fam.engine(N), M: fam.engine(N).mask(ctxFacts) })).slice(0, 40)];
          for (const f of pool) for (const plainFlag of [false, true]) {
            const txt = plainText(f.html(W, plainFlag));
            const rd = reader(txt);
            const st = wording[id]; st.n++;
            if (!rd) { st.unread++; if (st.ex.length < 6) st.ex.push('UNREAD ' + txt); continue; }
            for (let t = 0; t < 25; t++) {
              const { h, q } = rnd(N);
              if (rd(q) !== truth(f, h)) { st.wrong++; if (st.ex.length < 6) st.ex.push('WRONG ' + txt); break; }
            }
          }
        }
      }
    }
    out.wording = wording;

    // ---------------- answers
    // exact rational elimination (BigInt), independent of linReduce
    const rref = rows => {
      const R = rows.map(r => r.map(BigInt)), n = R.length ? R[0].length : 0, piv = [];
      let row = 0;
      for (let c = 0; c < n && row < R.length; c++) {
        let pr = R.findIndex((r, i) => i >= row && r[c] !== 0n);
        if (pr < 0) continue;
        [R[row], R[pr]] = [R[pr], R[row]];
        for (let i = 0; i < R.length; i++) if (i !== row && R[i][c] !== 0n) {
          const a = R[row][c], b2 = R[i][c];
          R[i] = R[i].map((v, j) => v * a - R[row][j] * b2);
        }
        piv.push(c); row++;
      }
      return R.slice(0, row);
    };
    const inSpan = (rows, v) => rref(rows).length === rref([...rows, v]).length;
    const ans = {};
    const fams = {
      diff: () => arDifferenceFamily(), span: () => arIntervalsFamily(), frame: () => arPerspectiveFamily(),
    };
    for (const neg of [false, true]) {
      savedata.enableNegation = neg;
      for (const [id, mk] of Object.entries(fams)) for (const k of [2, 3, 4, 5]) for (const P of [2, 3, 5, 8]) {
        const key = `${id} k${k} P${P}`;
        const st = ans[key] = ans[key] || { n: 0, wrong: 0, hidden: 0, noTop: 0, single: 0, fail: 0, ms: 0 };
        for (let rep = 0; rep < REPS; rep++) {
          const fam = mk(), t0 = performance.now();
          const it = arBuild(fam, P, k, {});
          st.ms = Math.max(st.ms, performance.now() - t0);
          if (!it) { st.fail++; continue; }
          st.n++;
          let v, single = false;
          if (id === 'diff') {
            const N = it.N;
            if (!it.facts.every(f => diffTruth(f, it.h))) st.hidden++;
            const decide = (facts, c) => {
              const rows = facts.map(f => f.vec);
              if (c.base) return inSpan(rows, c.base.vec) && !inSpan(rows, c.vec) ? false : null;
              return inSpan(rows, c.vec) ? true : null;
            };
            v = decide(it.facts, it.concl);
            single = it.facts.some(f => decide([f], it.concl) === it.isValid);
          } else if (id === 'span') {
            const models = arSpans(it.N);
            if (!it.facts.every(f => f.truth(it.h))) st.hidden++;
            const decide = facts => { const L = models.filter(m => facts.every(f => f.truth(m))); const t = L.every(m => it.concl.truth(m)); const fl = L.every(m => !it.concl.truth(m)); return t ? true : fl ? false : null; };
            v = decide(it.facts);
            single = it.facts.some(f => decide([f]) === it.isValid);
          } else {
            const N = it.N;
            if (!it.facts.every(f => f.truth(it.h))) st.hidden++;
            const weak = arWeak(N), Hs = arHeadingSets(N);
            const decide = facts => {
              let allT = true, allF = true;
              if (N <= 4) {
                for (const H of Hs) for (const x of weak) for (const y of weak) {
                  const m = { p: [x, y], H };
                  if (!facts.every(f => f.truth(m))) continue;
                  if (it.concl.truth(m)) allF = false; else allT = false;
                  if (!allT && !allF) return null;
                }
              } else {
                // per heading assignment, the orders each axis allows — found by trying every pair once
                // per surviving x order would be 292k; instead filter x and y orders independently using the
                // statements evaluated with the other axis taken from the hidden arrangement, then check pairs
                for (const H of Hs) {
                  const xs = weak.filter(x => facts.every(f => f.hd ? f.hd(H) : f.axes(H[f.ref])[0] === null || f.axes(H[f.ref])[0](x)));
                  if (!xs.length) continue;
                  const ys = weak.filter(y => facts.every(f => f.hd ? f.hd(H) : f.axes(H[f.ref])[1] === null || f.axes(H[f.ref])[1](y)));
                  if (!ys.length) continue;
                  for (const x of xs) for (const y of ys) {
                    const m = { p: [x, y], H };
                    if (it.concl.truth(m)) allF = false; else allT = false;
                    if (!allT && !allF) return null;
                  }
                }
              }
              return allT ? true : allF ? false : null;
            };
            v = decide(it.facts);
            if (N <= 4) single = it.facts.some(f => decide([f]) === it.isValid);
          }
          if (v !== it.isValid) st.wrong++;
          if (k >= 3 && !it.support.some(f => f.arity === it.k)) st.noTop++;
          if (single) st.single++;
        }
      }
    }
    for (const kk of Object.keys(ans)) ans[kk].ms = Math.round(ans[kk].ms);
    out.answers = ans;
    return out;
  }, REPS);
  console.log('WORDING');
  for (const [k, v] of Object.entries(r.wording)) console.log(' ', k, JSON.stringify({ n: v.n, unread: v.unread, wrong: v.wrong }), v.ex.join(' | '));
  let tot = { n: 0, wrong: 0, hidden: 0, noTop: 0, single: 0, fail: 0 };
  console.log('ANSWERS');
  for (const [k, v] of Object.entries(r.answers)) { for (const f of Object.keys(tot)) tot[f] += v[f]; if (v.wrong || v.hidden || v.noTop || v.single || v.fail || v.ms > 600) console.log(' ', k, JSON.stringify(v)); }
  console.log('TOTAL', JSON.stringify(tot), 'errors', errs);
  await b.close();
})();
