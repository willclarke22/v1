import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root,rel),"utf8");
const base = "sandbox/probe-lab/local-assessment/";
const lab=read(base+"local-assessment-lab.tsx");
const css=read(base+"local-assessment-lab.module.css");
const inspector=read(base+"learning-decision-inspector.tsx");
const inscss=read(base+"learning-decision-inspector.module.css");
const handoff=read(base+"visual-handoff.ts");
const old=read("scripts/sandbox/verify-myway-learning-plan-v3_5.mjs");
for(const [name,src,jsx] of [["lab",lab,true],["inspector",inspector,true],["handoff",handoff,false]]){
 const tree=ts.createSourceFile(name,src,ts.ScriptTarget.ESNext,true,jsx?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 assert.equal(tree.parseDiagnostics.length,0,`Malformed ${name} TypeScript/TSX`);
}
for(const marker of ["teachingProvider", "setTeachingProvider", "createTeachingPlan(input, teachingProvider, controller.signal)", "workflowPreset", "LearningDecisionInspector", "buildVisualHandoff", "latestHandoff", "stageRail", "visualHandoffPanel", "ASSESS", "HANDOFF READY", "handoff_only_no_director_inference"]){
 assert(lab.toUpperCase().includes(marker.toUpperCase()),`Missing workflow/UI: ${marker}`);
}
assert(lab.includes('provider: assessmentProvider, teachingProvider'),"Providers must be recorded per attempt");
assert(lab.includes('rootProblem && resolution !== "clarify" && resolution !== "unresolved"'),"Clarification gate missing");
assert(!/\/api\/message\b/.test(lab) && !/localStorage\b/.test(lab),"Production writes/browser persistence prohibited");
assert(lab.includes('<option value="cloud">Reference') && lab.includes('<option value="hybrid">Hybrid'),"User-selectable benchmark presets missing");
assert(lab.includes('<aside className={styles.sideColumn}>') && lab.includes('legacyDiagnostics'),"Persistent inspector + collapsible older diagnostics required");
assert(css.includes('grid-template-columns:minmax(0,1.55fr)') && inscss.includes('.tabs'),"Readable 2-column inspector layout missing");
for(const marker of ["relationships","personalization","handoff","trace","0.50","Not measured","Not called","Show raw inputs and outputs","no grounded root problem","model-generated justification"]){
 assert(inspector.toLowerCase().includes(marker.toLowerCase()),`Missing inspector detail ${marker}`);
}
assert(!inspector.includes('fetch('),"Inspector is observational; should not call external APIs");
assert(old.includes('teachingProvider, controller.signal'),"Adjusted V3.5 verifier must check independent teaching model");
const js=ts.transpileModule(handoff,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {buildVisualHandoff}=await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`);
const valid={learnerMessage:'I cannot translate se',topic:'Spanish pronoun se',rootProblem:'Lacks a function-based mental model',evidenceQuote:'cannot translate se',rootConfidence:.82,resolution:'proceed',assessmentProvider:'openai',teachingProvider:'edge',teaching:{learner_reflection:'You are translating word by word.',teaching_strategy:'Compare grammatical functions',next_step:'Look for the role of se',visual_intent:'Highlight sentence roles side by side',use_interest:'do_not_use',chosen_interest:'',reason:'Context directly addresses difficulty.'}};
const good=buildVisualHandoff(valid);
assert(good.handoff && good.handoff.schema_version==='myway_visual_handoff_v1',"Valid handoff rejected");
assert(Object.isFrozen(good.handoff) && Object.isFrozen(good.handoff.personalization),"Handoff must freeze upstream decisions");
assert.deepEqual(good.handoff.providers,{assessment:'openai',teaching:'edge'},"Independent provider provenance lost");
assert(good.handoff.root_problem===valid.rootProblem && good.handoff.visual_intent===valid.teaching.visual_intent,"Handoff must not rediagnose or rewrite teaching intent");
assert(good.handoff.visual_stage==='not_run',"No fake Model C/visual generation statuses");
assert(good.handoff.personalization.chosen_interest===null,"Unused interests must not leak into handoff");
for(const bad of [{...valid,resolution:'clarify'},{...valid,rootProblem:''},{...valid,evidenceQuote:''},{...valid,rootConfidence:1.7},{...valid,teaching:{...valid.teaching,use_interest:'structural_bridge',chosen_interest:''}}]){
 assert(buildVisualHandoff(bad).error,"Unsupported/inconsistent handoff accepted");
}
const prod=path.join(root,'lib/learning-space/relationship-graph/build-topic-relationships.ts');
if(fs.existsSync(prod)) assert(!lab.includes('applyUnderstandingEvidence('),"Sandbox must not update production understanding scores");
console.log('PASS V3.6: independent A/B model choices, real 4-tab inspector, source/status labeling, honest non-rendered stage, frozen canonical handoff, prohibited writes, existing validation gate.');
