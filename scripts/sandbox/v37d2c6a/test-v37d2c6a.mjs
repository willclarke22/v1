#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||process.cwd()),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ts=createRequire(path.join(root,'package.json'))('typescript');
const page=read('app/sandbox/probe-lab/learning-space/workbench/page.tsx');
const comp=read('lib/sandbox/v37d2c6a/browser-embedding-diagnostic.tsx');
const worker=read('lib/sandbox/v37d2c6a/embedding-worker-source.ts');
const launcher=read('scripts/sandbox/start-local.ps1');
for(const [file,source] of [['Workbench',page],['Diagnostic',comp],['Worker',worker]]){
 const out=ts.transpileModule(source,{fileName:file+'.tsx',compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
 assert.equal(out.diagnostics?.filter(x=>x.category===ts.DiagnosticCategory.Error).length??0,0,'TypeScript parser '+file);
}
assert.match(page,/process\.env\.VERCEL === "1"/);
for(const t of ['<CloudReadonlyView view="workbench"/>','<CloudAuthCheck />','<BrowserEmbeddingDiagnostic />','<LearningSpaceWorkbench/>'])assert.ok(page.includes(t),'Workbench branch '+t);
for(const t of ['new Worker','new Blob','type:"module"','Run browser embeddings','wasm','webgpu','rootRank','topicRank','revokeObjectURL','terminate()'])assert.ok(comp.includes(t),'UI behavior '+t);
for(const t of ['@huggingface/transformers@4.3.1','Xenova/all-MiniLM-L6-v2','normalize:true','pooling:',"dimensions:384",'valid(v)','cosine(','reused','postMessage({type:\'result\'','LIBRARY_URL'])assert.ok(worker.includes(t),'MiniLM behavior '+t);
for(const src of [comp,worker])for(const f of [/SUPABASE_SERVICE_ROLE_KEY/,/\.from\s*\(/,/\.rpc\s*\(/,/localStorage/,/sessionStorage/,/\bfetch\s*\(/,/\.insert\s*\(/,/\.update\s*\(/,/\.delete\s*\(/])assert.ok(!f.test(src),'Embedding code must not access MyWay storage/network APIs: '+f);
for(const t of ['current-local-release.json','installation.json','MYWAY_EXPERIMENTAL_LAUNCH_APPROVAL','--hostname 127.0.0.1 --port 3001','InvokeGitSafe','--short=7','start-local.ps1'])assert.ok((launcher+' start-local.ps1').includes(t),'Guarded startup '+t);
assert.ok(!launcher.includes('v37d2c3\\run-preview.ps1'));
const pointer=JSON.parse(read('scripts/sandbox/current-local-release.json'));
assert.equal(pointer.release,'v37d2c6a');assert.equal(pointer.schema,'myway-current-local-release-v1');
assert.ok(!read('lib/sandbox/v37d2c3/cloud-policy.ts').includes('/api/sandbox/probe-lab/learning-space/embeddings'));
console.log('V3.7D.2C.6A CONTRACT PASS: opt-in browser MiniLM, mock-only semantic comparisons, preserved auth/scene, pinned version-aware guarded launcher.');
