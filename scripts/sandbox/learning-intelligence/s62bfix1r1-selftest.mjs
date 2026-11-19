#!/usr/bin/env node
/** Research-only regressions; no provider calls, embeddings, database, or real media playback. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {run,parseArgs} from './s62bfix1r1-journey.mjs';
import {recoverReport} from './s62bfix1r1-report.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const base=path.join(root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r1');
const fresh=()=>`r1test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const inputs=()=>parseArgs(['--mode','offline','--episodes','3','--retrieval','lexical','--run-id',fresh()]);
const locations=[];
try{
 const opts=inputs();const dir=path.join(base,opts.runId);locations.push(dir);
 const seen=[];
 const first=await run(opts,{afterEpisode:(entry)=>{
  seen.push(entry.step);
  assert.equal(fs.existsSync(path.join(dir,'TRACE.json')),true);
  assert.equal(fs.existsSync(path.join(dir,'TURN_INSPECTOR.html')),false,'HTML should be generated only at end');
 }});
 assert.equal(first.trace.complete,true,JSON.stringify(first.trace.failure));
 assert.equal(first.trace.summary.episodes,3);
 assert.equal(first.trace.summary.completed_with_post_assessment,2);
 assert.equal(first.trace.summary.db_writes,0);
 assert.equal(first.trace.summary.model_calls,0);
 assert.deepEqual(seen,[1,2,3]);
 assert.equal(fs.existsSync(path.join(dir,'TURN_INSPECTOR.html')),true);
 assert.equal(fs.existsSync(path.join(dir,'SUMMARY.md')),true);
 assert.equal(first.trace.timeline[0].phases[0].result.status,'submitted');
 assert.equal(first.trace.timeline[0].phases[0].result.actions,2);
 assert.equal(first.trace.timeline[0].execution.design_id,first.trace.timeline[1].execution.design_id);
 assert.notEqual(first.trace.timeline[0].execution.activity_instance_id,first.trace.timeline[1].execution.activity_instance_id);
 const rendered=recoverReport({stage:'fix1r1',runId:opts.runId});
 assert.equal(rendered.complete,true);
 assert.equal(fs.existsSync(rendered.path),true);
 assert.throws(()=>recoverReport({stage:'fix1r1',runId:opts.runId}),/EEXIST/,'Rebuilder refuses overwrite');
 const forced=inputs();forced.episodes=1;const forcedDir=path.join(base,forced.runId);locations.push(forcedDir);
 const errorSim=await run(forced,{afterEpisode:()=>fs.mkdirSync(path.join(forcedDir,'TURN_INSPECTOR.html'))});
 assert.equal(errorSim.trace.complete,true,'Inspector failure must not change core learning outcome');
 assert.ok(errorSim.trace.report_warnings?.length>0);
 assert.equal(fs.existsSync(path.join(forcedDir,'TRACE.json')),true);
 assert.equal(fs.existsSync(path.join(forcedDir,'SUMMARY.md')),true);
 assert.equal(JSON.parse(fs.readFileSync(path.join(forcedDir,'TRACE.json'),'utf8')).report_warnings.length,1);
 fs.rmdirSync(path.join(forcedDir,'TURN_INSPECTOR.html'));
 assert.equal(recoverReport({stage:'fix1r1',runId:forced.runId}).complete,true);
 console.log('S62B-FIX1R1 SELFTEST PASS | phase checkpoints are TRACE-only, final HTML, safe HTML failure/recovery, distinct actions, no API/DB');
}finally{for(const dir of locations)fs.rmSync(dir,{recursive:true,force:true});}
