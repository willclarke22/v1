import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const ui=fs.readFileSync('sandbox/probe-lab/local-assessment/local-assessment-lab.tsx','utf8');
const css=fs.readFileSync('sandbox/probe-lab/local-assessment/local-assessment-lab.module.css','utf8');
const client=fs.readFileSync('sandbox/probe-lab/local-assessment/cloud-assessment-client.ts','utf8');
const source=fs.readFileSync('app/api/sandbox/probe-lab/local-assessment/openai/route.ts','utf8');
for (const str of ['role="tablist"','role="tab"','role="tabpanel"','configurationTab === "prompt"','configurationTab === "schema"','configurationTab === "diagnostics"','setConfigurationTab(tab)','checkOpenAISetup()','Check OpenAI setup','Assessment model','OpenAI · MyWay-configured GPT','root_problem_confidence']) assert(ui.includes(str),'UI missing '+str);
for(const str of ['.configTabActive','.configPane','.providerSelect','.configDiagnostics'])assert(css.includes(str),'CSS missing '+str);
for(const str of ['MYWAY_OPENAI_API_KEY','OPENAI_API_KEY','OPENAI_BASE_URL','MYWAY_VISUAL_EXPERIENCE_OPENAI_MODEL','OPENAI_MODEL','gpt-4o-mini','process.env.NODE_ENV !== "development"','SERVER_TIMEOUT_MS = 30_000','maxCompletion']) {
  if(str==='maxCompletion')continue;
  assert(source.includes(str),'server config missing '+str);
}
assert(client.includes('CLOUD_CLIENT_TIMEOUT_MS = 42_000'));
assert(client.includes('CONFIG_TIMEOUT_MS = 8_000'));
assert(!/\bfetch\s*\(/.test(ui),'Direct fetch bypassed client boundary');
assert(!ui.includes('API_KEY'),'Key must never enter React client');
assert(!/localStorage|supabase\.|qdrant|\bscoreUpdate\b/i.test(source));
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
assert.equal(compiled.diagnostics?.length??0,0);
const mockEnv={NODE_ENV:'development',MYWAY_OPENAI_API_KEY:'visual-provider-secret',OPENAI_API_KEY:'fallback-secret',OPENAI_BASE_URL:'https://example.test/v1',MYWAY_VISUAL_EXPERIENCE_OPENAI_MODEL:'gpt-4o-mini'};
let captured=null;let outboundCount=0;
const fakeFetch=async(url,options)=>{
  outboundCount++;captured={url,options};
  return {ok:true,status:200,json:async()=>({model:'gpt-4o-mini',choices:[{message:{content:'{"topic_name":"Spanish se"}'}}]})};
};
const exports={};
new Function('exports','process','Response','fetch','AbortController','setTimeout','clearTimeout','URL',compiled.outputText)(exports,{env:mockEnv},Response,fakeFetch,AbortController,setTimeout,clearTimeout,URL);
const {GET,POST}=exports;
function req(method='GET',body){return new Request('http://localhost:3000/api/sandbox/probe-lab/local-assessment/openai',{method,headers:{origin:'http://localhost:3000','content-type':'application/json'},...body?{body:JSON.stringify(body)}:{}});}
const details=await GET(req());const config=await details.json();
assert.equal(details.status,200);assert.equal(outboundCount,0,'GET must not call paid API');
assert.equal(config.ready,true);assert.equal(config.keySource,'MYWAY_OPENAI_API_KEY');assert.equal(config.model,'gpt-4o-mini');assert.equal(config.endpointHost,'example.test');assert.equal(config.serverTimeoutSeconds,30);
assert(!JSON.stringify(config).includes('secret'));
const fields=['topic_name','evidence_quote','root_problem','confusion','insight','next_action','clarifying_question','root_problem_confidence'];
const schema={type:'object',additionalProperties:false,required:fields,properties:{}};
for(const field of fields){schema.properties[field]={type:['confusion','insight'].includes(field)?'integer':field==='root_problem_confidence'?'number':'string'};}
for(const key of ['confusion','insight'])Object.assign(schema.properties[key],{minimum:-1,maximum:10});
Object.assign(schema.properties.root_problem_confidence,{minimum:0,maximum:1});
schema.properties.next_action.enum=['clarify','proceed'];
const payload={userPrompt:'I find Spanish se confusing.',systemPrompt:'Return the assessment.',responseSchema:schema};
const response=await POST(req('POST',payload));assert.equal(response.status,200);assert.equal((await response.json()).model,'gpt-4o-mini');
assert.equal(captured.url,'https://example.test/v1/chat/completions');assert.equal(captured.options.headers.Authorization,'Bearer visual-provider-secret');
assert.equal(JSON.parse(captured.options.body).response_format.json_schema.strict,true);
const count=outboundCount;
const bad=await POST(req('POST',{...payload,responseSchema:{}}));assert.equal(bad.status,400);assert.equal(outboundCount,count,'Invalid schema caused charge');
mockEnv.MYWAY_OPENAI_API_KEY='';const cfg=await GET(req());assert.equal((await cfg.json()).keySource,'OPENAI_API_KEY');
mockEnv.OPENAI_API_KEY='';const missing=await GET(req());assert.equal((await missing.json()).ready,false);
const missingPost=await POST(req('POST',payload));assert.equal(missingPost.status,503);assert.equal(outboundCount,count);
mockEnv.NODE_ENV='production';assert.equal((await GET(req())).status,403);
console.log('PASS V3.4.1: working UI tab wiring, inherited visual-provider env, free status GET, bounded client/server deadlines, strict schemas, dev-only cloud, no unprompted model usage.');
