/* R5.5.1: dark story-first paired experiment. Session-budget consent, one A assessment,
 * exactly one-call B-only versus B+X, faithful choice-linked evidence.
 * The older research UI is available only through /legacy.
 */
'use strict';
const $=id=>document.getElementById(id);const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
let csrf='',sessionId='goldpilot01_clean05',data=null,busy=false,detached=false,frames=[],lastViewed=null,progressTimer=null;
const escapeJson=x=>JSON.stringify(x,null,2);const usd=v=>typeof v==='number'?'$'+v.toFixed(4):'—';
async function api(url,{method='GET',payload=null}={}){const opt={method,credentials:'same-origin',headers:{}};if(method!=='GET'){opt.headers['content-type']='application/json';opt.headers['x-myway-csrf']=csrf;opt.body=JSON.stringify(payload??{});}const r=await fetch(url,opt);const body=await r.json();if(!r.ok)throw Error(body.error??`HTTP ${r.status}`);return body;}
function error(s){$('errorNotice').hidden=!s;$('errorNotice').textContent=s??'';}
function status(s){$('activityStatus').hidden=!s;$('activityStatus').textContent=s??'';}
function setBusy(on,msg=''){busy=on;$('sendButton').disabled=on||!$('message').value.trim()||!data?.auto_authorization?.enabled;$('exportButton').disabled=on;$('enableAuto').disabled=on;$('pauseAuto').disabled=on;if(msg)status(msg);else if(!on)status('');}
function nearBottom(){const m=$('chatMain');return m.scrollHeight-m.clientHeight-m.scrollTop<170;}
function scrollBottom(force=false){if(force||!detached){const m=$('chatMain');m.scrollTop=m.scrollHeight;$('jumpLatest').hidden=true;}}
$('chatMain').addEventListener('scroll',()=>{detached=!nearBottom();$('jumpLatest').hidden=!detached;},{passive:true});$('jumpLatest').onclick=()=>{detached=false;scrollBottom(true);};
function updateAuthorization(){const a=data?.auto_authorization??{exists:false,enabled:false};$('authSetup').hidden=a.exists;$('pauseAuto').hidden=!a.enabled;
 const c=data?.cost_summary; if($('costSummary')){const completed=c?.completed_estimated_usd??0;const issue=c?.pending_unresolved_count?` · ${c.pending_unresolved_count} pending/uncertain paid trace(s)` : ''; $('costSummary').textContent=`Session cost: ${usd(completed)} estimated across ${c?.completed_priced_turns??0} completed turn(s)${issue}.`; }
 $('authStatus').replaceChildren();const text=a.enabled?`Automatic comparison is on. Safety allowance left: ${usd(a.remaining_usd)}.`:a.exists?`Paused: ${a.paused_reason??'not enabled'}. Allowance left: ${usd(a.remaining_usd)}.`:'Not authorized yet.';
 $('authStatus').append(el('p',a.enabled?'budget-enabled':'hint',text));$('composerHint').textContent=a.enabled?'Both experiences generate automatically after each message.':'Authorize a bounded session budget to start.';
 $('sendButton').disabled=busy||!a.enabled||!$('message').value.trim();}
