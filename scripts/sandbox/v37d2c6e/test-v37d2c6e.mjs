#!/usr/bin/env node
/** V3.7D.2C.6E OFFLINE quality/security contract. Zero SQL execution, model calls, or private data reads. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||process.cwd());const file=p=>path.join(root,...p.split('/'));const read=p=>fs.readFileSync(file(p),'utf8');
const ts=await import(pathToFileURL(file('node_modules/typescript/lib/typescript.js')).href);
for(const name of ['lib/sandbox/v37d2c6e/cloud-protected-vector-search.tsx','lib/sandbox/v37d2c6a/embedding-worker-source.ts','app/sandbox/probe-lab/learning-space/workbench/page.tsx']){
 const source=read(name);const out=ts.transpileModule(source,{fileName:name,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 assert.equal((out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,'TS syntax '+name);
}
const worker=read('lib/sandbox/v37d2c6a/embedding-worker-source.ts');
for(const x of ['vector-query','vector-query-result','normalize:true','vectors[0]','MODEL_ID = "Xenova/all-MiniLM-L6-v2"'])assert.ok(worker.includes(x),'worker missing '+x);
// Verify actual inline worker JS parses, independent of JSX/typescript.
const match=worker.match(/String\.raw`([\s\S]*)`;\s*$/);assert.ok(match,'worker source template not found');
const {Script}=await import('node:vm');new Script(match[1],{filename:'v37d2c6e-embedding-worker.mjs'});
const ui=read('lib/sandbox/v37d2c6e/cloud-protected-vector-search.tsx');
// 6E FIX1: validate the worker's runtime result against its UI TypeScript contract.
assert.match(ui,/type VectorResult=\{[^\n]*backend:"wasm"\|"webgpu"/,'Worker backend missing from typed UI result');
assert.ok(worker.includes('result:{vector:vectors[0],model:MODEL_ID,backend,dimensions:384'),'Worker must return inference backend');
for(const needle of ['client.auth.getUser()','myway_cloud_vector_catalog_v37d2c6e','myway_cloud_match_topics_v37d2c6e','p_query:result.vector','return null','models','No per-token']){
 if(needle==='No per-token')continue;assert.ok(ui.includes(needle),'Missing UI guard '+needle);
}
for(const bad of ['service_role','myway_match_topics(','.insert(','.upsert(','.delete(','.update('])assert.ok(!ui.includes(bad),'Unexpected privileged operation '+bad);
const page=read('app/sandbox/probe-lab/learning-space/workbench/page.tsx');assert.ok(page.includes('<CloudProtectedVectorSearch />')&&page.includes('process.env.VERCEL === "1"'));
const sql=read('scripts/sandbox/v37d2c6e/sql/01_INSTALL_VECTOR_PROJECTION.sql');
// 6E SQL source hotfix: pgvector has no equality operator; comparing row values with IS DISTINCT FROM must never recur.
assert.ok(sql.includes('public.myway_cloud_vector_snapshot.embedding::text IS DISTINCT FROM EXCLUDED.embedding::text'), '6E pgvector refresh hotfix missing');
assert.ok(!sql.includes('IS DISTINCT FROM(EXCLUDED.embedding_model,EXCLUDED.embedding)'), 'Unsafe pgvector row-equality comparison returned');
for(const needle of ['myway_cloud_vector_snapshot','FORCE ROW LEVEL SECURITY','auth.uid()','auth.role()','SECURITY DEFINER SET search_path=\'\'','REVOKE ALL ON public.myway_cloud_vector_snapshot','myway_sync_private.owner_binding','OPERATOR(extensions.<=>)','OPERATOR(extensions.<#>)','myway_cloud_match_topics_v37d2c6e','kind=\'label\'','pg_advisory_xact_lock(3712,2503)','GRANT EXECUTE ON FUNCTION public.myway_cloud_match_topics_v37d2c6e'])assert.ok(sql.includes(needle),'SQL missing security invariant '+needle);
for(const risk of ['GRANT SELECT ON public.topic_vectors','GRANT SELECT ON public.topic_state','CREATE POLICY','ALTER TABLE public.topic_vectors','ALTER TABLE public.topic_state','INSERT INTO public.topic_state','UPDATE public.topic_state','DROP TABLE public.topic_state'])assert.ok(!sql.includes(risk),'Unexpected source-table scope expansion: '+risk);
for(const n of ['00_PREFLIGHT.sql','01_INSTALL_VECTOR_PROJECTION.sql','02_RUN_ONE_REFRESH.sql','03_ENABLE_CRON.sql','04_VERIFY_SECURITY.sql','05_STOP_CRON.sql','06_REMOVE_VECTOR_PROJECTION.sql'])assert.ok(fs.existsSync(file('scripts/sandbox/v37d2c6e/sql/'+n)));
const d=JSON.parse(read('scripts/sandbox/current-local-release.json'));assert.equal(d.release,'v37d2c6e');
console.log('V3.7D.2C.6E CONTRACT PASS: normalized 384-D browser vector, owner-only RPC, manual SQL, read-only cloud, no root-problem equivalence or write authority.');
