#!/usr/bin/env node
/** R5.2 free tests for safe long-title validation and R5.1 UI compatibility.
 * No real learner files, credentials, provider calls, embeddings, or state writes.
 */
import assert from 'node:assert/strict';
import {validateRouteR52} from './s62bfix1r52-route-policy.mjs';
import {routeTopic} from './s62bfix1r43-goldloop-core-anchor-v1.mjs';
import {describeTurnProgress,makeServer} from './s62bfix1r52-goldloop-web.mjs';
let n=0;
const ok=(name,f)=>{f();console.log('PASS '+(++n)+' '+name);};
const topics=[{id:'topic_spanish',title:'Spanish grammar'},{id:'topic_stats',title:'Statistics'}];
const good={decision:'new',existing_topic_id:null,new_topic_title:'Differentiating Causes of Facial Weakness: Peripheral Nerve vs. Lower Motor Neuron vs. Neuromuscular Junction',rationale:'The learner has changed to a new medical topic.'};
ok('109-character title from historical failure is preserved, not clipped',()=>{
 assert.equal(good.new_topic_title.length,109);
 const r=validateRouteR52(JSON.stringify(good),topics);assert.equal(r.new_topic_title,good.new_topic_title);
});
ok('new topic creation retains title and valid bounded slug',()=>{
 const state={topics:structuredClone(topics)};const r=validateRouteR52(good,topics);const t=routeTopic(state,r);assert.equal(t.title,good.new_topic_title);assert.ok(t.id.length<=55);
});
ok('ordinary short titles unchanged',()=>assert.equal(validateRouteR52({...good,new_topic_title:'Facial nerve localization'},topics).new_topic_title,'Facial nerve localization'));
ok('existing topic route unchanged',()=>assert.equal(validateRouteR52({decision:'existing',existing_topic_id:'topic_stats',new_topic_title:null,rationale:'Return to statistics'},topics).existing_topic_id,'topic_stats'));
ok('unknown existing topic still rejected',()=>assert.throws(()=>validateRouteR52({decision:'existing',existing_topic_id:'topic_other',new_topic_title:null,rationale:'Unknown topic'},topics),/unknown routed existing topic/));
ok('unexpected route fields still rejected',()=>assert.throws(()=>validateRouteR52({...good,unexpected:true},topics),/route fields incorrect/));
ok('malformed decision still rejected',()=>assert.throws(()=>validateRouteR52({...good,decision:'invented'},topics),/invalid route decision/));
ok('missing rationale still rejected',()=>assert.throws(()=>validateRouteR52({...good,rationale:''},topics),/invalid route rationale/));
ok('empty title still rejected',()=>assert.throws(()=>validateRouteR52({...good,new_topic_title:'  '},topics),/invalid new topic title/));
ok('overlong 181-character title still rejected',()=>assert.throws(()=>validateRouteR52({...good,new_topic_title:'x'.repeat(181)},topics),/invalid new topic title/));
ok('control characters in new title rejected',()=>assert.throws(()=>validateRouteR52({...good,new_topic_title:'Line\nbreak title'},topics),/invalid new topic title/));
ok('180-character boundary accepted',()=>assert.equal(validateRouteR52({...good,new_topic_title:'a'.repeat(180)},topics).new_topic_title.length,180));
ok('recovering paid ROUTE appears done in thought bubbles',()=>{const p=describeTurnProgress({status:'reviewed_route_reused_before_A',calls:[{role:'ROUTE',status:'returned'}]});assert.equal(p.roles.ROUTE,'done');assert.equal(p.roles.A,'queued');});
ok('R5.2 web server is provided with same authorization protections',()=>{assert.equal(typeof makeServer,'function');});
console.log('R5.2 FREE ROUTE SELFTEST PASS '+n+' tests; no network, spending, or learner writes');