function showInspector(turn){lastViewed=turn;$('inspector').hidden=false;const holder=$('inspectorBody');holder.replaceChildren();if(!turn){holder.textContent='Choose a completed turn.';return;}
 const detail=el('p','',`${turn.turn_id} · ${turn.topic_title}`);holder.append(detail);
 const schema=el('div','two-tone');holder.append(schema);
 const selected=el('p','',`Chosen variant: ${turn.dual_experience?.selected_variant??'not chosen'}. Both outputs were created before preference was recorded.`);holder.append(selected);
 holder.append(el('p','',`Model calls: ${(turn.model_calls??[]).map(x=>x.role).join(' → ')||'Historical sanitized trace'}`));holder.append(el('p','',`Turn cost: ${usd(turn.estimated_usd)} (token-based estimate)`));
 const cb=turn.cost_breakdown;if(cb&&turn.dual_experience){holder.append(el('p','',`Shared ROUTE/A: ${usd(cb.shared_estimated_usd)} · B-only: ${usd(cb.b_only_estimated_usd)} · B+X: ${usd(cb.bx_estimated_usd)}`));}for(const call of turn.model_calls??[])holder.append(el('p','small',`${call.role} (${call.model}): ${usd(call.estimated_usd)}`));
 const a=turn.A?.output??null;holder.append(el('h4','','Model A evidence-based assessment'));const pre=el('pre');pre.textContent=a?escapeJson({learner_brief_for_B:a.learner_brief_for_B,interpretation:a.interpretation,root_hypotheses:a.root_hypotheses,memory_decisions:a.memory_decisions}):'Not available in sanitized history.';holder.append(pre);
 const details=el('details');details.append(el('summary','','Retrieval / evidence metadata'));const d=el('pre');d.textContent=escapeJson(turn.A?.retrieval_summary??null);details.append(d);holder.append(details);
 const designs=turn.creative_designs??{};if(designs.b_only||designs.bx){holder.append(el('h4','','Architecture comparison'));for(const k of ['b_only','bx']){const z=designs[k];if(z){holder.append(el('p','',`${k==='b_only'?'B-only':'B+X'}: ${usd(z.estimated_usd)} · ${z.model_calls} call(s)`));if(z.moment_coverage)holder.append(el('p','small',`${k} scene marker coverage: ${z.moment_coverage.static_markers_complete?'all found in model HTML':'incomplete; do not assume visual fidelity'} (not a runtime quality verdict)`));}}}
}
function recordFrame(e){for(const f of frames){if(e.source!==f.iframe.contentWindow)continue;const z=e.data;if(!z||z.nonce!==f.nonce)return; if(z.kind==='myway_r552_cue_ack_v1'){f.narration&&(f.narration.cue_ack={index:z.index,matching_sections:z.matching_sections,section_count:z.section_count});return;} if(z.kind!=='myway_r54_event_v1')return;
 if(f.events.length>=160||typeof z.action!=='string'||typeof z.detail!=='string'||typeof (z.view_text??'')!=='string'||z.action.length>65||z.detail.length>550||(z.view_text??'').length>450)return;
 const origin=['bridge_observed','generated_report'].includes(z.origin)?z.origin:'unknown';f.events.push({action:z.action,origin,detail:z.detail,view_text:z.view_text??'',at:new Date().toISOString()});f.counter.textContent=`${f.events.length} event(s) · actions and code reports are unscored`;return;}}
window.addEventListener('message',recordFrame);
function attachTeacherNarration(option,frame,d){
 const lines=d?.authoritative_narration;
 if(!Array.isArray(lines)||!lines.length)return;
 const panel=el('div','teacher-voice');
 const eyebrow=el('div','voice-label','MODEL B · YOUR TEACHER');
 const count=el('span','voice-count');eyebrow.append(count);
 const body=el('div','voice-body');
 const nav=el('div','voice-nav');const prev=el('button','subtle','Back');const next=el('button','primary','Continue');const mark=el('button','subtle voice-mark','This part was confusing');
 const track=el('div','voice-progress');nav.append(prev,track,next,mark);
 panel.append(eyebrow,body,nav);
 frame.narration={lines,index:0,body,count,prev,next,track,panel,visited:new Set(),cue_ack:null};
 option.insertBefore(panel,frame.iframe);
 function display(index){
  const n=frame.narration;if(!n)return;n.index=Math.max(0,Math.min(index,n.lines.length-1));n.body.textContent=n.lines[n.index];n.count.textContent=`${n.index+1} / ${n.lines.length}`;
  n.prev.disabled=n.index===0;n.next.disabled=n.index===n.lines.length-1;mark.disabled=false;mark.textContent='This part was confusing';
  n.track.replaceChildren();for(let i=0;i<n.lines.length;i++){const dot=el('span',i===n.index?'voice-dot active':'voice-dot');n.track.append(dot);}
  // Record HOST-observed narration exposure, distinct from unverified model-generated events.
  if(!n.visited.has(n.index)){n.visited.add(n.index);if(frame.events.length<160){frame.events.push({action:'narration_moment_presented',origin:'host_observed',detail:`moment ${n.index+1} of ${n.lines.length}`,view_text:n.lines[n.index].slice(0,450),at:new Date().toISOString()});frame.counter.textContent=`${frame.events.length} events · unscored`;}}
  const cue=()=>{try{frame.iframe.contentWindow?.postMessage({kind:'myway_r552_cue_v1',nonce:frame.nonce,index:n.index},'*');}catch{}};
  if(frame.iframe.contentWindow)cue();
 }
 frame.cueTeacher=display;
 prev.onclick=()=>display(frame.narration.index-1);
 next.onclick=()=>display(frame.narration.index+1);
 mark.onclick=()=>{const n=frame.narration;if(!n||frame.events.length>=160)return;frame.events.push({action:'narration_marked_confusing',origin:'host_observed',detail:`moment ${n.index+1} of ${n.lines.length}`,view_text:n.lines[n.index].slice(0,450),at:new Date().toISOString()});frame.counter.textContent=`${frame.events.length} events · unscored`;mark.textContent='Marked · can discuss below';mark.disabled=true;};
 frame.iframe.addEventListener('load',()=>display(frame.narration.index));
 display(0);
}

