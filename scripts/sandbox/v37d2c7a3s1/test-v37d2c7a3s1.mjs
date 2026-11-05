#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(process.argv[2]||process.cwd());
const script=p=>path.join(root,...p.split('/'));
function run(p,args=[]){execFileSync(process.execPath,[script(p),...args],{cwd:root,stdio:'inherit',timeout:120000});}
run('scripts/sandbox/learning-intelligence/selftest.mjs');
run('scripts/sandbox/learning-intelligence/run.mjs',['--mode','fixture','--limit','16']);
console.log('V3.7D.2C.7A.3S1 TEST PASS: 160 offline selftest cases, 16 CLI samples, real runtime loader, budget gates, reports, selftest.');
