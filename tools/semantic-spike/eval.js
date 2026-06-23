'use strict';
const { makeEmbedder, cosine } = require('./embed');
const corpus = require('./corpus.json');
const queries = require('./queries.json');
const { embed } = makeEmbedder();
const docs = corpus.map(e => ({ title: e.title || '', text: e.text || '', vec: embed(((e.title||'')+' '+(e.text||'')).slice(0, 4000)) }));
const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g,' ');
let semHit=0, kwHit=0, semCaughtKwMissed=0;
console.log('N pages =', docs.length, '| queries =', queries.length, '\n');
for (const {q, expect} of queries) {
  const qv = embed(q);
  const ranked = docs.map((d,i)=>({i,t:d.title,s:cosine(qv,d.vec)})).sort((a,b)=>b.s-a.s);
  const top = ranked.slice(0,3);
  const semRank = ranked.findIndex(r => r.t.includes(expect)) + 1;
  // keyword baseline: does any query word (>=4 chars) appear in the doc title+text?
  const qWords = norm(q).split(/\s+/).filter(w=>w.length>=4);
  const kwScores = docs.map((d,i)=>({i,t:d.title,s:qWords.filter(w=>norm(d.title+' '+d.text).includes(w)).length}));
  const kwTop = kwScores.filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
  const kwRank = (()=>{const f=kwScores.filter(x=>x.s>0).sort((a,b)=>b.s-a.s).findIndex(r=>r.t.includes(expect)); return f<0?0:f+1;})();
  const semTop1 = semRank===1, kwTop1 = kwRank===1 && kwTop.length>0;
  if (semRank>=1 && semRank<=3) semHit++;
  if (kwTop1) kwHit++;
  if ((semRank>=1&&semRank<=3) && !(kwRank>=1&&kwRank<=3 && kwTop.length)) semCaughtKwMissed++;
  console.log(`Q: "${q}"`);
  console.log(`   expect ~"${expect}"  | semantic rank #${semRank||'>N'} (top3: ${top.map(t=>'"'+t.t.slice(0,22)+'" '+t.s.toFixed(2)).join(', ')})`);
  console.log(`   keyword baseline rank: ${kwRank? '#'+kwRank : 'MISS (no shared words)'}\n`);
}
console.log(`semantic top-3 hit: ${semHit}/${queries.length} | keyword top-1: ${kwHit}/${queries.length} | semantic caught & keyword missed (top3): ${semCaughtKwMissed}/${queries.length}`);
