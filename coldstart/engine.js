// Cold Start engine. No DOM: runs in the browser and in Node (check.js).
//
// A WORLD is a board of n places (coordinates + links) and three signs. Each sign stands for a relation
// among 2-5 objects, defined on the board's geometry and links alone, so one library serves every board.
// The library is built from parts: base relations between two places, and templates that spread one
// base relation over several objects (exactly j of these, both of these, the same as, exactly one of
// two), plus a few geometric relations. An ARRANGEMENT puts n objects on the n places. Every check below
// lists all arrangements and keeps the ones that survive the facts.
(function (root) {
'use strict';
const E = 1e-6;
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
const range = n => [...Array(n).keys()];
const sample = (n, k) => shuffle(range(n)).slice(0, k);

// ------------------------------------------------------------------ boards
function shape(name, xy, edges, held) {
    const n = xy.length, t = rnd(8);
    // a random quarter turn and mirror: the kind of board does not fix which way anything points
    xy = xy.map(([x, y]) => { if (t & 4) x = -x; for (let i = 0; i < (t & 3); i++) [x, y] = [-y, x]; return [x, y]; });
    const cx = xy.reduce((s, p) => s + p[0], 0) / n, cy = xy.reduce((s, p) => s + p[1], 0) / n;
    xy = xy.map(p => [p[0] - cx, p[1] - cy]);
    const gd = range(n).map(() => Array(n).fill(99)), adj = range(n).map(() => []);
    for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
    for (let s = 0; s < n; s++) {
        gd[s][s] = 0; const q = [s];
        for (let i = 0; i < q.length; i++) for (const v of adj[q[i]]) if (gd[s][v] === 99) { gd[s][v] = gd[s][q[i]] + 1; q.push(v); }
    }
    return { name, n, xy, edges, gd, deg: adj.map(a => a.length), diam: Math.max(...gd.flat().filter(d => d < 99)), held: !!held, prof: {} };
}
const circle = (m, R) => range(m).map(i => { const t = 2 * Math.PI * i / m - Math.PI / 2; return [R * Math.cos(t), R * Math.sin(t)]; });
const rad = m => Math.max(0.8, 1 / (2 * Math.sin(Math.PI / m)));
const SHAPES = {
    path: n => shape('path', range(n).map(i => [i, 0]), range(n - 1).map(i => [i, i + 1])),
    ring: n => shape('ring', circle(n, rad(n)), range(n).map(i => [i, (i + 1) % n])),
    grid: n => {
        const dims = { 4: [[2, 2]], 6: [[2, 3]], 8: [[2, 4]] }[n]; if (!dims) return null;
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
const ed = (S, a, b) => { const dx = gx(S, a) - gx(S, b), dy = gy(S, a) - gy(S, b); return dx * dx + dy * dy; };
const side = (S, a, b, c) => (gx(S, b) - gx(S, a)) * (gy(S, c) - gy(S, a)) - (gy(S, b) - gy(S, a)) * (gx(S, c) - gx(S, a));
const dot = (S, a, b, c) => (gx(S, b) - gx(S, a)) * (gx(S, c) - gx(S, a)) + (gy(S, b) - gy(S, a)) * (gy(S, c) - gy(S, a));
const B = (S, a, b, c) => S.gd[a][c] < 99 && S.gd[a][b] + S.gd[b][c] === S.gd[a][c];

// base relations between two places: [id, test, symmetric, held out of training]
const BASE = [
    ['L', L], ['A', A], ['R0', R0, 1], ['C0', C0, 1], ['N', N, 1], ['G', (S, a, b) => S.gd[a][b] < 99, 1],
    ['D2', (S, a, b) => S.gd[a][b] === 2, 1], ['F3', (S, a, b) => S.gd[a][b] >= 3 && S.gd[a][b] < 99, 1],
    ['OPP', (S, a, b) => S.gd[a][b] === S.diam, 1],
    ['NL', (S, a, b) => N(S, a, b) && L(S, a, b)], ['NA', (S, a, b) => N(S, a, b) && A(S, a, b)],
    ['RL', (S, a, b) => R0(S, a, b) && L(S, a, b)], ['CA', (S, a, b) => C0(S, a, b) && A(S, a, b)],
    ['SDG', (S, a, b) => S.deg[a] === S.deg[b], 1], ['MDG', (S, a, b) => S.deg[a] > S.deg[b]],
    ['MIR', (S, a, b) => Math.abs(gx(S, a) + gx(S, b)) < E && Math.abs(gy(S, a) - gy(S, b)) < E, 1, 1],
    ['DG', (S, a, b) => { const dx = Math.abs(gx(S, a) - gx(S, b)), dy = Math.abs(gy(S, a) - gy(S, b)); return dx > E && Math.abs(dx - dy) < E; }, 1, 1],
];
// whole relations held out for the probe even though their parts are trained: tests composition itself
const HOLD = ['same:N', 'cnt:R0', 'xor:D2', 'all:CA', "all:CA'"];

const LIB = [];
const sw = (k, i, j) => { const g = range(k); g[i] = j; g[j] = i; return g; };
function closure(k, gens) {
    const seen = new Map([[range(k).join(), range(k)]]), q = [range(k)];
    for (let i = 0; i < q.length; i++) for (const g of gens) {
        const h = q[i].map(j => g[j]), key = h.join();
        if (!seen.has(key)) { seen.set(key, h); q.push(h); }
    }
    return [...seen.values()];
}
// sym: every reordering of the arguments that leaves the relation unchanged (used to avoid testing one
// reading many times over; check.js confirms each one)
function rel(id, k, f, gens, fam, held) { LIB.push({ id, k, f, sym: closure(k, gens), fam, held: !!held }); }

for (const [id, f, sym, held] of BASE) rel(id, 2, f, sym ? [sw(2, 0, 1)] : [], 'base', held);
const DIR = [];
for (const [id, f, sym, held] of BASE) { DIR.push([id, f, held]); if (!sym) DIR.push([id + "'", (S, a, b) => f(S, b, a), held]); }
for (const [id, f, held] of DIR) {
    const h = t => !!held || HOLD.includes(t + ':' + id);
    rel('xor:' + id, 3, (S, a, b, c) => f(S, a, b) !== f(S, a, c), [sw(3, 1, 2)], 'xor', h('xor'));
    rel('all:' + id, 3, (S, a, b, c) => f(S, a, b) && f(S, a, c), [sw(3, 1, 2)], 'all', h('all'));
    for (const j of [1, 2, 3]) {
        rel(`c4${j}:${id}`, 4, (S, a, b, c, d) => f(S, a, b) + f(S, a, c) + f(S, a, d) === j, [sw(4, 1, 2), sw(4, 2, 3)], 'count', h('cnt'));
        rel(`c5${j}:${id}`, 5, (S, a, b, c, d, e) => f(S, a, b) + f(S, a, c) + f(S, a, d) + f(S, a, e) === j, [sw(5, 1, 2), sw(5, 2, 3), sw(5, 3, 4)], 'count', h('cnt'));
    }
}
for (const [id, f, sym, held] of BASE) rel('same:' + id, 4, (S, a, b, c, d) => f(S, a, b) === f(S, c, d), sym ? [[2, 3, 0, 1], sw(4, 0, 1)] : [[2, 3, 0, 1]], 'same', !!held || HOLD.includes('same:' + id));
const geo = (id, k, f, gens, held) => rel(id, k, f, gens, 'geo', held);
geo('B', 3, B, [sw(3, 0, 2)]);
geo('M', 3, (S, a, b, c) => B(S, a, b, c) && S.gd[a][b] === S.gd[b][c], [sw(3, 0, 2)]);
geo('EQ', 3, (S, a, b, c) => S.gd[a][b] === S.gd[a][c] && S.gd[a][b] < 99, [sw(3, 1, 2)]);
geo('CL', 3, (S, a, b, c) => S.gd[a][b] < S.gd[a][c], []);
geo('XL', 3, (S, a, b, c) => (L(S, b, a) && L(S, a, c)) || (L(S, c, a) && L(S, a, b)), [sw(3, 1, 2)]);
geo('XA', 3, (S, a, b, c) => (A(S, b, a) && A(S, a, c)) || (A(S, c, a) && A(S, a, b)), [sw(3, 1, 2)]);
geo('COL', 3, (S, a, b, c) => Math.abs(side(S, a, b, c)) < E, [sw(3, 0, 1), sw(3, 1, 2)]);
geo('CRN', 3, (S, a, b, c) => R0(S, a, b) && C0(S, a, c), []);
geo('ANG', 3, (S, a, b, c) => Math.abs(dot(S, a, b, c)) < E, [sw(3, 1, 2)]);
geo('EQD', 3, (S, a, b, c) => Math.abs(ed(S, a, b) - ed(S, a, c)) < E, [sw(3, 1, 2)]);
geo('ECL', 3, (S, a, b, c) => ed(S, a, b) < ed(S, a, c) - E, [], 1);
geo('CW', 3, (S, a, b, c) => side(S, a, b, c) > E, [[1, 2, 0]], 1);
geo('SV', 4, (S, a, b, c, d) => Math.abs(gx(S, b) - gx(S, a) - gx(S, d) + gx(S, c)) < E && Math.abs(gy(S, b) - gy(S, a) - gy(S, d) + gy(S, c)) < E, [[2, 3, 0, 1], [1, 0, 3, 2]]);
geo('SD', 4, (S, a, b, c, d) => S.gd[a][b] === S.gd[c][d], [[2, 3, 0, 1], sw(4, 0, 1)]);
geo('FD', 4, (S, a, b, c, d) => S.gd[a][b] > S.gd[c][d], [sw(4, 0, 1), sw(4, 2, 3)]);
geo('ESD', 4, (S, a, b, c, d) => Math.abs(ed(S, a, b) - ed(S, c, d)) < E, [[2, 3, 0, 1], sw(4, 0, 1)]);
geo('PAR', 4, (S, a, b, c, d) => Math.abs((gx(S, b) - gx(S, a)) * (gy(S, d) - gy(S, c)) - (gy(S, b) - gy(S, a)) * (gx(S, d) - gx(S, c))) < E, [[2, 3, 0, 1], sw(4, 0, 1)]);
geo('CROSS', 4, (S, a, b, c, d) => side(S, a, b, c) * side(S, a, b, d) < -E && side(S, c, d, a) * side(S, c, d, b) < -E, [[2, 3, 0, 1], sw(4, 0, 1)]);
geo('SSIDE', 4, (S, a, b, c, d) => side(S, a, b, c) * side(S, a, b, d) > E, [sw(4, 0, 1), sw(4, 2, 3)]);
geo('FR3', 4, (S, a, b, c, d) => S.gd[a][b] < 99 && S.gd[a][b] > S.gd[a][c] && S.gd[a][b] > S.gd[a][d], [sw(4, 2, 3)]);
geo('PERP', 4, (S, a, b, c, d) => Math.abs((gx(S, b) - gx(S, a)) * (gx(S, d) - gx(S, c)) + (gy(S, b) - gy(S, a)) * (gy(S, d) - gy(S, c))) < E, [[2, 3, 0, 1], sw(4, 0, 1)], 1);
geo('NR3', 4, (S, a, b, c, d) => S.gd[a][b] < S.gd[a][c] && S.gd[a][b] < S.gd[a][d], [sw(4, 2, 3)], 1);
geo('FR4', 5, (S, a, b, c, d, e) => S.gd[a][b] < 99 && S.gd[a][b] > S.gd[a][c] && S.gd[a][b] > S.gd[a][d] && S.gd[a][b] > S.gd[a][e], [sw(5, 2, 3), sw(5, 3, 4)]);
geo('NR4', 5, (S, a, b, c, d, e) => S.gd[a][b] < S.gd[a][c] && S.gd[a][b] < S.gd[a][d] && S.gd[a][b] < S.gd[a][e], [sw(5, 2, 3), sw(5, 3, 4)], 1);

// every ordered tuple of k distinct places (at most 6720)
const TUP = {};
function tuples(n, k) {
    const key = n + ':' + k; if (TUP[key]) return TUP[key];
    const out = [], cur = [];
    (function rec() { if (cur.length === k) { out.push(cur.slice()); return; } for (let v = 0; v < n; v++) if (!cur.includes(v)) { cur.push(v); rec(); cur.pop(); } })();
    return TUP[key] = out;
}
function profile(S, p) {
    if (S.prof[p.id]) return S.prof[p.id];
    const T = tuples(S.n, p.k), v = new Uint8Array(T.length); let c = 0;
    for (let i = 0; i < T.length; i++) if (p.f(S, ...T[i])) { v[i] = 1; c++; }
    return S.prof[p.id] = { v, rate: c / T.length };
}
const APERM = {};
function argPerms(k) {
    if (APERM[k]) return APERM[k];
    const out = [], a = range(k);
    (function rec(i) { if (i === k) { out.push(a.slice()); return; } for (let j = i; j < k; j++) { [a[i], a[j]] = [a[j], a[i]]; rec(i + 1); [a[i], a[j]] = [a[j], a[i]]; } })(0);
    return APERM[k] = out;
}
// the argument orders that give genuinely different readings of p
function orders(p) {
    if (p.orders) return p.orders;
    const seen = new Set(), out = [];
    for (const pi of argPerms(p.k)) {
        let key = null;
        for (const g of p.sym) { const s = g.map(j => pi[j]).join(); if (key === null || s < key) key = s; }
        if (!seen.has(key)) { seen.add(key); out.push(pi); }
    }
    return p.orders = out;
}
// does test f, reading its arguments from positions pi of a statement, agree with relation p everywhere?
function agrees(S, p, f, pi) {
    const T = tuples(S.n, p.k), v = profile(S, p).v;
    for (let i = 0; i < T.length; i++) { const t = T[i]; if ((f(S, ...pi.map(j => t[j])) ? 1 : 0) !== v[i]) return false; }
    return true;
}
const sameAny = (S, p, q) => orders(q).some(pi => agrees(S, p, q.f, pi));

// ------------------------------------------------------------------ arrangements and facts
const PERMS = {};
function perms(n) {
    if (PERMS[n]) return PERMS[n];
    const out = [], a = range(n);
    (function rec(i) { if (i === n) { for (let j = 0; j < n; j++) out.push(a[j]); return; } for (let j = i; j < n; j++) { [a[i], a[j]] = [a[j], a[i]]; rec(i + 1); [a[i], a[j]] = [a[j], a[i]]; } })(0);
    return PERMS[n] = Uint8Array.from(out);
}
// A fact { r: sign, a: objects in order, no: negated }. Does it hold when object o sits on place
// arr[off + o]? An object not yet placed (-1) makes every fact about it fail.
function val(W, f, arr, off) {
    const r = W.rels[f.r], n = W.S.n, a = f.a;
    let idx = 0, mul = 1;
    for (let i = 0; i < r.k; i++) { const s = arr[off + a[r.ord[i]]]; if (s === 255 || s < 0) return false; idx += s * mul; mul *= n; }
    let v = r.tab[idx];
    if (!v) { const s = []; for (let i = 0; i < r.k; i++) s.push(arr[off + a[r.ord[i]]]); v = r.tab[idx] = r.f(W.S, ...s) ? 2 : 1; }
    return ((v === 2) !== r.neg) !== !!f.no;
}
// the same, for a sign object outside the world (used to test candidate meanings); s = places in order
const relHolds = (S, r, s) => !!r.f(S, ...r.ord.map(i => s[i])) !== r.neg;
const filt = (W, M, f) => { const n = W.S.n, out = []; for (let i = 0; i < M.length; i++) if (val(W, f, W.P, M[i] * n)) out.push(M[i]); return out; };
const count = (W, M, f) => { const n = W.S.n; let c = 0; for (let i = 0; i < M.length; i++) if (val(W, f, W.P, M[i] * n)) c++; return c; };
const placeOf = (W, m) => Array.from(W.P.subarray(m * W.S.n, (m + 1) * W.S.n));
const sat = (W, facts, place) => facts.map(f => val(W, f, place, 0));
// chance that a random arrangement satisfies f
function chanceOf(W, f) {
    const r = W.rels[f.r], p = profile(W.S, r.lib).rate;
    return (r.neg !== !!f.no) ? 1 - p : p;
}

// ------------------------------------------------------------------ worlds
// level -> arity k, objects n, facts F. Arity rises first, then depth, then size.
const LADDER = [[2, 5, 3], [3, 5, 3], [3, 5, 4], [4, 5, 4], [4, 6, 4], [4, 6, 5], [5, 6, 5], [5, 7, 5], [5, 7, 6], [5, 7, 7], [5, 8, 7], [5, 8, 8]];
function params(level, deep) {
    const i = Math.max(1, level) - 1, b = LADDER[Math.min(i, LADDER.length - 1)];
    let [k, n, F] = b; F += Math.max(0, i - LADDER.length + 1);
    if (deep) { n = Math.min(8, n + 2); F += 2; }
    return { k, n, F };
}
// one relation of arity k: a family first (so counts do not crowd out everything else), then a member
function choose(S, k, pools, chosen) {
    for (const pool0 of pools) {
        let pool = pool0.filter(p => p.k === k);
        for (let t = 0; t < 40 && pool.length; t++) {
            const fam = pick([...new Set(pool.map(p => p.fam))]), p = pick(pool.filter(q => q.fam === fam));
            pool = pool.filter(q => q !== p);
            const r = profile(S, p).rate;
            if (r < 0.1 || r > 0.66 || chosen.some(q => q.k === k && sameAny(S, q, p))) continue;
            return p;
        }
    }
    return null;
}
const mkRel = (S, p, glyph) => ({ id: p.id, k: p.k, f: p.f, lib: p, neg: false, ord: range(p.k), tab: new Uint8Array(Math.pow(S.n, p.k)), glyph });
function makeWorld(P, held) {
    const pools = held ? [LIB.filter(p => p.held), LIB] : [LIB.filter(p => !p.held)];
    for (let att = 0; att < 300; att++) {
        const S = pickShape(P.n, held); if (!S) continue;
        const plan = P.k === 2 ? [2, 2, 2] : P.k === 3 ? [3, pick([3, 2]), 2] : [P.k, pick([P.k, P.k - 1]), pick([2, 3])];
        const chosen = [];
        for (const k of plan) { const p = choose(S, k, pools, chosen); if (p) chosen.push(p); }
        if (chosen.length < 3) continue;
        const gl = shuffle([0, 1, 2, 3, 4, 5, 6, 11]).slice(0, 3);   // never the arrows: a sign must not look like what it means
        const W = { S, P: perms(S.n), rels: chosen.map((p, i) => mkRel(S, p, gl[i])) };
        W.all = range(W.P.length / S.n);
        W.floor = floorOf(W);
        if (W.floor > 4) continue;                       // too symmetric: few arrangements can be told apart
        W.crack = makeCrack(W);
        if (W.crack) return W;
    }
    throw new Error('no world');
}

// ------------------------------------------------------------------ crack: what does each sign mean?
// Rival readings of a sign: every library relation of the same arity in every distinct argument order,
// and every base relation on any two of its objects (the simplest wrong idea: "it only looks at two").
function rivals(S, r) {
    const out = [];
    for (const p of LIB) if (p.k === r.k) for (const pi of orders(p)) if (!agrees(S, r.lib, p.f, pi)) out.push({ f: p.f, pi });
    if (r.k > 2) for (const [, f, sym] of BASE) for (let i = 0; i < r.k; i++) for (let j = sym ? i + 1 : 0; j < r.k; j++) {
        if (i !== j && !agrees(S, r.lib, f, [i, j])) out.push({ f, pi: [i, j] });
    }
    return out;
}
// Example boards carry statements marked true or false, chosen until every rival reading of every sign
// is contradicted by some mark.
function makeCrack(W) {
    const S = W.S, n = S.n, riv = W.rels.map(r => rivals(S, r)), boards = [];
    const add = () => {
        const place = shuffle(range(n)), items = [];
        W.rels.forEach((r, ri) => {
            let nt = 0, nf = 0;
            for (let c = 0; c < (r.k >= 4 ? 4 : 3); c++) {
                let best = null, bs = -1e9;
                for (let t = 0; t < 40; t++) {
                    const a = sample(n, r.k); if (items.some(it => it.r === ri && it.a.join() === a.join())) continue;
                    const v = val(W, { r: ri, a }, place, 0), s = a.map(o => place[o]);
                    let sc = Math.random();
                    for (const q of riv[ri]) if (!!q.f(S, ...q.pi.map(i => s[i])) !== v) sc++;
                    if (v ? nt === 0 : nf === 0) sc += 1e6; else if (v ? nt > nf : nf > nt) sc -= 0.5;
                    if (sc > bs) { bs = sc; best = { r: ri, a, v }; }
                }
                if (!best) break;
                items.push(best); if (best.v) nt++; else nf++;
                const s = best.a.map(o => place[o]);
                riv[ri] = riv[ri].filter(q => !!q.f(S, ...q.pi.map(i => s[i])) === best.v);
            }
        });
        boards.push({ place, items });                  // grouped by sign, so one sign's marks can be compared
    };
    add(); add(); if (W.rels.some(r => r.k >= 4)) add();
    while (riv.some(x => x.length) && boards.length < 5) add();
    return riv.some(x => x.length) ? null : { boards, add };
}
// one true and one false statement per sign on a fresh board
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
// How many arrangements no statement in this world can tell apart (mirror images and the like).
function floorOf(W) {
    const n = W.S.n, h = rnd(W.all.length); let M = W.all;
    for (let ri = 0; ri < W.rels.length && M.length > 1; ri++) for (const a of tuples(n, W.rels[ri].k)) {
        const f = { r: ri, a }, v = val(W, f, W.P, h * n), out = [];
        for (let i = 0; i < M.length; i++) if (val(W, f, W.P, M[i] * n) === v) out.push(M[i]);
        M = out; if (M.length === 1) break;
    }
    return M.length;
}
// F facts, all true of a hidden arrangement h, some of them negated, chosen so each one cuts the
// surviving arrangements by about the same factor (none is decoration). o.t / o.max / o.min are in
// units of the world's floor.
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
                const f = randFact(W, o.bias); if (Math.random() < 0.3) f.no = true;
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
        if (loose) {                                      // fallback: still never leave a fact that adds nothing
            for (let i = 0; i < last.facts.length && last.facts.length > 1; i++) {
                const rest = last.facts.filter((_, j) => j !== i);
                if (rest.reduce((m, f) => filt(W, m, f), W.all).length === M.length) { last.facts = rest; i = -1; }
            }
            break;
        }
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
    const s = shuffle(range(W.S.n)), facts = R.facts.map(f => ({ r: f.r, a: f.a.map(o => s[o]), no: f.no }));
    const M = facts.reduce((m, f) => filt(W, m, f), W.all);
    return { facts: shuffle(facts), M, h: pick(M) };
}

// ------------------------------------------------------------------ shift: a sign changes, shown not told
const cloneRels = R => R.map(r => ({ ...r, ord: r.ord.slice() }));
function shiftOptions(S, R) {
    const opts = [];
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (R[i].k === R[j].k) opts.push({ t: 'swap', i, j });
    R.forEach((r, i) => {
        opts.push({ t: 'neg', i });
        if (!tuples(S.n, r.k).every(t => relHolds(S, r, t) === relHolds(S, r, t.slice().reverse()))) opts.push({ t: 'rev', i });
    });
    return opts;
}
function applyShift(R, o) {
    if (o.t === 'swap') { const g = R[o.i].glyph; R[o.i].glyph = R[o.j].glyph; R[o.j].glyph = g; }
    if (o.t === 'neg') R[o.i].neg = !R[o.i].neg;
    if (o.t === 'rev') R[o.i].ord.reverse();
}
const signVal = (S, st, g, s) => relHolds(S, st.find(x => x.glyph === g), s);
const sameMeaning = (S, X, Y) => X.every(r => tuples(S.n, r.k).every(t => relHolds(S, r, t) === signVal(S, Y, r.glyph, t)));
// Marked boards under the new meanings, chosen until every other possible change (and no change at all)
// is contradicted by some mark.
function evidence(W, st, riv) {
    const S = W.S, n = S.n, boards = [];
    const add = () => {
        const place = shuffle(range(n)), items = [];
        st.forEach((r, ri) => {
            let nt = 0, nf = 0;
            for (let c = 0; c < 2; c++) {
                let best = null, bs = -1e9;
                for (let t = 0; t < 40; t++) {
                    const a = sample(n, r.k); if (items.some(it => it.r === ri && it.a.join() === a.join())) continue;
                    const s = a.map(o => place[o]), v = relHolds(S, r, s);
                    let sc = Math.random();
                    for (const q of riv) if (signVal(S, q, r.glyph, s) !== v) sc++;
                    if (v ? nt === 0 : nf === 0) sc += 100;
                    if (sc > bs) { bs = sc; best = { r: ri, a, v }; }
                }
                if (!best) break;
                items.push(best); if (best.v) nt++; else nf++;
                const s = best.a.map(o => place[o]);
                riv = riv.filter(q => signVal(S, q, r.glyph, s) === best.v);
            }
        });
        boards.push({ place, items });
    };
    add(); while (riv.length && boards.length < 3) add();
    return { boards, add, left: riv.length };
}
function shift(W) {
    const S = W.S, before = W.rels, opts = shuffle(shiftOptions(S, before));
    const states = opts.map(o => { const st = cloneRels(before); applyShift(st, o); return st; });
    let res = null;
    for (let i = 0; i < opts.length; i++) {
        const riv = [before, ...states.filter((_, j) => j !== i)].filter(x => !sameMeaning(S, x, states[i]));
        const ev = evidence(W, states[i], riv);
        if (!res || ev.left < res.ev.left) res = { o: opts[i], ev, st: states[i] };
        if (!ev.left) break;
    }
    W.rels = res.st;
    return { o: res.o, ev: res.ev };
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

root.CSE = { params, makeWorld, crackTest, genRound, genClaims, knownClaims, disguise, shift, genOp, val, relHolds, sat, filt, count, placeOf, settled, chanceOf,
    LIB, BASE, SHAPES, pickShape, argPerms, tuples, agrees, shuffle, range, rnd, pick };
})(typeof window !== 'undefined' ? window : globalThis);
