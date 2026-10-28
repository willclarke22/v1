#!/usr/bin/env node
/** No imports from the running app, no HTTP calls. Lightweight static contract tests. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=path.resolve(process.argv[2]||process.cwd());
const read=p=>fs.readFileSync(path.join(root,...p.split('/')),'utf8');
const yes=(v,msg)=>{if(!v)throw Error('V3.7C.3 CONTRACT TEST FAILED: '+msg)};
const a=read('sandbox/probe-lab/learning-space/assessment-core.ts');
const t=read('sandbox/probe-lab/local-assessment/learning-plan.ts');
const p=read('sandbox/probe-lab/learning-space/learning-turn.client.ts');
const ui=read('sandbox/probe-lab/learning-space/learning-space-preview.tsx');
const v=read('sandbox/probe-lab/local-assessment/visual-handoff.ts');
const parse=read('sandbox/probe-lab/local-assessment/parse-model-json.ts');
const api=read('app/api/sandbox/probe-lab/local-assessment/glm/route.ts');
const oa=read('app/api/sandbox/probe-lab/local-assessment/openai/route.ts');
const ot=read('app/api/sandbox/probe-lab/local-assessment/teaching/route.ts');
const tsVerify=JSON.parse(read('scripts/sandbox/v37c3/tsconfig.verify.json'));
yes(tsVerify.extends==='../../../tsconfig.json' &&
    tsVerify.exclude.includes('../../../scripts/**/backups/**/*') &&
    !tsVerify.exclude.some(p=>p.includes('app/')||p.includes('learning-space/')),
    'TypeScript verification inherits the real config and excludes archival backups only');
yes(a.includes('additionalProperties: false')&&a.includes('parseModelJson(raw)'),'strict assessment schema and fence decoding');
yes(parse.includes('^```')&&parse.includes('JSON.parse'),'whole fenced JSON only');
yes(t.includes('learner_statement')&&t.includes('clarification_answer')&&t.includes('prior_clarifying_question'),'full learner context');
yes(p.includes('context?.originalMessage??learnerMessage')&&p.includes('assessmentChoice')&&p.includes('teachingChoice'),'client passes selected models and original context');
yes(ui.includes('MODEL_CHOICES.map')&&ui.includes('setTeachingChoice')&&ui.includes('setAssessmentChoice'),'UI model menus');
yes(v.includes('"edge" | "openai" | "glm"')&&v.includes('myway_visual_handoff_v1'),'provider alignment, frozen schema');
yes(api.includes('selectedModel')&&api.includes('ZAI_MODELS')&&api.includes('NVIDIA_MODELS')&&!api.includes('upsertTopicState'),'server GLM allowlists, no writes');
yes(oa.includes('ALLOWED_MODELS')&&ot.includes('ALLOWED_MODELS'),'OpenAI model allowlists');
yes(p.includes('METRICS_KEY')&&p.includes('saveMetricRow')&&p.includes('retrieval.server'),'Workbench timings retained');
console.log('V3.7C.3 CONTRACT TEST PASS: model selection, context, fenced JSON, handoff, timings, read-only routes.');
