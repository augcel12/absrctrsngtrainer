// perspective.js — every term faces its own way, and where things are is said from someone's point of view.
//
// Space describes positions on one fixed compass. Here there is no compass: each term faces one of four
// ways, "ahead" and "left" belong to whoever the sentence is about, and how two of them are turned to
// each other is stated directly ("A faces a quarter turn right of B"). To place anything you have to take
// that one's point of view — turn your own frame into its frame — which is perspective taking, a
// different spatial ability from building a map.
//
//   2  "B is ahead and to the left of A";  "A faces a quarter turn right of B"
//   3  "From A: B and C are on the same side";  "From A: B is further left than C"
//   4  "From A: B is between C and D, left to right";  "From A: exactly one of B, C and D is on the left"
//   5  "From A: exactly 2 of B, C, D and E are on the left"
//
// Engine. Turning everything together changes nothing that can be said, so the first term always faces
// "north" and the others are enumerated (4^(N-1) ways). For one way of turning them, every statement
// constrains the east–west and north–south orders separately — the same weak orders per axis as Space —
// so each heading assignment is a Space problem. Positions say which way, not how far.

// heading 0..3 = facing north, east, south, west. A frame's left-right axis and its forward axis, as
// [world axis, sign]: from a term facing east, "ahead" is +x and "right" is -y.
const PV_LAT = [[0, 1], [1, -1], [0, -1], [1, 1]];
const PV_FWD = [[1, 1], [0, 1], [1, -1], [0, -1]];
// intrinsic (lateral, forward) signs to world (x, y) signs for a frame facing h
const pvToWorld = (h, lat, fwd) => {
    const w = [0, 0];
    w[PV_LAT[h][0]] += PV_LAT[h][1] * lat;
    w[PV_FWD[h][0]] += PV_FWD[h][1] * fwd;
    return w;
};
const pvToFrame = (h, wx, wy) => {
    const w = [wx, wy];
    return [PV_LAT[h][1] * w[PV_LAT[h][0]], PV_FWD[h][1] * w[PV_FWD[h][0]]];
};
const PV_DIR = {
    '0,1': 'straight ahead of', '0,-1': 'straight behind', '-1,0': 'directly to the left of', '1,0': 'directly to the right of',
    '-1,1': 'ahead and to the left of', '1,1': 'ahead and to the right of', '-1,-1': 'behind and to the left of', '1,-1': 'behind and to the right of',
};
const PV_TURN = ['faces the same way as', 'faces a quarter turn right of', 'faces the opposite way to', 'faces a quarter turn left of'];

function arHeadingSets(n) {
    const key = 'H' + n;
    if (AR_MODELS[key]) return AR_MODELS[key];
    const out = [];
    for (let x = 0; x < (1 << (2 * (n - 1))); x++) {
        const H = new Int8Array(n);
        for (let i = 1; i < n; i++) H[i] = (x >> (2 * (i - 1))) & 3;
        out.push(H);
    }
    return AR_MODELS[key] = out;
}