function cardForVariant(turn,variant,slot,wrap){const d=turn.creative_designs?.[variant];const option=el('div','option');option.dataset.variant=variant;const head=el('div','option-top');const title=el('div','option-title',`Experience ${slot}`);title.append(el('small','',d?.title??'Unavailable'));head.append(title,el('span','chip','Explore and compare'));option.append(head);
 if(!d||d.error){option.append(el('p','notice danger',d?.error??'Generated activity not available'));return option;}
 if(d.moment_coverage&&!d.moment_coverage.static_markers_complete)option.append(el('p','storyboard-note','Some visual scene anchors are missing from this activity; the host narration is preserved, but scene synchronization is not verified.'));
 if(d.visual_storyboard){const story=el('details','storyboard');story.append(el('summary','','Visual story & narration design'));story.append(el('p','storyboard-text',d.visual_storyboard));story.append(el('p','storyboard-note','This is the model’s intended progression. Inspect the playable activity below to judge how faithfully it was implemented.'));option.append(story);}else option.append(el('p','storyboard-note','Historical activity: no separate visual-story outline was saved.'));
 const iframe=el('iframe');iframe.sandbox='allow-scripts';iframe.referrerPolicy='no-referrer';iframe.setAttribute('allow','');iframe.title=`Experience ${slot}`;iframe.src=d.frame_url;option.append(iframe);
 const counter=el('span','option-status','0 events · unscored');option.append(counter);
 const frame={iframe,nonce:d.frame_nonce,events:[],counter,turn_id:turn.turn_id,variant};frames.push(frame);attachTeacherNarration(option,frame,d);
 const chosen=turn.dual_experience?.selected_variant??null;
 const actionDiv=el('div','option-actions');const choice=el('button',chosen===variant?'primary choice-btn':'subtle choice-btn',chosen===variant?'Selected experience':`Choose experience ${slot}`);choice.disabled=busy||!!chosen;
 async function choose(){if(busy||chosen)return;error('');setBusy(true,'Saving your preference (free). Neither generation is being rerun.');try{const res=await api('/api/dual-choice',{method:'POST',payload:{session_id:sessionId,turn_id:turn.turn_id,variant}});data=res.session;const state=data.history.find(t=>t.turn_id===turn.turn_id);if(state)turn.dual_experience=state.dual_experience;
   wrap.querySelectorAll('.option').forEach(z=>{z.classList.toggle('selected',z.dataset.variant===variant);const btn=z.querySelector('.choice-btn');if(btn){btn.disabled=true;btn.textContent=z.dataset.variant===variant?'Selected experience':'Not selected';}});
   // Preserve iframe DOM and its event history; never rerender in-progress activities during selection.
   for(const entry of frames.filter(e=>e.turn_id===turn.turn_id))entry.iframe.dataset.chosen=entry.variant===variant?'true':'false';
   choice.parentNode?.querySelectorAll('.post-choice').forEach(z=>z.hidden=false);
   renderAuthorizationsOnly();setBusy(false,`Preference saved: Experience ${slot}. Continue within that experience or send a new message.`);
  }catch(e){setBusy(false);error(e.message);}}
 choice.onclick=choose;actionDiv.append(choice);
 const answer=el('textarea','post-choice');answer.placeholder='Optional: explain what you tried, understood or found confusing…';answer.maxLength=3500;answer.hidden=chosen!==variant;
 const submit=el('button','primary post-choice','Submit & continue');submit.hidden=chosen!==variant;
 const save=el('button','subtle post-choice','Save attempt only');save.hidden=chosen!==variant;
 async function submitAttempt(continueNext){if(busy)return;error('');const learnerAnswer=answer.value.trim();if(!frame.events.length&&!learnerAnswer){error('Interact with the activity or describe your attempt before submitting.');return;}
  setBusy(true,'Saving actual browser actions as unscored evidence.');try{const saved=await api('/api/dual-creative-attempt',{method:'POST',payload:{session_id:sessionId,turn_id:turn.turn_id,variant,events:frame.events,learner_answer:learnerAnswer,comparison_exposure:{other_variant_event_count:frames.filter(e=>e.turn_id===turn.turn_id&&e.variant!==variant).reduce((total,e)=>total+e.events.filter(z=>z.origin!=='generated_report'&&z.action!=='narration_moment_presented').length,0)}}});
   if(continueNext){status('Model A is reassessing your selected experience, then both new options will generate automatically.');startProgress();const next=await api('/api/dual-probe-continue',{method:'POST',payload:{session_id:sessionId,attempt_id:saved.result.attempt_id}});data=next.session;renderSession(data);await refreshChoices();setBusy(false,`Continued from ${saved.result.attempt_id}; both alternatives generated.`);scrollBottom(true);}
   else{data=saved.session;setBusy(false,`Saved as ${saved.result.evidence_id}. No model call was made. Your next message can continue naturally.`);}
  }catch(e){setBusy(false,'Saved attempt or continuation may require review; do not retry automatically.');error(e.message);try{data=await api('/api/session?id='+encodeURIComponent(sessionId));renderSession(data);}catch{}}
  finally{stopProgress();}}
 submit.onclick=()=>submitAttempt(true);save.onclick=()=>submitAttempt(false);actionDiv.append(answer,submit,save);option.append(actionDiv);
 if(chosen===variant)option.classList.add('selected');return option;}
