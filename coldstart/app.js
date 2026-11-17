// Cold Start app. One screen; every round is evidence -> it disappears -> a demand.
(function () {
'use strict';
const E = window.CSE, { range, rnd, shuffle } = E;
const $ = s => document.querySelector(s);
const stage = $('#stage'), info = $('#info'), fill = $('#clock i');
const KEY = 'coldstart1';
const st = Object.assign({ level: 3, clock: 60, deep: false, win: [], sessions: [], probes: [] },
    (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })());
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage off: the session still runs */ } };
const END = {};
const now = () => performance.now() / 1000;
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const pct = v => Math.round(v * 100) + '%';
let ses = null, carry = null, cur = null, waiter = null, deadline = 0, bankLen = 0;

// ---------------------------------------------------------------- drawing
const GL = ['<circle cx="10" cy="10" r="7"/>', '<rect x="3" y="3" width="14" height="14"/>', '<path d="M10 2 L18 17 L2 17 Z"/>',
    '<path d="M10 1 L19 10 L10 19 L1 10 Z"/>', '<path d="M5 2 L15 2 L19 10 L15 18 L5 18 L1 10 Z"/>',
    '<path d="M8 2 H12 V8 H18 V12 H12 V18 H8 V12 H2 V8 H8 Z"/>', '<path d="M3 5 L5 3 L10 8 L15 3 L17 5 L12 10 L17 15 L15 17 L10 12 L5 17 L3 15 L8 10 Z"/>',
    '<path d="M2 8 H12 V3 L19 10 L12 17 V12 H2 Z"/>', '<path d="M18 8 H8 V3 L1 10 L8 17 V12 H18 Z"/>', '<path d="M8 18 V8 H3 L10 1 L17 8 H12 V18 Z"/>',
    '<path d="M8 2 V12 H3 L10 19 L17 12 H12 V2 Z"/>', '<path d="M10 1 L12.6 7.2 L19.2 7.6 L14.1 11.8 L15.8 18.2 L10 14.6 L4.2 18.2 L5.9 11.8 L0.8 7.6 L7.4 7.2 Z"/>'];
const glyph = (g, s) => `<svg class="gl" width="${s || 22}" height="${s || 22}" viewBox="0 0 20 20">${GL[g]}</svg>`;
// objects are unnameable on purpose: a mirrored 5x5 pattern in its own colour, new every world
function makeTokens(n) {
    const h0 = rnd(360), out = [], ones = b => { let c = 0; for (; b; b &= b - 1) c++; return c; };
    while (out.length < n) {
        const bits = rnd(1 << 15);
        if (ones(bits) < 5 || ones(bits) > 11 || out.some(t => ones(t.bits ^ bits) < 4)) continue;
        out.push({ bits, hue: (h0 + Math.round(out.length * 360 / n)) % 360 });
    }
    return shuffle(out);
}
function tokInner(t) {
    let o = `<rect x=".1" y=".1" width="6.8" height="6.8" rx="1.3" fill="hsl(${t.hue} 40% 14%)"/>`;
    const cell = (x, y) => `<rect x="${x}" y="${y}" width="1.03" height="1.03" fill="hsl(${t.hue} 85% 66%)"/>`;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (t.bits >> (r * 3 + c) & 1) { o += cell(1 + c, 1 + r); if (c < 2) o += cell(5 - c, 1 + r); }
    return o;
}
const tok = (t, s) => `<svg class="tok" width="${s || 30}" height="${s || 30}" viewBox="0 0 7 7">${tokInner(t)}</svg>`;
// a statement: the sign, then its objects in order. mark: true/false draws a tick or cross in front
const stm = (W, f, mark) => `<span class="st${mark === false ? ' bad' : ''}">${mark == null ? '' : `<b class="${mark ? 'ok' : 'no'}">${mark ? '✓' : '✗'}</b>`}${glyph(W.rels[f.r].glyph)}${f.a.map(o => tok(W.tok[o])).join('')}</span>`;
function board(W, place, o) {
    o = o || {};
    const S = W.S, U = o.u || 56, r = U * 0.4, pad = r + 8;
    const xs = S.xy.map(p => p[0]), ys = S.xy.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
    const X = i => (S.xy[i][0] - x0) * U + pad, Y = i => (S.xy[i][1] - y0) * U + pad;
    const w = (Math.max(...xs) - x0) * U + 2 * pad, h = (Math.max(...ys) - y0) * U + 2 * pad;
    let s = `<svg class="board" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    if (o.op) s += '<defs><marker id="ah" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0 0L12 6L0 12Z" fill="var(--acc)"/></marker></defs>';
    for (const [a, b] of S.edges) s += `<line class="edge" x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}"/>`;
    for (let i = 0; i < S.n; i++) s += `<circle class="slot" data-slot="${i}" cx="${X(i)}" cy="${Y(i)}" r="${r}"/>`;
    if (place) place.forEach((sl, ob) => { if (sl >= 0) s += `<svg x="${X(sl) - r * 0.76}" y="${Y(sl) - r * 0.76}" width="${r * 1.52}" height="${r * 1.52}" viewBox="0 0 7 7" style="pointer-events:none">${tokInner(W.tok[ob])}</svg>`; });
    if (o.op) o.op.forEach((to, i) => {
        if (to === i) return;
        const x1 = X(i), y1 = Y(i), x2 = X(to), y2 = Y(to);
        s += `<path class="arrow" d="M${x1} ${y1}Q${(x1 + x2) / 2 - (y2 - y1) * 0.28} ${(y1 + y2) / 2 + (x2 - x1) * 0.28} ${x2} ${y2}" marker-end="url(#ah)"/>`;
    });
    return s + '</svg>';
}
const show = html => { stage.innerHTML = html; };
const label = t => { info.textContent = ses ? `Level ${st.level} · world ${ses.worlds}${t ? ' · ' + t : ''}` : ''; };
const GO = t => `<button class="go" data-go="go">${t}</button>`;

