// Plays the real page through its own buttons: every family, formats, interrogate,
// explanations, auto progression. Reports errors, stalls and what the level did.
const { chromium } = require('playwright');
const N = +process.argv[2] || 120, ACC = +(process.argv[3] || 0.8), ARITY = process.argv[4] || '3';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 5).join(' | '))); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto((process.env.URL || 'http://localhost:8771/Syllogimous-v3-main/'));
  await p.waitForTimeout(500);
  await p.evaluate(({ ARITY }) => {
    Object.assign(savedata, {
      enableDistinction: true, enableLinear: true, linearWording: 'leftright,topunder,comparison,temporal,contains', enableDirection: true, enableDirection3D: true,
      enableInfluence: true, enableRequirement: true, enableContexts: true, enableBalance: true, enableRing: true, enableHierarchy: true, enableMapping: true, enableDifference: true, enableIntervals: true, enablePerspective: true,
      enableFmtName: true, enableFmtMissing: true, enableFmtRepair: true, enableInterrogate: true, interrogateChance: 30,
      explainOnMiss: true, autoProgression: true, autoProgressionTrailing: 10, enableNegation: true,
      arity: ARITY, premises: 3, timer: 120,
    });
    appState.fastUi = true;
    refresh();
    const t = document.querySelector('#timer-toggle'); if (!t.checked) t.click();
  }, { ARITY });
  const kinds = {}, stats = { stalls: 0, levels: [] };
  let lastKey = '';
  for (let i = 0; i < N; i++) {
    const info = await p.evaluate(() => ({ fmt: question && question.format, valid: question && question.isValid, cat: question && question.category, ar: question && question.arity, started: question && question.startedAt, P: question && (question.plen || question.premises.length) }));
    const key = info.started + info.cat;
    if (key === lastKey) { stats.stalls++; }
    lastKey = key;
    const kind = info.fmt || 'tf';
    if (process.env.TRACE) console.log(i, kind, info.cat, 'a' + info.ar, 'P' + info.P, new Date().toISOString().slice(14, 23));
    kinds[kind] = (kinds[kind] || 0) + 1;
    const right = Math.random() < ACC;
    try {
      if (!info.fmt) {
        const sayTrue = right ? info.valid : !info.valid;
        await p.click(sayTrue ? '#true-button' : '#false-button', { timeout: 3000 });
      } else if (info.fmt === 'interrogate') {
        await p.click('.fmt-panel .fmt-submit', { timeout: 3000 });
        const answers = await p.evaluate(() => question.queries.map(q => q.answer));
        const rows = await p.$$('.fmt-query');
        for (let r = 0; r < rows.length; r++) {
          const chips = await rows[r].$$('.fmt-chip');
          const opts = [true, false, null];
          const want = Math.random() < ACC ? answers[r] : opts[Math.floor(Math.random() * opts.length)];
          await chips[want === true ? 0 : want === false ? 1 : 2].click();
        }
        await p.click('.fmt-panel .fmt-choices .fmt-submit');
      } else if (info.fmt === 'name') {
        const cells = await p.$$('.fmt-pad__cell, .fmt-panel .fmt-chip');
        if (cells.length) await cells[Math.floor(Math.random() * cells.length)].click();
        else { // ratio: type numbers
          const nums = await p.$$('.fmt-number'); for (const n of nums) await n.fill(String(1 + Math.floor(Math.random() * 3)));
          await p.click('.fmt-panel .fmt-submit');
        }
      } else {
        const terms = await p.$$('.fmt-chip--term');
        if (terms.length >= 2) { await terms[0].click(); await terms[1].click(); }
        const rel = await p.$$('.fmt-pad__cell, .fmt-row:not(:first-child) .fmt-chip:not(.fmt-chip--term)');
        if (rel.length) await rel[Math.floor(Math.random() * rel.length)].click();
        const nums = await p.$$('.fmt-number'); for (const n of nums) await n.fill(String(1 + Math.floor(Math.random() * 3)));
        await p.click('.fmt-panel .fmt-choices .fmt-submit');
        await p.waitForTimeout(100);
        // an answer refused (e.g. repair needs an existing pair): give up on it by letting the clock run out
        const err = await p.$eval('.fmt-error', e => e.textContent).catch(() => '');
        if (err) { await p.evaluate(() => timeElapsed()); kinds['fmt-refused'] = (kinds['fmt-refused'] || 0) + 1; }
      }
    } catch (e) { errs.push('drive: ' + kind + ' ' + e.message.split('\n')[0]); await p.evaluate(() => timeElapsed()).catch(() => {}); }
    await p.waitForTimeout(450);
    if (await p.$('.miss-explanation')) { kinds.explained = (kinds.explained || 0) + 1; await p.click('.miss-explanation__continue'); await p.waitForTimeout(150); }
    if (i % 20 === 19) stats.levels.push(await p.evaluate(() => ({ P: savedata.overrideLinearPremises, T: savedata.overrideLinearTime })));
  }
  const tail = await p.evaluate(() => ({ score: appState.score, stored: appState.questions.length, run: appState.run && appState.run.streak, levels: Object.fromEntries(Object.entries(TYPE_TO_OVERRIDES).filter(([t, [pk]]) => savedata[pk]).map(([t, [pk, tk]]) => [t, savedata[pk] + 'p/' + savedata[tk] + 's'])) }));
  console.log('kinds', JSON.stringify(kinds));
  console.log('stalls', stats.stalls, 'levels', JSON.stringify(stats.levels));
  console.log('score', tail.score, 'stored', tail.stored, 'run', tail.run, 'levels', JSON.stringify(tail.levels));
  console.log('errors', [...new Set(errs)].slice(0, 15));
  await b.close();
})();
