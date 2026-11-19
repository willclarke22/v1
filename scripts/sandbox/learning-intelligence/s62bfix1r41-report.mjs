#!/usr/bin/env node
/** Render a new human-readable HTML view from an existing research TRACE.json.
 * Does not run models, change memory, overwrite existing views, or modify the trace.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspect} from './s62bfix1-inspector.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const safeName=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(v);
export function recoverReport({runId,stage='fix1r41'}={}){
 if(!safeName(runId)||stage!=='fix1r41')throw Error('Invalid runId or stage; expected --stage fix1r41');
 const basedir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r41',runId);
 const traceFile=path.join(basedir,'TRACE.json');
 if(!fs.existsSync(traceFile)||!fs.lstatSync(traceFile).isFile()||fs.lstatSync(traceFile).isSymbolicLink())throw Error('Missing safe TRACE.json: '+traceFile);
 const trace=JSON.parse(fs.readFileSync(traceFile,'utf8').replace(/^\uFEFF/,''));
 if(!Array.isArray(trace.timeline)||typeof trace.complete!=='boolean')throw Error('Unrecognized research TRACE.json');
 const dest=path.join(basedir,'TURN_INSPECTOR_RECOVERED.html');
 fs.writeFileSync(dest,inspect(trace)+'\n',{flag:'wx',mode:0o600});
 return {path:dest,episodes:trace.timeline.length,complete:trace.complete,failed_at:trace.failure?.phase??null};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const opts={};for(let i=2;i<process.argv.length;i+=2){if(!['--run-id','--stage'].includes(process.argv[i])||!process.argv[i+1])throw Error('Expected --run-id ID --stage fix1r41');opts[process.argv[i]==='--run-id'?'runId':'stage']=process.argv[i+1];}
  const r=recoverReport(opts);
  console.log('S62B-FIX1R4.1 RECOVERED REPORT '+r.path);
  console.log('S62B-FIX1R4.1 RECOVERY STATUS '+JSON.stringify({episodes:r.episodes,complete:r.complete,failed_at:r.failed_at}));
  if(!r.complete)console.warn('PARTIAL RUN: reconstructed HTML is not evidence of completed episodes or model validation');
 }catch(e){console.error('S62B-FIX1R4.1 RECOVERY FAILED '+String(e?.stack??e));process.exitCode=1;}
}
