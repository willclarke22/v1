#!/usr/bin/env node
/** Free R5.1 smoke test, zero provider calls and no writes to human sessions. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeServer,describeTurnProgress} from './s62bfix1r51-goldloop-web.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const roles=['ROUTE','A','B','X'];
function check(tr,phase,role,state){const p=describeTurnProgress(tr);assert.equal(p.phase,phase);assert.equal(p.roles[role],state);assert.equal(Object.keys(p).sort().join(','),'phase,roles,stage_label');}
check(null,'preparing','ROUTE','queued');
check({status:'model_call_submitted_ROUTE',calls:[{role:'ROUTE',status:'submitted'}]},'ROUTE','ROUTE','running');
check({status:'model_call_submitted_ROUTE',calls:[{role:'ROUTE',status:'returned'}]},'retrieving','ROUTE','done');
check({status:'model_call_submitted_A',calls:[{role:'ROUTE',status:'returned'},{role:'A',status:'submitted'}]},'A','A','running');
check({status:'model_call_submitted_A',calls:[{role:'ROUTE',status:'returned'},{role:'A',status:'returned'},{role:'A',status:'submitted'}]},'A','A','running');
check({status:'model_call_submitted_B',calls:[{role:'ROUTE',status:'returned'},{role:'A',status:'returned'},{role:'B',status:'submitted'}]},'B','B','running');
check({status:'model_call_submitted_X',calls:[{role:'ROUTE',status:'returned'},{role:'A',status:'returned'},{role:'B',status:'returned'},{role:'X',status:'submitted'}]},'X','X','running');
check({status:'complete',calls:roles.map(role=>({role,status:'returned'}))},'finalizing','X','done');
check({status:'manual_review_required_unsafe_to_retry',calls:[{role:'ROUTE',status:'returned'},{role:'A',status:'transport_or_provider_error_unknown_usage'}]},'review','A','running');
const html=fs.readFileSync(path.join(here,'s62bfix1r51-goldloop.html'),'utf8');
const css=fs.readFileSync(path.join(here,'s62bfix1r51-goldloop.css'),'utf8');
const js=fs.readFileSync(path.join(here,'s62bfix1r51-goldloop-client.js'),'utf8');
assert.match(html,/\/client\.js/);assert.match(css,/\.thought-panel/);assert.match(js,/startThoughtBubbles\(msg\)/);assert.match(js,/stopThoughtBubbles\(\)/);assert.match(js,/api\/turn-progress/);
const token='a'.repeat(64);
const {server}=makeServer({port:0,token,verifyBranch:false});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
try{
 const port=server.address().port,base=`http://127.0.0.1:${port}`;
 const auth=await fetch(base+'/?access='+token,{redirect:'manual'});assert.equal(auth.status,302);
 const cookie=auth.headers.get('set-cookie').split(';')[0];assert.match(cookie,/myway_goldloop_lab=/);
 const noCookie=await fetch(base+'/api/turn-progress?id=goldpilot01');assert.equal(noCookie.status,401);
 const req={headers:{cookie}};
 const progress=await fetch(base+'/api/turn-progress?id=goldpilot01',req);assert.equal(progress.status,200);
 const data=await progress.json();assert.equal(data.active,false);assert.equal(data.no_model_content,true);
 assert.deepEqual(data.roles,{ROUTE:'queued',A:'queued',B:'queued',X:'queued'});
 const invalid=await fetch(base+'/api/turn-progress?id=../hidden',req);assert.equal(invalid.status,400);
 for(const [asset,type] of [['/','text/html'],['/style.css','text/css'],['/client.js','application/javascript']]){
  const resp=await fetch(base+asset,req);assert.equal(resp.status,200);assert.match(resp.headers.get('content-type'),new RegExp(type));
 }
}finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
console.log('R5.1 FREE SELFTEST PASS: 9 stage tests, no-chain-of-thought response, auth, assets, no provider calls');
