// Independent checker: loads the real Syllogimous files, generates items with the new
// usage (from the repo root):  node tests/check-extra-relations.js . 200
// classes, then PARSES THE RENDERED HTML back into relations and brute-forces the answer.
// A disagreement anywhere (generator, rendering, negation, meta, scrambling) is a failure.
const fs=require('fs'), vm=require('vm');
const ROOT=process.argv[2];
const files=['js/constants.js','js/generators/utils.js','js/generators/junk-emojis.js','js/generators/direction-pair-chooser.js',
 'js/generators/direction.js','js/generators/meta.js','js/generators/distinction.js','js/generators/extra-relations.js',
 'js/generators/banned.js','js/generators/stimuli.js','js/generators/premise-html.js','js/generators/premise-reorder.js'];
const ctx={console,Math,Date,JSON,structuredClone,Set,Map,Object,Array,Error,document:{},window:{}};
vm.createContext(ctx);
let src=files.map(f=>fs.readFileSync(ROOT+'/'+f,'utf8')).join('\n;\n');
src=src.replace(/^const /gm,'var ').replace(/^let /gm,'var ').replace(/^class (\w+)/gm,'var $1 = class $1');
vm.runInContext(src,ctx);

const subj=h=>[...h.matchAll(/<span class="subject">(.*?)<\/span>/g)].map(m=>m[1]);
const neg=h=>/is-negated/.test(h);
function* assignments(words){const n=words.length;for(let m=0;m<(1<<n);m++){const a={};words.forEach((w,i)=>a[w]=(m>>i)&1);yield a;}}
function assert(c,msg,item){if(!c){console.log('FAIL:',msg);console.log(JSON.stringify(item,null,1));process.exit(1);}}

// parity family: returns constraints [x,y,k] meaning bit(x)^bit(y)==k ; meta: [x,y,a,b,k]: (x^y)^(a^b)==k
function parseParity(line, sameWord, oppWord, item){
  const s=subj(line);
  if(/is-meta/.test(line)){
    assert(s.length===4,'meta subjects',item);
    const same=/same as/.test(line.replace(/<[^>]+>/g,'').split('(')[0]);
    const negated=/<span class="is-negated">(opposite of|same as)<\/span>/.test(line);
    let k=same?0:1; if(negated)k^=1;
    return {meta:[s[0],s[3],s[1],s[2],k]};
  }
  assert(s.length===2,'2 subjects',item);
  const txt=line.replace(/<[^>]+>/g,'');
  let k; if(txt.includes(sameWord))k=0; else if(txt.includes(oppWord))k=1; else assert(false,'unknown relation '+txt,item);
  if(neg(line))k^=1;
  return {pair:[s[0],s[1],k]};
}
function parityModels(cons){
  const words=[...new Set(cons.flatMap(c=>c.pair?c.pair.slice(0,2):c.meta.slice(0,4)))];
  const ms=[];for(const a of assignments(words)){if(cons.every(c=>c.pair?((a[c.pair[0]]^a[c.pair[1]])===c.pair[2]):(((a[c.meta[0]]^a[c.meta[1]])^(a[c.meta[2]]^a[c.meta[3]]))===c.meta[4])))ms.push(a);}
  return ms;
}
function stripExplainer(ps){return ps.filter(p=>!/negation-explainer/.test(p));}

const stats={};
function rec(t,v){stats[t]=stats[t]||{n:0,t:0};stats[t].n++;if(v)stats[t].t++;}

