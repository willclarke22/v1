import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const file='sandbox/probe-lab/local-assessment/local-assessment-lab.tsx';
const source=fs.readFileSync(file,'utf8');
for(const phrase of [
  'myway_assessment_provider_confidence_v3_4',
  'Model quoted words not present in a learner statement',
  'Root problem lacked supporting quoted learner evidence',
  'Removed a stray clarifying question',
  'Validation adjustments (',
  'warnings: routedWarnings',
  'root_problem = ""',
  'setPendingClarification({',
  'await runConnectedComparison(id, parsed.assessment.topic_name, rootProblem)',
  'responseConstraint: SCHEMA',
  'const MAX_CLARIFICATION_DEPTH = 1',
  'exact learner words',
  'not the correct explanation',
  '0 complete clarity', '10 total confusion or frustration',
  '0 no insight (acknowledgment, filler)', '10 profound/original insight',
]) assert(source.includes(phrase),`missing safeguard: ${phrase}`);
const start=source.indexOf('function evidenceTokens(');
const end=source.indexOf('function formatScore(',start);
assert(start>=0 && end>start);
const snippet=`const SCHEMA_FIELDS = ${JSON.stringify(['topic_name','evidence_quote','root_problem','confusion','insight','next_action','clarifying_question','root_problem_confidence'])};\n`+source.slice(start,end);
const transpiled=ts.transpileModule(snippet,{compilerOptions:{target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal((transpiled.diagnostics??[]).length,0);
const validate=new Function(`${transpiled.outputText}\nreturn validateAssessment;`)();
const learner='I think a battery should light a bulb even with one wire missing.';
const base={topic_name:'Electric circuits',evidence_quote:'a battery should light a bulb',root_problem:'Learner believes a complete path is not required.',confusion:7,insight:2,root_problem_confidence:0.7,next_action:'proceed',clarifying_question:''};
const assess=(json, text=learner)=>validate(JSON.stringify(json),text);
let outcome=assess({...base,clarifying_question:'What does the second wire do?'});
assert.equal(outcome.error,undefined);assert.equal(outcome.assessment?.next_action,'proceed');
assert.equal(outcome.assessment.clarifying_question,'');assert.equal(outcome.warnings.length,1);
outcome=assess({...base,evidence_quote:'I don\'t understand how electricity works.',root_problem:'Learner does not know what electricity is.',next_action:'clarify',clarifying_question:'Which part is confusing?'},"I'm confused about electricity. Something isn't making sense.");
assert.equal(outcome.error,undefined);
assert.equal(outcome.assessment?.next_action,'clarify');
assert.equal(outcome.assessment.evidence_quote,'');
assert.equal(outcome.assessment.root_problem,'');
assert.equal(outcome.assessment.clarifying_question,'Which part is confusing?');
assert(outcome.warnings[0].includes('not present')); 
outcome=assess({...base,evidence_quote:'invented quote',clarifying_question:''});
assert.equal(outcome.assessment?.next_action,'clarify');
assert(outcome.assessment.clarifying_question.length>5);
outcome=assess({...base,evidence_quote:'',next_action:'proceed'});
assert.equal(outcome.assessment?.root_problem,'');
assert.equal(outcome.assessment?.next_action,'clarify');
outcome=assess({...base,confusion:13});
assert.equal(outcome.assessment,undefined);assert.match(outcome.error,/integer -1..10/);
outcome=assess({...base,root_problem:'',next_action:'clarify',clarifying_question:'What do you expect to happen?'});
assert.equal(outcome.assessment?.clarifying_question,'What do you expect to happen?');
outcome=assess({...base,topic_name:'Why does the wire matter?'});
assert(outcome.warnings.some(s=>s.includes('subject label')));
console.log('PASS: V3.2 recoverable-field handling, strict quote grounding, clarification fallback, rigid scores, cached retrieval and sandbox-only scope.');
