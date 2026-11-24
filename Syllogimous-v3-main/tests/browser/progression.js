// The progression rule, driven directly: a perfect run lifts the types in it that have their own
// evidence; misses step down only the type that made them; levels are kept per arity; load first.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.URL || 'http://localhost:8771/Syllogimous-v3-main/')); await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const out = [], ok = (name, cond, info) => out.push((cond ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + JSON.stringify(info) : ''));
    Object.assign(savedata, { autoProgression: true, autoProgressionTrailing: 20, autoProgressionGoal: 10, autoProgressionTimeDrop: 5, autoProgressionTimeBump: 5,
      arity: 2, levels: {}, levelsArity: null, premises: 3, timer: 30,
      overrideDirectionPremises: 4, overrideDirectionTime: 40, overrideRingPremises: 4, overrideRingTime: 60, overrideDistinctionPremises: 3, overrideDistinctionTime: 30 });
    appState.run = null; syncArityLevels();
    const lv = t => { const [pk, tk] = TYPE_TO_OVERRIDES[t]; return [savedata[pk], savedata[tk]]; };
    const ans = (type, right) => PROGRESS_STORE.levelChange({ type, correctness: right ? 'right' : 'wrong' });
    // 19 right: nothing moves; the 20th completes the run
    const seq = ['space-two-d', 'ring', 'space-two-d', 'ring', 'space-two-d', 'ring', 'distinction'];
    for (let i = 0; i < 19; i++) ans(seq[i % seq.length], true);
    ok('no change before the run completes', lv('space-two-d')[0] === 4 && lv('ring')[0] === 4, { space2d: lv('space-two-d'), ring: lv('ring') });
    ans('space-two-d', true);
    ok('run of 20: space 2D (on budget 40<=40) gains a premise and 10 s', lv('space-two-d')[0] === 5 && lv('space-two-d')[1] === 50, lv('space-two-d'));
    ok('run of 20: ring (over budget 60>40) loses 5 s, keeps premises', lv('ring')[0] === 4 && lv('ring')[1] === 55, lv('ring'));
    ok('run of 20: distinction (2 of its own in the run, under 3) unchanged', lv('distinction')[0] === 3 && lv('distinction')[1] === 30, lv('distinction'));
    ok('streak reset after the run', runState().streak === 0);
    // a miss breaks the run; second ring miss in its last 8 steps ring down only
    for (let i = 0; i < 10; i++) ans('space-two-d', true);
    ans('ring', false);
    ok('one miss resets the run', runState().streak === 0);
    ans('ring', true); ans('ring', false);
    ok('two ring misses in 8: ring steps down (55+5=60 <= 1.5*10*4: time first)', lv('ring')[0] === 4 && lv('ring')[1] === 60, lv('ring'));
    ok('space 2D untouched by ring misses', lv('space-two-d')[0] === 5 && lv('space-two-d')[1] === 50, lv('space-two-d'));
    ans('ring', false); ans('ring', false);
    ok('ring at 60 s over 1.5x budget after bump: drops a premise', lv('ring')[0] === 3 && lv('ring')[1] === 60, lv('ring'));
    // arity: switch to 4, levels stored for 2; change at 4; back to 2 restores
    savedata.arity = 4; syncArityLevels();
    ok('new arity starts from the levels you had', lv('space-two-d')[0] === 5, lv('space-two-d'));
    savedata.overrideDirectionPremises = 7; savedata.overrideDirectionTime = 70;
    savedata.arity = 2; syncArityLevels();
    ok('back to arity 2 restores its levels', lv('space-two-d')[0] === 5 && lv('space-two-d')[1] === 50, lv('space-two-d'));
    savedata.arity = 4; syncArityLevels();
    ok('arity 4 kept its own levels', lv('space-two-d')[0] === 7 && lv('space-two-d')[1] === 70, lv('space-two-d'));
    return out;
  });
  console.log(r.join('\n')); console.log('errors', errs); await b.close();
})();
