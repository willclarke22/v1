#!/usr/bin/env node
// FREE no-provider/no-MiniLM local HTTP smoke test for the GoldLoop UI. No app writes.
import assert from 'node:assert/strict';
import {makeServer} from './s62bfix1r43-goldloop-web.mjs';
const port=0,token='1'.repeat(64),csrf='2'.repeat(64);
const {server}=makeServer({port,token,csrf,verifyBranch:false});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
const base=`http://127.0.0.1:${server.address().port}`;
try{
 let r=await fetch(base+'/api/status');assert.equal(r.status,401);
 r=await fetch(base+'/?access='+token,{redirect:'manual'});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/');
 const cookie=r.headers.get('set-cookie').split(';')[0];
 r=await fetch(base+'/',{headers:{cookie}});assert.equal(r.status,200);assert.match(await r.text(),/Learning should feel/);
 for(const [url,needle] of [['/client.js','showBeat'],['/style.css','beat-grid']]){r=await fetch(base+url,{headers:{cookie}});assert.equal(r.status,200);assert.ok((await r.text()).includes(needle));}
 r=await fetch(base+'/api/status',{headers:{cookie}});assert.equal(r.status,200);const status=await r.json();assert.equal(status.csrf,csrf);assert.equal(status.model_spend_requires_each_turn_approval,true);
 const session='webtest_'+Math.random().toString(36).slice(2,10);r=await fetch(base+'/api/session?id='+session,{headers:{cookie}});assert.equal(r.status,200);assert.equal((await r.json()).turn_count,0);
 r=await fetch(base+'/api/turn',{method:'POST',headers:{cookie,origin:base,'Content-Type':'application/json'},body:JSON.stringify({})});assert.equal(r.status,403);
 r=await fetch(base+'/api/turn',{method:'POST',headers:{cookie,origin:'http://evil.example','Content-Type':'application/json','X-MyWay-CSRF':csrf},body:'{}'});assert.equal(r.status,403);
 r=await fetch(base+'/api/turn',{method:'POST',headers:{cookie,origin:base,'Content-Type':'application/json','X-MyWay-CSRF':csrf},body:JSON.stringify({session_id:session,message:'hi',allow_spend:false,budget_usd:0.5})});assert.equal(r.status,400);
 console.log(JSON.stringify({ok:true,test:'goldloop local browser session/auth/UI contract',checks:11,paid_model_calls:0,embedding_calls:0,app_writes:0},null,2));
}finally{await new Promise(resolve=>server.close(resolve));}
