/** R5.5.3 host-owned visual scenes; defensive checks for R5.5.2 CSS collision. */
import vm from 'node:vm';
import {frameDocument as oldFrame} from './s62bfix1r551-creative-core.mjs';
export function auditGeneratedScripts(fragment){
 const problems=[];let i=0;
 for(const m of String(fragment).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)){
   i++;
   try{new vm.Script(m[1],{filename:'generated-scene-'+i+'.js'});}
   catch(e){problems.push({script_index:i,message:String(e.message).slice(0,160)});}
 }
 return {script_count:i,parse_error_count:problems.length,problems};
}
export function frameDocument(fragment,nonce){
 const audit=auditGeneratedScripts(fragment);
 // Keep non-executable artwork visible. Remove invalid inline scripts; never claim their controls worked.
 let i=0;
 let safe=String(fragment).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,m=>{
  i++;return audit.problems.some(p=>p.script_index===i)?'<!-- model-generated script failed syntax check and was disabled -->':m;
 });
 const warning=audit.parse_error_count?`<p role="status" style="background:#39233b;color:#ffe0e6;padding:9px;font:13px system-ui">Generated interaction code failed a syntax check and was disabled. The visual may be static; learner actions are not verified.</p>`:'';
 const listen=`<script>(function(){'use strict';const N=${JSON.stringify(nonce)};let requested=0;function cue(index){if(!Number.isInteger(index)||index<0||index>11)return;requested=index;const sections=[...document.querySelectorAll('[data-myway-moment]')];let shown=0;for(const s of sections){const match=Number(s.getAttribute('data-myway-moment'))===index;s.hidden=!match;if(s.style){if(match){s.style.setProperty('display','block','important');s.style.setProperty('visibility','visible','important');}else{s.style.setProperty('display','none','important');}}if(match)shown++;}const report=()=>{let visible=0;for(const s of sections){if(Number(s.getAttribute('data-myway-moment'))!==index)continue;const rect=s.getBoundingClientRect();const cs=window.getComputedStyle(s);if(rect.width>0&&rect.height>0&&cs.display!=='none'&&cs.visibility!=='hidden')visible++;}window.parent.postMessage({kind:'myway_r552_cue_ack_v1',nonce:N,index,matching_sections:shown,visible_sections:visible,section_count:sections.length},'*');};if(window.requestAnimationFrame)window.requestAnimationFrame(report);else report();}window.addEventListener('message',function(e){if(e.source!==window.parent||e.data?.kind!=='myway_r552_cue_v1'||e.data?.nonce!==N)return;cue(e.data.index);});window.addEventListener('DOMContentLoaded',()=>cue(requested));})();<\/script>`;
 // Host bridge executes even if generated scripts fail. Ensures model CSS cannot hide selected moments.
 return oldFrame(safe,nonce).replace('<body>','<body>'+listen.replace('<\/script>','</script>')+warning);
}
