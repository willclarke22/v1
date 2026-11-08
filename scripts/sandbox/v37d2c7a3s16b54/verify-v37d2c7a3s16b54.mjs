#!/usr/bin/env node
/** Independent add-only integration/source-integrity audit, no model or DB calls. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {loadSeed,parseArgs,runJourney} from '../learning-intelligence/s16b54-journey.mjs';
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
  "scripts/sandbox/v37d2c7a3s16b52/verify-v37d2c7a3s16b52.mjs": "d044f58b2a7c53b9ef62d3b816efbdeeb9a679ab588d89279ffd6c64ef3f679c",
  "scripts/sandbox/learning-intelligence/s16b53-conversation.mjs": "0c9e2ed4ddfc7f6e99ba5a9823b55820b39fce15658b60ab1903c647c0384fe6",
  "scripts/sandbox/learning-intelligence/s16b53-eval.mjs": "03a3276d2494725df0b5c3762dc1d3d507ff2d6e58fbff43ee611c642001375d",
  "scripts/sandbox/learning-intelligence/s16b53-selftest.mjs": "2c18b76b60159272c89c4e1cdf10e6ef019ac0e7c9a6fae3642144a18292531b",
  "scripts/sandbox/v37d2c7a3s16b53/README.md": "30b7708c8d581cbbcdef4dc5967988d351f794c65baedb8d8b27d515d0498058",
  "scripts/sandbox/v37d2c7a3s16b53/REVIEW_PROTOCOL.md": "e63e29e24e09f4bdfb9eff0df996d258b800abbece2ab14f10a03574c8ce66fc",
  "scripts/sandbox/v37d2c7a3s16b53/verify-v37d2c7a3s16b53.mjs": "340e6a5fa65d3da7cbf84ce18929bdf86064ff9d8c7cdf82a19c5889bbcefd09"
};
for(const [p,h] of Object.entries(must))assert.equal(hash(p),h,'Protected source changed: '+p);
for(const st of ['s16b51','s16b52','s16b53'])assert.ok(fs.existsSync(path.join(root,`scripts/sandbox/v37d2c7a3${st}/installation.json`)),'Missing prerequisite '+st);
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'scripts/sandbox/current-local-release.json'),'utf8')).release,'v37d2c7a3s12');
const proxy=fs.readFileSync(path.join(root,'proxy.ts'),'utf8');assert.ok(proxy.includes('Route blocked in V3.7C.1 read-only sandbox'));
assert.ok(proxy.indexOf('process.env.VERCEL === "1"')<proxy.indexOf('/api/sandbox/probe-lab/local-assessment/s16b4d-teaching'));
const seed=loadSeed();assert.equal(seed.sessions.length,3);assert.equal(seed.sessions.flatMap(s=>s.turns).length,12);
const test=await runJourney(parseArgs(['--mode','offline','--limit','12']),{rootCheck:false});
assert.equal(test.summary.processed,12);assert.equal(test.summary.live_memory_writes,0);
assert.ok(test.projection.not_semantic_layout&&test.projection.relationships.every(x=>!x.verified));
assert.equal(test.state.safeguards.committed_memory_writes,0);
for(const f of ['scripts/sandbox/learning-intelligence/s16b54-core.mjs','scripts/sandbox/learning-intelligence/s16b54-models.mjs','scripts/sandbox/learning-intelligence/s16b54-journey.mjs']){
 const x=fs.readFileSync(path.join(root,f),'utf8');for(const token of ['supabase.from(','upsertTopicState(','createClient(','writeFileSync(path.join(root,'])assert.ok(!x.includes(token),'Forbidden database or source write in '+f+': '+token);
}
console.log('S1.6B.5.4 VERIFY PASS: exact old source hashes, 12-turn local A/B/C journey, evidence/relationship/visual proposals, chronological tutor context; no writes to DB, existing teacher, proxy, production or original main.');
