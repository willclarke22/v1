#!/usr/bin/env node
/** S58-R1-FIX1: evidence visibility and paired non-leading diagnostic probes; never modifies old runners. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseArgs} from './s16b58-journey.mjs';
import {loadFixture} from './s16b58-fixture.mjs';
import {runConsolidated} from './s16b58r1-journey.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const deep=x=>JSON.parse(JSON.stringify(x));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const START='Does sunlight get built into glucose?';
// Two questions are shared across all A/B history/no-root conditions, not reused old leading answers.
const PROBE_TEXT={
 'BIO01-P1':'A plant produces glucose while receiving light, air, and water. Where do the carbon atoms in its glucose come from? What does light contribute? Explain how you know.',
 'CHEM02-P1':'Vinegar and baking soda react inside a closed, sealed container sitting on a scale. Bubbles form. Predict what happens to the total mass reading and explain whether any atoms need to be counted beyond the liquid.'
};
const PROBE_IDS=Object.keys(PROBE_TEXT);
export function makePairedFixture(id,trial){
 if(!['LEARNER-A','LEARNER-B'].includes(id)||!({T01:'LEARNER-A',T02:'LEARNER-B',T05:'LEARNER-A',T06:'LEARNER-B'}[trial]===id))throw Error('FIX1 supports the four paired A/B trials only; no automatic substitution for other trials.');
 const f=deep(loadFixture(id,trial));
 const sourceIds=new Set(f.probes.map(p=>p.probe_id));
 for(const [probeId,prompt] of Object.entries(PROBE_TEXT)){
  if(!sourceIds.has(probeId))throw Error('Curated probe ID missing: '+probeId);
  const probe=f.probes.find(p=>p.probe_id===probeId);
  if(!probe.supports_diagnostic_inference||!['free_text','short_response'].includes(probe.response_mode))throw Error('Curated probe contract drift: '+probeId);
  probe.prompt=prompt;
 }
 f.trial.first_learner_message=START;
 // S58 public probe suggestions will now use the same initial sequence in all four trials.
 f.trial.suggested_probe_sequence=['BIO01-P1','CHEM02-P1','CHEM02-P1'];
 f.trial.later_unprompted_transfer_probe='CHEM02-P1';
 f.trial.paired_probe_design='FIX1_AB_HISTORY_CONDITION_MATCHED';
 return f;
}
export function evidenceReview(t){
 return t.probe_events.filter(e=>e.offer_status==='answered'||e.offer_status==='declined_not_failure').map(e=>{
  const answered=e.offer_status==='answered', response=e.response?.response??'';
  const isSelection=e.check?.method==='exact_public_scene_target_researcher_key';
  const check=e.check??{status:'not_scored',scored:false};
  const correctness=isSelection?(check.correct===true?'correct_selection':check.correct===false?'incorrect_selection':'unknown'):'unknown_not_semantically_graded';
  const modelProposal=e.revision_raw&&e.revision_guard?.accepted?{
   interpretation:e.revision_raw.interpretation,alternative_explanation:e.revision_raw.alternative_explanation,
   root_id:e.revision_raw.root_id,root_stance:e.revision_raw.root_stance,
   relationship_id:e.revision_raw.relationship_id,relationship_stance:e.revision_raw.relationship_stance,
   status:'provisional_model_proposal_not_factual_root_truth'
  }:null;
  return {probe_id:e.probe_id,phase:e.phase,observed:answered,source:'synthetic_probe_response',
   verbatim_response:response,selected_object_id:e.response?.selected_object_id??null,
   scoring_screen:{status:check.status,method:check.method??null,screen_passed:check.scored===true,correctness},
   informative_even_if_unscored:answered,
   interpretation_status:!answered?'declined_not_failure':modelProposal&&(modelProposal.root_stance!=='insufficient'||modelProposal.relationship_stance!=='insufficient')?'provisional_guarded_interpretation':modelProposal?'commentary_only_no_root_stance':'raw_evidence_without_accepted_interpretation',
   model_provisional_interpretation:modelProposal,
   rejected_revision_reason:e.revision_guard&&!e.revision_guard.accepted?e.revision_guard.reason:null};
 });
}
export async function runFixed(options,deps={}){
 const paired=makePairedFixture(options.learnerId,options.trialId);
 const t=await runConsolidated(options,{...deps,fixture:paired});
 const observations=evidenceReview(t);
 const checks=observations.filter(x=>x.observed);
 const textScreens=checks.filter(x=>x.scoring_screen.method==='conservative_lexical_feature_screen');
 const withheld=checks.filter(x=>x.scoring_screen.screen_passed!==true);
 t.schema='myway_s16b58r1fix1_research_v1';
 t.paired_comparison={design:'matching_start_and_probes_not_full_causal_control',
  group:options.learnerId,first_learner_message:START,
  administered_probes:PROBE_IDS,probe_prompts:deep(PROBE_TEXT),
  public_probe_fingerprint:hash(PROBE_TEXT),
  trial_condition:t.trial_condition.condition,
  caution:'Other turns are still learner-specific; no causal effect or diagnostic correctness can be inferred from these scripted comparisons.'};
 t.probe_observations=observations;
 t.summary={...t.summary,probe_responses_observed:checks.length,
  scored_selective_tasks:checks.filter(x=>x.scoring_screen.correctness.startsWith('correct_')||x.scoring_screen.correctness.startsWith('incorrect_')).length,
  text_feature_screen_passes:textScreens.filter(x=>x.scoring_screen.screen_passed).length,
  unscored_responses_preserved:withheld.length,
  observation_evidence_available:checks.length,
  guarded_model_comments:checks.filter(x=>x.model_provisional_interpretation).length,
  provisional_noninsufficient_stances:checks.filter(x=>x.model_provisional_interpretation&&(x.model_provisional_interpretation.root_stance!=='insufficient'||x.model_provisional_interpretation.relationship_stance!=='insufficient')).length,
  // Legacy counter remains for comparison, explicitly NOT total evidence.
  independent_probe_evidence_legacy_screen_count:t.summary.independent_probe_evidence};
 t.limitations.push('Every accepted response is retained as an observation even if lexical screening abstains. A positive text screen is not evidence of scientific correctness.');
 t.limitations.push('Only opening message and post-journey probe pair are matched; subsequent learner conversations can diverge and reveal different clues.');
 t.limitations.push('Pre-existing S58-R1 guard still blocks stance promotion for unscored responses; this patch preserves their evidence but does not turn it into a root verdict.');
 t.limitations.push('The pre-existing S58-R1 tutor bridge is used without edits; the unscored-response interpretation remains provisional.');
 return t;
}
export function saveFixed(t){
 const dir=path.join(ROOT,'.myway-patch-backups','learning-intelligence-reports','s16b58r1fix1',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));
 fs.mkdirSync(dir,{recursive:true});
 for(const [name,data] of [
  ['trace.json',t],
  ['PROBE_OBSERVATIONS.json',t.probe_observations],
  ['REVIEW.json',{schema:t.schema,paired_comparison:t.paired_comparison,summary:t.summary,probe_observations:t.probe_observations,cost:t.cost,limitations:t.limitations}]
 ])fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
 const lines=['MYWAY S58-R1 FIX1 | RESEARCH ONLY','DESIGN: '+JSON.stringify(t.paired_comparison),'COUNTERS: '+JSON.stringify(t.summary),'COST: '+JSON.stringify(t.cost)];
 for(const o of t.probe_observations){lines.push('',`PROBE ${o.probe_id} (${o.phase})`, `PROMPT: ${t.paired_comparison.probe_prompts[o.probe_id]??'UNKNOWN'}`,'LEARNER: '+o.verbatim_response,'SCREEN: '+JSON.stringify(o.scoring_screen),'INTERPRETATION: '+JSON.stringify(o.model_provisional_interpretation),'REVISION HOLD: '+(o.rejected_revision_reason??'none'));}
 fs.writeFileSync(path.join(dir,'READABLE_REVIEW.txt'),lines.join('\n')+'\n',{flag:'wx',mode:0o600});
 return dir;
}
async function main(){const o=parseArgs(process.argv.slice(2));if(o.help){console.log('S58-R1-FIX1: --mode offline --limit 12 --learner-id LEARNER-A --trial-id T01 --retrieval lexical; allowed T01,T02,T05,T06; no DB writes');return;}
 console.log('S58-R1-FIX1 PAIRED OBSERVATION RESEARCH ONLY | NO DB WRITES');
 const t=await runFixed(o);const dir=saveFixed(t);console.log('SUMMARY '+JSON.stringify(t.summary));console.log('COST '+JSON.stringify(t.cost));console.log('REVIEW '+path.join(dir,'READABLE_REVIEW.txt'));console.log('TRACE '+path.join(dir,'trace.json'));if(t.summary.stopped)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('S58-R1-FIX1 REFUSAL: '+String(e?.message??e).slice(0,300));process.exitCode=1;});
