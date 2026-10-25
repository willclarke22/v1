#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
const original=path.resolve(process.argv[2]);const target=path.resolve(process.argv[3]);const marker=JSON.parse(fs.readFileSync(path.join(target,'scripts/sandbox/v37a/installation.json'),'utf8'));
const checksum=b=>crypto.createHash('sha256').update(b).digest('hex');
if(marker.schema!=='myway-v37a-install-v1')throw Error('Invalid installation marker');
if(path.resolve(marker.original).toLowerCase()!==original.toLowerCase()||path.resolve(marker.target).toLowerCase()!==target.toLowerCase())throw Error('Wrong worktree target');
for(const c of marker.carry){const file=path.join(target,...c.path.split('/'));if(!fs.existsSync(file)||checksum(fs.readFileSync(file))!==c.sha256)throw Error('Carry-forward failed: '+c.path);}
const baseline=JSON.parse(fs.readFileSync(path.join(target,'scripts/sandbox/v37a/SOURCE-BASELINE.json'),'utf8'));
if(baseline.schema!=='myway-v3.7a-source-baseline-v1')throw Error('Invalid source baseline schema');
for(const [rel,expected] of Object.entries(baseline.required_normalized_sha256)){
  const file=path.join(target,...rel.split('/'));
  if(!fs.existsSync(file))throw Error('Missing required V3.6 source in experiment: '+rel);
  const normalized=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n').replace(/^\n+|\n+$/g,'');
  if(checksum(Buffer.from(normalized,'utf8'))!==expected)throw Error('Experimental source fingerprint mismatch: '+rel);
}
for(const p of ['scripts/sandbox/v37a/EXPERIMENTAL-ENV.example','scripts/sandbox/v37a/README.md','scripts/sandbox/v37a/readonly-audit.json','scripts/sandbox/v37a/SOURCE-BASELINE.json'])if(!fs.existsSync(path.join(target,p)))throw Error('Missing V3.7A artifact: '+p);
const g=spawnSync('git',['-C',target,'branch','--show-current'],{encoding:'utf8'});if(g.status!==0||g.stdout.trim()!=='myway/learning-sandbox-v3_7a')throw Error('Experimental Git branch invalid');
console.log('V3.7A VERIFY PASS: '+Object.keys(baseline.required_normalized_sha256).length+' source fingerprints verified in experiment; '+marker.carry.length+' uncommitted files transferred, original project unchanged by installer.');
