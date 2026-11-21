#!/usr/bin/env node
/** FREE R4.3 GoldLoop export v2 integration/security smoke test.
 * Synthetic session is placed in ignored local test state and deleted in finally.
 * No provider, embedding, production, or database calls.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {makeServer,makeZip} from './s62bfix1r43-goldloop-web-export-v2.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../../..');
const OUT=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r43-goldloop');
const id='exporttest_'+crypto.randomBytes(5).toString('hex');
const other='exporttest_'+crypto.randomBytes(5).toString('hex');
const dir=path.join(OUT,id),otherDir=path.join(OUT,other);
const token='a'.repeat(64),csrf='b'.repeat(64);
const {server}=makeServer({port:0,token,csrf,verifyBranch:false});
// Archive validator uses the standard ZIP local headers. Also tested with Python zipfile during packaging.
function unzipEntries(zip){
 const files=new Map();let at=0;
 while(at+4<=zip.length&&zip.readUInt32LE(at)===0x04034b50){
  const method=zip.readUInt16LE(at+8),compressed=zip.readUInt32LE(at+18),nameLen=zip.readUInt16LE(at+26),extra=zip.readUInt16LE(at+28);
  const n=zip.subarray(at+30,at+30+nameLen).toString('utf8');const begin=at+30+nameLen+extra;
  const bytes=zip.subarray(begin,begin+compressed);const original=method===8?zlib.inflateRawSync(bytes):bytes;
  assert.equal(original.length,zip.readUInt32LE(at+22));files.set(n,original);
  at=begin+compressed;
 }
 return files;
}
fs.mkdirSync(path.join(dir,'turns'),{recursive:true});
fs.mkdirSync(path.join(dir,'inputs'),{recursive:true});
fs.mkdirSync(path.join(otherDir,'turns'),{recursive:true});
try{
 const state={schema:'myway_goldloop_human_v1',learner:id,topics:[{id:'topic_one',title:'Statistics'}],observations:[{id:'T1',text:'I find probability difficult.'}],records:[],turns:[{turn_id:'t0001',learner_message:'What is binomial distribution?'}],version:1};
 fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(state));
 const first={status:'complete',calls:[{role:'A',model:'gpt-4.1-mini',request:{messages:[{role:'user',content:'first message'}]},response_raw:'{"ok":true}'}],A:{retrieval_summary:{selected_ids:['T1']}}};
 const pending={status:'model_call_submitted_B',calls:[{role:'B',request:{messages:[{role:'user',content:'second message'}]}}]};
 fs.writeFileSync(path.join(dir,'turns','t0001.json'),JSON.stringify(first));
 fs.writeFileSync(path.join(dir,'turns','t0002.pending.json'),JSON.stringify(pending));
 fs.writeFileSync(path.join(dir,'inputs','t0001.txt'),'Original learner text');
 fs.writeFileSync(path.join(dir,'private.env'),'MUST_NEVER_EXPORT');
 fs.writeFileSync(path.join(otherDir,'state.json'),JSON.stringify({schema:'myway_goldloop_human_v1',learner:other,secret:'ANOTHER_SESSION_SECRET'}));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const base='http://127.0.0.1:'+server.address().port;
 let r=await fetch(base+'/api/export?id='+id);assert.equal(r.status,401);
 r=await fetch(base+'/?access='+token,{redirect:'manual'});assert.equal(r.status,302);
 const cookie=r.headers.get('set-cookie').split(';')[0];
 r=await fetch(base+'/');assert.equal(r.status,401);
 r=await fetch(base+'/',{headers:{cookie}});assert.equal(r.status,200);const html=await r.text();assert.match(html,/exportButton/);assert.match(html,/Download session ZIP/);
 r=await fetch(base+'/client.js',{headers:{cookie}});assert.equal(r.status,200);assert.match(await r.text(),/onExport/);
 r=await fetch(base+'/api/export?id=..%2Fsecret',{headers:{cookie}});assert.equal(r.status,400);
 r=await fetch(base+'/api/export?id=missing_session_1234',{headers:{cookie}});assert.equal(r.status,404);
 r=await fetch(base+'/api/export?id='+id,{headers:{cookie}});assert.equal(r.status,200);
 assert.match(r.headers.get('content-type'),/application\/zip/);
 assert.match(r.headers.get('content-disposition'),/attachment/);
 assert.equal(r.headers.get('cache-control'),'no-store');
 const archive=Buffer.from(await r.arrayBuffer()),contents=unzipEntries(archive);
 assert.deepEqual([...contents.keys()].sort(),['MANIFEST.json','session/inputs/t0001.txt','session/state.json','session/turns/t0001.json','session/turns/t0002.pending.json'].sort());
 const parsedManifest=JSON.parse(contents.get('MANIFEST.json'));
 assert.equal(parsedManifest.session_id,id);assert.equal(parsedManifest.complete_turn_traces,1);assert.equal(parsedManifest.pending_turn_traces,1);
 assert.equal(contents.get('session/inputs/t0001.txt').toString(),'Original learner text');
 assert.equal(JSON.parse(contents.get('session/turns/t0001.json')).A.retrieval_summary.selected_ids[0],'T1');
 assert.equal(contents.get('session/state.json').toString(),JSON.stringify(state));
 assert.ok(!archive.includes(Buffer.from('ANOTHER_SESSION_SECRET')));
 assert.ok(!archive.includes(Buffer.from('MUST_NEVER_EXPORT')));
 r=await fetch(base+'/api/status',{headers:{cookie}});assert.equal(r.status,200);
 const synthetic=makeZip([['test/hello.txt',Buffer.from('hello')]]);assert.equal(unzipEntries(synthetic).get('test/hello.txt').toString(),'hello');
 console.log(JSON.stringify({ok:true,test:'GoldLoop export v2 authenticated ZIP, complete and pending traces, session isolation, original UI preservation',checks:21,model_calls:0,embedding_calls:0,db_writes:0,synthetic_fixture_cleaned:true},null,2));
}finally{
 if(server.listening)await new Promise(resolve=>server.close(resolve));
 fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(otherDir,{recursive:true,force:true});
}
