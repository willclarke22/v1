#!/usr/bin/env node
/** Offline, no HTTP/DB. Deterministic negative-gate and integration assertions. */
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(process.argv[2]||process.cwd());
const read=p=>fs.readFileSync(path.join(root,...p.split('/')),'utf8');
function check(ok,message){if(!ok)throw new Error('V3.7D.2A TEST FAIL: '+message)}
const route=read('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts');
const server=read('sandbox/probe-lab/learning-space/topic-memory-commit.server.ts');
const cap=read('sandbox/probe-lab/learning-space/topic-memory-approval.server.ts');
const workbench=read('sandbox/probe-lab/learning-space/workbench.tsx');
const decision=read('sandbox/probe-lab/learning-space/topic-memory-preview.ts');
const ts=await import('typescript');
for(const [name,source,jsx] of [['route',route,false],['commit',server,false],['capability',cap,false],['Workbench',workbench,true],['decision',decision,false]]){
 const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,...(jsx?{jsx:ts.JsxEmit.ReactJSX}:{})},reportDiagnostics:true,fileName:name+(jsx?'.tsx':'.ts')});
 check(!(result.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error),name+' TypeScript syntax');
}
check(route.includes('x-myway-approval')&&route.includes('I_APPROVE_ONE_TOPIC_MEMORY_WRITE')&&route.includes('origin!==ownOrigin'),'commit must need same-origin custom-header and explicit approval');
check(route.includes('consumeApproval(x.approvalToken)')&&route.includes('commitTopicMemory(approved)'),'approved one-use capability');
check(route.includes('issueApproval({preview:topicMemory')&&route.includes('memoryDigest(rows)'),'issued for server-checked D.1 decision and memory snapshot');
check(server.includes('memoryDigest(rows)!==p.snapshotDigest')&&server.includes('.eq("updated_at",target.updated_at)'),'stale snapshot and conditional existing update');
check(server.includes('.insert(')&&!server.includes('.upsert('),'creation must be insert-only');
check(server.includes('getLatestTopicState()')&&server.includes('verified:true'),'server verification read');
check(server.includes('MYWAY_EXPERIMENTAL_RUNTIME')&&server.includes('MYWAY_TOPIC_VECTOR_BACKEND')&&server.includes('MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL'),'runtime pin');
check(cap.includes('TTL_MS=10*60*1000')&&cap.includes('approvals.delete(token)'),'expiring single-use capability');
check(workbench.includes('checked={approveChecked}')&&workbench.includes('disabled={!approveChecked||commitBusy}')&&workbench.includes('approveMemoryWrite'),'no automatic client write');
check(decision.includes('myway_learning_evidence')&&decision.includes('approvalToken?:'),'stored evidence readable by later proposals');
const compiled=ts.transpileModule(cap.replace('import "server-only";','').replace('import type { TopicStateRow } from "@/lib/persistence/read";','').replace('import type { TopicMemoryPreview } from "./topic-memory-preview";',''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
// Static checks above plus the real project typecheck are authoritative; no DB contacted.
check(compiled.includes('function consumeApproval'),'capability transpile');
const capability = await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const rows=[{topic_id:'a',topic_label:'Circuit',updated_at:'2026-10-25T00:00:00Z',topic_json:{root_problem:'A circuit must have a complete path.'}}];
const snapshot=capability.memoryDigest(rows);
check(snapshot!==capability.memoryDigest([{...rows[0],updated_at:'2026-10-25T01:00:00Z'}]),'memory version change invalidates approval');
check(snapshot!==capability.memoryDigest([{...rows[0],topic_json:{root_problem:'A new conflicting difficulty.'}}]),'topic evidence change invalidates approval');
const proposal={preview:{mode:'read_only',action:'associate_existing',targetTopicId:'a'},topicName:'Circuit',rootProblem:'Learner lacks a model of complete circuits',evidenceQuote:'circuit does not work',originalMessage:'My circuit does not work',currentMessage:'My circuit does not work',snapshotDigest:snapshot};
const capabilityToken=capability.issueApproval(proposal);
check(typeof capabilityToken==='string'&&capabilityToken.length===64,'strong single-use token issued only for actionable preview');
check(capability.consumeApproval(capabilityToken)?.topicName==='Circuit','first approval valid');
check(capability.consumeApproval(capabilityToken)===null,'replay of spent approval refused');
check(capability.issueApproval({...proposal,preview:{mode:'read_only',action:'hold',targetTopicId:null}})===null,'hold decisions cannot receive approval');
console.log('V3.7D.2A CONTRACT TEST PASS: explicit consent, one-time token, stale checks, guarded INSERT/UPDATE, verification read.');
