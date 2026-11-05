#!/usr/bin/env node
/** Guarded installation test. No paid calls, no SQL, no MyWay memory writes. */
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(process.argv[2]||process.cwd());
function run(rel,args=[]){execFileSync(process.execPath,[path.join(root,...rel.split('/')),...args],{cwd:root,stdio:'inherit',timeout:150000});}
run('scripts/sandbox/learning-intelligence/selftest.mjs');
run('scripts/sandbox/learning-intelligence/s11-selftest.mjs');
run('scripts/sandbox/learning-intelligence/run.mjs',['--mode','fixture','--limit','6']);
console.log('V3.7D.2C.7A.3S1.1 TEST PASS: S1 baseline preserved, 53 challenge cases, deliberate missing-score hold, cost and preexisting model runner gates.');