class ArFrameEngine {
    constructor(n) {
        this.n = n; this.models = arWeak(n); this.full = abFull(this.models.length);
        this.Hs = arHeadingSets(n); this.cache = new Map(); this.pairCache = new Map(); this.maskCache = new Map();
    }
    // a statement's constraint on each axis when the one it is about faces h ([axis0 bits, axis1 bits],
    // null where that axis is left alone)
    axisBits(f) {
        let v = this.cache.get(f.key);
        if (!v) {
            v = [0, 1, 2, 3].map(h => f.axes(h).map(pred => (pred ? abFrom(this.models, pred) : null)));
            this.cache.set(f.key, v);
        }
        return v;
    }
    // The same few sets of statements are tried over and over while an item is built (every candidate
    // conclusion re-checks each premise on its own, and the supports overlap), and a statement's key fixes
    // its meaning, so the worlds a set allows are kept by key.
    mask(facts) {
        const key = facts.map(f => f.key).sort().join('|');
        let M = this.maskCache.get(key);
        if (!M) {
            M = this.maskRaw(facts);
            if (this.maskCache.size > 4000) this.maskCache.clear();
            this.maskCache.set(key, M);
        }
        return M;
    }
    maskRaw(facts) {
        const hdF = facts.filter(f => f.hd), posF = facts.filter(f => !f.hd);
        const refs = posF.map(f => f.ref), abs = posF.map(f => this.axisBits(f));
        const out = [], L = this.full.length, X = new Uint32Array(L), Y = new Uint32Array(L);
        const andAll = (B, axis, H) => {
            B.set(this.full);
            for (let j = 0; j < abs.length; j++) {
                const bits = abs[j][H[refs[j]]][axis];
                if (!bits) continue;
                let any = 0;
                for (let i = 0; i < L; i++) any |= (B[i] &= bits[i]);
                if (!any) return false;
            }
            return true;
        };
        for (const H of this.Hs) {
            let ok = true;
            for (const f of hdF) if (!f.hd(H)) { ok = false; break; }
            if (!ok || !andAll(X, 0, H) || !andAll(Y, 1, H)) continue;
            out.push({ H, X: X.slice(), Y: Y.slice() });
        }
        return out;
    }
    valueM(M, c) {
        let allT = true, allF = true;
        const ab = c.hd ? null : this.axisBits(c);
        for (const w of M) {
            let t, f;
            if (c.hd) { t = c.hd(w.H); f = !t; }
            else {
                const [b0, b1] = ab[w.H[c.ref]];
                t = (!b0 || abSubset(w.X, b0)) && (!b1 || abSubset(w.Y, b1));
                f = (b0 && abDisjoint(w.X, b0)) || (b1 && abDisjoint(w.Y, b1));
            }
            if (!t) allT = false;
            if (!f) allF = false;
            if (!allT && !allF) return null;
        }
        return allT ? true : allF ? false : null;
    }
    value(facts, c) { return this.valueM(this.mask(facts), c); }
    // lt / eq / gt of y against x on one axis
    signClasses(x, y) {
        const key = x + ',' + y;
        let cls = this.pairCache.get(key);
        if (!cls) {
            cls = [-1, 0, 1].map(s => abFrom(this.models, m => arSign(m[y] - m[x]) === s));
            this.pairCache.set(key, cls);
        }
        return cls;
    }
    // is where y stands, as x sees it, left open?
    pairOpen(M, [x, y]) {
        const cls = this.signClasses(x, y);
        let sig = null;
        for (const w of M) {
            const sx = [-1, 0, 1].find((s, i) => abSubset(w.X, cls[i]));
            const sy = [-1, 0, 1].find((s, i) => abSubset(w.Y, cls[i]));
            if (sx === undefined || sy === undefined) return true;
            const s = pvToFrame(w.H[x], sx, sy).join(',');
            if (sig === null) sig = s; else if (sig !== s) return true;
        }
        return false;
    }
}
const AR_FRAME_ENGINES = {};
const arFrameEngine = n => AR_FRAME_ENGINES[n] || (AR_FRAME_ENGINES[n] = new ArFrameEngine(n));

