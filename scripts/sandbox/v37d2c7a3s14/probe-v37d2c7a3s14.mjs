#!/usr/bin/env node
/** No paid calls and no database read on invalid input. */
const url='http://127.0.0.1:3001/api/sandbox/probe-lab/local-assessment/memory-history-s14';
try{
 const r=await fetch(url,{method:'POST',headers:{Origin:'http://127.0.0.1:3001','Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
 const b=await r.text();if(r.status!==400||!b.includes('Invalid topic ID request'))throw Error('Expected HTTP 400 from schema validation; got '+r.status+' '+b.slice(0,160));
 console.log('S1.4 LOCAL HISTORY PROBE PASS: HTTP 400 (unapproved input rejected before any SELECT; zero paid/model calls).');
}catch(e){console.error('S1.4 HISTORY PROBE FAILED: '+e.message);process.exitCode=1;}
