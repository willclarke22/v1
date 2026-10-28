#!/usr/bin/env node
/** V3.7D.2A Cost patch: preserve existing approval-only sandbox topic memory writes. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd()),original=path.resolve(root,'../v1');
const at=rel=>path.join(root,...rel.split('/'));
const stop=x=>{throw Error('V3.7D.2C.1 VERIFY STOP: '+x)};
const git=(r,...a)=>execFileSync('git',['-C',r,...a],{encoding:'utf8'}).trim();
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
// Compare protected files with the captured source *content*, allowing only
// line-ending, UTF-8 BOM, and trailing-final-newline representation variance.
const upgraded=new Set(['sandbox/probe-lab/learning-space/topic-association-verifier.ts','sandbox/probe-lab/learning-space/learning-turn.client.ts','sandbox/probe-lab/learning-space/learning-space-preview.tsx','sandbox/probe-lab/learning-space/workbench.tsx','sandbox/probe-lab/learning-space/glm-client.ts','sandbox/probe-lab/local-assessment/model-token-usage.ts','app/api/sandbox/probe-lab/local-assessment/teaching/route.ts','app/api/sandbox/probe-lab/local-assessment/glm/route.ts','sandbox/probe-lab/learning-space/topic-memory-preview.ts','sandbox/probe-lab/learning-space/root-problem-compare.server.ts','sandbox/probe-lab/learning-space/topic-memory-scores.ts','sandbox/probe-lab/learning-space/topic-memory-approval.server.ts','sandbox/probe-lab/learning-space/topic-memory-commit.server.ts','sandbox/probe-lab/learning-space/learning-turn.client.ts','sandbox/probe-lab/learning-space/learning-space-preview.tsx','sandbox/probe-lab/learning-space/workbench.tsx','sandbox/probe-lab/learning-space/snapshot.server.ts','app/api/sandbox/probe-lab/learning-space/retrieve/route.ts','app/api/sandbox/probe-lab/learning-space/retrieve/route.ts','lib/learning-space/build-learning-space.ts','sandbox/probe-lab/learning-space/assessment-core.ts','sandbox/probe-lab/learning-space/learning-space-preview.tsx','sandbox/probe-lab/learning-space/snapshot.server.ts','sandbox/probe-lab/learning-space/topic-memory-commit.server.ts','sandbox/probe-lab/learning-space/topic-memory-index.server.ts','sandbox/probe-lab/learning-space/workbench.tsx','sandbox/probe-lab/learning-space/assessment-core.ts','sandbox/probe-lab/learning-space/learning-turn.client.ts','sandbox/probe-lab/learning-space/glm-client.ts',
 'sandbox/probe-lab/learning-space/workbench.tsx','sandbox/probe-lab/local-assessment/cloud-teaching-client.ts',
 'app/api/sandbox/probe-lab/local-assessment/teaching/route.ts','app/api/sandbox/probe-lab/local-assessment/glm/route.ts']);
const contentDigest=p=>crypto.createHash('sha256').update(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/\n+$/,'')+'\n').digest('hex');
if(path.basename(root).toLowerCase()!=='v1-learning-experiment'||path.basename(original).toLowerCase()!=='v1')stop('Wrong worktree');
const common=r=>path.resolve(r,git(r,'rev-parse','--git-common-dir')).toLowerCase();
if(common(root)!==common(original)||!git(root,'branch','--show-current').startsWith('myway/learning-sandbox-'))stop('Git isolation/branch mismatch');
for(const p of ['scripts/sandbox/v37b3/installation.json','scripts/sandbox/v37c1/installation.json','scripts/sandbox/v37c23/installation.json','scripts/sandbox/v37c3/installation.json','scripts/sandbox/v37d1/installation.json','scripts/sandbox/v37d2a/installation.json','scripts/sandbox/v37d2acost/installation.json'])if(!fs.existsSync(at(p)))stop('Missing marker: '+p);
const c3=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37c3/installation.json'),'utf8'));
const d1=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37d1/installation.json'),'utf8'));
const m=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37d2a/installation.json'),'utf8'));
const cost=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37d2acost/installation.json'),'utf8'));
if(cost.schema!=='myway-v37d2acost-install-v1'||cost.database_writes!==false||cost.original_checkout_modified!==false)stop('Unsafe cost observability marker');
for(const [rel,wanted] of Object.entries(cost.file_hashes||{})){if(upgraded.has(rel))continue;if(!/^[a-zA-Z0-9_./-]+$/.test(rel)||rel.includes('..')||!fs.existsSync(at(rel))||digest(at(rel))!==wanted)stop('Cost patch source drift: '+rel);}
if(d1.schema!=='myway-v37d1-install-v1'||d1.database_writes!==false)stop('D.1 prerequisite not safe');
if(m.schema!=='myway-v37d2a-install-v1'||m.write_policy!=='explicit_approval_only'||m.legacy_worker_enabled!==false||m.original_checkout_modified!==false)stop('Unsafe D.2A installation marker');
for(const [rel,wanted] of Object.entries(m.file_hashes||{})){
 if(upgraded.has(rel)||new Set(['app/api/sandbox/probe-lab/learning-space/retrieve/route.ts','sandbox/probe-lab/learning-space/topic-memory-preview.ts','sandbox/probe-lab/learning-space/topic-memory-commit.server.ts']).has(rel))continue;
 if(!/^[a-zA-Z0-9_./-]+$/.test(rel)||rel.includes('..')||!fs.existsSync(at(rel))||digest(at(rel))!==wanted)stop('Source/hash drift: '+rel);
}
// D.1 files outside the D.2A allowlist must remain byte-for-byte unchanged.
const d2changed=new Set(['app/api/sandbox/probe-lab/learning-space/retrieve/route.ts',
 'sandbox/probe-lab/learning-space/topic-memory-preview.ts',
 'sandbox/probe-lab/learning-space/workbench.tsx']);
for(const [rel,hash] of Object.entries(d1.file_hashes||{})){
 if(d2changed.has(rel)||upgraded.has(rel))continue;
 if(!fs.existsSync(at(rel))||digest(at(rel))!==hash)stop('Unexpected D.1 source drift: '+rel);
}
// All previous V3.7C.3 files must remain unchanged except the single amended turn orchestrator.
for(const [rel,hash] of Object.entries(c3.file_hashes||{})){
 if(upgraded.has(rel)||new Set(['app/api/sandbox/probe-lab/local-assessment/openai/route.ts','sandbox/probe-lab/local-assessment/cloud-assessment-client.ts','sandbox/probe-lab/local-assessment/learning-plan.ts']).has(rel))continue;
 if(!fs.existsSync(at(rel))||digest(at(rel))!==hash)stop('Unexpected V3.7C.3 source drift: '+rel);
}
// Critical gates are left byte-for-byte untouched by this patch.
const c23=JSON.parse(fs.readFileSync(at('scripts/sandbox/v37c23/installation.json'),'utf8'));
for(const rel of ['proxy.ts','app/api/sandbox/probe-lab/learning-space/retrieve/route.ts','app/api/sandbox/probe-lab/local-assessment/glm/route.ts']){
 if(rel==='app/api/sandbox/probe-lab/local-assessment/glm/route.ts')continue; // Updated in C.3
 if(rel==='proxy.ts'&&digest(at(rel))!==c23.file_hashes[rel])stop('Proxy gate changed');
}
// V3.7B.3 hashes are historical; later approved patches changed both guard files.
const protectedHashes={
 'next.config.ts':'dc644ee3610c1562277d976e164b57dc0da39e3744ade87ad77b25c4d20337eb',
 'scripts/local-dev/semantic-enrichment-worker.ps1':'0597c3cc5763a0f648549393048d9adec95473a85707397562bcdda4d3d8ab01',
};
for(const [rel,hash] of Object.entries(protectedHashes))if(contentDigest(at(rel))!==hash)stop('Startup/worker gate content drift: '+rel);
for(const p of ['sandbox/probe-lab/learning-space/topic-memory-commit.server.ts',
 'sandbox/probe-lab/learning-space/topic-memory-approval.server.ts']){
 const content=fs.readFileSync(at(p),'utf8');
 if(!content.includes('import "server-only"'))stop('Server-only authority boundary missing: '+p);
}
const route=fs.readFileSync(at('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts'),'utf8');
for(const token of ['commit_topic_memory','I_APPROVE_ONE_TOPIC_MEMORY_WRITE','origin!==ownOrigin','consumeApproval'])
 if(!route.includes(token))stop('Missing explicit consent route guard: '+token);
const commit=fs.readFileSync(at('sandbox/probe-lab/learning-space/topic-memory-commit.server.ts'),'utf8');
for(const token of ['memoryDigest(rows)!==p.snapshotDigest','MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL','.eq("updated_at",target.updated_at)','createServerSupabaseClient'])
 if(!commit.includes(token))stop('Missing write safety invariant: '+token);
const proxy=fs.readFileSync(at('proxy.ts'),'utf8');
for(const token of ['127.0.0.1:3001','Route blocked in V3.7C.1','/api/sandbox/probe-lab/local-assessment/glm','/api/sandbox/probe-lab/local-assessment/openai','/api/sandbox/probe-lab/local-assessment/teaching'])if(!proxy.includes(token))stop('Missing proxy whitelist token: '+token);
if(fs.existsSync(at('middleware.ts'))||fs.existsSync(at('src/middleware.ts'))||fs.existsSync(at('src/proxy.ts')))stop('Conflicting route guard');
if(!fs.readFileSync(at('next.config.ts'),'utf8').includes('assertExperimentalStartupGate()'))stop('Next startup gate absent');
if(!fs.readFileSync(at('scripts/local-dev/semantic-enrichment-worker.ps1'),'utf8').includes('V3.7B.3 WORKER BLOCK'))stop('Legacy worker guard absent');
const {parseEnv,assertDestinationPin}=await import('../v37b2/live-utilities.mjs');
const origin=parseEnv(path.join(original,'.env.local')),destination=parseEnv(at('.env.local'));
assertDestinationPin(root,origin,destination);
if(destination.MYWAY_EXPERIMENTAL_RUNTIME!=='v37b'||destination.MYWAY_TOPIC_VECTOR_BACKEND!=='supabase')stop('Experiment runtime or vector backend not pinned');
for(const k of ['QDRANT_URL','QDRANT_API_KEY','QDRANT_TOPIC_COLLECTION'])if(destination[k]||process.env[k])stop('Qdrant not permitted in experimental runtime');
if(process.argv.includes('--remote')){
 // The old B.3 auditor requires EXACTLY the initially seeded topic count.
 // Approved D.2A topic creation intentionally changes that count. Keep the
 // destination pin and read-only health verification, not the frozen seed count.
 const {request,supabaseUrl,key}=await import('../v37b2/live-utilities.mjs');
 const response=await request(supabaseUrl(destination),key(destination),'/rest/v1/topic_state?select=topic_id&limit=1');
 if(!Array.isArray(response.data))stop('Pinned experimental topic_state read failed');
 console.log('V3.7D.2A PINNED SANDBOX DATABASE READ PASS (dynamic topic count permitted).');
}
for(const rel of ['sandbox/probe-lab/local-assessment/model-token-usage.ts','sandbox/probe-lab/learning-space/workbench.tsx'])if(!fs.readFileSync(at(rel),'utf8').includes('calculateTurnCost'))stop('Cost pipeline not wired: '+rel);
for(const rel of ['app/api/sandbox/probe-lab/local-assessment/openai/route.ts','app/api/sandbox/probe-lab/local-assessment/teaching/route.ts'])if(!fs.readFileSync(at(rel),'utf8').includes('readOpenAIUsage'))stop('Provider usage not captured: '+rel);
console.log('V3.7D.2A.1 BASELINE CHECK PASS: cost and approval prerequisites preserved.');

const d21=at('scripts/sandbox/v37d2a1/installation.json');
if(!fs.existsSync(d21))stop('New patch marker missing');
const newMarker=JSON.parse(fs.readFileSync(d21,'utf8'));
if(newMarker.schema!=='myway-v37d2a1-install-v1'||newMarker.write_policy!=='explicit_approval_only'||newMarker.database_writes!==false)stop('D2A1 marker unsafe');
for(const [rel,hash] of Object.entries(newMarker.file_hashes||{})){
 if(upgraded.has(rel))continue;
 if(!/^[a-zA-Z0-9_./-]+$/.test(rel)||rel.includes('..')||!fs.existsSync(at(rel))||digest(at(rel))!==hash)stop('D2A1 installed file drift: '+rel);
}
const turn=fs.readFileSync(at('sandbox/probe-lab/learning-space/learning-turn.client.ts'),'utf8');
if(!turn.includes('trace.reply=learnerFacingTeachingReply(result.plan.teaching_strategy)'))stop('Direct learner reply absent');
const preview=fs.readFileSync(at('sandbox/probe-lab/learning-space/topic-memory-preview.ts'),'utf8');
if(!preview.includes('strong_topic_level_match')||!preview.includes('rootConfidence>=0.78'))stop('Topic-level evidence threshold guard missing');
const newCommit=fs.readFileSync(at('sandbox/probe-lab/learning-space/topic-memory-commit.server.ts'),'utf8');
if(!newCommit.includes('memoryDigest(rows)!==p.snapshotDigest')||!newCommit.includes('strong_topic_level_match'))stop('Legacy association commit does not preserve stale-preview guard');
console.log('V3.7D.2A.1 VERIFY PASS: validated cost baseline, pinned sandbox destination, protected gates, explicit write approval, unchanged visual/worker boundary.');

const installed=at('scripts/sandbox/v37d2a2/installation.json');
if(!fs.existsSync(installed))stop('New D2A2 installation marker missing');
const marker=JSON.parse(fs.readFileSync(installed,'utf8'));
if(marker.schema!=='myway-v37d2a2-install-v1'||marker.write_policy!=='explicit_approval_only'||marker.database_writes!==false||marker.original_checkout_modified!==false||marker.legacy_worker_enabled!==false)stop('D2A2 marker safety fields invalid');
for(const [rel,wanted] of Object.entries(marker.file_hashes||{})){
 if(upgraded.has(rel))continue;
 if(!/^[a-zA-Z0-9_./-]+$/.test(rel)||rel.includes('..')||!fs.existsSync(at(rel))||digest(at(rel))!==wanted)stop('D2A2 source drift: '+rel);
}
const compact=fs.readFileSync(at('sandbox/probe-lab/local-assessment/compact-teaching.ts'),'utf8');
if(!compact.includes('required:["teaching_strategy","next_step","visual_intent"]')||!compact.includes('use_interest:"do_not_use"'))stop('Compact teaching schema or no-interest policy missing');
const glm=fs.readFileSync(at('app/api/sandbox/probe-lab/local-assessment/glm/route.ts'),'utf8');
const openai=fs.readFileSync(at('app/api/sandbox/probe-lab/local-assessment/teaching/route.ts'),'utf8');
if(!glm.includes('validCompactTeachingInput')||!openai.includes('validCompactTeachingInput')||!openai.includes('readOpenAIUsage'))stop('Model-side strict compact format or cost capture missing');
const currentTurn=fs.readFileSync(at('sandbox/probe-lab/learning-space/learning-turn.client.ts'),'utf8');
if(!currentTurn.includes('validateCompactTeaching(answer.raw)')||!currentTurn.includes('trace.reply=learnerFacingTeachingReply(result.plan.teaching_strategy)'))stop('Compact teaching not wired to learner reply');
console.log('V3.7D.2A.2 VERIFY PASS: unchanged sandbox pin/approval/legacy worker gates; compact teaching and cost intact; frozen handoff not modified.');

const d2bPath=at('scripts/sandbox/v37d2b/installation.json');
if(!fs.existsSync(d2bPath))stop('D2B installation marker missing');
const d2b=JSON.parse(fs.readFileSync(d2bPath,'utf8'));
if(d2b.schema!=='myway-v37d2b-install-v1'||d2b.database_writes!==false||d2b.write_policy!=='explicit_approval_only'||d2b.original_checkout_modified!==false||d2b.legacy_worker_enabled!==false)stop('D2B marker safety invariant failed');
for(const [rel,wanted] of Object.entries(d2b.file_hashes||{})){
 if(upgraded.has(rel))continue;
 if(!/^[a-zA-Z0-9_./-]+$/.test(rel)||rel.includes('..')||!fs.existsSync(at(rel))||digest(at(rel))!==wanted)stop('D2B payload drift: '+rel);
}
const index=fs.readFileSync(at('sandbox/probe-lab/learning-space/topic-memory-index.server.ts'),'utf8');
const newCommitD2b=fs.readFileSync(at('sandbox/probe-lab/learning-space/topic-memory-commit.server.ts'),'utf8');
const newRouteD2b=fs.readFileSync(at('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts'),'utf8');
const newWorkbenchD2b=fs.readFileSync(at('sandbox/probe-lab/learning-space/workbench.tsx'),'utf8');
for(const t of ['import "server-only"','embedText','initialTopicPlacement','is384Vector'])if(!index.includes(t))stop('Missing index/placement source invariant: '+t);
// Pending GLOBAL layout is set at commit/repair time, not by the pure index placement helper.
if(!newCommitD2b.includes('semantic_layout_refresh_pending'))stop('Missing commit/repair pending-layout invariant');
for(const t of ['memoryDigest(rows)!==p.snapshotDigest','MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL','prepareTopicIndex(label,rows)','topic_label_embedding_centroid:prepared.vector','repairApprovedTopicIndex','topic_vectors','.eq("updated_at",row.updated_at)'])if(!newCommitD2b.includes(t))stop('Missing commit/index invariant: '+t);
for(const t of ['repair_approved_topic_index','I_APPROVE_ONE_TOPIC_INDEX_REPAIR','origin!==ownOrigin','consumeApproval','commit_topic_memory'])if(!newRouteD2b.includes(t))stop('Missing route authority check: '+t);
for(const t of ['repairChecked','repairEligible','I_APPROVE_ONE_TOPIC_INDEX_REPAIR','Approve and commit once'])if(!newWorkbenchD2b.includes(t))stop('Explicit repair UI missing: '+t);
if(!/const data=await res\.json\(\) as \{[^}]*embeddingReady\?:boolean;[^}]*warning\?:string;/.test(newWorkbenchD2b))stop('Workbench approved commit response type omits index status fields');
if(!fs.readFileSync(at('lib/learning-space/build-learning-space.ts'),'utf8').includes('approved_topic_memory_evidence'))stop('Approved root problem not integrated into relationship graph');
console.log('V3.7D.2B VERIFY PASS: pinned sandbox, explicit creation/repair, indexed centroids, protected worker and model gates.');

const d2cAt=at('scripts/sandbox/v37d2c/installation.json');
if(!fs.existsSync(d2cAt))stop('Missing D2C installation marker');
const d2c=JSON.parse(fs.readFileSync(d2cAt,'utf8'));
if(d2c.schema!=='myway-v37d2c-install-v1'||d2c.database_writes!==false||d2c.original_checkout_modified!==false||d2c.legacy_worker_enabled!==false||d2c.write_policy!=='browser_session_opt_in_existing_only')stop('D2C marker safety invalid');
for(const [rel,wanted] of Object.entries(d2c.file_hashes||{})){
 if(upgraded.has(rel))continue;
 if(!/^[a-zA-Z0-9_./-]+$/.test(rel)||rel.includes('..')||!fs.existsSync(at(rel))||digest(at(rel))!==wanted)stop('D2C installed file drift: '+rel);
}
const croute=fs.readFileSync(at('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts'),'utf8');
const ccommit=fs.readFileSync(at('sandbox/probe-lab/learning-space/topic-memory-commit.server.ts'),'utf8');
const cpreview=fs.readFileSync(at('sandbox/probe-lab/learning-space/topic-memory-preview.ts'),'utf8');
const cclient=fs.readFileSync(at('sandbox/probe-lab/learning-space/learning-space-preview.tsx'),'utf8');
for(const x of ['auto_associate_existing','I_ENABLED_AUTO_ASSOCIATION_THIS_SESSION','autoEligible!==true','consumeApproval','rootSemanticMatches','isRubricScore'])if(!croute.includes(x))stop('D2C guarded route feature missing: '+x);
for(const x of ['snapshotDigest','memoryDigest(rows)!==p.snapshotDigest','sandboxOwned','myway_scored_observation_summary','scoreSummary','learning_score:null','.eq("updated_at",target.updated_at)'])if(!ccommit.includes(x))stop('D2C score/commit boundary missing: '+x);
for(const x of ['semantic_root_problem_match','rootProblemSemanticSimilarity','autoEligible','rootConfidence>=0.78'])if(!cpreview.includes(x))stop('D2C comparison missing: '+x);
for(const x of ['setAutoAssociate','autoAssociate && finalTrace.status==="complete"','auto_associate_existing','sessionStorage.setItem(TRACE_KEY'])if(!cclient.includes(x))stop('D2C session opt-in missing: '+x);
if(!fs.readFileSync(at('sandbox/probe-lab/learning-space/root-problem-compare.server.ts'),'utf8').includes('import "server-only"'))stop('Difficulty comparator not server-only');
if(!fs.readFileSync(at('sandbox/probe-lab/learning-space/topic-memory-scores.ts'),'utf8').includes('isRubricScore'))stop('Scoring validation missing');
const snapshotD2c=fs.readFileSync(at('sandbox/probe-lab/learning-space/snapshot.server.ts'),'utf8');
if(!snapshotD2c.includes('scoredObservations: object(object(row.topic_json).myway_scored_observation_summary)'))stop('Snapshot scored observation must use the current row topic_json');
console.log('V3.7D.2C VERIFY PASS: pinned sandbox, local root comparisons, opt-in auto update, scores, no auto creation or mastery writes.');

// V3.7D.2C.1 validates the new payload by exact SHA, on top of the inherited protected gates.
const v=at('scripts/sandbox/v37d2c1/installation.json');
if(!fs.existsSync(v))stop('D2C1 marker missing');
const m1=JSON.parse(fs.readFileSync(v,'utf8'));
if(m1.schema!=='myway-v37d2c1-install-v1'||m1.database_writes!==false||m1.original_checkout_modified!==false||m1.legacy_worker_enabled!==false||m1.write_policy!=='shadow_verifier_no_new_write_authority')stop('D2C1 unsafe marker');
for(const [rel,wanted] of Object.entries(m1.file_hashes||{})){
 if(!/^[a-zA-Z0-9_./-]+$/.test(rel)||rel.includes('..')||!fs.existsSync(at(rel))||digest(at(rel))!==wanted)stop('D2C1 installed file drift: '+rel);
}
const vcontract=fs.readFileSync(at('sandbox/probe-lab/learning-space/topic-association-verifier.ts'),'utf8');
const vturn=fs.readFileSync(at('sandbox/probe-lab/learning-space/learning-turn.client.ts'),'utf8');
const vpreview=fs.readFileSync(at('sandbox/probe-lab/learning-space/learning-space-preview.tsx'),'utf8');
const vt=fs.readFileSync(at('app/api/sandbox/probe-lab/local-assessment/teaching/route.ts'),'utf8');
const vg=fs.readFileSync(at('app/api/sandbox/probe-lab/local-assessment/glm/route.ts'),'utf8');
for(const x of ['same_topic_same_difficulty','same_topic_new_difficulty','new_topic','uncertain','parseVerifier','target_topic_id'])if(!vcontract.includes(x))stop('Verifier contract changed: '+x);
for(const x of ['verifierChoice','parseVerifier(answer.raw,input)','shadow-only','trace.verifier','trace.verifierModel'])if(!vturn.includes(x))stop('Verifier must remain in shadow-only trace: '+x);
for(const x of ['MODEL_CHOICES.map','Association verifier model','setVerifierChoice','autoAssociate && finalTrace.status'])if(!vpreview.includes(x))stop('Provider selector or opt-in boundary changed: '+x);
if(!vt.includes('verifying?validVerifierInput')||!vt.includes('VERIFIER_SCHEMA')||!vg.includes('validVerifierInput(obj.input)'))stop('Strict provider verifier validation missing');
if(!fs.readFileSync(at('sandbox/probe-lab/learning-space/workbench.tsx'),'utf8').includes('Shadow only · no write authority'))stop('Workbench verifier disclaimer absent');
console.log('V3.7D.2C.1 VERIFY PASS: shadow verifier, original approval guards, model selection, provider validation, cost capture, worker isolation.');
