#!/usr/bin/env node
/** FIX6B: derive controlled packets from immutable FIX6A prepared report. */
import fs from 'node:fs';import path from 'node:path';
import {prepareComparison,STAGE,sha} from './s62bfix1r42fix6b-context.mjs';
import {inspectResearchCode} from './s62bfix1r42fix6b-inventory.mjs';
const die=s=>{throw Error(s)};
const reading=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const write=(p,data)=>fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const goodId=s=>/^[A-Za-z0-9_-]{1,80}$/.test(s??'');
function flags(args){const result={root:process.cwd(),mode:'plan',runId:'fix6b_context_01',sourceRunId:'fix6a_context_free_01',sourceDir:null,caseIds:'all',budget:55000};
 for(let i=0;i<args.length;i+=2){const k=args[i],v=args[i+1];if(!v)die('Argument missing for '+k);
 switch(k){case '--root':result.root=path.resolve(v);break;case '--mode':result.mode=v.toLowerCase();break;
 case '--run-id':result.runId=v;break;case '--source-run-id':result.sourceRunId=v;break;case '--source-dir':result.sourceDir=path.resolve(v);break;
 case '--case-ids':result.caseIds=v;break;case '--target-bytes':result.budget=+v;break;default:die('Unknown argument '+k);}}
 if(!['plan','prepare'].includes(result.mode)||!goodId(result.runId)||!goodId(result.sourceRunId)||!Number.isInteger(result.budget)||result.budget<34000||result.budget>500000)die('Invalid mode, run ID or byte budget');
 result.sourceDir??=path.join(result.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix6a','context-audits',result.sourceRunId);
 result.out=path.join(result.root,'.myway-patch-backups','learning-intelligence-reports','s62bfix1r42fix6b','context-audits',result.runId);
 return result;}
function report(plan,rows,inventory){const headers='| Assessment | Original bytes | Full-history bytes | Selective bytes | New selected | Budget omitted | Original packing omissions | Stored not delivered |\n|---|---:|---:|---:|---:|---:|---:|---:|';
 const lines=rows.map(r=>{const a=r.accounting;return `| ${r.case_id}/${r.stage} | ${a.original_bytes} | ${a.full_bytes} | ${a.selective_bytes} | ${a.selective_added.length} | ${a.selective_omitted.length} | ${a.reported_context_packing_omissions.length} | ${a.historical_stored_not_delivered_ids.length} |`;});
 return `# MyWay FIX6B — Context Quality + Pipeline Inventory\n\n`+
 `**Offline / research-only:** no model provider, embedding, or DB calls. Source is the saved FIX6A report, not a recreated or invented conversation.\n\n`+
 `**Target:** ${plan.target_bytes} UTF-8 JSON bytes for the selective variant (NOT a token limit). System prompts frozen. No capture-time evidence repair.\n\n`+
 headers+'\n'+lines.join('\n')+'\n\n'+
 `## Key comparisons\n\n`+
 `- Original: frozen prior model request including its unchanged system prompt and delivered input.\n`+
 `- Full-history: original observations plus all other eligible earlier saved observations from FIX6A.\n`+
 `- Selective-evidence: original observations preserved; additional eligible full saved observations selected by memory references, topic, retrieval status and recency under the byte budget.\n`+
 `- Full-history and selective both use **identical** normalized coverage, available_topics, recent dialogue, activity evidence and existing memory candidate values. Only added historical observation sets and their citable IDs differ.\n`+
 `- Selectivity was active in ${rows.filter(r=>r.accounting.selective_is_genuinely_different).length} / ${rows.length} assessments. If no budget omissions exist, the two context strategies are not meaningfully different.\n\n`+
 `## Corrected accounting\n\n`+
 `- Original packing omission IDs are a separate signal from FIX6A \'retrieved not delivered\'. The latter is not zero proof: the former may record retriever IDs removed during packing. Both are reported separately, not added as independent unique event counts.\n`+
 `- Source observations that were already clipped when recorded remain clipped.\n`+
 `- Presence and correctness of an explanation are distinct from independently demonstrated understanding; the offline ranking is not cognitive ground truth.\n\n`+
 `## Code inventory (read-only)\n\n`+
 `- Research .mjs files scanned: ${inventory.module_count}; static import edges: ${inventory.imported_module_edges}.\n`+
 `- Zero-inbound static import candidates: ${inventory.zero_static_inbound_modules}. **Do not delete automatically.**\n`+
 `- Runtime modules: ${inventory.runtime_module_count}; similar runtime pairs above threshold: ${inventory.runtime_high_overlap_pairs.length}.\n`+
 `- Source-interface review points: ${inventory.interface_flags.map(x=>x.id).join(', ')||'none detected'}. Full source lines and limitations are in CODE_INVENTORY.json.\n\n`+
 `## Recommended next phase\n\nReview historical evidence relevance and run a **separate paid matched Model A comparison** only if packets preserve chronology and actually differ. Freeze prompts/model versions, inspect numeric facts, and measure genuine learner inference quality, not just verbosity. No archival deletion or runtime rewrites until validation.\n`;
}
function main(){const o=flags(process.argv.slice(2));
 const summaryPath=path.join(o.sourceDir,'SUMMARY.json');if(!fs.existsSync(summaryPath))die('FIX6A SUMMARY.json missing at '+summaryPath);
 const summary=reading(summaryPath);
 if(summary.stage!=='S62B-FIX1R42FIX6A'||summary.completed!==true||summary.provider_calls!==0||summary.database_writes!==0)die('Source must be completed, read-only FIX6A report');
 const sourceNames=summary.case_ids;if(!Array.isArray(sourceNames)||sourceNames.length===0)die('Source has no assessed cases');
 const chosen=o.caseIds==='all'?sourceNames:o.caseIds.split(',');for(const v of chosen)if(!sourceNames.includes(v))die('Unknown FIX6A case '+v);
 const names=chosen.flatMap(c=>['pre','post'].map(s=>`${c}_${s}`));const packets=[];
 for(const name of names){const file=path.join(o.sourceDir,'A_PACKETS',name+'.json');if(!fs.existsSync(file))die('Missing prepared source '+file);
  const input=reading(file),comp=prepareComparison(input,{targetBytes:o.budget});
  if(name!==comp.case_id+'_'+comp.stage)die('Source case/phase mismatch '+name);
  packets.push(comp);
 }
 const inv=inspectResearchCode(o.root);
 const counters={assessments:packets.length,original_packing_omissions:packets.reduce((n,p)=>n+p.accounting.reported_context_packing_omissions.length,0),
  historical_stored_not_delivered:packets.reduce((n,p)=>n+p.accounting.historical_stored_not_delivered_ids.length,0),
  selective_assessments:packets.filter(p=>p.accounting.selective_is_genuinely_different).length,
  selective_total_new_evidence:packets.reduce((n,p)=>n+p.accounting.selective_added.length,0),
  selective_total_omitted_evidence:packets.reduce((n,p)=>n+p.accounting.selective_omitted.length,0),
  max_original_bytes:Math.max(...packets.map(p=>p.accounting.original_bytes)),max_full_bytes:Math.max(...packets.map(p=>p.accounting.full_bytes)),max_selective_bytes:Math.max(...packets.map(p=>p.accounting.selective_bytes))};
 const plan={stage:STAGE,mode:o.mode,run_id:o.runId,source_run_id:o.sourceRunId,source_dir:o.sourceDir,source_summary_sha256:sha(fs.readFileSync(summaryPath,'utf8')),source_state_hashes:summary.source_hashes,
  case_ids:chosen,target_bytes:o.budget,planned_assessments:packets.length,counters,model_calls:0,embedding_calls:0,database_writes:0,model_inference:false};
 if(o.mode==='plan'){console.log('FIX6B PLAN PASS\n'+JSON.stringify({plan,code_inventory:{modules:inv.module_count,interface_flags:inv.interface_flags.map(x=>x.id)}},null,2));return;}
 if(fs.existsSync(o.out))die('Prepared RunId already exists. Use a fresh RunId: '+o.out);
 fs.mkdirSync(path.join(o.out,'A_PACKETS'),{recursive:true});
 for(const c of packets)write(path.join(o.out,'A_PACKETS',`${c.case_id}_${c.stage}.json`),c);
 write(path.join(o.out,'PLAN.json'),plan);
 write(path.join(o.out,'CODE_INVENTORY.json'),inv);
 const stats=packets.map(({case_id,stage,round,arm,topic_id,current_id,source_packet_sha256,baseline_source_request_sha256,system_prompt_sha256,accounting})=>({case_id,stage,round,arm,topic_id,current_id,source_packet_sha256,baseline_source_request_sha256,system_prompt_sha256,accounting}));
 write(path.join(o.out,'SUMMARY.json'),{...plan,mode:'prepare',completed:true,assessments:stats,code_inventory_counts:{modules:inv.module_count,flags:inv.interface_flags.length,similar_runtime_pairs:inv.runtime_high_overlap_pairs.length},input_variants:['original','full_history','selective_evidence'],source_capture_not_guaranteed_raw:true});
 fs.writeFileSync(path.join(o.out,'REPORT.md'),report(plan,packets,inv),{flag:'wx'});
 write(path.join(o.out,'TRACE.json'),{stage:STAGE,run_id:o.runId,source_summary_sha256:plan.source_summary_sha256,model_calls:0,embedding_calls:0,database_writes:0,packets_sha256:sha(stats),system_prompts_unchanged:true,counterfactuals_not_ground_truth:true});
 console.log('FIX6B PREPARE PASS '+JSON.stringify({run_id:o.runId,assessments:packets.length,selective_cases:counters.selective_assessments,source:o.sourceDir,output:o.out,provider_calls:0,db_writes:0}));
}
main();
