// Wording vs meaning: every k-ary fact (premises and conclusion candidates) is rendered, read back by an
// independent reader written from the English, and compared with the fact's own truth on random models.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.URL || 'http://localhost:8771/Syllogimous-v3-main/'));
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const out = { checked: 0, unread: 0, wrong: 0, kinds: {}, samples: [] };
    const txt = h => h.replace(/<span class="is-negated">([^<]*)<\/span>/g, '~[$1]').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const T = s => +s.slice(1);                        // "T3" -> 3
    const list = s => s.replace(/ and /g, ', ').split(', ').map(x => T(x.trim()));
    const neg = (ph, inv) => ph.startsWith('~[') ? inv(ph.slice(2, -1)) : ph;
    // ---- order wordings: prev means "comes first"
    const PREV = ['is left of', 'is on top of', 'is less than', 'is before', 'contains'];
    const NEXT = ['is right of', 'is under', 'is more than', 'is after', 'is within'];
    const plural = t => t.replace(/^is /, 'are ').replace(/^contains$/, 'contain');
    const ordPhrase = ph => { // -> +1 if "first term earlier", -1 if later
      const raw = ph.startsWith('~[') ? ph.slice(2, -1) : ph, red = ph.startsWith('~[');
      let d = PREV.includes(raw) || PREV.map(plural).includes(raw) ? 1 : NEXT.includes(raw) || NEXT.map(plural).includes(raw) ? -1 : 0;
      return red ? -d : d;
    };
    const betweenWord = ph => { const raw = ph.replace(/^~\[|\]$/g, ''), red = ph.startsWith('~['); const inside = !/not/.test(raw); return red ? !inside : inside; };
    const endWord = ph => { const raw = ph.replace(/^~\[|\]$/g, ''), red = ph.startsWith('~['); const at = !/not/.test(raw); return red ? !at : at; };
    const inside = (v, x, c, d) => (v[c] < v[x] && v[x] < v[d]) || (v[d] < v[x] && v[x] < v[c]);
    const AX = { 'east–west': 0, 'north–south': 1, 'above–below': 2, 'in time': 3 };
    // read an order/space sentence: returns m(values) => bool, or null
    function readOrder(s) {
      let m;
      const PH = '(~\\[[^\\]]+\\]|[a-z][a-z ]+?)';
      if ((m = new RegExp(`^(T\\d+) ${PH} (T\\d+)$`).exec(s)) && ordPhrase(m[2])) { const d = ordPhrase(m[2]), x = T(m[1]), y = T(m[3]); return v => d > 0 ? v[x] < v[y] : v[x] > v[y]; }
      if ((m = new RegExp(`^(T\\d+) ${PH} (T\\d+) and (T\\d+)$`).exec(s)) && /between/.test(m[2])) { const w = betweenWord(m[2]), a = T(m[1]), x = T(m[3]), y = T(m[4]); return v => inside(v, a, x, y) === w; }
      if ((m = new RegExp(`^(T\\d+) ${PH} (T\\d+) or (T\\d+)$`).exec(s)) && ordPhrase(m[2])) { const d = ordPhrase(m[2]), a = T(m[1]), x = T(m[3]), y = T(m[4]); return v => d > 0 ? (v[a] < v[x] || v[a] < v[y]) : (v[a] > v[x] || v[a] > v[y]); }
      if ((m = /^(T\d+) ~\[(.+) both\] (T\d+) and (T\d+)$/.exec(s))) { const d = ordPhrase(m[2]), a = T(m[1]), x = T(m[3]), y = T(m[4]); return v => !(d > 0 ? (v[a] < v[x] && v[a] < v[y]) : (v[a] > v[x] && v[a] > v[y])); }
      if ((m = new RegExp(`^(T\\d+) (is left of|is right of|is on top of|is under|is less than|is more than|is before|is after|contains|is within) (T\\d+) exactly when (T\\d+) ${PH} (T\\d+)$`).exec(s))) {
        const d1 = ordPhrase(m[2]), d2 = ordPhrase(m[5]), w = T(m[1]), x = T(m[3]), y = T(m[4]), z = T(m[6]);
        return v => ((d1 > 0) === (v[w] < v[x])) === ((d2 > 0) === (v[y] < v[z]));
      }
      if ((m = new RegExp(`^Exactly (one|\\d+) of (.+?) ${PH} (T\\d+) and (T\\d+)$`).exec(s)) && /between/.test(m[3])) {
        const n = m[1] === 'one' ? 1 : +m[1], L = list(m[2]), w = betweenWord(m[3]), c = T(m[4]), d = T(m[5]);
        return v => L.filter(x => inside(v, x, c, d) === w).length === n;
      }
      if ((m = new RegExp(`^Exactly (\\d+) of (.+?) ${PH} (T\\d+)$`).exec(s)) && ordPhrase(m[3])) {
        const n = +m[1], L = list(m[2]), d = ordPhrase(m[3]), a = T(m[4]);
        return v => L.filter(x => d > 0 ? v[x] < v[a] : v[x] > v[a]).length === n;
      }
      if ((m = new RegExp(`^Among (.+), (T\\d+) ${PH}$`).exec(s)) && /one end/.test(m[3])) {
        const L = list(m[1]), a = T(m[2]), at = endWord(m[3]), rest = L.filter(x => x !== a);
        return v => (rest.every(x => v[a] < v[x]) || rest.every(x => v[a] > v[x])) === at;
      }
      return null;
    }
    function readSpace(s) {
      const ax = Object.keys(AX).find(k => s.endsWith(' ' + k));
      if (!ax) {
        let m;
        if ((m = /^(T\d+) (~\[[^\]]+\]|is the same way from|is the opposite way from) (T\d+) as (T\d+) is from (T\d+)$/.exec(s))) {
          const raw = m[2].replace(/^~\[|\]$/g, ''), red = m[2].startsWith('~['); let same = /same/.test(raw); if (red) same = !same;
          const a = T(m[1]), bb = T(m[3]), c = T(m[4]), d = T(m[5]);
          return (pts, D) => { for (let i = 0; i < D; i++) if (Math.sign(pts[a][i] - pts[bb][i]) !== (same ? 1 : -1) * Math.sign(pts[c][i] - pts[d][i])) return false; return true; };
        }
        return null;
      }
      const body = s.slice(0, -ax.length - 1), i = AX[ax];
      let m;
      if ((m = /^(T\d+) (~\[[^\]]+\]|is level with|is not level with) (T\d+) or (T\d+)$/.exec(body))) {
        const raw = m[2].replace(/^~\[|\]$/g, ''), red = m[2].startsWith('~['); let lv = !/not/.test(raw); if (red) lv = !lv;
        const a = T(m[1]), x = T(m[3]), y = T(m[4]);
        return (pts) => (pts[a][i] === pts[x][i] || pts[a][i] === pts[y][i]) === lv;
      }
      const f = readOrder(body);
      return f ? (pts) => f(pts.map(c => c[i])) : null;
    }
    // ---- same / opposite (distinction and influence wordings)
    const SAMEW = ['is same as', 'are same as', 'varies directly with', 'moves with', 'move with'];
    const OPPW = ['is opposite of', 'are opposite of', 'varies inversely with', 'moves against', 'move against'];
    const sameOf = ph => { const raw = ph.replace(/^~\[|\]$/g, ''), red = ph.startsWith('~['); let s = SAMEW.includes(raw) ? true : OPPW.includes(raw) ? false : null; if (s === null) return null; return red ? !s : s; };
    function readBits(s) {
      let m;
      const PH = '(~\\[[^\\]]+\\]|[a-z][a-z ]+?)';
      if ((m = new RegExp(`^(T\\d+), (T\\d+) and (T\\d+) ${PH}$`).exec(s))) {
        const raw = m[4].replace(/^~\[|\]$/g, ''), red = m[4].startsWith('~['); let notAll = /not/.test(raw); if (red) notAll = !notAll;
        const a = T(m[1]), x = T(m[2]), y = T(m[3]);
        return v => !(v[a] === v[x] && v[x] === v[y]) === notAll;
      }
      if ((m = new RegExp(`^(T\\d+) ${PH} (T\\d+) or (T\\d+)$`).exec(s)) && sameOf(m[2]) !== null) { const sm = sameOf(m[2]), a = T(m[1]), x = T(m[3]), y = T(m[4]); return v => ((v[a] === v[x]) === sm) || ((v[a] === v[y]) === sm); }
      if ((m = /^(T\d+) ~\[(.+) both\] (T\d+) and (T\d+)$/.exec(s))) { const sm = sameOf(m[2]), a = T(m[1]), x = T(m[3]), y = T(m[4]); return v => !(((v[a] === v[x]) === sm) && ((v[a] === v[y]) === sm)); }
      if ((m = new RegExp(`^(T\\d+) ${PH} (T\\d+) exactly when (T\\d+) ${PH} (T\\d+)$`).exec(s))) {
        const s1 = sameOf(m[2]), s2 = sameOf(m[5]), w = T(m[1]), x = T(m[3]), y = T(m[4]), z = T(m[6]);
        return v => ((v[w] === v[x]) === s1) === ((v[y] === v[z]) === s2);
      }
      if ((m = new RegExp(`^Exactly (\\d+) of (.+?) ${PH} (T\\d+)$`).exec(s))) { const n = +m[1], L = list(m[2]), sm = sameOf(m[3]), a = T(m[4]); return v => L.filter(x => (v[x] === v[a]) === sm).length === n; }
      if ((m = new RegExp(`^Either (T\\d+) ${PH} (T\\d+), or (T\\d+) ${PH} (T\\d+), or both$`).exec(s))) {
        const s1 = sameOf(m[2]), s2 = sameOf(m[5]), w = T(m[1]), x = T(m[3]), y = T(m[4]), z = T(m[6]);
        return v => ((v[w] === v[x]) === s1) || ((v[y] === v[z]) === s2);
      }
      if ((m = new RegExp(`^(T\\d+) ${PH} (T\\d+)$`).exec(s)) && sameOf(m[2]) !== null) { const sm = sameOf(m[2]), a = T(m[1]), x = T(m[3]); return v => (v[a] === v[x]) === sm; }
      return null;
    }
    // ---- ring
    function readRing(s, N) {
      const gap = (v, x, y) => (v[y] - v[x] + N) % N;
      let m;
      const flip = (ph, yes) => { const red = ph.startsWith('~['); const raw = ph.replace(/^~\[|\]$/g, ''); let r = yes(raw); return red ? !r : r; };
      if ((m = /^(T\d+) (~\[[^\]]+\]|is the next one clockwise after|is not the next one clockwise after) (T\d+)$/.exec(s))) { const nx = flip(m[2], r => !/not/.test(r)), a = T(m[1]), x = T(m[3]); return v => (gap(v, x, a) === 1) === nx; }
      if ((m = /^Going clockwise from (T\d+), (T\d+) (~\[[^\]]+\]|comes before|comes after) (T\d+)$/.exec(s))) { const bf = flip(m[3], r => r === 'comes before'), a = T(m[1]), x = T(m[2]), y = T(m[4]); return v => (gap(v, a, x) < gap(v, a, y)) === bf; }
      if ((m = /^(T\d+) sits closer to (T\d+) than to (T\d+)$/.exec(s))) { const a = T(m[1]), x = T(m[2]), y = T(m[3]); const dist = (v, p, q) => Math.min(gap(v, p, q), N - gap(v, p, q)); return v => dist(v, a, x) < dist(v, a, y); }
      if ((m = /^It is (~\[[^\]]+\]|the same number of steps|a different number of steps) clockwise from (T\d+) to (T\d+) as from (T\d+) to (T\d+)$/.exec(s))) { const same = flip(m[1], r => /same/.test(r)), a = T(m[2]), x = T(m[3]), c = T(m[4]), d = T(m[5]); return v => (gap(v, a, x) === gap(v, c, d)) === same; }
      if ((m = /^Exactly (one|\d+) of (.+?) (~\[[^\]]+\]|lies on|lie on|lies off|lie off) the clockwise way from (T\d+) round to (T\d+)$/.exec(s))) {
        const n = m[1] === 'one' ? 1 : +m[1], L = list(m[2]), on = flip(m[3], r => / on$/.test(r)), c = T(m[4]), d = T(m[5]);
        return v => L.filter(x => (gap(v, c, x) < gap(v, c, d)) === on).length === n;
      }
      return null;
    }
    const W = Array.from({ length: 12 }, (_, i) => 'T' + i);
    const rndPerm = n => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return Int8Array.from(a); };
    const fams = [
      ...[LEFT_RIGHT, TOP_UNDER, MORE_LESS, BEFORE_AFTER, CONTAINS_WITHIN].map(g => ['order:' + g.getName(), arOrderFamily(g), 'order']),
      ['space2d', arSpaceFamily(new Direction2D()), 'space'], ['space3d', arSpaceFamily(new Direction3D()), 'space'],
      ['distinction', arBitsFamily(), 'bits'], ['influence', arBitsFamily(AR_LEX_INFLUENCE), 'bits'], ['ring', arRingFamily(), 'ring'],
    ];
    for (const neg of [false, true]) {
      savedata.enableNegation = neg;
      for (const [name, fam, kind] of fams) for (const k of [2, 3, 4, 5]) for (let rep = 0; rep < 40; rep++) {
        const P = 5, N = fam.terms(P, k), h = fam.hidden(N), eng = fam.engine(N);
        const facts = [];
        for (let t = 0; t < 12; t++) { const f = fam.fact(h, N, k, new Set(), []); if (f) facts.push(f); }
        const cands = fam.conclusions(h, N, k, {}, { facts, M: eng.mask(facts), eng }).filter(c => c.arity >= 3 || kind === 'ring').slice(0, 25);
        for (const f of [...facts, ...cands]) {
          for (const plain of [false, true]) {
            const s = txt(f.html(W, plain));
            const rd = kind === 'order' ? readOrder(s) : kind === 'space' ? readSpace(s) : kind === 'bits' ? readBits(s) : readRing(s, N);
            const key = name + ' ' + s.replace(/T\d+/g, 'T').replace(/\d+/g, '#');
            out.kinds[name + ':' + f.arity] = (out.kinds[name + ':' + f.arity] || 0) + 1;
            if (!rd) { out.unread++; if (out.samples.length < 25) out.samples.push('UNREAD ' + key); continue; }
            for (let trial = 0; trial < 30; trial++) {
              let m, truth, mine;
              if (kind === 'space') {
                const D = h[0].length, idx = Math.floor(Math.random() * eng.models.length);
                const axes = [...Array(D)].map(() => eng.models[Math.floor(Math.random() * eng.models.length)]);
                const pts = [...Array(N)].map((_, i) => axes.map(ax => ax[i]));
                truth = [...Array(D).keys()].every(a => !!f.truth(axes[a], a));
                mine = !!rd(pts, D);
              } else {
                m = kind === 'bits' ? Int8Array.from([...Array(N)].map(() => Math.random() < 0.5 ? 1 : 0)) : rndPerm(N);
                truth = !!f.truth(m, 0); mine = !!rd(m);
              }
              out.checked++;
              if (truth !== mine) { out.wrong++; if (out.samples.length < 25) out.samples.push(`WRONG ${key} truth=${truth}`); break; }
            }
          }
        }
      }
    }
    return out;
  });
  console.log('checked', r.checked, 'unread', r.unread, 'wrong', r.wrong);
  console.log(Object.entries(r.kinds).map(e => e.join('=')).join(' '));
  r.samples.forEach(x => console.log('  ', x));
  console.log('errors', errs);
  await b.close();
})();
