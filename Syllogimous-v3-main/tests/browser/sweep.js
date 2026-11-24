// How often does each family hand back no item, by arity and premise count? (no item = the app stalls)
const { chromium } = require('playwright');
const OFF = { enableDistinction: false, enableSyllogism: false, enableAnalogy: false, enableDirection: false, enableDirection3D: false, enableAnchorSpace: false, enableBinary: false, onlyAnalogy: false, onlyBinary: false, enableMapping: false, enableRequirement: false, enableContexts: false, enableBalance: false, enableRing: false, enableHierarchy: false, enableDifference: false, enableIntervals: false, enablePerspective: false, enableFmtName: false, enableFmtMissing: false, enableFmtRepair: false, onlyFormats: false, enableInterrogate: false };
const FAM = {
  distinction: { enableDistinction: true },
  syllogism: { enableSyllogism: true }, space2d: { enableDirection: true }, space3d: { enableDirection3D: true },
  anchor: { enableAnchorSpace: true }, mapping: { enableMapping: true }, requirement: { enableRequirement: true },
  contexts: { enableContexts: true }, balance: { enableBalance: true }, ring: { enableRing: true }, hierarchy: { enableHierarchy: true },
  difference: { enableDifference: true }, intervals: { enableIntervals: true }, perspective: { enablePerspective: true },
  analogy: { enableDistinction: true, enableDirection: true, enableAnalogy: true, onlyAnalogy: true },
  binary: { enableDistinction: true, enableDirection: true, enableBinary: true, onlyBinary: true },
  'fmt-name': { enableDistinction: true, enableDirection: true, enableRequirement: true, enableBalance: true, enableContexts: true, enableFmtName: true, onlyFormats: true },
  'fmt-missing': { enableDistinction: true, enableDirection: true, enableDirection3D: true, enableRequirement: true, enableBalance: true, enableFmtMissing: true, onlyFormats: true },
  'fmt-repair': { enableDistinction: true, enableDirection: true, enableDirection3D: true, enableBalance: true, enableFmtRepair: true, onlyFormats: true },
};
const K = +process.argv[2] || 12;
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.URL || 'http://localhost:8771/Syllogimous-v3-main/'));
  await p.waitForTimeout(400);
  for (const [fam, cfg] of Object.entries(FAM)) {
    if (ONLY && !ONLY.includes(fam)) continue;
    const line = [];
    for (const arity of [2, 3, 4, 5]) for (const P of [2, 3, 5, 7, 9, 12]) {
      const r = await p.evaluate(({ OFF, cfg, arity, P, K }) => {
        Object.assign(savedata, OFF, cfg, { arity: String(arity), enableNegation: true, premises: P });
        let fail = 0, thrown = 0, max = 0; const res = {};
        for (let i = 0; i < K; i++) {
          const t0 = performance.now();
          let q; try { q = generateQuestion(); } catch (e) { thrown++; }
          if (q && (q.arity || 2) < Math.min(arity, 5) && !/analogy|mapping|Mapping|Analogy/.test(q.category || '')) res.down = (res.down || 0) + 1;
          max = Math.max(max, performance.now() - t0);
          if (!q) fail++;
        }
        return { fail, thrown, max: Math.round(max), down: res.down || 0 };
      }, { OFF, cfg, arity, P, K });
      if (r.fail || r.thrown || r.max > 500 || r.down) line.push(`a${arity}P${P}:${r.fail}${r.thrown ? 'T' + r.thrown : ''}${r.down ? 'd' + r.down : ''}${r.max > 500 ? '(' + r.max + 'ms)' : ''}`);
    }
    console.log(fam.padEnd(12), line.join(' ') || 'ok');
  }
  console.log('errors', [...new Set(errs)].slice(0, 10));
  await b.close();
})();
