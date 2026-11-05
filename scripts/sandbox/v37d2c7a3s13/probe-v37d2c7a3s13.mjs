#!/usr/bin/env node
/** Read-only S1.3 endpoint probe: invalid schema, no paid model request. */
const url='http://127.0.0.1:3001/api/sandbox/probe-lab/local-assessment/memory-adjudicator-s13';
const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
try{
 const r=await fetch(url,{method:'POST',headers:{Origin:'http://127.0.0.1:3001','Content-Type':'application/json'},body:'{}',cache:'no-store',signal:controller.signal});
 const body=await r.text();
 if(r.status!==400||!body.includes('Invalid S1.3 two-stage input'))throw Error(`Unexpected HTTP ${r.status}: ${body.slice(0,150)}`);
 console.log('S1.3 LOCAL ENDPOINT PROBE PASS: HTTP 400 (invalid input rejected before model/API invocation).');
}catch(e){console.error('S1.3 PROBE FAILED: '+(e?.message??e));process.exitCode=1;}finally{clearTimeout(timer);}
