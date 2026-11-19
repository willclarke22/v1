#!/usr/bin/env node
/** FIX4 provider-free selftest: embedding lifecycle plus optional full report chain plan. */
import {spawnSync} from 'node:child_process';import path from 'node:path';import fs from 'node:fs';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),audit=path.join(here,'s62bfix1r42fix4-audit.mjs');
function run(args){const res=spawnSync(process.execPath,[audit,...args],{cwd:root,encoding:'utf8',timeout:120000});if(res.status!==0)throw Error('FIX4 audit selftest failed: '+(res.stderr??'')+' '+(res.stdout??''));return res.stdout;}
const lifecycle=run(['--mode','embedding-test','--root',root,'--run-id','fix4_selftest_emb']);
if(!lifecycle.includes('"result":"PASS"')||!lifecycle.includes('"provider_calls":0'))throw Error('Embedding lifecycle test result invalid');
const rdir=path.join(root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix2','paireds');
const pilot=path.join(rdir,'fix2_paid_pilot_1','TRACE.json');
if(fs.existsSync(pilot)){
 const plan=run(['--mode','plan','--root',root,'--run-id','fix4_selftest_plan']);
 if(!plan.includes('"paired_rounds":20')||!plan.includes('"learning_visits":40')||!plan.includes('"provider_calls":0'))throw Error('Full report chain failed');
 console.log('S62B-FIX1R42FIX4 SOURCE CHAIN PASS | 20 paired rounds, 40 visits');
}else console.log('S62B-FIX1R42FIX4 NOTE | historical reports not found; no report lineage tested');
console.log('S62B-FIX1R42FIX4 SELFTEST PASS | free, no provider, no DB writes');