function renderTurn(turn,index,total){const article=el('article','turn');const row=el('div','learner-row');row.append(el('div','learner-bubble',turn.learner_message??'[learning activity]'));article.append(row);
 const card=el('section','teacher-card');card.append(el('div','two-tone'));const h=el('div','teacher-header');h.append(el('strong','',turn.dual_experience?'Choose your learning experience':'Learning response'),el('small','',`${turn.topic_title??'Topic'} · ${turn.turn_id}`));const inspect=el('button','report-toggle','Inspect A & costs');inspect.onclick=()=>showInspector(turn);h.append(inspect);card.append(h);if(typeof turn.estimated_usd==='number'){const costLine=el('div','turn-cost',`Turn cost ${usd(turn.estimated_usd)} estimated`);card.append(costLine);}
 if(turn.dual_experience&&Object.keys(turn.creative_designs??{}).length){if(index===total-1){card.append(el('p','teacher-intro','Both approaches share one Model A assessment. Exact Model B narration lead the visual moments. Explore both before choosing; neither is automatically counted as mastered.'));const optionGrid=el('div','option-grid');const order=Number(turn.turn_id.slice(1))%2?['b_only','bx']:['bx','b_only'];order.forEach((v,i)=>optionGrid.append(cardForVariant(turn,v,i?'B':'A',optionGrid)));card.append(optionGrid);card.append(el('p','teacher-note','The unchosen experience remains a research comparison, not a completed learning attempt. Event reports are not independently scored.'));}
  else card.append(el('p','teacher-intro',`Two alternative experiences generated; ${turn.dual_experience.selected_variant?'you chose one':'no selection recorded'}. The latest turn is shown below.`));}
 else{card.append(el('p','teacher-intro',turn.teacher_response??'Historical teaching response unavailable'));const beats=(turn.B_output?.beats??[]);if(beats.length){const details=el('details');details.append(el('summary','small','View original narration and scene beats'));beats.forEach(b=>details.append(el('p','small',b.narration)));card.append(details);}}
 article.append(card);return article;}
function renderAuthorizationsOnly(){updateAuthorization();$('pendingBanner').hidden=!data?.blocked_pending;}
function renderSession(d){data=d;frames=[];$('chatHistory').replaceChildren();const hist=d.history??[];$('counts').textContent=`${d.turn_count} turns · ${d.topic_count} topics · ${d.observation_count} observations · ${d.memory_record_count} root records`;
 if(!hist.length){const empty=el('div','empty');empty.append(el('div','big','✧'));empty.append(el('p','','Ask a question to begin. Model A will assess your evidence, and both creative architectures will generate an experience.'));$('chatHistory').append(empty);}
 else hist.forEach((t,i)=>$('chatHistory').append(renderTurn(t,i,hist.length)));renderAuthorizationsOnly();}