// ---------------------------------------------------------------- input
// tap an object, then a place. Tapping a filled place sends its object back.
function builder(W, host) {
    const n = W.S.n, place = Array(n).fill(-1); let sel = -1;
    const draw = () => {
        host.innerHTML = `<div class="tray">${range(n).map(o => place[o] < 0 ? `<button data-obj="${o}" class="${o === sel ? 'sel' : ''}">${tok(W.tok[o], 34)}</button>` : '').join('')}</div>` + board(W, place);
    };
    host.onclick = e => {
        const b = e.target.closest('[data-obj]'), s = e.target.closest('[data-slot]');
        if (b) sel = +b.dataset.obj === sel ? -1 : +b.dataset.obj;
        else if (s) { const sl = +s.dataset.slot, occ = place.indexOf(sl); if (occ >= 0) place[occ] = -1; if (sel >= 0) { place[sel] = sl; sel = -1; } }
        else return;
        draw();
    };
    draw();
    return place;
}
function chooser(W, host, claims, opts) {
    const ans = claims.map(() => null);
    host.innerHTML = claims.map((c, i) => `<div class="row">${stm(W, c.f)}<span class="chips" data-i="${i}">${opts.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</span></div>`).join('');
    host.onclick = e => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        ans[+b.parentNode.dataset.i] = +b.dataset.v;
        b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    };
    return ans;
}
const THREE = [[1, 'Must'], [0, "Can't"], [-1, 'Open']], TWO = [[1, '✓'], [0, '✗']];
const nameOf = v => v == null ? 'none' : (THREE.find(o => o[0] === v) || [])[1];

// resolves when a [data-go] button is pressed or the time is up; End unwinds the whole session
function wait(until) {
    return new Promise(res => {
        const done = v => { clearInterval(iv); waiter = null; res(v); };
        const iv = setInterval(() => {
            if (deadline) fill.style.width = Math.max(0, (deadline - now()) / bankLen * 100) + '%';
            if (until && now() >= until) done('time');
        }, 100);
        waiter = done;
    }).then(v => { if (v === 'end') throw END; return v; });
}
function bank() { bankLen = st.deep && ses.kind === 'train' ? 0 : st.clock; deadline = bankLen ? now() + bankLen : 0; fill.style.width = bankLen ? '100%' : '0'; }
function noClock() { deadline = 0; fill.style.width = '0'; }
const studyEnd = () => deadline ? deadline - bankLen * 0.3 : 0;         // study may use 70% of the round
const answerEnd = () => deadline ? Math.max(deadline, now() + 8) : 0;

// ---------------------------------------------------------------- scoring and level
function record(adj, counted) {
    if (!counted) return;
    ses.rounds++; ses.sum += adj;
    if (ses.kind !== 'train' || st.deep) return;
    st.win.push(adj); if (st.win.length > 12) st.win.shift();
    if (st.win.length >= 8) {
        const m = mean(st.win);
        if (m >= 0.85) { st.level++; st.win = []; } else if (m <= 0.55 && st.level > 1) { st.level--; st.win = []; }
    }
    save();
}
const corrected = (raw, chance) => Math.max(0, (raw - chance) / (1 - chance));

