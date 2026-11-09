/** MyWay S58-R1 controlled research overlay. No API, persistence, or production code. */
import crypto from 'node:crypto';
const clone=x=>JSON.parse(JSON.stringify(x));
const FEATURED={
 'CHEM03-P1':{type:'explain_reasoning',kind:'text',positive:[/\b(light|sunlight|photons?)\b/i,/\benerg(y|etic)\b/i,/(?:\bco\s*2\b|\bcarbon\b)/i,/(?:not|doesn.t|no|without).{0,50}(?:carbon|matter|atoms?)|(?:carbon|matter|atoms?).{0,50}(?:not|doesn.t|no)/i]},
 'BIO01-P1':{type:'explain_reasoning',kind:'text',positive:[/\bco\s*2\b|carbon dioxide/i,/\b(light|sunlight)\b/i,/\benerg(y|etic)\b/i]},
 'CHEM02-P1':{type:'explain_reasoning',kind:'text',positive:[/\b(gas|gases|vapou?r)\b/i,/\b(closed|sealed|total|all matter)\b/i,/\b(mass|conserv|remain|constant)\w*/i]},
 'BIO03-P2':{type:'prediction',kind:'text',positive:[/\b(block|inhibit|stop|disable|prevent)\w*/i,/\b(reduc|decreas|stop|less|no|slow)\w*/i,/(?:carbon|fixation|incorporat)/i]},
 'CHEM03-P2':{type:'prediction',kind:'text',positive:[/\b(light|wavelength|blue|red|lamp)\b/i,/(?:\bco\s*2\b|carbon|atoms?)/i,/(?:not|no|doesn.t|unchanged|same).{0,55}(?:carbon|atoms?|new|added)|(?:carbon|atoms?).{0,55}(?:not|no|unchanged|same)/i]},
 'CHEM01-P2':{type:'scene_select',kind:'scene',correct:'SCN01-O00',control:'SCN01-C00'},
 'CELL01-P2':{type:'scene_select',kind:'scene',correct:'SCN05-O04',control:'SCN05-C00'},
 'BIO06-P2':{type:'scene_select',kind:'scene',correct:'SCN05-O00',control:'SCN05-C00'},
 'BIO06-P1':{type:'explain_reasoning',kind:'text',positive:[/\b(proton|h\+|hydrogen)\b/i,/\b(gradient|downhill|high.to.low|electrochemical)\b/i,/\b(pump|pumping)\b/i,/\batp\b/i]}
};
// This intentionally supports a SMALL subset of curated probes, not a generic grader.
export function prepareFixture(input){
 const f=clone(input),cond=f.trial.condition;
 if(cond==='history_without_prior_root_hypotheses'){
  f.learner.provisional_root_hypotheses=[];
  // Do not relabel historical quotations; the trial withholds hypotheses, not observed history.
 }else if(!['history_available','history_available_control_verbal_only','history_available_visual_optional'].includes(cond))throw Error('Unsupported curated trial condition: '+cond);
 f.enforced_condition={condition:cond,roots_exposed:f.learner.provisional_root_hypotheses.length,observations_exposed:f.learner.prior_sessions.length};
 return f;
}
export function choosePair(f){
 const requested=[f.trial.suggested_probe_sequence[0],f.trial.later_unprompted_transfer_probe];
 return requested.map((id,i)=>{
  const phase=i===0?'baseline_after_conversation':'independent_transfer_after_tutoring';
  let probe=f.probes.find(p=>p.probe_id===id)??null;
  const original=id;let substitution=null;
  if(!checkValidity(probe,f.scenes).valid){
   const alternatives=f.trial.suggested_probe_sequence.slice(1).map(x=>f.probes.find(p=>p.probe_id===x)).filter(Boolean);
   const vetted=alternatives.find(p=>p.probe_id!==requested[0]&&checkValidity(p,f.scenes).valid);
   if(vetted){probe=vetted;substitution={original_probe_id:original,replacement_probe_id:probe.probe_id,reason:'original_cannot_be_scored_with_vetted_s58r1_contract; predeclared trial alternative used'};}
  }
  return {phase,probe,substitution};
 });
}
export function checkValidity(probe,scenes){
 if(!probe)return {valid:false,reason:'missing_curated_probe'};
 const spec=FEATURED[probe.probe_id];
 if(!spec)return {valid:false,reason:'probe_not_vetted_for_s58r1'};
 if(probe.type!==spec.type||probe.supports_diagnostic_inference!==true)return {valid:false,reason:'probe_contract_drift'};
 if(/\b(?:3|three)\s*(?:co\s*2|carbon dioxide).{0,100}(?:one\s*)?glucose\b/i.test(probe.prompt))return {valid:false,reason:'scientifically_inconsistent_carbon_accounting'};
 if(spec.kind==='scene'){
  const scene=scenes.find(s=>s.scene_id===probe.scene_id);
  const control=scene?.controls?.find(c=>c.control_id===spec.control);
  if(!control||!control.target_object_ids.includes(spec.correct)||!scene.objects.some(x=>x.object_id===spec.correct&&x.selectable))return {valid:false,reason:'missing_scene_target_or_control'};
 }
 if(spec.kind==='text'&&!['free_text','short_response'].includes(probe.response_mode))return {valid:false,reason:'response_contract_drift'};
 return {valid:true,reason:'researcher_vetted_narrow_contract',response_kind:spec.kind};
}
export function publicOffer(probe,scenes){
 const x={probe_id:probe.probe_id,topic_id:probe.topic_id,probe_type:probe.type,prompt:probe.prompt,optional:true};
 if(probe.scene_id){const scene=scenes.find(s=>s.scene_id===probe.scene_id);x.scene={scene_id:scene.scene_id,title:scene.title,visual_rendered:false,objects:scene.objects.filter(o=>o.selectable).map(o=>({id:o.object_id,label:o.semantic_label})),controls:scene.controls.map(c=>({id:c.control_id,type:c.action_type,target_object_ids:c.target_object_ids}))};}
 return x;
}
export function independentCheck(probe,scenes,answer){
 const validation=checkValidity(probe,scenes);
 if(!validation.valid)return {status:'invalid_probe_not_learner_evidence',reason:validation.reason,scored:false};
 if(!answer?.accept)return {status:'declined_not_failure',scored:false};
 if(typeof answer.response!=='string'||answer.response.length>1600)return {status:'unscored_invalid_response',scored:false};
 const spec=FEATURED[probe.probe_id];
 if(spec.kind==='scene'){
  const scene=scenes.find(s=>s.scene_id===probe.scene_id),control=scene.controls.find(c=>c.control_id===spec.control);
  if(!control.target_object_ids.includes(answer.selected_object_id))return {status:'unscored_invalid_target',scored:false};
  return {status:answer.selected_object_id===spec.correct?'correct_selection':'incorrect_selection',scored:true,correct:answer.selected_object_id===spec.correct,method:'exact_public_scene_target_researcher_key',control_id:control.control_id};
 }
 const t=answer.response;
 // Shallow positive checks are only screening evidence; failures abstain, not graded as learner misconception.
 const hits=spec.positive.map(x=>x.test(t));
 return hits.every(Boolean)?{status:'positive_feature_screen_only',scored:true,correct:null,method:'conservative_lexical_feature_screen',cannot_establish:'scientific accuracy, causal root or lasting mastery'}:
 {status:'insufficient_for_automatic_scoring',scored:false,matched_features:hits.filter(Boolean).length,total_features:hits.length};
}
export function guardRevision(candidate,answer,check,state){
 const rootIds=new Set(state.roots.map(x=>x.id)),relIds=new Set(state.relationships.map(x=>x.id));
 const decisions=new Set(['supports','weakens','challenges','insufficient']);
 if(!candidate||typeof candidate!=='object'||!decisions.has(candidate.root_stance)||!decisions.has(candidate.relationship_stance))return {accepted:false,reason:'invalid_stance_contract'};
 if(candidate.root_id!==null&&!rootIds.has(candidate.root_id))return {accepted:false,reason:'root_not_in_learner_history'};
 if(candidate.relationship_id!==null&&!relIds.has(candidate.relationship_id))return {accepted:false,reason:'relationship_not_in_learner_history'};
 if(typeof candidate.evidence_quote!=='string'||!answer.response.includes(candidate.evidence_quote)||!candidate.evidence_quote.trim())return {accepted:false,reason:'nonverbatim_or_missing_probe_evidence'};
 if(typeof candidate.interpretation!=='string'||candidate.interpretation.length<10||candidate.interpretation.length>700||typeof candidate.alternative_explanation!=='string'||candidate.alternative_explanation.length>500||typeof candidate.next_teaching_move!=='string'||candidate.next_teaching_move.length>450)return {accepted:false,reason:'invalid_revision_text'};
 if(!check.scored&&['supports','weakens','challenges'].includes(candidate.root_stance))return {accepted:false,reason:'unscored_probe_cannot_change_root_support'};
 if(!check.scored&&['supports','weakens','challenges'].includes(candidate.relationship_stance))return {accepted:false,reason:'unscored_probe_cannot_change_relationship_support'};
 if(candidate.root_id===null&&candidate.root_stance!=='insufficient'||candidate.relationship_id===null&&candidate.relationship_stance!=='insufficient')return {accepted:false,reason:'missing_target_for_stance'};
 // A positive feature screen is NOT sufficient to establish underlying cause or learning preferences.
 return {accepted:true,reason:'provisional_cited_evidence_only_not_automated_truth',root_update:{target_id:candidate.root_id,stance:candidate.root_stance},relationship_update:{target_id:candidate.relationship_id,stance:candidate.relationship_stance}};
}
export function summarizeRevisions(events){
 const valid=events.filter(e=>e.revision_guard?.accepted);
 return {root_updates:valid.filter(e=>e.revision_guard.root_update.target_id&&e.revision_guard.root_update.stance!=='insufficient').length,
 relationship_updates:valid.filter(e=>e.revision_guard.relationship_update.target_id&&e.revision_guard.relationship_update.stance!=='insufficient').length,
 revision_holds:events.filter(e=>e.revision_guard&&!e.revision_guard.accepted).length,
 independent_probe_evidence:events.filter(e=>e.check?.scored).length,
 invalid_probes:events.filter(e=>e.check?.status==='invalid_probe_not_learner_evidence').length};
}
export function fixtureFingerprint(f){return crypto.createHash('sha256').update(JSON.stringify({learner:f.learner.learner_id,trial:f.trial.trial_id,condition:f.trial.condition,roots:f.learner.provisional_root_hypotheses.map(x=>x.root_id)})).digest('hex');}
