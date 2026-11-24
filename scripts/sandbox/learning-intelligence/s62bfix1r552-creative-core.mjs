/** Host-owned scene pacing. The iframe cannot author or change the teacher's words.
 * UI sends cue to matching opaque-origin iframe using per-frame nonce.
 */
import {frameDocument as oldFrame} from './s62bfix1r551-creative-core.mjs';
export function frameDocument(fragment,nonce){
 const listen=`<script>(function(){'use strict';const N=${JSON.stringify(nonce)};let requested=0;function cue(index){if(!Number.isInteger(index)||index<0||index>11)return;requested=index;const sections=[...document.querySelectorAll('[data-myway-moment]')];let shown=0;for(const s of sections){const match=Number(s.getAttribute('data-myway-moment'))===index;s.hidden=!match;if(s.style){if(match)s.style.removeProperty('display');else s.style.setProperty('display','none','important');}if(match)shown++;}window.parent.postMessage({kind:'myway_r552_cue_ack_v1',nonce:N,index,matching_sections:shown,section_count:sections.length},'*');}window.addEventListener('message',function(e){if(e.source!==window.parent||e.data?.kind!=='myway_r552_cue_v1'||e.data?.nonce!==N)return;cue(e.data.index);});window.addEventListener('DOMContentLoaded',()=>cue(requested));})();<\/script>`;
 // The script is an additional fixed bridge, not written by the model.
 const script=listen.replace('<\\/script>','</script>');
 return oldFrame(fragment,nonce).replace('<body>','<body>'+script);
}
