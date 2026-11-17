// Cold Start engine. No DOM: runs in the browser and in Node (tests).
//
// A WORLD is a board of n places (a shape: coordinates + links) and three relations. A relation is a
// statement about where 2-5 objects sit, defined on the geometry and the links alone, so the same
// library works on any shape. An ARRANGEMENT puts n objects on the n places. Every check below is done
// by listing all arrangements and seeing which ones survive the facts.
(function (root) {
'use strict';
const E = 1e-6;
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
const range = n => [...Array(n).keys()];
const sample = (n, k) => shuffle(range(n)).slice(0, k);

// ------------------------------------------------------------------ shapes
function shape(name, xy, edges, held) {
    const n = xy.length;
    const cx = xy.reduce((s, p) => s + p[0], 0) / n, cy = xy.reduce((s, p) => s + p[1], 0) / n;
    xy = xy.map(p => [p[0] - cx, p[1] - cy]);
    const gd = range(n).map(() => Array(n).fill(99)), adj = range(n).map(() => []);
    for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
    for (let s = 0; s < n; s++) {
        gd[s][s] = 0; const q = [s];
        for (let i = 0; i < q.length; i++) for (const v of adj[q[i]]) if (gd[s][v] === 99) { gd[s][v] = gd[s][q[i]] + 1; q.push(v); }
    }
    return { name, n, xy, edges, gd, held: !!held, prof: {} };
}
const circle = (m, R, off) => range(m).map(i => { const t = 2 * Math.PI * i / m - Math.PI / 2; return [R * Math.cos(t) + (off || 0), R * Math.sin(t)]; });
const rad = m => Math.max(0.8, 1 / (2 * Math.sin(Math.PI / m)));
const SHAPES = {
    path: n => shape('path', range(n).map(i => [i, 0]), range(n - 1).map(i => [i, i + 1])),
    ring: n => shape('ring', circle(n, rad(n)), range(n).map(i => [i, (i + 1) % n])),
    grid: n => {
        const dims = { 4: [[2, 2]], 6: [[2, 3], [3, 2]], 8: [[2, 4], [4, 2]] }[n]; if (!dims) return null;
        const [r, c] = pick(dims), xy = [], ed = [];
        for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) {
            xy.push([j, i]);
            if (j + 1 < c) ed.push([i * c + j, i * c + j + 1]);
            if (i + 1 < r) ed.push([i * c + j, (i + 1) * c + j]);
        }
        return shape('grid', xy, ed);
    },
    tree: n => {
        const par = [-1], dep = [0], kids = [[]];
        for (let i = 1; i < n; i++) {
            const c = range(i).filter(j => dep[j] < 3 && kids[j].length < 3), p = pick(c);
            par.push(p); dep.push(dep[p] + 1); kids.push([]); kids[p].push(i);
        }
        const x = Array(n).fill(0); let leaf = 0;
        (function lay(u) { if (!kids[u].length) { x[u] = leaf++; return; } kids[u].forEach(lay); x[u] = kids[u].reduce((s, v) => s + x[v], 0) / kids[u].length; })(0);
        return shape('tree', x.map((v, i) => [v, dep[i]]), par.slice(1).map((p, i) => [p, i + 1]));
    },
    star: n => n < 5 ? null : shape('star', [[0, 0], ...circle(n - 1, 1.25)], range(n - 1).map(i => [0, i + 1])),
    isles: n => {
        const parts = pick({ 4: [[2, 2]], 5: [[3, 2]], 6: [[2, 2, 2], [3, 3]], 7: [[3, 2, 2], [4, 3]], 8: [[3, 3, 2], [4, 4], [2, 2, 2, 2]] }[n]);
        const xy = [], ed = [];
        parts.forEach((sz, g) => { for (let i = 0; i < sz; i++) { if (i) ed.push([xy.length - 1, xy.length]); xy.push([g * 1.6, i]); } });
        return shape('isles', xy, ed);
    },
    // never used in training: reserved for the probe
    wheel: n => n < 5 ? null : shape('wheel', [[0, 0], ...circle(n - 1, rad(n - 1))], [...range(n - 1).map(i => [0, i + 1]), ...range(n - 1).map(i => [i + 1, (i + 1) % (n - 1) + 1])], 1),
    comb: n => {
        const m = Math.ceil(n / 2), xy = range(m).map(i => [i, 0]), ed = range(m - 1).map(i => [i, i + 1]);
        for (let j = 0; j < n - m; j++) { ed.push([j, xy.length]); xy.push([j, 1]); }
        return shape('comb', xy, ed, 1);
    },
    tri: n => n !== 6 ? null : shape('tri', [[0, 0], [-0.5, 0.9], [0.5, 0.9], [-1, 1.8], [0, 1.8], [1, 1.8]], [[0, 1], [0, 2], [1, 2], [1, 3], [1, 4], [2, 4], [2, 5], [3, 4], [4, 5]], 1),
};
const TRAIN = ['path', 'ring', 'grid', 'tree', 'star', 'isles'], HELD = ['wheel', 'comb', 'tri'];
function pickShape(n, held) {
    for (const k of shuffle(held ? HELD : TRAIN)) { const s = SHAPES[k](n); if (s) return s; }
    return null;
}

// ------------------------------------------------------------------ relation library
const gx = (S, i) => S.xy[i][0], gy = (S, i) => S.xy[i][1];
const L = (S, a, b) => gx(S, a) < gx(S, b) - E;
const A = (S, a, b) => gy(S, a) < gy(S, b) - E;
const R0 = (S, a, b) => Math.abs(gy(S, a) - gy(S, b)) < E;
const C0 = (S, a, b) => Math.abs(gx(S, a) - gx(S, b)) < E;
const N = (S, a, b) => S.gd[a][b] === 1;
const G = (S, a, b) => S.gd[a][b] < 99;
const ed = (S, a, b) => { const dx = gx(S, a) - gx(S, b), dy = gy(S, a) - gy(S, b); return dx * dx + dy * dy; };
const cross = (S, a, b, c) => (gx(S, b) - gx(S, a)) * (gy(S, c) - gy(S, b)) - (gy(S, b) - gy(S, a)) * (gx(S, c) - gx(S, b));
const B = (S, a, b, c) => S.gd[a][c] < 99 && S.gd[a][b] + S.gd[b][c] === S.gd[a][c];
const EQ = (S, a, b, c) => S.gd[a][b] === S.gd[a][c] && S.gd[a][b] < 99;
const XL = (S, a, b, c) => (L(S, b, a) && L(S, a, c)) || (L(S, c, a) && L(S, a, b));
const XA = (S, a, b, c) => (A(S, b, a) && A(S, a, c)) || (A(S, c, a) && A(S, a, b));
const deg = (S, a) => S.gd[a].filter(d => d === 1).length;
const diam = S => S.diam || (S.diam = Math.max(...S.gd.flat().filter(d => d < 99)));
const dot = (S, a, b, c) => (gx(S, b) - gx(S, a)) * (gx(S, c) - gx(S, a)) + (gy(S, b) - gy(S, a)) * (gy(S, c) - gy(S, a));
const vx = (S, a, b, c, d) => (gx(S, b) - gx(S, a)) * (gy(S, d) - gy(S, c)) - (gy(S, b) - gy(S, a)) * (gx(S, d) - gx(S, c));
const side = (S, a, b, c) => (gx(S, b) - gx(S, a)) * (gy(S, c) - gy(S, a)) - (gy(S, b) - gy(S, a)) * (gx(S, c) - gx(S, a));
const cnt = (S, f, a, o) => o.reduce((s, x) => s + (f(S, x, a) ? 1 : 0), 0);
// [id, arity, test, held-out]
const LIB = [
    ['L', 2, L], ['A', 2, A], ['R0', 2, R0], ['C0', 2, C0], ['N', 2, N],
    ['D2', 2, (S, a, b) => S.gd[a][b] === 2], ['F3', 2, (S, a, b) => S.gd[a][b] >= 3 && S.gd[a][b] < 99], ['G', 2, G],
    ['NL', 2, (S, a, b) => N(S, a, b) && L(S, a, b)], ['NA', 2, (S, a, b) => N(S, a, b) && A(S, a, b)],
    ['RL', 2, (S, a, b) => R0(S, a, b) && L(S, a, b)], ['CA', 2, (S, a, b) => C0(S, a, b) && A(S, a, b)],
    ['MIR', 2, (S, a, b) => Math.abs(gx(S, a) + gx(S, b)) < E && Math.abs(gy(S, a) - gy(S, b)) < E, 1],
    ['SDG', 2, (S, a, b) => deg(S, a) === deg(S, b)], ['MDG', 2, (S, a, b) => deg(S, a) > deg(S, b)], ['OPP', 2, (S, a, b) => S.gd[a][b] === diam(S)],
    ['DG', 2, (S, a, b) => { const dx = Math.abs(gx(S, a) - gx(S, b)), dy = Math.abs(gy(S, a) - gy(S, b)); return dx > E && Math.abs(dx - dy) < E; }, 1],
    ['B', 3, B], ['M', 3, (S, a, b, c) => B(S, a, b, c) && S.gd[a][b] === S.gd[b][c]], ['EQ', 3, EQ],
    ['CL', 3, (S, a, b, c) => S.gd[a][b] < S.gd[a][c]],
    ['ECL', 3, (S, a, b, c) => ed(S, a, b) < ed(S, a, c) - E, 1],
    ['CW', 3, (S, a, b, c) => cross(S, a, b, c) > E, 1],
    ['COL', 3, (S, a, b, c) => Math.abs(cross(S, a, b, c)) < E],
    ['CRN', 3, (S, a, b, c) => R0(S, a, b) && C0(S, a, c)],
    ['X1', 3, (S, a, b, c) => N(S, a, b) !== N(S, a, c)],
    ['XL', 3, XL], ['XA', 3, XA],
    ['ANG', 3, (S, a, b, c) => Math.abs(dot(S, a, b, c)) < E], ['EQD', 3, (S, a, b, c) => Math.abs(ed(S, a, b) - ed(S, a, c)) < E],
    ['SV', 4, (S, a, b, c, d) => Math.abs(gx(S, b) - gx(S, a) - gx(S, d) + gx(S, c)) < E && Math.abs(gy(S, b) - gy(S, a) - gy(S, d) + gy(S, c)) < E],
    ['SD', 4, (S, a, b, c, d) => S.gd[a][b] === S.gd[c][d]], ['FD', 4, (S, a, b, c, d) => S.gd[a][b] > S.gd[c][d]],
    ['SRL', 4, (S, a, b, c, d) => L(S, a, b) === L(S, c, d)], ['SRA', 4, (S, a, b, c, d) => A(S, a, b) === A(S, c, d)],
    ['SRN', 4, (S, a, b, c, d) => N(S, a, b) === N(S, c, d)], ['SRG', 4, (S, a, b, c, d) => G(S, a, b) === G(S, c, d)],
    ['NR3', 4, (S, a, b, c, d) => S.gd[a][b] < S.gd[a][c] && S.gd[a][b] < S.gd[a][d], 1],
    ['C1N', 4, (S, a, b, c, d) => cnt(S, N, a, [b, c, d]) === 1], ['C1L', 4, (S, a, b, c, d) => cnt(S, L, a, [b, c, d]) === 1],
    ['C2L', 4, (S, a, b, c, d) => cnt(S, L, a, [b, c, d]) === 2], ['C1A', 4, (S, a, b, c, d) => cnt(S, A, a, [b, c, d]) === 1],
    ['PAR', 4, (S, a, b, c, d) => Math.abs(vx(S, a, b, c, d)) < E], ['PERP', 4, (S, a, b, c, d) => Math.abs((gx(S, b) - gx(S, a)) * (gx(S, d) - gx(S, c)) + (gy(S, b) - gy(S, a)) * (gy(S, d) - gy(S, c))) < E, 1],
    ['CROSS', 4, (S, a, b, c, d) => side(S, a, b, c) * side(S, a, b, d) < -E && side(S, c, d, a) * side(S, c, d, b) < -E],
    ['SSIDE', 4, (S, a, b, c, d) => side(S, a, b, c) * side(S, a, b, d) > E],
    ['FR3', 4, (S, a, b, c, d) => S.gd[a][b] < 99 && S.gd[a][b] > S.gd[a][c] && S.gd[a][b] > S.gd[a][d]],
    ['ESD', 4, (S, a, b, c, d) => Math.abs(ed(S, a, b) - ed(S, c, d)) < E],
    ['C2L5', 5, (S, a, b, c, d, e) => cnt(S, L, a, [b, c, d, e]) === 2], ['C2A5', 5, (S, a, b, c, d, e) => cnt(S, A, a, [b, c, d, e]) === 2],
    ['C1N5', 5, (S, a, b, c, d, e) => cnt(S, N, a, [b, c, d, e]) === 1], ['C2N5', 5, (S, a, b, c, d, e) => cnt(S, N, a, [b, c, d, e]) === 2],
    ['C1L5', 5, (S, a, b, c, d, e) => cnt(S, L, a, [b, c, d, e]) === 1], ['C3L5', 5, (S, a, b, c, d, e) => cnt(S, L, a, [b, c, d, e]) === 3],
    ['C1A5', 5, (S, a, b, c, d, e) => cnt(S, A, a, [b, c, d, e]) === 1],
    ['FR4', 5, (S, a, b, c, d, e) => S.gd[a][b] < 99 && S.gd[a][b] > S.gd[a][c] && S.gd[a][b] > S.gd[a][d] && S.gd[a][b] > S.gd[a][e]],
    ['NR4', 5, (S, a, b, c, d, e) => S.gd[a][b] < S.gd[a][c] && S.gd[a][b] < S.gd[a][d] && S.gd[a][b] < S.gd[a][e], 1],
];

// place tuples used to compare relations: every one when that is small, a fixed sample otherwise
const TUP = {};
function tuples(n, k) {
    const key = n + ':' + k; if (TUP[key]) return TUP[key];
    const out = [], total = Math.pow(n, k);
    if (total <= 4096) {
        for (let t = 0; t < total; t++) {
            const s = []; let v = t, ok = true;
            for (let i = 0; i < k; i++) { const d = v % n; v = (v - d) / n; if (s.includes(d)) { ok = false; break; } s.push(d); }
            if (ok) out.push(s);
        }
    } else for (let i = 0; i < 2500; i++) out.push(sample(n, k));
    return TUP[key] = out;
}
function profile(S, p) {
    if (S.prof[p[0]]) return S.prof[p[0]];
    const T = tuples(S.n, p[1]), v = new Uint8Array(T.length); let c = 0;
    for (let i = 0; i < T.length; i++) if (p[2](S, ...T[i])) { v[i] = 1; c++; }
    return S.prof[p[0]] = { v, rate: c / T.length };
}
const APERM = {};
function argPerms(k) {
    if (APERM[k]) return APERM[k];
    const out = [], a = range(k);
    (function rec(i) { if (i === k) { out.push(a.slice()); return; } for (let j = i; j < k; j++) { [a[i], a[j]] = [a[j], a[i]]; rec(i + 1); [a[i], a[j]] = [a[j], a[i]]; } })(0);
    return APERM[k] = out;
}
// is q, read with its arguments reordered by pi, the same relation as p on this shape?
function same(S, p, q, pi) {
    const T = tuples(S.n, p[1]), v = profile(S, p).v;
    for (let i = 0; i < T.length; i++) { const t = T[i]; if ((q[2](S, ...pi.map(j => t[j])) ? 1 : 0) !== v[i]) return false; }
    return true;
}
const sameAny = (S, p, q) => argPerms(p[1]).some(pi => same(S, p, q, pi));

// ------------------------------------------------------------------ arrangements
const PERMS = {};
function perms(n) {
    if (PERMS[n]) return PERMS[n];
    const out = [], a = range(n);
    (function rec(i) { if (i === n) { for (let j = 0; j < n; j++) out.push(a[j]); return; } for (let j = i; j < n; j++) { [a[i], a[j]] = [a[j], a[i]]; rec(i + 1); [a[i], a[j]] = [a[j], a[i]]; } })(0);
    return PERMS[n] = Uint8Array.from(out);
}
// Does fact f hold when object o sits on place arr[off + o]?  (-1 = not placed)
function val(W, f, arr, off) {
    const r = W.rels[f.r], n = W.S.n, a = f.a;
    let idx = 0, mul = 1;
    for (let i = 0; i < r.k; i++) { const s = arr[off + a[r.ord[i]]]; if (s === 255 || s < 0) return false; idx += s * mul; mul *= n; }
    let v = r.tab[idx];
    if (!v) { const s = []; for (let i = 0; i < r.k; i++) s.push(arr[off + a[r.ord[i]]]); v = r.tab[idx] = r.f(W.S, ...s) ? 2 : 1; }
    return (v === 2) !== r.neg;
}
const filt = (W, M, f) => { const n = W.S.n, out = []; for (let i = 0; i < M.length; i++) if (val(W, f, W.P, M[i] * n)) out.push(M[i]); return out; };
const count = (W, M, f) => { const n = W.S.n; let c = 0; for (let i = 0; i < M.length; i++) if (val(W, f, W.P, M[i] * n)) c++; return c; };
const placeOf = (W, m) => Array.from(W.P.subarray(m * W.S.n, (m + 1) * W.S.n));
const sat = (W, facts, place) => facts.map(f => val(W, f, place, 0));

// ------------------------------------------------------------------ worlds
// level -> arity k, objects n, facts F. Arity rises first, then depth, then size.
const LADDER = [[2, 5, 3], [3, 5, 3], [3, 5, 4], [4, 5, 4], [4, 6, 4], [4, 6, 5], [5, 6, 5], [5, 7, 5], [5, 7, 6], [5, 7, 7], [5, 8, 7], [5, 8, 8]];
function params(level, deep) {
    const i = Math.max(1, level) - 1, b = LADDER[Math.min(i, LADDER.length - 1)];
    let [k, n, F] = b; F += Math.max(0, i - LADDER.length + 1);
    if (deep) { n = Math.min(8, n + 2); F += 2; }
    return { k, n, F };
}
function makeWorld(P, held) {
    for (let att = 0; att < 300; att++) {
        const S = pickShape(P.n, held); if (!S) continue;
        const cand = LIB.filter(p => p[1] <= P.k && (held || !p[3])).filter(p => { const r = profile(S, p).rate; return r >= 0.1 && r <= 0.66; });
        const plan = P.k === 2 ? [2, 2, 2] : P.k === 3 ? [3, pick([3, 2]), 2] : [P.k, pick([P.k, P.k - 1]), pick([2, 3])];
        const chosen = [];
        for (const k of plan) {
            let c = shuffle(cand.filter(p => p[1] === k));
            if (held) c = c.filter(p => p[3]).concat(c.filter(p => !p[3]));
            const p = c.find(p => !chosen.some(q => q[1] === k && sameAny(S, q, p)));
            if (p) chosen.push(p);
        }
        if (chosen.length < 3) continue;
        const gl = shuffle([0, 1, 2, 3, 4, 5, 6, 11]).slice(0, 3);
        const W = { S, P: perms(S.n), rels: chosen.map((p, i) => ({ id: p[0], k: p[1], f: p[2], lib: p, neg: false, ord: range(p[1]), tab: new Uint8Array(Math.pow(S.n, p[1])), rate: profile(S, p).rate, glyph: gl[i] })) };
        W.all = range(W.P.length / S.n);
        W.floor = floorOf(W);
        if (W.floor > 4) continue;                       // too symmetric: few arrangements can be told apart
        W.crack = makeCrack(W);
        if (W.crack) return W;
    }
    throw new Error('no world');
}

// ------------------------------------------------------------------ crack: what does each sign mean?
// Example boards carry statements marked true or false. They are chosen so that, for every sign, no
// other relation in the library (with its arguments in any order) fits all of the marks.
function makeCrack(W) {
    const S = W.S, n = S.n;
    const riv = W.rels.map(r => {
        const out = [];
        for (const p of LIB) if (p[1] === r.k) for (const pi of argPerms(r.k)) if (!same(S, r.lib, p, pi)) out.push({ f: p[2], pi });
        return out;
    });
    const boards = [];
    const add = () => {
        const place = shuffle(range(n)), items = [];
        W.rels.forEach((r, ri) => {
            let nt = 0, nf = 0;
            for (let c = 0; c < 3; c++) {
                let best = null, bs = -1e9;
                for (let t = 0; t < 40; t++) {
                    const a = sample(n, r.k); if (items.some(it => it.r === ri && it.a.join() === a.join())) continue;
                    const v = val(W, { r: ri, a }, place, 0), s = a.map(o => place[o]);
                    let sc = Math.random();
                    for (const q of riv[ri]) if (q.f(S, ...q.pi.map(i => s[i])) !== v) sc++;
                    if (v ? nt === 0 : nf === 0) sc += 1e6; else if (v ? nt > nf : nf > nt) sc -= 0.5;
                    if (sc > bs) { bs = sc; best = { r: ri, a, v }; }
                }
                if (!best) break;
                items.push(best); if (best.v) nt++; else nf++;
                const s = best.a.map(o => place[o]);
                riv[ri] = riv[ri].filter(q => q.f(S, ...q.pi.map(i => s[i])) === best.v);
            }
        });
        boards.push({ place, items });                  // kept grouped by sign, so the marks for one sign can be compared
    };
    add(); add(); if (W.rels.some(r => r.k >= 4)) add();
    while (riv.some(x => x.length) && boards.length < 4) add();
    return riv.some(x => x.length) ? null : { boards, add };
}
function crackTest(W) {
    const n = W.S.n, place = shuffle(range(n)), items = [];
    W.rels.forEach((r, ri) => {
        for (const want of [true, false]) {
            let got = null;
            for (let t = 0; t < 80 && !got; t++) {
                const a = sample(n, r.k);
                if (val(W, { r: ri, a }, place, 0) === want && !items.some(it => it.r === ri && it.a.join() === a.join())) got = { r: ri, a, v: want };
            }
            if (got) items.push(got);
        }
    });
    return { place, items: shuffle(items) };
}

// ------------------------------------------------------------------ rounds
function randFact(W, bias) {
    const ri = bias && Math.random() < 0.6 ? pick(bias) : rnd(W.rels.length);
    return { r: ri, a: sample(W.S.n, W.rels[ri].k) };
}
// How many arrangements can no statement in this world tell apart (mirror images and the like).
function floorOf(W) {
    const n = W.S.n, h = rnd(W.all.length); let M = W.all;
    for (let ri = 0; ri < W.rels.length && M.length > 1; ri++) for (const a of tuples(n, W.rels[ri].k)) {
        const f = { r: ri, a }, v = val(W, f, W.P, h * n), out = [];
        for (let i = 0; i < M.length; i++) if (val(W, f, W.P, M[i] * n) === v) out.push(M[i]);
        M = out; if (M.length === 1) break;
    }
    return M.length;
}
// F facts, all true of a hidden arrangement h, chosen so each one cuts the surviving arrangements by
// about the same factor (so none is decoration). o.t / o.max / o.min are in units of the world's floor.
function genRound(W, F, o) {
    const n = W.S.n, fl = W.floor; let last = null;
    for (let att = 0; att < 90; att++) {
        // a world that cannot carry F facts that all matter gets fewer facts, never padding
        const loose = att >= 60, h = rnd(W.all.length), full = F;
        F = Math.max(2, full - (att < 30 ? 0 : att < 45 ? 1 : 2));
        let M = W.all; const facts = []; let ok = true;
        for (let s = 0; s < F; s++) {
            const want = Math.max(fl, M.length * Math.pow(o.t * fl / M.length, 1 / (F - s)));
            const est = M.length > 6000 ? range(2500).map(() => M[rnd(M.length)]) : M;
            let best = null, bd = Infinity;
            for (let c = 0; c < 36; c++) {
                const f = randFact(W, o.bias);
                if (!val(W, f, W.P, h * n) || facts.some(g => g.r === f.r && g.a.join() === f.a.join())) continue;
                const left = count(W, est, f) / est.length * M.length;
                if (left > M.length - 0.5 || (!loose && s < F - 1 && left <= fl * 1.2)) continue;   // adds nothing, or leaves nothing for later facts
                let d = Math.log(left / want); d = d < 0 ? -2 * d : d;
                if (d < bd) { bd = d; best = f; }
            }
            const m = best && filt(W, M, best);
            if (!best || m.length === M.length) { ok = loose && facts.length >= 1; F = full; break; }
            facts.push(best); M = m;
        }
        if (!ok) continue;
        F = full;
        last = { facts: shuffle(facts), h, M };
        if (loose) break;
        const lim = att < 30 ? 1 : 3;
        if (M.length > o.max * fl * lim || M.length < (att < 30 ? o.min * fl : 1)) continue;
        if (new Set(facts.flatMap(f => f.a)).size < n) continue;
        if (facts.some((_, i) => facts.reduce((m, f, j) => j === i ? m : filt(W, m, f), W.all).length === M.length)) continue;   // a fact that adds nothing
        break;
    }
    return last;
}
// Is claim c already decided by one fact alone (depth 1) or by some pair (depth 2)?
function settled(W, R, c, depth) {
    const facts = R.facts, one = R.one || (R.one = facts.map(f => filt(W, W.all, f)));
    const dec = m => { const t = count(W, m, c); return t === 0 || t === m.length; };
    if (one.some(dec)) return true;
    if (depth > 1) for (let i = 0; i < facts.length; i++) for (let j = i + 1; j < facts.length; j++) if (dec(filt(W, one[i], facts[j]))) return true;
    return false;
}
// Claims answered must (1) / can't (0) / open (-1). A decided claim has to need several facts.
function genClaims(W, R, num) {
    const open = R.M.length > 1, kinds = open ? [1, 0, -1] : [1, 0];
    const wants = range(num).map(() => pick(kinds));
    if (num > 1 && wants.every(w => w === wants[0])) wants[0] = pick(kinds.filter(w => w !== wants[0]));
    const pool = [];
    for (let i = 0; i < 240; i++) {
        const f = randFact(W); if (R.facts.some(g => g.r === f.r && g.a.join() === f.a.join())) continue;
        const t = count(W, R.M, f);
        pool.push({ f, st: t === R.M.length ? 1 : t === 0 ? 0 : -1 });
    }
    const out = [];
    const find = (w, depth) => {
        let tries = 0;
        for (const c of pool) {
            if (c.used || c.st !== w || out.some(x => x.f.a.slice().sort().join() === c.f.a.slice().sort().join())) continue;
            if (w !== -1 && depth) { if (++tries > 25) return null; if (settled(W, R, c.f, depth)) continue; }
            return c;
        }
        return null;
    };
    for (const w of wants) {
        // the wanted answer needing 3+ facts, else 2+; failing that another answer rather than a one-fact read
        const got = find(w, 2) || find(w, 1) || kinds.filter(x => x !== w).map(x => find(x, 1)).find(Boolean) || pool.find(c => !c.used);
        got.used = true; out.push({ f: got.f, st: got.st });
    }
    return out;
}
// statements about a fully known arrangement, about half of them true
function knownClaims(W, place, num) {
    const out = [];
    for (let i = 0; i < num; i++) {
        const want = i % 2 === 0; let got = null;
        for (let t = 0; t < 80; t++) { const f = randFact(W); if (out.some(x => x.f.r === f.r && x.f.a.join() === f.a.join())) continue; got = f; if (val(W, f, place, 0) === want) break; }
        out.push({ f: got, st: val(W, got, place, 0) ? 1 : 0 });
    }
    return shuffle(out);
}
// the same structure with the objects renamed
function disguise(W, R) {
    const s = shuffle(range(W.S.n)), facts = R.facts.map(f => ({ r: f.r, a: f.a.map(o => s[o]) }));
    const M = facts.reduce((m, f) => filt(W, m, f), W.all);
    return { facts: shuffle(facts), M, h: pick(M) };
}

// ------------------------------------------------------------------ shift and operations
function shift(W) {
    const R = W.rels, opts = [];
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (R[i].k === R[j].k) opts.push({ t: 'swap', i, j });
    R.forEach((r, i) => {
        opts.push({ t: 'neg', i });
        if (!same(W.S, r.lib, r.lib, range(r.k).reverse())) opts.push({ t: 'rev', i });
    });
    const o = pick(opts);
    if (o.t === 'swap') { const g = R[o.i].glyph; R[o.i].glyph = R[o.j].glyph; R[o.j].glyph = g; }
    if (o.t === 'neg') { R[o.i].neg = !R[o.i].neg; R[o.i].rate = 1 - R[o.i].rate; }
    if (o.t === 'rev') R[o.i].ord.reverse();
    return o;
}
// a move of places: whatever sits on place i goes to pi[i]
function genOp(W, moved) {
    const S = W.S, sym = [];
    const maps = [p => [-p[0], p[1]], p => [p[0], -p[1]], p => [-p[0], -p[1]]];
    for (const q of [3, 4, 5, 6, 7, 8]) { const c = Math.cos(2 * Math.PI / q), s = Math.sin(2 * Math.PI / q); maps.push(p => [p[0] * c - p[1] * s, p[0] * s + p[1] * c]); }
    for (const f of maps) {
        const pi = S.xy.map(p => { const q = f(p); return S.xy.findIndex(r => Math.abs(r[0] - q[0]) < 1e-3 && Math.abs(r[1] - q[1]) < 1e-3); });
        if (pi.every(v => v >= 0) && new Set(pi).size === S.n && pi.some((v, i) => v !== i)) sym.push(pi);
    }
    if (sym.length && Math.random() < 0.5) return pick(sym);
    const pi = range(S.n), c = sample(S.n, Math.min(S.n, moved));
    if (c.length === 4 && Math.random() < 0.5) { pi[c[0]] = c[1]; pi[c[1]] = c[0]; pi[c[2]] = c[3]; pi[c[3]] = c[2]; }
    else c.forEach((v, i) => { pi[v] = c[(i + 1) % c.length]; });
    return pi;
}

root.CSE = { params, makeWorld, crackTest, genRound, genClaims, knownClaims, disguise, shift, genOp, val, sat, filt, count, placeOf, settled, LIB, argPerms, tuples, shuffle, range, rnd, pick };
})(typeof window !== 'undefined' ? window : globalThis);