// ---------------------------------------------------------------- crack: learn the signs from marked examples
async function crack(W) {
    const t0 = now(); let fails = 0;
    noClock(); label('crack');
    for (;;) {
        show(`<div class="cap">New world. Work out what each sign means. ✓ holds on that board, ✗ does not.</div>
            <div class="cards">${W.crack.boards.map(b => `<div class="card">${board(W, b.place, { u: 42 })}<div class="facts">${b.items.map(it => stm(W, it, it.v)).join('')}</div></div>`).join('')}</div><div class="row">${GO('Test')}${fails ? '<button data-go="skip">Skip world</button>' : ''}</div>`);
        if (await wait(0) === 'skip') return false;
        const T = E.crackTest(W);
        show(`<div class="card">${board(W, T.place)}</div><div id="c"></div>${GO('Submit')}`);
        const ans = chooser(W, $('#c'), T.items.map(it => ({ f: it })), TWO);
        cur = { W, T, kind: 'crack' };
        await wait(0);
        const right = T.items.map((it, i) => ans[i] === (it.v ? 1 : 0));
        if (right.every(Boolean)) break;
        fails++;
        show(`<div class="card">${board(W, T.place)}</div><div id="c">${T.items.map((it, i) => `<div class="row">${stm(W, it, it.v)}${right[i] ? '' : '<b class="no">missed</b>'}</div>`).join('')}</div>${GO('More examples')}`);
        await wait(0);
        if (W.crack.boards.length >= 6) W.crack.boards.shift();
        W.crack.add();
    }
    ses.cracks.push(Math.round(now() - t0));
    return true;
}

// ---------------------------------------------------------------- a round
// kind: rebuild | judge | first (the question comes first, then the facts one at a time)
async function round(W, P, kind, o) {
    o = o || {};
    const judge = kind !== 'rebuild', deep = st.deep && ses.kind === 'train';
    const R = o.R || E.genRound(W, (o.F || P.F) + (kind === 'first' ? 2 : 0), o.spec || (judge ? { t: 3, max: 10, min: 2 } : { t: 1, max: 6, min: 1 }));
    const claims = judge ? E.genClaims(W, R, kind === 'first' ? 1 : 3) : null;
    const facts = `<div class="facts">${R.facts.map(f => stm(W, f)).join('')}</div>`;
    cur = { W, R, claims, kind };
    label(o.label); bank();
    if (kind === 'first') {
        for (let i = 0; i < R.facts.length; i++) {
            show(`<div class="ask">${stm(W, claims[0].f)}<b>?</b></div><div class="facts">${stm(W, R.facts[i])}</div><div class="cap">${i + 1} / ${R.facts.length}</div>${deadline ? '' : GO('Next')}`);
            await wait(deadline ? now() + Math.max(2, bankLen * 0.7 / R.facts.length) : 0);
        }
    } else {
        show(facts + board(W, null, { u: 44 }) + GO('Hide'));
        await wait(studyEnd());
    }
    let raw, chance, fb;
    if (!judge) {
        show(`<div id="b"></div>${GO('Submit')}`);
        const place = builder(W, $('#b')); cur.place = place;
        await wait(answerEnd());
        const ok = E.sat(W, R.facts, place), hit = ok.filter(Boolean).length;
        raw = hit / ok.length; chance = mean(R.facts.map(f => W.rels[f.r].rate));
        fb = `<div class="cap">${hit} of ${ok.length} facts hold</div><div class="facts">${R.facts.map((f, i) => stm(W, f, ok[i])).join('')}</div>${board(W, place)}`
            + (raw < 1 || o.keep ? `<div class="cap">${o.keep ? 'This is the arrangement. It stays.' : 'One that fits'}</div>${board(W, E.placeOf(W, R.h))}` : '');
    } else {
        show((kind === 'judge' && deep ? facts : '') + `<div id="c"></div>${GO('Submit')}`);
        const ans = chooser(W, $('#c'), claims, THREE); cur.ans = ans;
        await wait(answerEnd());
        const right = claims.map((c, i) => ans[i] === c.st);
        raw = right.filter(Boolean).length / right.length; chance = 1 / 3;
        fb = `<div id="c">${claims.map((c, i) => `<div class="row">${stm(W, c.f)}<b class="${right[i] ? 'ok' : 'no'}">${nameOf(c.st)}</b>${right[i] ? '' : `<span class="cap">you: ${nameOf(ans[i])}</span>`}</div>`).join('')}</div>`
            + facts + `<div class="cap">${R.M.length > 1 ? 'One of ' + R.M.length + ' arrangements that fit' : 'The arrangement'}</div>${board(W, E.placeOf(W, R.h))}`;
    }
    noClock();
    const adj = corrected(raw, chance);
    record(adj, !o.nocount);
    show(fb + GO('Next'));
    await wait(0);
    return { adj, R };
}

