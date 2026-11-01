#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||process.cwd());const read=p=>fs.readFileSync(path.join(root,...p.split('/')),'utf8');
const r=read('app/api/sandbox/probe-lab/learning-space/retrieve/route.ts');
const s=read('sandbox/probe-lab/learning-space/learning-space-preview.tsx');
const prev=JSON.parse(read('scripts/sandbox/current-local-release.json'));
assert.equal(prev.release,'v37d2c6c');
for(const marker of ['auto_create_new_topic','consumeApproval','commitTopicMemory({...p,topicName:canonical})','p.rootConfidence<0.78','c.similarity<0.55','no_close_semantic_candidate','origin!==ownOrigin','local']){
  if(marker==='local')continue;
  assert.ok(r.includes(marker),'Auto-create route invariant absent: '+marker);
}
for(const marker of ['Live topic search bubbles','searchMatches','trace?.status==="teaching"','Searching your topic space','Existing topic previews','autoCreate','without another confirmation','!(autoCreate && trace.topicMemory.action==="propose_new")','Creating the new topic automatically']){
 assert.ok(s.includes(marker),'Learning Space contract absent: '+marker);
}
assert.ok(!s.includes('root_problem_confidence??0)>=0.92'),'Removed mismatched extra client gate');
assert.ok(!r.includes('p.rootConfidence<0.92'),'Removed mismatched extra server gate');
assert.ok(s.includes('setSelected(m.topicId)'),'Search bubbles should open existing topics');
// Syntax-check TS/TSX with project TypeScript, no package/CDN calls.
const ts=await import(pathToFileURL(path.join(root,'node_modules/typescript/lib/typescript.js')).href);
for(const f of ['app/api/sandbox/probe-lab/learning-space/retrieve/route.ts','sandbox/probe-lab/learning-space/learning-space-preview.tsx']){
  const t=ts.createSourceFile(f,read(f),ts.ScriptTarget.Latest,true,f.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(t.parseDiagnostics.length,0,`Typescript syntax error ${f}: ${t.parseDiagnostics.map(x=>x.messageText).join('; ')}`);
}
console.log('V3.7D.2C.6C CONTRACT PASS: live search preview and consented, confirmation-free server-guarded topic creation.');
