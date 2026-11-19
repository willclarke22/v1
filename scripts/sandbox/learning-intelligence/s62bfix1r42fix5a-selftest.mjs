#!/usr/bin/env node
/** Research-only Windows-safe self-test using pinned FIX4 audit and final state. */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));const root=path.resolve(dir,'../../..');
const evalJs=path.join(dir,'s62bfix1r42fix5a-evaluate.mjs');
function run(...args){return execFileSync(process.execPath,[evalJs,'--root',root,...args],{cwd:root,encoding:'utf8',timeout:120000});}
const a=run('--mode','plan','--lab','assessment','--case-ids','R14_bonly,R15_bonly','--run-id','fix5a_selftest_plan');
if(!a.includes('"planned_model_calls":6')||!a.includes('"provider_calls_if_plan_or_prepare":0'))throw Error('Frozen A model matrix incorrect');
const b=run('--mode','plan','--lab','handoff','--case-ids','R15_bonly,R17_bonly','--run-id','fix5a_selftest_handoff');
if(!b.includes('"planned_model_calls":6'))throw Error('B handoff comparison incorrect');
const temp='fix5a_selftest_'+crypto.randomBytes(5).toString('hex');
const output=path.join(root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix5a','handoffs',temp);
try{
 const p=run('--mode','prepare','--lab','handoff','--case-ids','R15_bonly','--run-id',temp);
 if(!p.includes('FIX5A PREPARE PASS'))throw Error('Handoff prepare missing');
 const c=JSON.parse(fs.readFileSync(path.join(output,'cases','R15_bonly.json'),'utf8'));
 if(c.variants.length!==3||c.variants[0].sha===c.variants[1].sha||c.variants[1].sha===c.variants[2].sha)throw Error('Handoff conditions not distinct');
}finally{if(fs.existsSync(output))fs.rmSync(output,{recursive:true,force:true});}
const et='fix5a_embtest_'+crypto.randomBytes(5).toString('hex');
const embOut=path.join(root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix5a','assessments',et);
try{
 const t=run('--mode','embedding-test','--run-id',et);
 if(!t.includes('"model_revision_mismatch_refused":false'))throw Error('Version-gap diagnostic missing');
}finally{if(fs.existsSync(embOut))fs.rmSync(embOut,{recursive:true,force:true});}

// FIX5A regression: alternative evidence citation IDs must be unique and match delivered observations.
const sample='fix5a_citations_'+crypto.randomBytes(5).toString('hex');
const sampleDir=path.join(root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix5a','assessments',sample);
try {
 const p=run('--mode','prepare','--lab','assessment','--case-ids','R14_bonly,R15_bonly,R15_bplusx,R20_bplusx','--run-id',sample);
 if(!p.includes('FIX5A PREPARE PASS'))throw Error('FIX5A assessment preparation failed');
 for(const id of ['R14_bonly','R15_bonly','R15_bplusx','R20_bplusx']) {
  const packet=JSON.parse(fs.readFileSync(path.join(sampleDir,'cases',id+'.json'),'utf8'));
  for(const v of packet.variants){
   if(v.name!=='rebalanced')continue;
   const x=v.input, cited=x.allowed_evidence_ids??[], observed=x.observations.map(o=>o.id);
   if(new Set(cited).size!==cited.length)throw Error('Duplicate citation ID: '+id);
   if(cited.length!==new Set([x.current.id,...observed]).size)throw Error('Citation and observed IDs differ: '+id);
   if(![...new Set([x.current.id,...observed])].every(e=>cited.includes(e)))throw Error('Citation missing: '+id);
   if(x.current.id!==packet.source_evidence_id)throw Error('Current observation changed: '+id);
   if(v.name==='original' && v.sha!==packet.original_input_sha)throw Error('Source input hash changed');
  }
 }
} finally {if(fs.existsSync(sampleDir))fs.rmSync(sampleDir,{recursive:true,force:true});}
console.log('S62B-FIX1R42FIX5A SELFTEST PASS | frozen replay, B handoff, embedding lifecycle; no providers/DB');