// ---------------------------------------------------------------- shift: the vocabulary changes, then one arrangement is held and moved
async function shiftBlock(W, P) {
    const sh = E.shift(W), n = W.S.n, g = i => glyph(W.rels[i].glyph, 40);
    noClock(); label('shift');
    show(`<div class="ask">${sh.t === 'swap' ? g(sh.i) + '⇄' + g(sh.j) : g(sh.i)}</div><div class="cap">${{
        swap: 'These two signs have exchanged meanings.', neg: 'This sign now holds exactly where it did not before.', rev: 'This sign now reads its objects in the reverse order.' }[sh.t]}</div>${GO('Go')}`);
    await wait(0);
    const r1 = await round(W, P, 'rebuild', { F: P.F + 1, spec: { t: 1, max: 1, min: 1, bias: sh.t === 'swap' ? [sh.i, sh.j] : [sh.i] }, keep: true, label: 'shift' });
    // the held arrangement is moved; nothing about it is shown again
    const pi = E.genOp(W, st.level > 5 ? 4 : 3), after = E.placeOf(W, r1.R.h).map(s => pi[s]);
    cur = { W, kind: 'op', after }; bank();
    show(`<div class="cap">Whatever sits at the start of an arrow moves to its end.</div>${board(W, null, { op: pi })}${GO('Hide')}`);
    await wait(studyEnd());
    show(`<div id="b"></div>${GO('Submit')}`);
    const mine = builder(W, $('#b')); cur.place = mine;
    await wait(answerEnd()); noClock();
    const hit = after.filter((s, ob) => mine[ob] === s).length;
    record(corrected(hit / n, 1 / n), true);
    show(`<div class="cap">${hit} of ${n} in place</div>${board(W, mine)}${hit < n ? `<div class="cap">After the move</div>${board(W, after)}` : ''}${GO('Next')}`);
    await wait(0);
    // statements about the moved arrangement, read with the changed signs
    const cl = E.knownClaims(W, after, 4); bank();
    show(`<div id="c"></div>${GO('Submit')}`);
    const ans = chooser(W, $('#c'), cl, TWO); cur = { W, kind: 'known', claims: cl, ans };
    await wait(answerEnd()); noClock();
    const right = cl.map((c, i) => ans[i] === c.st);
    record(corrected(right.filter(Boolean).length / cl.length, 0.5), true);
    show(`<div id="c">${cl.map((c, i) => `<div class="row">${stm(W, c.f, c.st === 1)}${right[i] ? '' : '<b class="no">missed</b>'}</div>`).join('')}</div>${board(W, after)}${GO('Next')}`);
    await wait(0);
    carry = { W, place: after };
}
// an unannounced question about the world that has just closed, asked inside the next one
async function carryRound() {
    const W = carry.W, truth = carry.place, n = W.S.n; carry = null;
    label('earlier'); bank();
    show(`<div class="cap">The world before this one. Rebuild its last arrangement.</div><div id="b"></div>${GO('Submit')}`);
    const mine = builder(W, $('#b')); cur = { W, kind: 'carry', after: truth, place: mine };
    await wait(answerEnd()); noClock();
    const hit = truth.filter((s, ob) => mine[ob] === s).length; ses.carry.push(hit / n);
    show(`<div class="cap">${hit} of ${n} in place</div>${board(W, mine)}${hit < n ? `<div class="cap">It was</div>${board(W, truth)}` : ''}${GO('Next')}`);
    await wait(0);
}

