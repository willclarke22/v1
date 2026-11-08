#!/usr/bin/env node
/** All assertions are provider-free and database-free, including paid-mode mocks. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {runJourney,parseArgs,admissionEstimate,loadSeed} from './s16b54-journey.mjs';
import {assessGuard,memoryDecisionGuard,teachingContext,newState,projection} from './s16b54-core.mjs';
import {validatedJson,validateReply,B_SCHEMA,usageCost,requestA,requestC} from './s16b54-models.mjs';
const seed=loadSeed(),all=seed.sessions.flatMap(s=>s.turns);
assert.equal(all.length,12);assert.equal(seed.sessions.length,3);assert.equal(new Set(all.map(t=>t.id)).size,12);
assert.throws(()=>parseArgs(['--mode','model','--limit','3']),/allow-spend/);
assert.throws(()=>parseArgs(['--mode','offline','--allow-spend']),/refuses/);
assert.throws(()=>parseArgs(['--mode','offline','--limit','13']),/Limit/);
assert.throws(()=>parseArgs(['--mode','model','--limit','7','--allow-spend','--budget-usd','0.4']),/Limit/);
assert.throws(()=>parseArgs(['--mode','offline','--personalization','invented']),/Unsupported/);
assert.ok(admissionEstimate(3)<0.12);
assert.throws(()=>assessGuard({...all[0].offline_assessment,evidence_quote:'not actually what learner said'},all[0].learner),/invented/);
assert.throws(()=>memoryDecisionGuard({identity:'same',anchor_id:'invented',rationale:'guess'},[]),/anchor/);
assert.throws(()=>validatedJson('{"reply":"fine","mastery":true}',B_SCHEMA),/unexpected/);
assert.throws(()=>validateReply('{"reply":""}'),/Invalid/);
assert.throws(()=>usageCost({prompt_tokens:5}),/Unknown/);
assert.ok(!JSON.stringify(requestA(newState(seed),all[0].learner)).includes('offline_reply'));
const offline=await runJourney(parseArgs(['--mode','offline','--limit','12']),{seed,rootCheck:false});
assert.equal(offline.summary.processed,12);assert.equal(offline.summary.stopped,false);
assert.equal(offline.summary.sessions_reached,3);assert.equal(offline.summary.topics,3);
assert.equal(offline.summary.provisional_roots,3);assert.equal(offline.summary.relationship_hypotheses,1);
assert.equal(offline.summary.visual_proposals,1);assert.equal(offline.cost.attemptedCalls,0);
assert.ok(offline.events.every(e=>e.model_b_status==='OFFLINE_AUTHOR_SCRIPT_NOT_MODEL_B'));
assert.ok(offline.events.every(e=>e.reply===all.find(t=>t.id===e.id).offline_reply));
assert.ok(offline.events.some(e=>e.memory_action.status==='HELD_IDENTITY_UNCERTAIN'));
assert.ok(offline.events.find(e=>e.id==='J04').reply.includes('Suppose'));
assert.equal(offline.events.find(e=>e.id==='J08').visual.status,'PROPOSED_NOT_RENDERED');
assert.equal(offline.events.find(e=>e.id==='J06').relationships[0].verified,false);
assert.ok(offline.state.roots.every(r=>r.status==='PROVISIONAL_UNVERIFIED'));
assert.ok(offline.state.evidence.every(e=>all.find(t=>t.id===e.turn_id).learner.includes(e.quote)));
assert.equal(offline.state.safeguards.authoritative_mastery_awards,0);
assert.equal(offline.projection.not_semantic_layout,true);
assert.ok(offline.projection.topics.every(t=>t.position_source.includes('NOT_SEMANTIC')));
const first=offline.events[0];assert.equal(first.model_b_context.at(-1).content,first.learner);
assert.equal(offline.events[1].model_b_context.at(-3).content,first.learner);
assert.equal(offline.events[1].model_b_context.at(-2).content,first.reply);
const offProfile=teachingContext(offline.state,'test',all[0].offline_assessment,{personalization:'off',seedProfile:seed.profile});
const onProfile=teachingContext(offline.state,'test',all[0].offline_assessment,{personalization:'explicit',seedProfile:seed.profile});
assert.deepEqual(offProfile.note.interests,[]);assert.deepEqual(onProfile.note.interests,['soccer']);
assert.equal(onProfile.note.personal_preference,seed.profile.preference);
assert.ok(!onProfile.messages[0].content.includes('MOVE='));
const untrusted=all[0].offline_assessment;assert.throws(()=>teachingContext({turns:[{learner:'a'.repeat(4300),reply:'b'}],roots:[],topics:[]},'learner',untrusted),/Unsafe dialogue/);
const reports=JSON.stringify(offline.state);assert.ok(!reports.includes('OPENAI_API_KEY'));
let calls=[];const mock=async (request,_credentials,role)=>{
 calls.push({role,messages:request.messages});let value;
 if(role==='A'){
  const user=JSON.parse(request.messages.at(-1).content).current_learner_message;
  const turn=all.find(t=>t.learner===user);value=turn.offline_assessment;
 }else if(role==='B'){
  const learner=request.messages.at(-1).content;
  value={reply:'MOCK_MODEL_B: '+learner.slice(0,100)};
 }else{
  const ctx=JSON.parse(request.messages.at(-1).content);
  const candidate=ctx.candidates.find(c=>c.topic===ctx.topic);
  value=candidate?{identity:'same',anchor_id:candidate.id,rationale:'mocked same-topic anchor'}:{identity:'uncertain',anchor_id:null,rationale:'mocked uncertain'};
 }
 return {raw:JSON.stringify(value),usage:{prompt_tokens:80,completion_tokens:45,prompt_tokens_details:{cached_tokens:0}},model:'gpt-4.1-mini',finishReason:'stop'};
};
const live=await runJourney(parseArgs(['--mode','model','--limit','3','--allow-spend','--budget-usd','0.12']),{seed,rootCheck:false,send:mock,cred:()=>({key:'MOCK_ONLY',url:'https://mock.invalid'})});
assert.equal(live.summary.processed,3);assert.equal(live.summary.stopped,false);assert.equal(live.cost.byRole.A,3);assert.equal(live.cost.byRole.B,3);assert.equal(live.cost.byRole.C,1);
assert.equal(live.cost.attemptedCalls,7);assert.equal(live.cost.unknownOrIncompleteCalls,0);
assert.ok(live.events.every(e=>e.reply.startsWith('MOCK_MODEL_B: ')));
const bCalls=calls.filter(x=>x.role==='B');assert.equal(bCalls.length,3);
assert.ok(bCalls[1].messages.some(m=>m.role==='assistant'&&m.content===live.events[0].reply), 'real provider-generated tutor output must become next turn history');
assert.equal(live.events[2].memory_action.status,'OBSERVATION_ONLY');
let invalidAOnce=true;
const badA=await runJourney(parseArgs(['--mode','model','--limit','2','--allow-spend','--budget-usd','0.12']),{seed,rootCheck:false,cred:()=>({key:'MOCK_ONLY',url:'https://mock.invalid'}),send:async(req,c,role)=>{
 const out=await mock(req,c,role);
 if(role==='A'&&invalidAOnce){invalidAOnce=false;const a=JSON.parse(out.raw);a.evidence_quote='a quote that was not in learner message';out.raw=JSON.stringify(a);}
 return out;
}});
assert.equal(badA.summary.processed,2);
assert.equal(badA.events[0].model_a_status,'HELD_INVALID_MODEL_A');
assert.ok(badA.events[0].reply.startsWith('MOCK_MODEL_B:'));
assert.equal(badA.events[0].memory_action.status,'HELD_NO_VALID_ASSESSMENT');
const badC=await runJourney(parseArgs(['--mode','model','--limit','3','--allow-spend','--budget-usd','0.12']),{seed,rootCheck:false,cred:()=>({key:'MOCK_ONLY',url:'https://mock.invalid'}),send:async(req,c,role)=>{
 const out=await mock(req,c,role);if(role==='C')out.raw=JSON.stringify({identity:'same',anchor_id:'invented',rationale:'mock invalid anchor'});return out;
}});
assert.equal(badC.summary.processed,3);assert.equal(badC.events[1].model_c_status,'HELD_INVALID_MODEL_C');
assert.equal(badC.events[1].memory_action.status,'HELD_IDENTITY_UNCERTAIN');
assert.ok(badC.events[2].reply.startsWith('MOCK_MODEL_B:'));
let attempts=0;
const incomplete=await runJourney(parseArgs(['--mode','model','--limit','2','--allow-spend','--budget-usd','0.12']),{seed,rootCheck:false,cred:()=>({key:'MOCK_ONLY',url:'https://mock.invalid'}),send:async()=>{attempts++;return {raw:'{}',usage:null}}});
assert.equal(attempts,1);assert.equal(incomplete.summary.processed,0);assert.equal(incomplete.summary.stopped,true);
assert.equal(incomplete.cost.complete,false);assert.equal(incomplete.cost.unknownOrIncompleteCalls,1);
assert.equal(incomplete.summary.live_memory_writes,0);
assert.equal(JSON.stringify(projection(offline.state)),JSON.stringify(offline.projection));
console.log('S1.6B.5.4 SELFTEST PASS: 12 sequential synthetic turns across 3 sessions; real chronological tutor context; A/B/C mocked model chain; evidence-backed provisional roots, contextual holds, relationship and requested visual proposals; no mastery, semantic-layout claims, DB writes or provider calls; unknown usage fails closed.');
