// Items built at every arity: the answer re-derived by enumerating every arrangement with the facts'
// truth functions (no bitsets), the hidden arrangement satisfies every premise, the conclusion needs a
// top-arity premise, and no single premise settles it.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.URL || 'http://localhost:8771/Syllogimous-v3-main/'));
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const fams = [
      ['order', () => arOrderFamily(LEFT_RIGHT)], ['space2d', () => arSpaceFamily(new Direction2D())], ['space3d', () => arSpaceFamily(new Direction3D())],
      ['distinction', () => arBitsFamily()], ['influence', () => arBitsFamily(AR_LEX_INFLUENCE)], ['contexts', () => arContextsFamily()],
      ['ring', () => arRingFamily()], ['hierarchy', () => arHierarchyFamily()],
    ];
    const res = {};
    for (const neg of [false, true]) {
      savedata.enableNegation = neg;
      for (const [name, mk] of fams) for (const k of [2, 3, 4, 5]) for (const P of [3, 5, 8]) {
        if (k === 2 && !['ring', 'hierarchy'].includes(name)) continue;
        const key = `${name} k${k} P${P}`;
        const st = res[key] = res[key] || { n: 0, wrong: 0, hidden: 0, noTop: 0, single: 0, fail: 0, ms: 0 };
        for (let rep = 0; rep < 6; rep++) {
          const fam = mk(), t0 = performance.now();
          const it = arBuild(fam, P, k, {});
          st.ms = Math.max(st.ms, performance.now() - t0);
          if (!it) { st.fail++; continue; }
          st.n++;
          const eng = fam.engine(it.N), D = eng.axes;
          const sat = a => eng.models.filter(m => it.facts.every(f => f.truth(m, a)));
          const S = [...Array(D).keys()].map(sat);
          const hv = name.startsWith('space') ? [...Array(D).keys()].map(a => it.h.map(c => c[a])) : name === 'contexts' ? it.h : [...Array(D)].map(() => it.h);
          if (![...Array(D).keys()].every(a => it.facts.every(f => f.truth(hv[a], a)))) st.hidden++;
          const allTrue = S.every((L, a) => L.every(m => it.concl.truth(m, a)));
          const someFalse = S.some((L, a) => L.every(m => !it.concl.truth(m, a)));
          const v = allTrue ? true : someFalse ? false : null;
          if (v !== it.isValid) st.wrong++;
          if (!it.support.some(f => f.arity === it.k)) st.noTop++;
          const single = it.facts.some(f => { const L = [...Array(D).keys()].map(a => eng.models.filter(m => f.truth(m, a))); const t = L.every((LL, a) => LL.every(m => it.concl.truth(m, a))); const fl = L.some((LL, a) => LL.every(m => !it.concl.truth(m, a))); return (t ? true : fl ? false : null) === it.isValid; });
          if (single) st.single++;
        }
      }
    }
    for (const k of Object.keys(res)) res[k].ms = Math.round(res[k].ms);
    return res;
  });
  let tot = { n: 0, wrong: 0, hidden: 0, noTop: 0, single: 0, fail: 0 };
  for (const [k, v] of Object.entries(r)) { for (const f of Object.keys(tot)) tot[f] += v[f]; if (v.wrong || v.hidden || v.noTop || v.single || v.fail || v.ms > 400) console.log(k, JSON.stringify(v)); }
  console.log('TOTAL', JSON.stringify(tot), 'errors', errs);
  await b.close();
})();
