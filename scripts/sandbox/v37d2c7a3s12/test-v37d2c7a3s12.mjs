#!/usr/bin/env node
/** S1.2 post-copy regression tests; no network/model, database or Git mutation. */
import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());
const run=p=>execFileSync(process.execPath,[path.join(root,...p.split('/'))],{cwd:root,stdio:'inherit',timeout:130000});
run('scripts/sandbox/learning-intelligence/selftest.mjs');
run('scripts/sandbox/learning-intelligence/s11-selftest.mjs');
run('scripts/sandbox/learning-intelligence/s12-selftest.mjs');
console.log('V3.7D.2C.7A.3S1.2 TEST PASS: S1/S1.1 offline regression, balanced S1.2 benchmark, strict Model C contract, budget gates, mock transport.');