function arPerspectiveFamily() {
    const list = (W, xs) => `${xs.slice(0, -1).map(i => arS(W[i])).join(', ')} ${arR('and')} ${arS(W[xs[xs.length - 1]])}`;
    const from = (W, a) => `${arR('From')} ${arS(W[a])}:`;
    // a statement about the hidden arrangement h = { p: [x ranks, y ranks], H }
    const truthOf = f => h => f.hd ? f.hd(h.H) : f.axes(h.H[f.ref]).every((pred, a) => !pred || pred(h.p[a]));
    const mk = f => { f.truth = truthOf(f); return f; };
    // "o is ahead and to the left of r": signs (lat, fwd) in r's frame
    const pos = (r, o, lat, fwd) => mk({
        key: `p${r},${o},${lat},${fwd}`, arity: 2, terms: [r, o], pairs: [], ref: r,
        axes: h => { const w = pvToWorld(h, lat, fwd); return w.map(s => (m => arSign(m[o] - m[r]) === s)); },
        html: (W, plain) => {
            const dir = PV_DIR[`${lat},${fwd}`];
            // negation mirrors left and right, the mistake perspective taking invites
            if (!plain && savedata.enableNegation && lat !== 0 && coinFlip()) {
                return `${arS(W[o])} ${arR('is')} ${arR(arNeg(PV_DIR[`${-lat},${fwd}`]))} ${arS(W[r])}`;
            }
            return `${arS(W[o])} ${arR('is ' + dir)} ${arS(W[r])}`;
        },
    });
    // "a faces a quarter turn right of b": heading(a) = heading(b) + t
    const turn = (a, b, t) => {
        const [p, q, tt] = a < b ? [a, b, t] : [b, a, (4 - t) % 4];
        return mk({
            key: `h${p},${q},${tt}`, arity: 2, terms: [a, b], pairs: [], ref: null,
            hd: H => ((H[a] - H[b] + 4) % 4) === t,
            html: (W, plain) => {
                if (!plain && savedata.enableNegation && coinFlip()) {
                    return `${arS(W[a])} ${arR(arNeg(PV_TURN[(t + 2) % 4]))} ${arS(W[b])}`;
                }
                return `${arS(W[a])} ${arR(PV_TURN[t])} ${arS(W[b])}`;
            },
        });
    };
    // where something stands across a's left-right line, relative to a: -1 left, 0 level, 1 right
    const latOf = (h, a, m, x) => PV_LAT[h][1] * arSign(m[x] - m[a]);
    const fwdOf = (h, a, m, x) => PV_FWD[h][1] * arSign(m[x] - m[a]);
    const onAxis = (axis, pred) => (axis === 0 ? [pred, null] : [null, pred]);
    // "From a: b and c are on the same side" (left or right of a, both) / "on opposite sides"
    const side = (a, b, c, same) => {
        const [lo, hi] = b < c ? [b, c] : [c, b];
        return mk({
            key: `s${a};${lo},${hi};${+same}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [a, c, null]], ref: a,
            axes: h => onAxis(PV_LAT[h][0], m => {
                const lb = latOf(h, a, m, b), lc = latOf(h, a, m, c);
                return lb !== 0 && lc !== 0 && (lb === lc) === same;
            }),
            html: (W, plain) => `${from(W, a)} ${arS(W[b])} ${arR('and')} ${arS(W[c])} ${same ? arPhrase('are on the same side', 'are on opposite sides', plain) : arPhrase('are on opposite sides', 'are on the same side', plain)}`,
        });
    };
    // "From a: b is further left than c" (along a's left-right line, wherever a itself stands)
    const lefter = (a, b, c) => mk({
        key: `l${a};${b},${c}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [a, c, null]], ref: a,
        axes: h => onAxis(PV_LAT[h][0], m => PV_LAT[h][1] * (m[b] - m[c]) < 0),
        html: (W, plain) => `${from(W, a)} ${arS(W[b])} ${arPhrase('is further left than', 'is further right than', plain)} ${arS(W[c])}`,
    });
    const aheader = (a, b, c) => mk({
        key: `f${a};${b},${c}`, arity: 3, terms: [a, b, c], pairs: [[a, b, null], [a, c, null]], ref: a,
        axes: h => onAxis(PV_FWD[h][0], m => PV_FWD[h][1] * (m[b] - m[c]) > 0),
        html: (W, plain) => `${from(W, a)} ${arS(W[b])} ${arPhrase('is further ahead than', 'is further back than', plain)} ${arS(W[c])}`,
    });
    // "From a: b is between c and d, left to right" / "front to back"
    const betw = (a, b, c, d, lat) => {
        const [lo, hi] = c < d ? [c, d] : [d, c];
        const T = lat ? PV_LAT : PV_FWD;
        return mk({
            key: `b${lat ? 'L' : 'F'}${a};${b};${lo},${hi}`, arity: 4, terms: [a, b, c, d], pairs: [[a, b, null], [a, c, null], [a, d, null]], ref: a,
            axes: h => onAxis(T[h][0], m => (m[c] < m[b] && m[b] < m[d]) || (m[d] < m[b] && m[b] < m[c])),
            html: (W, plain) => `${from(W, a)} ${arS(W[b])} ${arPhrase('is between', 'is not between', plain)} ${arS(W[c])} ${arR('and')} ${arS(W[d])}${arR(lat ? ', left to right' : ', front to back')}`,
        });
    };
    // "From a: exactly n of b, c and d are on the left" (or "are ahead")
    const count = (a, rest, n, lat) => mk({
        key: `c${lat ? 'L' : 'F'}${a};${rest.slice().sort((p, q) => p - q)};${n}`, arity: rest.length + 1, terms: [a, ...rest],
        pairs: rest.map(x => [a, x, null]), ref: a,
        axes: h => onAxis((lat ? PV_LAT : PV_FWD)[h][0], m => rest.filter(x => (lat ? latOf(h, a, m, x) < 0 : fwdOf(h, a, m, x) > 0)).length === n),
        html: (W) => {
            const where = lat ? (n === 1 ? 'is on the left' : 'are on the left') : (n === 1 ? 'is ahead' : 'are ahead');
            const q = n === 0 ? 'none of' : n === 1 ? 'exactly one of' : `exactly ${n} of`;
            return `${from(W, a)} ${arR(q)} ${list(W, rest)} ${arR(n === 0 ? (lat ? 'is on the left' : 'is ahead') : where)}`;
        },
    });
    const worldSign = (h, x, y) => [arSign(h.p[0][y] - h.p[0][x]), arSign(h.p[1][y] - h.p[1][x])];
    const trueDir = (h, r, o) => pvToFrame(h.H[r], ...worldSign(h, r, o));
    const DIRS = Object.keys(PV_DIR).map(k => k.split(',').map(Number));
    const ROT8 = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
    return {
        id: 'frame',
        engine: N => arFrameEngine(N),
        simple(h, N) {
            const out = [];
            for (const r of arRange(N)) for (const o of arRange(N)) {
                if (r === o) continue;
                out.push(pos(r, o, ...trueDir(h, r, o)));
                if (r < o) out.push(turn(r, o, (h.H[r] - h.H[o] + 4) % 4));
            }
            return out;
        },
        // a build that fails here fails slowly (every heading assignment), and a second one rarely does better
        tries: 3,
        // 4^(N-1) headings times weak orders on two axes: five terms is the most that stays quick. A term
        // needs about two statements (where it is, and how it is turned), so fewer terms than premises.
        terms: (P, k) => Math.max(Math.min(k + 1, 5), Math.min(5, Math.ceil(P / 2) + 2)),
        hidden(N) {
            for (;;) {
                const pts = arRange(N).map(() => [Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)]);
                if (new Set(pts.map(p => p.join(','))).size < N) continue;
                const p = [0, 1].map(a => {
                    const vals = [...new Set(pts.map(q => q[a]))].sort((x, y) => x - y);
                    return Int8Array.from(pts.map(q => vals.indexOf(q[a])));
                });
                const H = Int8Array.from(arRange(N).map(i => (i === 0 ? 0 : Math.floor(Math.random() * 4))));
                return { p, H };
            }
        },
        fact(h, N, a, used) {
            if (a === 2) {
                const [x, y] = arTerms(N, 2, used);
                if (Math.random() < 0.42) return turn(x, y, (h.H[x] - h.H[y] + 4) % 4);
                const [r, o] = coinFlip() ? [x, y] : [y, x];
                const [lat, fwd] = trueDir(h, r, o);
                return pos(r, o, lat, fwd);
            }
            if (a === 3) {
                const t = arTerms(N, 3, used), opts = [];
                for (const [p, q, r] of [[t[0], t[1], t[2]], [t[1], t[0], t[2]], [t[2], t[0], t[1]]]) {
                    opts.push(side(p, q, r, true), side(p, q, r, false), lefter(p, q, r), lefter(p, r, q), aheader(p, q, r), aheader(p, r, q));
                }
                const ok = opts.filter(f => f.truth(h));
                return ok.length ? arPick(ok) : null;
            }
            if (a === 4) {
                const [p, ...rest] = arTerms(N, 4, used), opts = [];
                for (const lat of [true, false]) {
                    for (const [q, r, s] of [[rest[0], rest[1], rest[2]], [rest[1], rest[0], rest[2]], [rest[2], rest[0], rest[1]]]) opts.push(betw(p, q, r, s, lat));
                    for (const n of [0, 1, 2, 3]) opts.push(count(p, rest, n, lat));
                }
                const ok = opts.filter(f => f.truth(h));
                // a count of 0 or 3 is just three two-term facts; keep it rare
                const good = ok.filter(f => !/;[03]$/.test(f.key));
                return good.length ? arPick(good) : ok.length && Math.random() < 0.2 ? arPick(ok) : null;
            }
            const [p, ...rest] = arTerms(N, 5, used), opts = [];
            for (const lat of [true, false]) for (const n of [1, 2, 3]) opts.push(count(p, rest, n, lat));
            const ok = opts.filter(f => f.truth(h));
            return ok.length ? arPick(ok) : null;
        },
        conclusions(h, N, k, opts, ctx) {
            const out = [];
            // how two are turned is only worth asking when it takes more than the turns to find out: a
            // chain of quarter turns alone is arithmetic, not a point of view
            const turnsOnly = ctx && ctx.facts ? ctx.facts.filter(f => f.hd) : null;
            const eng = ctx && ctx.eng;
            const askTurn = f => !turnsOnly || !eng || eng.value(turnsOnly, f) === null;
            for (const r of arRange(N)) for (const o of arRange(N)) {
                if (r === o) continue;
                const [lat, fwd] = trueDir(h, r, o);
                out.push(pos(r, o, lat, fwd));
                // near misses: left and right swapped, ahead and behind swapped, one step round
                if (lat) out.push(pos(r, o, -lat, fwd));
                if (fwd) out.push(pos(r, o, lat, -fwd));
                const i = ROT8.findIndex(([a, b]) => a === lat && b === fwd);
                for (const j of [i + 1, i + 7]) { const [a, b] = ROT8[j % 8]; out.push(pos(r, o, a, b)); }
                if (r < o) for (let t = 0; t < 4; t++) { const f = turn(r, o, t); if (askTurn(f)) out.push(f); }
            }
            if (k >= 3) for (let i = 0; i < 40; i++) {
                const [a, b, c] = shuffle(arRange(N)).slice(0, 3), r = Math.random();
                out.push(r < 0.34 ? side(a, b, c, coinFlip()) : r < 0.67 ? lefter(a, b, c) : aheader(a, b, c));
            }
            if (k >= 4) for (let i = 0; i < 30; i++) {
                const [a, b, c, d] = shuffle(arRange(N)).slice(0, 4);
                out.push(coinFlip() ? betw(a, b, c, d, coinFlip()) : count(a, [b, c, d], arPick([1, 2]), coinFlip()));
            }
            if (k >= 5 && N >= 5) for (let i = 0; i < 24; i++) {
                const [a, ...rest] = shuffle(arRange(N)).slice(0, 5);
                out.push(count(a, rest, arPick([1, 2, 3]), coinFlip()));
            }
            return out;
        },
    };
}

function arPerspectiveQuestion(length) {
    return arQuestion(arPerspectiveFamily(), length, {
        category: 'Perspective', type: 'perspective', analogy: false, meta: false, minK: 2,
        explainer: 'Each one faces its own way: ahead, behind, left and right are as that one faces',
        countdown: savedata.overridePerspectiveTime || null,
        model: (r, W) => ({
            facing: {
                head: `Drawn with ${W[0]} facing up: only how they are turned to each other matters`,
                cells: arRange(r.N).map(i => [W[i], r.h.p[0][i], r.h.p[1][i], r.h.H[i]]),
            },
        }),
    });
}

class PerspectiveQuestion { create(length) { return arPerspectiveQuestion(length); } }
function createPerspectiveGenerator(length) {
    return {
        question: new PerspectiveQuestion(),
        premiseCount: getPremisesFor('overridePerspectivePremises', length),
        weight: savedata.overridePerspectiveWeight,
    };
}
