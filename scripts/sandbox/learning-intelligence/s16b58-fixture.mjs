/** S58 curated research adapter. Public learner history is model-visible; hidden simulation and evaluator rubrics remain separate. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {scenarioCheck,createState} from './s16b56-core.mjs';
const DIR=path.join(path.dirname(fileURLToPath(import.meta.url)),'s16b58-fixtures');
const FILES=['topics_public','curriculum_links_public','probes_public','scenes_public','learners_public','learner_simulator_PRIVATE','probe_scoring_PRIVATE','trials','user_interaction_examples_public'];
const deep=v=>JSON.parse(JSON.stringify(v));
const read=name=>JSON.parse(fs.readFileSync(path.join(DIR,name+'.json'),'utf8'));
const fail=x=>{throw Error('S58 fixture integrity failure: '+x);};
// Explicit curator-defined anchors: topic IDs are curriculum references, not learner-cause labels.
const ROOT_TOPIC={'A-R1':'BIO01','A-R2':'CELL01','B-R1':'BIO01','B-R2':'BIO03','C-R1':'BIO06','C-R2':'PHYS06'};
export function loadFixture(learnerId='LEARNER-A',trialId='T01'){
 if(!['LEARNER-A','LEARNER-B','LEARNER-C'].includes(learnerId))fail('unknown learner');
 if(!/^T(?:0[1-9]|1[0-2])$/.test(trialId))fail('invalid trial');
 const contents=Object.fromEntries(FILES.map(n=>[n,read(n)]));
 const {topics_public:topics,curriculum_links_public:curriculumLinks,probes_public:probes,scenes_public:scenes,learners_public:learners,learner_simulator_PRIVATE:simulators,probe_scoring_PRIVATE:rubrics,trials}=contents;
 if(topics.length!==30||curriculumLinks.length!==44||probes.length!==60||scenes.length!==12||learners.length!==3||simulators.length!==3||rubrics.length!==60||trials.length!==12)fail('inventory count drift');
 const unique=(arr,key)=>arr.length===new Set(arr.map(x=>x[key])).size;
 for(const [a,k] of [[topics,'topic_id'],[curriculumLinks,'edge_id'],[probes,'probe_id'],[scenes,'scene_id'],[learners,'learner_id'],[trials,'trial_id']])if(!unique(a,k))fail('duplicate '+k);
 const ti=new Set(topics.map(x=>x.topic_id)),pi=new Set(probes.map(x=>x.probe_id)),si=new Set(scenes.map(x=>x.scene_id));
 if(curriculumLinks.some(x=>!ti.has(x.from_topic_id)||!ti.has(x.to_topic_id)))fail('unknown curriculum edge');
 if(probes.some(x=>!ti.has(x.topic_id)||(x.scene_id&&!si.has(x.scene_id))))fail('unknown probe topic or scene');
 if(rubrics.some(x=>!pi.has(x.probe_id)))fail('rubric references unknown probe');
 const learner=learners.find(x=>x.learner_id===learnerId),privateSimulator=simulators.find(x=>x.learner_id===learnerId),trial=trials.find(x=>x.trial_id===trialId);
 if(!trial||trial.learner_id!==learnerId||!privateSimulator)fail('learner/trial mismatch');
 if(learner.prior_sessions.length!==6||learner.provisional_root_hypotheses.length!==2)fail('historical evidence count drift');
 const oi=new Set(learner.prior_sessions.map(x=>x.id));
 for(const o of learner.prior_sessions)if(!ti.has(o.topic_id)||!o.learner_quote?.trim())fail('invalid learner evidence');
 for(const r of learner.provisional_root_hypotheses){if(!ti.has(ROOT_TOPIC[r.root_id]))fail('missing explicit root topic');for(const id of [...r.supporting_observation_ids,...r.contradicting_observation_ids])if(!oi.has(id))fail('root references missing observation');}
 for(const rel of learner.learner_specific_relationship_hypotheses){if(!ti.has(rel.from_topic_id)||!ti.has(rel.to_topic_id)||rel.observation_ids.some(x=>!oi.has(x)))fail('bad learner relationship');}
 for(const id of [...trial.suggested_probe_sequence,trial.later_unprompted_transfer_probe])if(!pi.has(id))fail('trial unknown probe');
 if(JSON.stringify(learner).includes('knowledge_state')||JSON.stringify(topics).includes('known_misconception_to_check'))fail('hidden truth leaked into public');
 return {topics:deep(topics),curriculumLinks:deep(curriculumLinks),probes:deep(probes),scenes:deep(scenes),learner:deep(learner),trial:deep(trial),privateSimulator:deep(privateSimulator)};
}
export function makeSeed(curated){
 const state=createState();state.topics=curated.topics.map(t=>({id:t.topic_id,label:t.title,status:'curriculum_reference_not_learner_knowledge',cluster:t.cluster}));
 state.observations=curated.learner.prior_sessions.map(o=>({id:o.id,turn_id:o.turn,session_id:'HISTORICAL',topic_id:o.topic_id,source:'synthetic_researcher_authored_history',verbatim_quote:o.learner_quote,evidence_type:o.evidence_type,review_required:true,seeded:true,demonstrated_mastery:false}));
 state.roots=curated.learner.provisional_root_hypotheses.map(r=>({id:r.root_id,topic_id:ROOT_TOPIC[r.root_id],root_problem:r.underlying_cause_hypothesis,presenting_difficulty:r.presenting_difficulty,alternative_hypotheses:deep(r.alternative_hypotheses),supporting_observation_ids:deep(r.supporting_observation_ids),contradicting_observation_ids:deep(r.contradicting_observation_ids),first_quote:state.observations.find(o=>o.id===r.supporting_observation_ids[0])?.verbatim_quote??'',source_turn:r.supporting_observation_ids[0],observation_turn_ids:[...new Set([...r.supporting_observation_ids,...r.contradicting_observation_ids])],status:r.status,seeded:true}));
 state.relationships=curated.learner.learner_specific_relationship_hypotheses.map(r=>({id:r.relationship_id,source_turn:r.observation_ids[0],learner_quote:r.claim,from_topic_id:r.from_topic_id,to_topic_id:r.to_topic_id,kind:r.kind,observation_ids:deep(r.observation_ids),status:r.status,not_a_curriculum_edge:true,seeded:true}));
 state.preferences=[];return state;
}
const defaultOffline='I can help investigate the learner’s reasoning, but this scripted offline reply is not a Model B inference.';
function step(id,learner,aim){return {id,learner,aim,offline_reply:defaultOffline};}
function scenarioText(curated){
 const id=curated.learner.learner_id;
 if(id==='LEARNER-A')return [
 [curated.trial.first_learner_message,'I keep picturing the energy as an ingredient. Could we test that explanation?','I know the carbon atoms need CO₂, but could light somehow add matter?','Please ask me a question that could reveal why I am mixing these ideas up.'],
 ['I am back. Can you check whether I really understand the distinction between the source of carbon and the source of energy?','I can say the words carbon and energy, but I am not sure I can trace the matter.','Suppose sunlight shines but CO₂ is absent. What would that mean for sugar formation?','Could we test this in a different context, not just with a plant diagram?'],
 ['Now I am comparing mitochondria and chloroplasts. I get proton movement in mitochondria, but I mix up the chloroplast compartments.','Could you compare where protons accumulate in each? A simple diagram might help.','I tend to put extra protons in the chloroplast stroma because it feels like the mitochondrial matrix. Is that right?','Can you check my reasoning with a new prediction about ATP synthase?']];
 if(id==='LEARNER-B')return [
 [curated.trial.first_learner_message,'I know that light is energy rather than carbon, but I lose the carbon atoms when molecules rearrange.','Could you show me where a specific carbon atom goes after fixation?','Ask me one atom-tracking question without showing the answer first.'],
 ['I am back. Can you check whether I can use conservation of atoms in a new reaction?','I think the atoms must be conserved, but I cannot match the drawings.','Could you give me a probe that changes the arrangement of atoms?','I do not want another explanation yet. I want to try reasoning it through.'],
 ['I am now comparing glucose production with respiration. Is the source of energy the same as the source of atoms?','Could you suggest a small visual task where I trace atoms rather than memorize labels?','I got a similar problem correct last time, but I am unsure on a changed diagram.','Could you test whether I can transfer that idea to a new biological process?']];
 return [
 [curated.trial.first_learner_message,'I keep mixing up pumps that build gradients with channels or enzymes that use them.','Can we compare what happens when the gradient is already present versus when it must be built?','Could you probe my reasoning about energy input, not just ask for a label?'],
 ['I am back. I think protons flow down a gradient through ATP synthase, but I confuse that with proton pumping.','What would happen if the pump stopped but the gradient remained for a short time?','I know sodium channels are involved in action potentials. Are they doing the same thing as ATP synthase?','Please ask me something that could show whether I really distinguish pumps from gradient-driven transport.'],
 ['Now I am comparing kidney sodium-glucose cotransport with proton gradients in mitochondria.','Could a diagram help me distinguish the gradient-building step from the gradient-using step?','I thought the cotransporter makes the sodium gradient itself. Is that the same confusion again?','Could you give me a new example where I predict whether a gradient is built or used?']];
}
export function scenarioForFixture(curated){const messages=scenarioText(curated);return scenarioCheck({schema:'myway_s16b56_synthetic_journey_v1',source:'researcher_authored_synthetic_not_human',description:'S58 seeded curated scenario; goals are not answer keys, hidden synthetic state only visible to Model L',sessions:messages.map((items,i)=>({id:'J'+(i+1),name:['Prior-root investigation','Historical continuity and independent probe','Cross-context transfer and optional activity'][i],steps:items.map((text,j)=>step(`J${i+1}-${j+1}`,text,`Investigate public historical evidence for ${curated.learner.learner_id}; preserve uncertainty; follow the tutor, and respond naturally. No promised learner outcome.`))}))});}
export function publicProbeForTurn(curated,turnId){const ids=[...curated.trial.suggested_probe_sequence,curated.trial.later_unprompted_transfer_probe];const selected={'J1-4':0,'J2-2':1,'J3-2':2,'J3-4':3};if(!(turnId in selected))return null;return deep(curated.probes.find(p=>p.probe_id===ids[selected[turnId]])??null);}
export function fixtureAudit(curated){const hash=crypto.createHash('sha256').update(JSON.stringify({learner:curated.learner.learner_id,trial:curated.trial.trial_id,roots:curated.learner.provisional_root_hypotheses.map(r=>r.root_id)})).digest('hex');return {learner_id:curated.learner.learner_id,trial_id:curated.trial.trial_id,topics_available:curated.topics.length,curriculum_reference_links:curated.curriculumLinks.length,public_historical_observations:curated.learner.prior_sessions.length,existing_learner_root_hypotheses:curated.learner.provisional_root_hypotheses.length,existing_learner_relationships:curated.learner.learner_specific_relationship_hypotheses.length,suggested_probes_not_administered:4,seed_fingerprint:hash,private_knowledge_state_in_trace:false,private_rubrics_in_trace:false,real_user_data:false,db_writes:0};}
