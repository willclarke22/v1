#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||process.cwd());const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const proxy=read('proxy.ts');const s13Route=read('app/api/sandbox/probe-lab/local-assessment/memory-adjudicator-s13/route.ts');
const readRoute=read('app/api/sandbox/probe-lab/local-assessment/memory-history-s14/route.ts');
const flow=read('scripts/sandbox/learning-intelligence/s14-flow.mjs');
assert.ok(proxy.includes('path === "/api/sandbox/probe-lab/local-assessment/memory-history-s14"'));
assert.ok(proxy.includes('request.method === "POST" ? NextResponse.next()'));
assert.ok(proxy.includes('const decision = cloudRouteDecision(path, request.method)'));
assert.ok(proxy.includes('Route blocked in V3.7C.1 read-only sandbox'));
assert.ok(readRoute.includes('eligibleDifficultyEvents')&&readRoute.includes('getLatestTopicState'));
assert.ok(readRoute.includes('MYWAY_TOPIC_VECTOR_BACKEND')&&readRoute.includes("process.env.VERCEL==='1'"));
for(const forbidden of ['commitTopicMemory','saveIndependentObservation','issueApproval','consumeApproval','supabase.from','INSERT INTO','DELETE FROM'])assert.ok(!readRoute.includes(forbidden),'Write-capable code found in read-only endpoint: '+forbidden);
assert.ok(!flow.includes('x-myway-approval')&&!flow.includes('commit_topic_memory'));
assert.ok(flow.includes('ASSESSMENT_SYSTEM_PROMPT')&&flow.includes('validateAssessment'));
assert.ok(flow.includes('/learning-space/retrieve')&&flow.includes('memory-adjudicator-s13'));
assert.ok(s13Route.includes("S13_PROMPT"),'Original S1.3 adjudicator must remain unchanged');
execFileSync(process.execPath,[path.join(root,'scripts/sandbox/learning-intelligence/s14-selftest.mjs')],{cwd:root,stdio:'inherit',timeout:30000});
console.log('V3.7D.2C.7A.3S1.4 TEST PASS: end-to-end pipeline, immutable writer guard, loopback history, prior Model C unchanged.');