function checkInfluence(item,L){
  const ps=item.premises; assert(ps.length===L,'premise count '+ps.length+' vs '+L,item);
  const cons=ps.map(p=>parseParity(p,'varies directly with','varies inversely with',item));
  const ms=parityModels(cons); assert(ms.length>0,'inconsistent',item);
  const c=item.conclusion.replace(/<[^>]+>/g,''); const [A,B]=subj(item.conclusion);
  const m=c.match(/If .* (increases|decreases), .* (increases|decreases)/); assert(m,'concl parse',item);
  const claimK = (m[1]===m[2])?0:1;
  const vals=ms.map(a=>(a[A]^a[B])===claimK);
  assert(vals.every(v=>v===vals[0]),'undetermined',item);
  assert(vals[0]===item.isValid,'wrong key',item);
  assert(!ps.some(p=>!/is-meta/.test(p)&&subj(p).includes(A)&&subj(p).includes(B)),'pair stated directly',item);
  rec('influence',item.isValid);
}
function checkRequirement(item,L){
  const ps=item.premises; assert(ps.length===L,'premise count',item);
  const edges=ps.map(p=>{const s=subj(p);const t=p.replace(/<[^>]+>/g,'');let req;
    if(t.includes('is required by'))req=false; else if(t.includes('requires'))req=true; else assert(false,'rel',item);
    if(neg(p))req=!req; return req?[s[0],s[1]]:[s[1],s[0]];});
  const words=[...new Set(edges.flat())]; assert(words.length===L+1,'tree size',item);
  const ms=[];for(const a of assignments(words)) if(edges.every(([r,q])=>!a[r]||a[q]))ms.push(a); // 1=works
  const [X,Y]=subj(item.conclusion); const t=item.conclusion.replace(/<[^>]+>/g,'');
  let nec;
  if(/fails, then .* must fail/.test(t)) nec=ms.filter(a=>!a[X]).every(a=>!a[Y]);
  else if(/works, then .* must work/.test(t)) nec=ms.filter(a=>a[X]).every(a=>a[Y]);
  else assert(false,'concl',item);
  assert(nec===item.isValid,'wrong key',item);
  assert(!ps.some(p=>subj(p).includes(X)&&subj(p).includes(Y)),'pair stated directly',item);
  rec('requirement',item.isValid);
}
function checkContexts(item,L){
  const ps=item.premises; assert(ps.length===Math.max(3,L),'premise count',item);
  const ctxOf=p=>{const m=p.match(/^<span class="is-connector">Under<\/span> <span class="subject">(.*?)<\/span>: /);return m?m[1]:null;};
  const body=p=>p.replace(/^<span class="is-connector">Under<\/span> <span class="subject">.*?<\/span>: /,'');
  const ctxs=[...new Set(ps.map(ctxOf).filter(Boolean))]; assert(ctxs.length===2,'two contexts',item);
  const cc=ctxOf(item.conclusion); assert(ctxs.includes(cc),'concl ctx',item);
  const res={};
  for(const C of ctxs){
    const cons=ps.filter(p=>ctxOf(p)===null||ctxOf(p)===C).map(p=>parseParity(body(p),'is same as','is opposite of',item));
    const ms=parityModels(cons); assert(ms.length>0,'inconsistent '+C,item);
    const [A,B]=subj(body(item.conclusion)); const k=parseParity(body(item.conclusion),'is same as','is opposite of',item).pair[2];
    const vals=ms.map(a=>(a[A]^a[B])===k); assert(vals.every(v=>v===vals[0]),'undetermined',item);
    res[C]=vals[0];
  }
  assert(res[cc]===item.isValid,'wrong key',item);
  const other=ctxs.find(c=>c!==cc); assert(res[other]!==res[cc],'context does not matter',item);
  rec('contexts',item.isValid);
}
function checkBalance(item,L){
  const ps=item.premises; assert(ps.length===L,'premise count',item);
  const parse=h=>{const t=h.replace(/<[^>]+>/g,'').trim().split(/\s+/);assert(t.length===5,'balance parse '+t,item);
    return {p:BigInt(t[0]),a:subj(h)[0],q:BigInt(t[3]),b:subj(h)[1]};};
  const cons=ps.map(parse); // p*w(a) = q*w(b)
  const w={}; const first=cons[0].a; w[first]=[1n,1n]; let changed=true;
  while(changed){changed=false;for(const c of cons){
    if(w[c.a]&&!w[c.b]){w[c.b]=[c.p*w[c.a][0],c.q*w[c.a][1]];changed=true;}
    else if(w[c.b]&&!w[c.a]){w[c.a]=[c.q*w[c.b][0],c.p*w[c.b][1]];changed=true;}}}
  const words=[...new Set(cons.flatMap(c=>[c.a,c.b]))]; assert(words.every(x=>w[x]),'disconnected',item);
  for(const c of cons) assert(c.p*w[c.a][0]*w[c.b][1]===c.q*w[c.b][0]*w[c.a][1],'inconsistent',item);
  const k=parse(item.conclusion);
  const truth=k.p*w[k.a][0]*w[k.b][1]===k.q*w[k.b][0]*w[k.a][1];
  assert(truth===item.isValid,'wrong key',item);
  assert(!ps.some(p=>subj(p).includes(k.a)&&subj(p).includes(k.b)),'pair stated directly',item);
  rec('balance',item.isValid);
}

const configs=[{},{enableNegation:true},{enableMeta:true},{enableNegation:true,enableMeta:true},{minimalMode:false,scrambleFactor:100},{enableConnectionBranching:false}];
const N=+process.argv[3]||400;
for(const cfg of configs){
  Object.assign(ctx.savedata,{enableNegation:false,enableMeta:false,minimalMode:false,scrambleFactor:80,enableConnectionBranching:true},cfg);
  for(let L=2;L<=12;L++) for(let i=0;i<N;i++){
    let it;
    it=new ctx.InfluenceQuestion().create(L); it.premises=stripExplainer(it.premises); checkInfluence(it,L);
    it=new ctx.RequirementQuestion().create(L); checkRequirement(it,L);
    it=new ctx.ContextsQuestion().create(L); checkContexts(it,L);
    it=new ctx.BalanceQuestion().create(L); checkBalance(it,L);
  }
}
for(const [k,v] of Object.entries(stats)) console.log(k.padEnd(12),'items',v.n,' true-rate',(v.t/v.n*100).toFixed(1)+'%');
console.log('ALL CHECKS PASSED');