// ---------------------------------------------------------------- world and session
async function world() {
    const probe = ses.kind === 'probe', P = E.params(st.level, st.deep && !probe);
    noClock(); show('<div class="cap">…</div>');
    await new Promise(r => setTimeout(r, 30));          // paint before the generator runs
    const W = E.makeWorld(P, probe); W.tok = makeTokens(W.S.n);
    ses.worlds++;
    const r0 = ses.rounds, s0 = ses.sum;
    if (!await crack(W)) return null;
    const plan = shuffle(probe ? ['rebuild', 'rebuild', 'rebuild', 'rebuild', 'judge', 'judge', 'judge', 'judge'] : ['rebuild', 'rebuild', 'rebuild', 'judge', 'judge', 'first']);
    const again = [];
    for (let i = 0; i < plan.length; i++) {
        if (!probe && i === 2 && carry && Math.random() < 0.6) await carryRound();
        const res = await round(W, P, plan[i]);
        // a missed structure comes back two rounds later with the objects renamed
        if (!probe && res.adj < 0.6 && plan[i] !== 'first') again.push({ kind: plan[i], R: res.R, due: i + 2 });
        const d = again.findIndex(x => x.due === i);
        if (d >= 0) { const x = again.splice(d, 1)[0]; await round(W, P, x.kind, { R: E.disguise(W, x.R), nocount: true, label: 'again' }); }
    }
    if (!probe) await shiftBlock(W, P);
    return ses.rounds > r0 ? (ses.sum - s0) / (ses.rounds - r0) : 0;
}
async function session(kind) {
    ses = { kind, worlds: 0, rounds: 0, sum: 0, cracks: [], carry: [], L0: st.level }; carry = null;
    document.body.classList.add('run');
    try {
        for (;;) {
            const c = await world();
            if (kind === 'probe') break;
            if (c == null) continue;
            noClock(); label('');
            show(`<div class="big">${pct(c)}</div><div class="cap">World ${ses.worlds} · cracked in ${ses.cracks[ses.cracks.length - 1]} s</div><div class="row">${GO('Next world')}<button data-go="end">End session</button></div>`);
            await wait(0);
        }
    } catch (e) { if (e !== END) { document.body.classList.remove('run'); ses = null; home(); throw e; } }
    document.body.classList.remove('run'); noClock();
    if (ses.rounds && (kind === 'train' || ses.rounds >= 8)) {
        const rec = { d: Date.now(), L: st.level, L0: ses.L0, c: ses.sum / ses.rounds, k: ses.cracks.length ? Math.round(mean(ses.cracks)) : 0, y: ses.carry.length ? mean(ses.carry) : null, deep: st.deep && kind === 'train' };
        const list = kind === 'probe' ? st.probes : st.sessions;
        list.push(rec); if (list.length > 40) list.shift();
        save();
    }
    ses = null; home();
}
function home() {
    label('');
    const P = E.params(st.level, false), day = d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const line = r => `${day(r.d)} · L${r.L0 !== r.L ? r.L0 + '→' + r.L : r.L}${r.deep ? ' deep' : ''} · ${pct(r.c)} · crack ${r.k} s${r.y == null ? '' : ' · carry ' + pct(r.y)}`;
    show(`<h1>Cold Start</h1>
        <div class="row"><button data-act="dn">−</button><b>Level ${st.level}</b><button data-act="up">+</button></div>
        <div class="cap">arity ${P.k} · ${P.n} objects · ${P.F} facts</div>
        <div class="row"><label>Seconds per round <input id="clk" type="number" min="10" max="900" value="${st.clock}"></label></div>
        <div class="row"><label><input id="deep" type="checkbox"${st.deep ? ' checked' : ''}> Deep: no clock, two more objects, two more facts</label></div>
        <div class="row"><button class="go" data-act="start">Start</button><button data-act="probe">Probe</button></div>
        <div class="cap">Probe: one world of a kind never used in training. It does not change your level.</div>
        ${st.sessions.length ? `<div class="hist"><b>Sessions</b><br>${st.sessions.slice(-6).reverse().map(line).join('<br>')}</div>` : ''}
        ${st.probes.length ? `<div class="hist"><b>Probes</b><br>${st.probes.slice(-6).reverse().map(line).join('<br>')}</div>` : ''}`);
}
stage.addEventListener('click', e => {
    const go = e.target.closest('[data-go]'), act = e.target.closest('[data-act]');
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
    if (go && waiter) waiter(go.dataset.go);
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'up' || a === 'dn') { st.level = Math.max(1, st.level + (a === 'up' ? 1 : -1)); st.win = []; save(); home(); }
    if (a === 'start' || a === 'probe') session(a === 'probe' ? 'probe' : 'train');
});
stage.addEventListener('change', e => {
    if (e.target.id === 'clk') st.clock = Math.max(10, Math.min(900, +e.target.value || 60));
    if (e.target.id === 'deep') st.deep = e.target.checked;
    save();
});
$('#end').addEventListener('click', () => { if (waiter) waiter('end'); });
document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName === 'INPUT') return;
    const b = stage.querySelector('button.go'); if (b) { e.preventDefault(); b.click(); }
});
window.CS = { get cur() { return cur; }, st };
home();
})();
