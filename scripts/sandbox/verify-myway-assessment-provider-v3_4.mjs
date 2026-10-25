import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const ui = fs.readFileSync('sandbox/probe-lab/local-assessment/local-assessment-lab.tsx','utf8');
const client = fs.readFileSync('sandbox/probe-lab/local-assessment/cloud-assessment-client.ts','utf8');
const server = fs.readFileSync('app/api/sandbox/probe-lab/local-assessment/openai/route.ts','utf8');
for (const phrase of ['myway_assessment_provider_confidence_v3_4', 'root_problem_confidence',
  'function resolveAssessmentRoute(', 'confidenceThreshold', 'requestOpenAIAssessment({',
  'responseConstraint: SCHEMA', 'provider: assessmentProvider', 'setAssessmentProvider(',
  'Ask one helpful question distinguishing possible difficulties', 'Original 0–10 rubrics',
  'function recoverEvidenceQuote(', 'Two similarity rankings', 'Advanced · Legacy manual benchmark']) {
  assert(ui.includes(phrase),`UI missing ${phrase}`);
}
assert(!/\bfetch\s*\(/.test(ui),'UI must not do direct cloud or production network calls');
assert(client.includes('const ROUTE = "/api/sandbox/probe-lab/local-assessment/openai";') && client.includes('fetch(ROUTE,'));
assert(!client.includes('OPENAI_API_KEY') && !ui.includes('OPENAI_API_KEY'));
assert(server.includes('process.env.OPENAI_API_KEY') && server.includes('process.env.NODE_ENV !== "development"'));
assert(server.includes('store: false') && server.includes('"no-store"'));
assert(!/localStorage|database\.|supabase\.|topic_state|qdrant/i.test(server));
const start=ui.indexOf('function evidenceTokens('),end=ui.indexOf('function formatScore(',start);
assert(start>=0 && end>start);
const fields=['topic_name','evidence_quote','root_problem','confusion','insight','next_action','clarifying_question','root_problem_confidence'];
const snippet=`const SCHEMA_FIELDS=${JSON.stringify(fields)};\nconst MAX_CLARIFICATION_DEPTH=1;\ntype Assessment={topic_name:string;evidence_quote:string;root_problem:string;confusion:number;insight:number;next_action:'clarify'|'proceed';clarifying_question:string;root_problem_confidence:number};\ntype ClarificationContext={originalMessage:string;question:string;depth:number};\ntype Resolution='clarify'|'proceed'|'provisional'|'unresolved';\n`+ui.slice(start,end);
const out=ts.transpileModule(snippet,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
assert.equal(out.diagnostics?.length??0,0,JSON.stringify(out.diagnostics));
const api=new Function(`${out.outputText}\nreturn {validateAssessment,resolveAssessmentRoute,recoverEvidenceQuote};`)();
const learner='I do not know how to understand se in different contexts.';
const base={topic_name:'Spanish se',evidence_quote:'I do not know how to understand se',root_problem:'Cannot interpret se from context.',confusion:5,insight:2,next_action:'proceed',clarifying_question:'',root_problem_confidence:0.45};
let x=api.validateAssessment(JSON.stringify(base),[learner]);
assert(x.assessment && !x.error);
assert.equal(api.resolveAssessmentRoute(x.assessment,null,0.65),'clarify');
assert.equal(api.resolveAssessmentRoute({...x.assessment,root_problem_confidence:0.75},null,0.65),'proceed');
assert.equal(api.resolveAssessmentRoute(x.assessment,{originalMessage:learner,question:'What is hardest?',depth:1},0.65),'provisional');
x=api.validateAssessment(JSON.stringify({...base,evidence_quote:'The learner was fluent yesterday',root_problem_confidence:0.99}),[learner]);
assert.equal(x.assessment?.root_problem,'');
assert.equal(x.assessment?.root_problem_confidence,0);
assert.equal(api.resolveAssessmentRoute(x.assessment,null,0.65),'clarify');
for (const score of [-0.1,1.1,'0.9',null]) {
  x=api.validateAssessment(JSON.stringify({...base,root_problem_confidence:score}),[learner]);
  assert(!x.assessment,`invalid confidence accepted: ${score}`);
}
const compiled=ts.transpileModule(server,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
assert.equal(compiled.diagnostics?.length??0,0,JSON.stringify(compiled.diagnostics));
const schema={type:'object',properties:{},required:fields,additionalProperties:false};
for(const f of fields) schema.properties[f]={type:f==='confusion'||f==='insight'?'integer':f==='root_problem_confidence'?'number':'string'};
for(const f of ['confusion','insight'])Object.assign(schema.properties[f],{minimum:-1,maximum:10});
Object.assign(schema.properties.root_problem_confidence,{minimum:0,maximum:1});
schema.properties.next_action.enum=['clarify','proceed'];
const processMock={env:{NODE_ENV:'production',OPENAI_API_KEY:'example-secret'}};
let captured=null;
const mockedFetch=async (_url,options)=>{
  captured=options;
  return {ok:true,status:200,json:async()=>({model:'example-openai-model',choices:[{message:{content:JSON.stringify({...base,root_problem_confidence:0.7})}}]})};
};
const moduleExports={};
new Function('exports','process','Response','fetch','AbortController','setTimeout','clearTimeout','URL',compiled.outputText)(
  moduleExports,processMock,Response,mockedFetch,AbortController,setTimeout,clearTimeout,URL);
const POST=moduleExports.POST;
function req(payload,origin='http://localhost:3000') {
  return new Request('http://localhost:3000/api/sandbox/probe-lab/local-assessment/openai',{
    method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(payload)});
}
const payload={userPrompt:learner,systemPrompt:'Assess carefully',responseSchema:schema};
assert.equal((await POST(req(payload))).status,403,'cloud API must be dev only');
processMock.env.NODE_ENV='development';processMock.env.OPENAI_API_KEY='';
assert.equal((await POST(req(payload))).status,503,'missing API key must fail closed');
processMock.env.OPENAI_API_KEY='example-secret';
assert.equal((await POST(req(payload,'http://malicious.localhost:3000'))).status,403);
assert.equal((await POST(req({...payload,responseSchema:{...schema,required:fields.slice(1)}}))).status,400);
const success=await POST(req(payload));
assert.equal(success.status,200);assert.equal((await success.json()).model,'example-openai-model');
assert.equal(captured.headers.Authorization,'Bearer example-secret');
assert.equal(captured.cache,'no-store');
assert.equal(JSON.parse(captured.body).response_format.json_schema.strict,true);
assert.equal(JSON.parse(captured.body).store,false);
console.log('PASS V3.4: strict 0..1 confidence, evidence grounding, threshold routing, dev-only explicit cloud, no key leakage, same schema for both providers.');