async function refreshChoices(){const stat=await api('/api/status');csrf=stat.csrf;const sel=$('sessionSelect');const old=sel.value;sel.replaceChildren();const sessions=stat.existing_sessions??[];const known=sessions.some(s=>s.session_id===sessionId);if(!known){const option=el('option','',sessionId+' · new');option.value=sessionId;sel.append(option);}for(const x of sessions){const op=el('option','',x.session_id+` · ${x.turn_count} turns${x.pending?' · review':''}`);op.value=x.session_id;sel.append(op);}sel.value=sessionId;}
async function loadSession(id){if(!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(id))throw Error('Invalid journey name');sessionId=id;error('');status('');data=await api('/api/session?id='+encodeURIComponent(id));renderSession(data);scrollBottom(true);}
async function enableAuto(){if(busy)return;error('');const limit=Number($('sessionLimit').value),model=$('modelChoice').value;if(!(limit>=0.5&&limit<=10))return error('Use a session limit from $0.50 to $10.');const message=`Authorize automatic ROUTE, A, B-only, B-design and X calls for each learning message in ${sessionId}, until the session's $${limit.toFixed(2)} estimated request ceiling is reached? Each completed experience can trigger another dual turn when submitted. Usage is estimated, not a guaranteed provider bill. Unknown outcomes pause calls. No automatic retries.`;
 if(!window.confirm(message))return;setBusy(true,'Recording explicit session-wide authorization. No paid calls yet.');try{const res=await api('/api/auto-dual-authorize',{method:'POST',payload:{session_id:sessionId,model_a:model,model_b:model,model_x:model,limit_usd:limit,approval_phrase:'AUTHORIZE_AUTOMATIC_DUAL_CALLS'}});data=res.session;renderAuthorizationsOnly();setBusy(false,'Research budget authorized. Your next learner message starts both variants automatically.');}catch(e){setBusy(false);error(e.message);}}
async function pauseAuto(){if(busy)return;try{const res=await api('/api/auto-dual-pause',{method:'POST',payload:{session_id:sessionId}});data=res.session;renderAuthorizationsOnly();status('Automatic generation paused. Existing traces and choices remain unchanged.');}catch(e){error(e.message);}}
function startProgress(){stopProgress();progressTimer=setInterval(async()=>{if(!busy)return;try{const p=await api('/api/turn-progress?id='+encodeURIComponent(sessionId));if(p.active)status(`Working on your next two experiences · ${p.stage_label??p.phase??'generating'}`);}catch{}},1250);}
function stopProgress(){if(progressTimer)clearInterval(progressTimer);progressTimer=null;}
async function onSend(){if(busy)return;error('');const message=$('message').value.trim();if(!message)return;const auth=data?.auto_authorization;if(!auth?.enabled)return error('First authorize a bounded session research budget.');setBusy(true,'Assessing evidence and automatically generating both approaches…');detached=false;scrollBottom(true);startProgress();
 try{const res=await api('/api/dual-turn',{method:'POST',payload:{session_id:sessionId,message}});$('message').value='';data=res.session;renderSession(data);await refreshChoices();setBusy(false,`Both experiences created. Estimated charge ${usd(res.result.estimated_usd)}. Choose the one you prefer.`);scrollBottom(true);}
 catch(e){setBusy(false,'Stopped; review the saved trace. No automatic retry.');error(e.message);try{data=await api('/api/session?id='+encodeURIComponent(sessionId));renderSession(data);}catch{}}finally{stopProgress();}}
async function onExport(){if(busy)return;const response=await fetch('/api/export?id='+encodeURIComponent(sessionId),{credentials:'same-origin'});if(!response.ok){error('Export failed');return;}const blob=await response.blob();const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`MyWay_GoldLoop_${sessionId}_Export.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),2000);}
async function init(){try{const s=await api('/api/status');csrf=s.csrf;sessionId=s.default_session??sessionId;await refreshChoices();await loadSession(sessionId);
 $('sessionSelect').onchange=async e=>{await loadSession(e.target.value)};$('newSession').onclick=async()=>{const id='human_'+Math.random().toString(36).slice(2,10);await loadSession(id);await refreshChoices()};$('enableAuto').onclick=enableAuto;$('pauseAuto').onclick=pauseAuto;$('exportButton').onclick=onExport;
 $('message').oninput=()=>{$('sendButton').disabled=busy||!$('message').value.trim()||!data?.auto_authorization?.enabled};$('sendButton').onclick=onSend;$('message').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();onSend()}});
 $('inspectToggle').onclick=()=>showInspector(data?.history?.at(-1));$('closeInspector').onclick=()=>{$('inspector').hidden=true};
 }catch(e){error(e.message)}}init();
