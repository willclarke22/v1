#!/usr/bin/env node
/** Read-only, provider-free retrieval evaluation with real localhost embeddings. */
import {loadCases} from './s13-evaluator.mjs';
import {chooseHistory} from './s14-flow.mjs';
import {rankFixtureEvidence,evidenceIntegrity} from './s151-retrieval.mjs';
export function args(argv){
 const x={caseId:'Q03-refinement',topic:null,root:null};
 for(let i=0;i<argv.length;i++){
  const k=argv[i];if(k==='--help'){x.help=true;continue;}
  if(!['--case','--topic','--root'].includes(k)||i===argv.length-1)throw Error('Unknown/incomplete option '+k);
  x[k==='--case'?'caseId':k==='--topic'?'topic':'root']=argv[++i];
 }
 if(x.topic!==null&&(x.topic.trim().length<4||x.topic.length>200))throw Error('Invalid topic length');
 if(x.root!==null&&(x.root.trim().length<15||x.root.length>700))throw Error('Invalid root length');
 return x;
}
async function main(){
 const f=args(process.argv.slice(2));if(f.help){console.log('Usage: node scripts/sandbox/learning-intelligence/s151-diagnose.mjs --case Q03-refinement [--topic "SA node depolarization" --root "Learner understands SA node location but does not understand the mechanism of ion currents causing depolarization"]');return;}
 const c=loadCases().find(v=>v.id===f.caseId);if(!c)throw Error('Unknown fixture case');
 const a={topic_name:f.topic??c.topicLabel,root_problem:f.root??c.root};
 console.log('MyWay S1.5.1 RETRIEVAL DIAGNOSTIC | fixture_bank=curated | embeddings=real_local | paid_API_calls=0 | learner_writes=0');
 console.log('ASSESSED | topic='+a.topic_name+' | root='+a.root_problem);
 const found=await rankFixtureEvidence(a);const chosen=chooseHistory(found.events,found.topicId,5);const gate=evidenceIntegrity(found,chosen);
 console.log('ORIGINAL-TYPE TOPIC-LABEL LEADER | '+found.diagnostics.nearestTopicLabelByScore);
 for(const [i,row] of found.topicCandidates.slice(0,10).entries())console.log(`RANK ${i+1} | ${row.topicLabel} | rootEvidence=${row.bestEventSimilarity?.toFixed(4)??'n/a'} | topicLabel=${row.topicSimilarity.toFixed(4)} | history=${row.topRoot??'none'}`);
 console.log('SELECTED | '+found.topicLabel+' | '+found.topicId);
 console.log('EVIDENCE | '+JSON.stringify(chosen.map(e=>({topic:e.topic_label,root:e.root_problem,similarity:e.similarity}))));
 console.log('MEMORY INTEGRITY | '+JSON.stringify(gate));
 console.log('NO WRITE | no SQL, model A/B/C calls, or automatic release gate.');
}
if(process.argv[1]&&process.argv[1].endsWith('s151-diagnose.mjs'))main().catch(e=>{console.error('S1.5.1 DIAGNOSTIC STOPPED: '+e.message);process.exitCode=1;});
