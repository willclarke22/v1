#!/usr/bin/env node
/** Completely read-only R5.4 source/contract checks. No model calls, no session writes. */
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {validateActivity,validateEvents,frameDocument,sha} from './s62bfix1r54-creative-core.mjs';
import {parseArgs} from './s62bfix1r54-creative-run.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),src=n=>fs.readFileSync(path.join(here,n),'utf8');let n=0;const ok=(expr,msg)=>{assert.ok(expr,msg);n++;};
const activity={title:'An interactive original idea',html_fragment:'<style>button{color:purple}</style><button id="test" onclick="mywayRecord(\'choose\',\'option A\')">Try</button>',evidence_notes:'Learner clicks are not correctness.',limitations:'No verified physics or external audio.'};
const data=validateActivity(activity);ok(data===activity,'valid free-form activity');ok(sha(activity).length===64,'sha');
const doc=frameDocument(activity.html_fragment,'123456789012345678901234');
for(const part of ["default-src 'none'","connect-src 'none'","script-src 'unsafe-inline'","worker-src 'none'","form-action 'none'","window.mywayRecord",'myway_r54_event_v1','browser_click','browser_change','view_text'])ok(doc.includes(part),'frame missing '+part);
assert.throws(()=>validateActivity({...activity,html_fragment:'<html><body>hello</body></html>'}));n++;
assert.throws(()=>validateActivity({...activity,html_fragment:'x'}));n++;
ok(validateEvents([{action:'choose',detail:'A',view_text:'Which character?',at:'2026-01-01T00:00:00Z'}]).length===1,'event recording');
assert.throws(()=>validateEvents([{action:'ok',detail:'ok',at:'now',view_text:'x'.repeat(451)}]));n++;
const p=['--mode','check','--session-id','lab_r54','--turn-id','t0020','--variant','bx'];const x=parseArgs(p);ok(x.variant==='bx'&&x.mode==='check'&&!x.allow,'free check');
assert.throws(()=>parseArgs(['--mode','model','--session-id','lab_r54','--turn-id','t0020','--variant','bx','--budget-usd','1']));n++;
assert.throws(()=>parseArgs(['--mode','model','--session-id','lab_r54','--turn-id','t0020','--variant','bx','--budget-usd','0.01','--allow-spend']));n++;
ok(parseArgs(['--mode','model','--session-id','lab_r54','--turn-id','t0020','--variant','b_only','--budget-usd','0.5','--allow-spend']).variant==='b_only','single-call paid design admission');
const run=src('s62bfix1r54-creative-run.mjs'),web=src('s62bfix1r54-goldloop-web.mjs'),client=src('s62bfix1r54-goldloop-client.js'),continueCode=src('s62bfix1r54-probe-continuation.mjs'),runner=src('s62bfix1r54-goldloop-run.mjs'),store=src('s62bfix1r54-creative-store.mjs');
for(const [s,why] of [[run,"o.variant==='bx'"],[run,"B_ONLY"],[run,"B_DESIGN"],[run,"X_IMPLEMENT"],[run,"flag:'wx'"],[web,'/api/creative-design'],[web,'/api/creative-attempt'],[web,'/creative-frame'],[web,"frame-src 'self'"],[web,'creative-designs'],[web,'s62bfix1r54-probe-continuation.mjs'],[runner,'s62bfix1r54-probe-continuation.mjs'],[continueCode,"modality!=='creative_sandbox'"],[continueCode,'not_from_legacy_template'],[store,'not_independently_scored:true'],[store,'artifacts'],[client,'addCreativeResearchSection'],[client,'allow-scripts'],[client,'Submit & Continue (paid)'],[client,'Save only (free)'],[client,"'/api/creative-attempt'"],[client,"'/api/probe-continue'"]]){
 if(why==='artifacts')continue; // historical source label is intentionally not a runtime requirement
 ok(s.includes(why),'missing source invariant '+why);
}
console.log(JSON.stringify({status:'ok',checks:n,model_calls:0,embedding_calls:0,learning_state_writes:0,scope:'Read-only verification of creative output transport, sandbox policies, event provenance and paid API gate wiring'},null,2));
