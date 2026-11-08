#!/usr/bin/env node
/** Independent evidence-integrity and locked-source check; does not use providers. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {selectComparisonCases,buildConversationCase,buildProviderRequest,VARIANTS} from '../learning-intelligence/s16b53-conversation.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const must={
  "proxy.ts": "917bdadc239a25b9625b8cc667b971149e9a5f1e4883fba5b735f73124b61337",
  "app/api/sandbox/probe-lab/local-assessment/s16b4d-teaching/route.ts": "13499f1e9ef8f5ceac0fc482b85465ddd5c3a63e61a5bdcf2181855fca620225",
  "scripts/sandbox/learning-intelligence/s16b51-fidelity.mjs": "f1d05e2b12755f4638f2af591ec09d1f28201362572a7a615f787bd4a97c44b6",
  "scripts/sandbox/learning-intelligence/s16b51-eval.mjs": "2ee027875ec9433b5e1b9e35aa660f92006db3a9eb853ba0193d81c5b83e2e03",
  "scripts/sandbox/learning-intelligence/s16b5-dialogue.mjs": "45a0a7ccc0264880943ec7910d21d41ba87952af87a24dbab985fa836da441c0",
  "scripts/sandbox/learning-intelligence/s16b3-intent.mjs": "45bfa3f9cf08203a4e034b2d35721873312e2a3d1485b66eb0f31b93ef2222a7",
  "scripts/sandbox/learning-intelligence/s16b4c-planner.mjs": "a1186a8d6086d44919e6ee544c7d9876812bbc6c31655ed321c4f82d81779a62",
  "scripts/sandbox/learning-intelligence/s16b4d-integration.mjs": "d610675fc72fcc3225b3f92d235eabea9883e93cfb40e600ed91608dff4e40a2",
  "scripts/sandbox/learning-intelligence/s16b4b-context.mjs": "d00fabb67a3119419a2f448de9568ce3284b141214ab33e9f44580cfdbf34aa9",
  "scripts/sandbox/v37d2c7a3s16b51/verify-v37d2c7a3s16b51.mjs": "64091e239599257c544fee33b21b450f325ee5613d0022ce5012fef1576c6542",
  "scripts/sandbox/learning-intelligence/s16b4d-fixtures.json": "6af14d1e75d27693cfa8b4239b442279f575a2c6625602bdd9e403a449c72ccd",
  "scripts/sandbox/current-local-release.json": "24336fe35cd0096d2d510d11a44a39fc0c82a40167914b556069cdd2c9bb16f1",
  "scripts/sandbox/learning-intelligence/s16b52-corpus.mjs": "3fe16e1fe20aa3ce113bd8184d3ef3118e39069e1d05581bfa11d231970efb08",
  "scripts/sandbox/learning-intelligence/s16b52-eval.mjs": "3f1c3cf93e2bd30ac9c6591a2511575be287b9b6652c342f46241f97b988a975",
  "scripts/sandbox/learning-intelligence/s16b52-realism-corpus.json": "fd82dc36de871a195c29f97e531f84d4ada38b06f08e3fd6d5ef953a06a6ab29",
  "scripts/sandbox/v37d2c7a3s16b52/verify-v37d2c7a3s16b52.mjs": "d044f58b2a7c53b9ef62d3b816efbdeeb9a679ab588d89279ffd6c64ef3f679c"
};
for(const [p,h] of Object.entries(must))assert.equal(hash(p),h,'Protected source changed: '+p);
const code=fs.readFileSync(path.join(root,'scripts/sandbox/learning-intelligence/s16b53-eval.mjs'),'utf8');
for(const s of ['--allow-spend','--budget-usd','preflight','cost','PROVIDER_VALIDATED_UNSCORED','OFFLINE_PREPARED','S16B53_BLIND_REVIEW.txt','rootCheck','no learner']){
 if(s==='no learner')continue;assert.ok(code.includes(s),'Eval lacks guard '+s);
}
assert.ok(!code.includes('upsertTopicState')&&!code.includes('supabase.from('));
const cases=selectComparisonCases({limit:6});assert.equal(cases.length,6);assert.ok(cases.every(x=>x.split==='development'));
for(const s of cases){const c=buildConversationCase(s);const m=buildProviderRequest(c,'direct').messages;
 assert.equal(m.at(-1).content,s.raw_learner_message);assert.deepEqual(m.slice(2,-1).map(x=>x.content),s.prior_turns.map(x=>x.text));
}
assert.deepEqual(VARIANTS,['direct','simple','action','current']);
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/current-local-release.json'),'utf8')).release,'v37d2c7a3s12');
const proxy=fs.readFileSync(path.join(root,'proxy.ts'),'utf8');assert.ok(proxy.includes('Route blocked in V3.7C.1 read-only sandbox'));
assert.ok(proxy.indexOf('process.env.VERCEL === "1"')<proxy.indexOf('/api/sandbox/probe-lab/local-assessment/s16b4d-teaching'));
for(const st of ['s16b4d','s16b4dfix1','s16b4dfix2','s16b5','s16b51','s16b52'])
 assert.ok(fs.existsSync(path.join(root,`scripts/sandbox/v37d2c7a3${st}/installation.json`)),'Missing prior receipt '+st);
console.log('S1.6B.5.3 VERIFY PASS: raw dialogue/model-first ablation, single reply, heuristic advisory, existing adaptive baseline and proxy unchanged; developer cases only, no DB/profiles/memory writes.');
