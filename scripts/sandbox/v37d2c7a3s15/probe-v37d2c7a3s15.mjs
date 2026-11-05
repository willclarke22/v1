#!/usr/bin/env node
const url='http://127.0.0.1:3001/api/sandbox/probe-lab/local-assessment/myway-shadow-s15';
try{const r=await fetch(url,{method:'POST',headers:{Origin:'http://127.0.0.1:3001','Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(12000)});
 const raw=await r.json().catch(()=>({}));if(r.status!==400||typeof raw.error!=='string'||!raw.error.includes('Invalid S1.5'))throw Error('Expected local input rejection 400, got '+r.status+' '+JSON.stringify(raw));
 console.log('S1.5 LOCAL SHADOW PROBE PASS: HTTP 400 (invalid schema refused before provider/model call).');
}catch(e){console.error('S1.5 LOCAL SHADOW PROBE FAILED: '+e.message);process.exitCode=1;}
