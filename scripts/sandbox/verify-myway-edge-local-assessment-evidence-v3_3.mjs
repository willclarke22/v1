import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const path = 'sandbox/probe-lab/local-assessment/local-assessment-lab.tsx';
const source = fs.readFileSync(path,'utf8');
const worker = fs.readFileSync('public/myway-local-embedding-lab-v2/connected-worker.mjs','utf8');
const required = [
  'myway_assessment_provider_confidence_v3_4', 'function recoverEvidenceQuote(',
  'function resolveAssessmentRoute(', 'function evidenceTokens(',
  'const MAX_CLARIFICATION_DEPTH = 1', 'provisional', 'unresolved',
  'const resolution = parsed.assessment ? resolveAssessmentRoute(',
  'const connected = await runConnectedComparison(id, parsed.assessment.topic_name, rootProblem)',
  'subject-only comparison', 'Withheld · no grounded root-problem hypothesis',
  'not the correct explanation', 'nonautomatic application',
  '0 complete clarity', '10 total confusion or frustration',
  '0 no insight (acknowledgment, filler)', '10 profound/original insight',
  'responseConstraint: SCHEMA', 'setPendingClarification({',
];
for(const phrase of required) assert(source.includes(phrase),`missing: ${phrase}`);
for(const phrase of ['const hasRoot = Boolean(rootProblem.trim());',
  'const queries = ensureVectors(queryOutput.tolist(), 2)',
  'queryVectors = ensureVectors(queryOutput.tolist(), 1)',
  'const difficulties = hasRoot ?',
  'problemVector: hasRoot ? queryVectors[1] : []']) assert(worker.includes(phrase),`worker missing: ${phrase}`);
for (const prohibited of [/\bfetch\s*\(/, /localStorage\s*\./, /indexedDB\.open\s*\(/, /\/api\//]) assert(!prohibited.test(worker));
const start=source.indexOf('function evidenceTokens(');
const end=source.indexOf('function formatScore(',start);
assert(start>=0&&end>start);
const snippet=`const SCHEMA_FIELDS = ${JSON.stringify(['topic_name','evidence_quote','root_problem','confusion','insight','next_action','clarifying_question','root_problem_confidence'])};\nconst MAX_CLARIFICATION_DEPTH=1;\ntype Assessment = { topic_name:string; evidence_quote:string; root_problem:string; confusion:number; insight:number; root_problem_confidence:number; next_action:"clarify"|"proceed"; clarifying_question:string };\ntype ClarificationContext={originalMessage:string;question:string;depth:number};\ntype Resolution="clarify"|"proceed"|"provisional"|"unresolved";\n`+source.slice(start,end);
const output=ts.transpileModule(snippet,{compilerOptions:{target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
assert.equal(output.diagnostics?.length??0,0,JSON.stringify(output.diagnostics));
const api=new Function(`${output.outputText}\nreturn {validateAssessment,recoverEvidenceQuote,resolveAssessmentRoute};`)();
const original='I don\'t want to keep translating the word "se" in Spanish in my head anymore. I can\'t map it onto a single English word, but I don\'t know what to do with it.';
const reply='Just every context. I know it can be used in different cases like in reflexive cases but when I read it or hear it, I just get lost even though I can slow down and figure it out. It\'s just not automatic.';
const base={topic_name:'Spanish se',evidence_quote:'I don\'t want to keep translating the word \'se\' in Spanish in my head anymore.',root_problem:'The learner struggles to assign a single meaning to se in context.',confusion:5,insight:0,root_problem_confidence:0.7,next_action:'proceed',clarifying_question:''};
let r=api.validateAssessment(JSON.stringify(base),[original]);
assert(r.assessment && !r.error);assert(r.assessment.evidence_quote.includes('word "se" in'));assert(r.assessment.root_problem);assert(r.warnings.some(w=>w.includes('Recovered verbatim')));
r=api.validateAssessment(JSON.stringify({...base,evidence_quote:'I never learned the word se.'}),[original]);
assert.equal(r.assessment.evidence_quote,'');assert.equal(r.assessment.root_problem,'');assert.equal(r.assessment.next_action,'clarify');
assert.equal(api.recoverEvidenceQuote("we'll get this",["well get this"]),null);
assert.equal(api.recoverEvidenceQuote('not automatic',[reply]),'not automatic');
assert.equal(api.recoverEvidenceQuote('I know how everything works',[original,reply]),null);
r=api.validateAssessment(JSON.stringify({...base, evidence_quote:'I can\'t map it onto a single English word',root_problem:'se can be e.g. a noun, verb or preposition',next_action:'proceed'}),[original,reply]);
assert.equal(r.assessment.root_problem,'');assert.equal(r.assessment.next_action,'clarify');
r=api.validateAssessment(JSON.stringify({...base,evidence_quote:'It\'s just not automatic',root_problem:'The learner cannot recognize se automatically when hearing or reading it.',next_action:'clarify',clarifying_question:'Which context?' }),[original,reply]);
assert.equal(r.assessment.root_problem.length>0,true);
assert.equal(api.resolveAssessmentRoute(r.assessment,{originalMessage:original,question:'Which context?',depth:1}),'provisional');
assert.equal(api.resolveAssessmentRoute({...r.assessment,root_problem:''},{originalMessage:original,question:'Which context?',depth:1}),'unresolved');
assert.equal(api.resolveAssessmentRoute(r.assessment,null),'clarify');
r=api.validateAssessment(JSON.stringify({...base,insight:15}),[original]);assert(!r.assessment);
// Simulate the installed worker's module logic without downloading any model.
const fakeTopics=Array.from({length:50},(_,i)=>({label:`Topic ${i}`,rootProblem:`Mock difficulty ${i}`}));
let embeddedCalls=0;
const fakePipeline=async texts=>{
 embeddedCalls++;
 return {tolist:()=>texts.map((s)=>{const vec=Array(384).fill(.02);vec[String(s).length%384]=1;return vec;})};
};
const msgs=[];
const fakeModule={env:{},pipeline:async()=>fakePipeline};
const sourceWorker=worker.replace('import { MOCK_TOPICS } from "./mock-topics.mjs";', 'const MOCK_TOPICS = self.__topics;').replace('await import(LIBRARY_URL)','await Promise.resolve(self.__module)');
const ctx={self:{__topics:fakeTopics,__module:fakeModule,navigator:{}},postMessage:(x)=>msgs.push(x),performance:{now:()=>5},console};
vm.runInNewContext(sourceWorker,ctx);
await ctx.self.onmessage({data:{type:'compare',runId:101,backend:'wasm',topicName:'Spanish se',rootProblem:''}});
let result=msgs.find(x=>x.type==='result'&&x.runId===101);assert(result,JSON.stringify(msgs));
assert.equal(result.result.subjects.length,50);assert.equal(result.result.difficulties.length,0);assert.equal(result.result.problemVector.length,0);
assert.equal(embeddedCalls,2);
await ctx.self.onmessage({data:{type:'compare',runId:102,backend:'wasm',topicName:'Spanish se',rootProblem:'Needs automatic recognition.'}});
result=msgs.find(x=>x.type==='result'&&x.runId===102);assert(result,JSON.stringify(msgs));
assert.equal(result.result.difficulties.length,50);assert.equal(result.result.problemVector.length,384);
assert.equal(result.result.reusedReferences,true);assert.equal(embeddedCalls,3);
console.log('PASS V3.3: exact quote recovery, altered-word rejection, speculative-example blocking, post-clarification routing, subject-only and 2-query cached retrieval.');
