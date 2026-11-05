#!/usr/bin/env node
/** Exact localhost invalid-payload probe: cannot invoke any model or write learner memory. */
const url='http://127.0.0.1:3001/api/sandbox/probe-lab/local-assessment/memory-adjudicator';
const response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:3001'},body:'{}'});
const body=(await response.text()).slice(0,240);
if(response.status!==400){console.error(`S1.2.1 PROBE FAILED: HTTP ${response.status}; ${body}`);process.exitCode=1;}
else console.log('S1.2.1 LOCAL ENDPOINT PROBE PASS: HTTP 400 (invalid JSON schema rejected; no model request).');
