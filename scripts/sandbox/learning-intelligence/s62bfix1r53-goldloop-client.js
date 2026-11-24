'use strict';
const $=id=>document.getElementById(id);
let csrf='',currentSession='goldpilot01_clean01',currentData=null,busy=false,selectedTurn=-1,selectedBeats={},embedOK=null,pendingHighlights={},initialSessionRead=false,chatDetached=false,programmaticScroll=false;
const numberMoney=n=>typeof n==='number'?'$'+n.toFixed(5):'unavailable';
function el(tag,klass,text){const e=document.createElement(tag);if(klass)e.className=klass;if(text!==undefined)e.textContent=String(text);return e;}
function clear(parent){parent.replaceChildren();}
function chatContainer(){return window.matchMedia('(min-width:900px)').matches?document.querySelector('main.main'):document.scrollingElement;}
function scrollToLatest({force=false,smooth=true}={}){
 const c=chatContainer();if(!c||(!force&&chatDetached))return;
 programmaticScroll=true;
 c.scrollTo({top:c.scrollHeight,behavior:smooth?'smooth':'instant'});
 if(force)chatDetached=false;
 const btn=$('jumpLatest');if(btn)btn.hidden=true;
 setTimeout(()=>{programmaticScroll=false;},550);
}
function trackChatScroll(){if(programmaticScroll)return;const c=chatContainer();if(!c)return;
 chatDetached=(c.scrollHeight-c.clientHeight-c.scrollTop)>165;
 const btn=$('jumpLatest');if(btn)btn.hidden=!chatDetached;
}
function setError(msg){$('errorNotice').hidden=!msg;$('errorNotice').textContent=msg||'';}
function setBusy(yes,note=''){busy=yes;$('sendButton').disabled=yes||!$('authorize').checked||!$('message').value.trim()||currentData?.blocked_pending;$('preflightButton').disabled=yes;$('retrievalButton').disabled=yes;$('sessionSelect').disabled=yes;$('sessionInput').disabled=yes;$('newSession').disabled=yes;for(const id of ['rootPreviewButton','rootMatchButton'])if($(id))$(id).disabled=yes;if($('rootBackfillButton'))$('rootBackfillButton').disabled=yes||!currentData?.exists||!!currentData?.blocked_pending||(currentData?.root_memory?.records??[]).length>0||(currentData?.root_memory?.backfill_history??[]).some(x=>x.version==='r45');$('busyNotice').textContent=note;}
async function api(path,{method='GET',payload}={}){const req={method,credentials:'same-origin',headers:{}};if(method==='POST'){req.headers['Content-Type']='application/json';req.headers['X-MyWay-CSRF']=csrf;req.body=JSON.stringify(payload??{});}let response;try{response=await fetch(path,req);}catch{throw Error('The local sandbox server is unavailable. Confirm the PowerShell window is still running.');}let data;try{data=await response.json();}catch{throw Error('Local sandbox returned a non-JSON result');}if(!response.ok)throw Error(data.error??'Request failed');return data;}
function makeSection(parent,title,body){const s=el('section','inspection');s.append(el('h3','',title));if(typeof body==='string')s.append(el('p','',body));else if(body){const p=el('pre');p.textContent=JSON.stringify(body,null,2);s.append(p);}parent.append(s);}
function showInspector(turn){const body=$('inspectorBody');clear(body);if(!turn){body.append(el('p','muted','Choose a completed turn to inspect the evidence and model decisions.'));return;}
 makeSection(body,'Topic routing',turn.route?`${turn.route.resolved_topic?.title??turn.topic_title} — ${turn.route.rationale??'No rationale'}`:turn.topic_title);
 makeSection(body,'MiniLM root candidates (NOT shared-root evidence)',turn.A?.root_similarity_candidates??'No stored roots or no ranking available');
 makeSection(body,'Model A learner brief',turn.A?.output?.learner_brief_for_B??turn.A_brief??'Not recorded');
 makeSection(body,'Interpretation and uncertainty',turn.A?.output?.interpretation??'Not recorded');
 makeSection(body,'Real MiniLM retrieval',turn.A?.retrieval_summary??'Not recorded');
 makeSection(body,'Proposed / applied memory changes',turn.A?.changes?.length?turn.A.changes:'No durable changes in this turn');
 makeSection(body,'Model B intent',turn.B_output?.teaching_intent??'Not recorded');
 makeSection(body,'Optional probe and actual attempts',{plan:turn.probe_plan??null,attempts:turn.probe_attempts??[],scene:turn.scene_contract??null});
 makeSection(body,'Model X visual concept and coverage',turn.X_output?{visual_concept:turn.X_output.visual_concept,continuity_plan:turn.X_output.continuity_plan,limitations:turn.X_output.limitations,coverage_report:turn.x_coverage_report??{status:'not_recorded_on_older_turn'}}:'Not recorded');
 makeSection(body,'Provider calls and estimated cost',{calls:turn.model_calls,estimated_usd:turn.estimated_usd});
}

function highlightText(node,text,segments){clear(node);let pos=0;const valid=segments.filter(s=>s.start>=0&&s.end<=text.length&&s.end>s.start).sort((a,b)=>a.start-b.start);
 for(const mark of valid){if(mark.start<pos)continue;if(mark.start>pos)node.append(document.createTextNode(text.slice(pos,mark.start)));const chip=el('mark','learner-highlight',text.slice(mark.start,mark.end));chip.title=(mark.reason??'Feedback')+(mark.note?' — '+mark.note:'');node.append(chip);pos=mark.end;}if(pos<text.length)node.append(document.createTextNode(text.slice(pos)));}
function marksFor(turn,beatId,surface){return [...(turn.feedback??[]).filter(f=>f.base_sha256===turn.active_sha256).flatMap(f=>f.selections),...(pendingHighlights[turn.turn_id]??[])].filter(s=>s.beat_id===beatId&&s.surface===surface);}
function showBeat(turn,card,i){const b=turn.B_output?.beats??[],m=turn.X_output?.moments??[];if(!b.length)return;const j=Math.min(Math.max(i,0),b.length-1);selectedBeats[turn.turn_id]=j;const beat=b[j],scene=m[j];card.querySelector('.beat-num').textContent=`BEAT ${j+1} / ${b.length}`;
 highlightText(card.querySelector('.narration'),beat.narration,marksFor(turn,beat.id,'narration'));highlightText(card.querySelector('.scene'),scene?.scene_description??'No corresponding scene saved',marksFor(turn,beat.id,'visual'));const cues=card.querySelector('.subtitle-cues');clear(cues);
 for(const c of scene?.cues??[]){const e=el('div','cue');e.append(el('q','',c.narration_quote));e.append(el('span','',c.on_screen_change));cues.append(e);}
 const dots=card.querySelector('.beat-dots');clear(dots);b.forEach((_,k)=>{const btn=el('button','beat-dot'+(k===j?' active':''),k+1);btn.title=`Beat ${k+1}`;btn.setAttribute('aria-label',`Show teaching beat ${k+1}`);btn.onclick=()=>showBeat(turn,card,k);dots.append(btn);});card.querySelector('.prev-beat').disabled=j===0;card.querySelector('.next-beat').disabled=j===b.length-1;
}
function addFeedbackSection(turn,card,teacher){const panel=el('section','highlight-panel');panel.append(el('div','section-label','REFINE THIS EXPLANATION · OPTIONAL'));
 panel.append(el('p','muted tiny','Select words in the narration or visual description above, then mark what did not work. You can mark multiple sections before saving. Feedback is not a scored understanding test.'));
 const settings=el('div','highlight-settings');const reason=el('select','highlight-reason');for(const [value,label] of [['lost','I got lost'],['bored','I got bored'],['other','Something else']]){const o=el('option','',label);o.value=value;reason.append(o);}const note=el('input','highlight-note');note.placeholder='Optional: what happened or what would you prefer?';note.maxLength=350;settings.append(reason,note);panel.append(settings);
 const controls=el('div','highlight-actions');const selected=el('button','ghost-button','Mark selected words');const whole=el('button','ghost-button','Mark entire narration beat');const wholeVisual=el('button','ghost-button','Mark entire visual moment');controls.append(selected,whole,wholeVisual);panel.append(controls);
 const draft=el('div','highlight-draft');panel.append(draft);
 function addMark(surface,start,end){const j=selectedBeats[turn.turn_id]??0,beat=turn.B_output.beats[j],txt=surface==='narration'?beat.narration:(turn.X_output.moments[j]?.scene_description??'');if(start<0||end>txt.length||end<=start||txt.slice(start,end).trim().length<3){setError('Select at least three characters of narration or visual text.');return;}const marks=pendingHighlights[turn.turn_id]??[];if(marks.length>=8){setError('Save your eight marked sections first.');return;}if([...marks,...(turn.feedback??[]).filter(f=>f.base_sha256===turn.active_sha256).flatMap(f=>f.selections)].some(x=>x.beat_id===beat.id&&x.surface===surface&&start<x.end&&end>x.start)){setError('The selected text overlaps an existing highlight.');return;}
 marks.push({beat_id:beat.id,surface,start,end,reason:reason.value,note:note.value.trim()});pendingHighlights[turn.turn_id]=marks;note.value='';setError('');showBeat(turn,teacher,j);refreshDraft();}
 selected.onclick=()=>{const sel=window.getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount){setError('Drag to select words in the narration or visual description first.');return;}const range=sel.getRangeAt(0),narr=teacher.querySelector('.narration'),visual=teacher.querySelector('.scene');let container=null,surface=null;if(narr.contains(range.startContainer)&&narr.contains(range.endContainer)){container=narr;surface='narration';}else if(visual.contains(range.startContainer)&&visual.contains(range.endContainer)){container=visual;surface='visual';}else{setError('Selection must be entirely inside the current narration or visual description.');return;}const before=range.cloneRange();before.selectNodeContents(container);before.setEnd(range.startContainer,range.startOffset);const a=before.toString().length,b=a+range.toString().length;sel.removeAllRanges();addMark(surface,a,b);};
 whole.onclick=()=>{const j=selectedBeats[turn.turn_id]??0;addMark('narration',0,turn.B_output.beats[j].narration.length);};
 wholeVisual.onclick=()=>{const j=selectedBeats[turn.turn_id]??0;addMark('visual',0,(turn.X_output.moments[j]?.scene_description??'').length);};
 function refreshDraft(){clear(draft);const marks=pendingHighlights[turn.turn_id]??[];if(!marks.length)return;draft.append(el('div','muted tiny',`${marks.length} marked section(s) — not yet saved`));for(const [idx,m] of marks.entries()){const line=el('div','highlight-item');line.append(el('span','',`${m.beat_id} · ${m.surface} · ${m.reason} · `));const t=m.surface==='narration'?turn.B_output.beats.find(b=>b.id===m.beat_id).narration:turn.X_output.moments.find(b=>b.beat_id===m.beat_id).scene_description;line.append(el('em','',t.slice(m.start,m.end).slice(0,110)));const remove=el('button','small-link','Remove');remove.onclick=()=>{marks.splice(idx,1);showBeat(turn,teacher,selectedBeats[turn.turn_id]??0);refreshDraft();};line.append(remove);draft.append(line);}
 const save=el('button','primary small-primary','Save highlighted feedback (free)');save.disabled=busy;save.onclick=async()=>{if(busy)return;setBusy(true,'Saving learner feedback locally; no API charges.');setError('');try{const r=await api('/api/feedback',{method:'POST',payload:{session_id:currentSession,turn_id:turn.turn_id,base_sha256:turn.active_sha256,selections:marks}});delete pendingHighlights[turn.turn_id];renderSession(r.session);setBusy(false,`Saved ${r.added_evidence_ids.length} user-experience observation(s) for Model A retrieval. No model calls.`);}catch(e){setBusy(false,'');setError(e.message);}};draft.append(save);}
 refreshDraft();const saved=el('div','highlight-saved');panel.append(saved);
 for(const f of (turn.feedback??[]).slice().reverse()){
  const group=el('div','highlight-saved-group');group.append(el('div','muted tiny',`${f.feedback_id} · ${f.selections.length} saved highlight(s) · ${f.created_at?.slice(0,10)??''}`));group.append(el('p','muted tiny',f.selections.map(x=>`${x.beat_id}: ${x.reason} (${x.surface})`).join(' • ')));
  const current=f.base_sha256===turn.active_sha256;const isLatest=currentData?.history?.at(-1)?.turn_id===turn.turn_id;const already=(turn.targeted_retries??[]).some(r=>r.feedback_id===f.feedback_id);
  if(current&&isLatest&&!already){const line=el('div','retry-action');const approve=el('input');approve.type='checkbox';const lab=el('label','muted tiny');lab.append(approve,document.createTextNode(' I authorize a paid targeted retry (B + X, or X only).'));const btn=el('button','ghost-button','Retry only marked section(s)');btn.onclick=async()=>{if(busy||!approve.checked){setError('Check the authorization box to approve paid retry calls.');return;}const budget=Number($('budget').value);if(!(budget>0&&budget<=10)){setError('Choose a valid retry budget in Model selection and paid-call settings.');return;}setError('');setBusy(true,'Revising only selected spans and affected storyboard moments. This makes paid API calls and never retries automatically.');try{const res=await api('/api/retry',{method:'POST',payload:{session_id:currentSession,feedback_id:f.feedback_id,model_b:$('modelB').value,model_x:$('modelX').value,budget_usd:budget,allow_spend:true}});renderSession(res.session);setBusy(false,`Targeted retry complete. ${res.result.model_calls} model call(s), estimated USD ${numberMoney(res.result.estimated_usd)}. Original paid trace unchanged.`);}catch(e){setBusy(false,'Manual review may be required. No automatic retry.');setError(e.message);try{renderSession(await api('/api/session?id='+encodeURIComponent(currentSession)));}catch{}}};line.append(lab,btn);group.append(line);}else group.append(el('div','muted tiny',already?'This feedback has an existing retry. Original record is retained.':'Saved feedback; paid retry is available only on the most recent turn and current version.'));
  const cPlan=(turn.revision_plans??[]).find(x=>x.feedback_id===f.feedback_id);
  if(cPlan){const box=el('div','c-plan');box.append(el('strong','','Model C research proposal — not a learner fact'));
    box.append(el('p','muted tiny',`Scope: ${cPlan.plan.revision_scope} · Probe: ${cPlan.plan.probe_impact} · ${cPlan.plan.reason}`));
    if(cPlan.plan.hypotheses?.length)box.append(el('p','muted tiny','Competing possibilities: '+cPlan.plan.hypotheses.map(h=>h.possibility).join(' / ')));
    box.append(el('p','muted tiny','This plan is for comparison only. It did not modify B, X, any probe or Model A memory.'));group.append(box);
  }else if(current&&isLatest&&!currentData?.blocked_pending){const cButton=el('button','ghost-button','Investigate with Model C (paid, optional)');cButton.type='button';
    cButton.onclick=async()=>{if(busy)return;const budget=Number($('budget').value);if(!(budget>=0.055&&budget<=10)){setError('Choose a sufficient budget before calling Model C.');return;}
      if(!window.confirm('Authorize ONE separate paid Model C feedback-investigation call? This will save a tentative plan only. No lesson will be changed, and nothing is added to Model A memory.'))return;
      setError('');setBusy(true,'Model C is examining saved feedback; this is a separate paid call with no automatic retry.');
      try{const r=await api('/api/revision-plan',{method:'POST',payload:{session_id:currentSession,turn_id:turn.turn_id,feedback_id:f.feedback_id,model_c:$('modelA').value,budget_usd:budget,allow_spend:true}});
        renderSession(r.session);setBusy(false,'Model C proposed a tentative revision analysis. It was not automatically applied.');
      }catch(e){setBusy(false,'C planning stopped. Review its saved trace before any retry.');setError(e.message);}
    };group.append(cButton);
  }
  saved.append(group);
 }
 teacher.append(panel);
}
function addCreativeExperience(turn,section){
 const design=turn.experience_design;
 const isLatest=currentData?.history?.at(-1)?.turn_id===turn.turn_id;
 if(!design){
  if(!isLatest||currentData?.blocked_pending)return;
  const area=el('div','creative-entry');area.append(el('strong','','Experimental X-designed interactive experience'));
  area.append(el('p','muted tiny','Optional: have Model X design a multi-step, browser-native activity from B’s educational purpose. This is an additional paid X call and does not change B’s explanation or Model A memory.'));
  const btn=el('button','ghost-button','Design creative activity with X (paid)');btn.type='button';btn.onclick=async()=>{
   if(busy)return;const budget=Number($('budget').value);if(!(budget>=0.055&&budget<=10)){setError('Select a sufficient paid budget for the separate X call.');return;}
   if(!window.confirm('Authorize ONE additional paid X design call? The result is an experimental interactive task, not a scored test or real renderer.'))return;
   setError('');setBusy(true,'Model X is designing a browser-native experiment; one paid call, no auto-retry.');
   try{const r=await api('/api/experience-plan',{method:'POST',payload:{session_id:currentSession,turn_id:turn.turn_id,model_x:$('modelX').value,budget_usd:budget,allow_spend:true}});renderSession(r.session);setBusy(false,`Experimental X design saved. Estimated ${numberMoney(r.result.estimated_usd)}; no real renderer or independent scoring.`);scrollToLatest({force:true});}
   catch(e){setBusy(false,'Interactive-design call stopped. Inspect the saved trace before retrying.');setError(e.message);}
  };area.append(btn);section.append(area);return;
 }
 const wrap=el('div','creative-entry');wrap.append(el('div','section-label','EXPERIMENTAL X ACTIVITY · B PURPOSE PRESERVED'));wrap.append(el('h3','',design.title));wrap.append(el('p','muted tiny',design.scene_description));
 wrap.append(el('p','muted tiny','Multi-step browser interaction only — no audio, physical simulation or independent grading. Responses, hints and exposure are recorded.'));
 const recorded=(turn.probe_attempts??[]).filter(a=>a.experience_design_id===turn.turn_id);
 if(recorded.length){const r=el('p','muted tiny',`${recorded.length} X-experience attempt(s) already saved. Original actions and provenance preserved.`);wrap.append(r);}
 const eligible=recorded.findLast(a=>a.continuation_eligible);
 if(eligible&&isLatest){const btn=el('button','primary','Continue learning from X activity (paid)');btn.type='button';btn.onclick=async()=>{
  if(busy)return;const budget=Number($('budget').value);if(!(budget>0&&budget<=10)){setError('Choose an adequate admission budget.');return;}
  if(!window.confirm('Authorize ONE paid A → B → X continuation from the saved X activity? No ROUTE call or automatic retry.'))return;
  setError('');setBusy(true,'Continuing from the saved X experience. Paid A/B/X calls may occur.');startThoughtBubbles(`Submitted interactive experience ${eligible.attempt_id}`,{probe:true});
  try{const r=await api('/api/probe-continue',{method:'POST',payload:{session_id:currentSession,attempt_id:eligible.attempt_id,model_a:$('modelA').value,model_b:$('modelB').value,model_x:$('modelX').value,budget_usd:budget,allow_spend:true}});
   stopThoughtBubbles();selectedTurn=-1;renderSession(r.session);await refreshSessionChoices();scrollToLatest({force:!chatDetached});setBusy(false,`X experience ${eligible.attempt_id} continued as ${r.result.turn_id}; unscored evidence preserved.`);
  }catch(e){stopThoughtBubbles();setBusy(false,'X experience continuation stopped. Do not retry without inspecting the paid trace.');setError(e.message);}
 };wrap.append(btn);section.append(wrap);return;}
 if(!isLatest){wrap.append(el('p','muted tiny','This is a historical activity. Leaving it unanswered does not block future topics.'));section.append(wrap);return;}
 const answers={},steps=design.steps;let current=0,hints=0;const events=[];
 const event=(action,detail='')=>{if(events.length<98)events.push({action:String(action).slice(0,50),detail:String(detail).slice(0,400),at:new Date().toISOString()});};
 const stage=el('div','creative-stage');wrap.append(stage);
 const actions=el('div','probe-actions'),back=el('button','ghost-button','Previous'),next=el('button','primary','Next step');back.type='button';next.type='button';
 const submit=el('button','ghost-button','Save only (free)');submit.type='button';submit.hidden=true;
 const submitPaid=el('button','primary','Submit & Continue (paid)');submitPaid.type='button';submitPaid.hidden=true;
 function draft(){const s=steps[current],a=answers[s.id]??{selection:'',response:''};
  if(s.kind==='choose'){const selected=stage.querySelector('input[type=radio]:checked');a.selection=selected?.value??a.selection;}
  else if(['predict','explain','compare'].includes(s.kind))a.response=stage.querySelector('textarea')?.value??a.response;
  answers[s.id]=a;
 }
 function validCurrent(){draft();const s=steps[current],a=answers[s.id];
  return s.kind==='reveal'||(s.kind==='choose'&&s.options.includes(a.selection))||(['predict','explain','compare'].includes(s.kind)&&a.response.trim().length>0);
 }
 function renderStage(){const s=steps[current],a=answers[s.id]??{selection:'',response:''};stage.replaceChildren();stage.append(el('div','section-label',`STEP ${current+1} / ${steps.length} · ${s.kind.toUpperCase()}`));
  stage.append(el('p','creative-context',s.context));stage.append(el('p','probe-purpose',s.challenge));
  if(s.kind==='choose'){for(const opt of s.options){const label=el('label','probe-choice'),radio=el('input');radio.type='radio';radio.name='creative_'+turn.turn_id+'_'+s.id;radio.value=opt;radio.checked=a.selection===opt;radio.onchange=()=>{a.selection=opt;answers[s.id]=a;event('choose',s.id+': '+opt);};label.append(radio,document.createTextNode(opt));stage.append(label);}}
  if(['predict','explain','compare'].includes(s.kind)){const t=el('textarea','probe-answer');t.maxLength=1200;t.rows=3;t.placeholder='Explain your reasoning in your own words…';t.value=a.response;t.onchange=()=>{a.response=t.value;answers[s.id]=a;event('response_edited',s.id+' length '+t.value.length)};stage.append(t);}
  const hint=el('button','ghost-button','Show hint');hint.type='button';hint.onclick=()=>{hints++;event('hint',s.id);const h=el('p','probe-hint',s.hint||'There is no additional hint for this step.');if(!stage.querySelector('.probe-hint'))stage.append(h);};stage.append(hint);
  back.disabled=current===0;next.hidden=current===steps.length-1;submit.hidden=current!==steps.length-1;submitPaid.hidden=current!==steps.length-1;
 }
 back.onclick=()=>{draft();current=Math.max(0,current-1);event('go_back',steps[current].id);renderStage();};
 next.onclick=()=>{if(!validCurrent()){setError('Complete the current step first, or leave the activity unanswered.');return;}current++;event('step_advanced',steps[current].id);setError('');renderStage();};
 async function saveExperience(continueAfter=false){if(busy)return;if(!validCurrent()){setError('Complete this step before submitting.');return;}
  const budget=Number($('budget').value);
  if(continueAfter&&!(budget>0&&budget<=10)){setError('Choose a valid A/B/X continuation budget first.');return;}
  if(!window.confirm(continueAfter?'Submit this X-designed activity, then authorize ONE paid A → B → X continuation? The original unscored attempt is saved first; no automatic retry.':'Save your X activity responses as unscored learner evidence (free)?'))return;
  setError('');setBusy(true,continueAfter?'Saving the activity for free, then continuing with explicitly approved A/B/X calls.':'Saving the X-designed browser interaction (free and unscored).');
  let saved;
  try{saved=await api('/api/experience-attempt',{method:'POST',payload:{session_id:currentSession,turn_id:turn.turn_id,answers,hint_count:hints,events}});}
  catch(e){setBusy(false,'X activity save may have stopped. Inspect the session before trying again.');setError(e.message);try{renderSession(await api('/api/session?id='+encodeURIComponent(currentSession)));}catch{}return;}
  if(!continueAfter){renderSession(saved.session);setBusy(false,`Saved actual learner interaction ${saved.result.evidence_id} (free). You can continue from that attempt later.`);scrollToLatest({force:true});return;}
  const attemptId=saved.result.attempt_id;
  startThoughtBubbles(`Submitted interactive experience ${attemptId}`,{probe:true});
  try{const r=await api('/api/probe-continue',{method:'POST',payload:{session_id:currentSession,attempt_id:attemptId,model_a:$('modelA').value,model_b:$('modelB').value,model_x:$('modelX').value,budget_usd:budget,allow_spend:true}});
   stopThoughtBubbles();selectedTurn=-1;renderSession(r.session);await refreshSessionChoices();scrollToLatest({force:!chatDetached});setBusy(false,`Saved X experience ${attemptId} and continued as ${r.result.turn_id}. Unscored attempt and exact actions retained.`);
  }catch(e){stopThoughtBubbles();setBusy(false,`X activity saved as ${saved.result.evidence_id}, but paid continuation stopped. Inspect the pending trace; no automatic retry.`);setError(e.message);try{renderSession(await api('/api/session?id='+encodeURIComponent(currentSession)));}catch{}}
 }
 submit.onclick=()=>saveExperience(false);submitPaid.onclick=()=>saveExperience(true);
 actions.append(back,next,submitPaid,submit);wrap.append(actions);renderStage();section.append(wrap);
}

function addProbeSection(turn,teacher){
 const p=turn.probe_plan??turn.B_output?.probe_plan;
 if(!p?.offer)return;
 const section=el('section','probe-lab');const heading=el('div','section-label','OPTIONAL PROBE · REUSABLE SCENE PLACEHOLDER');section.append(heading);
 const scene=turn.scene_contract??null;
 const summary=el('div','probe-scene-summary');summary.append(el('strong','',scene?.visual_concept??turn.X_output?.visual_concept??'Model X scene'));
 summary.append(el('p','muted tiny',`Scene: ${scene?.scene_id??'legacy text scene'} · ${scene?.scene_reuse??'untracked'} · textual storyboard only`));
 if(scene?.scene_descriptions?.length)summary.append(el('p','muted',scene.scene_descriptions.slice(0,2).join(' ').slice(0,650)));
 section.append(summary);
 section.append(el('p','probe-purpose',p.prompt));
 section.append(el('p','muted tiny',`B's purpose: ${p.purpose} · ${p.modality} · ${p.novelty} · ${p.scene_reason||'No additional scene reason'}`));
 section.append(el('p','muted tiny','This is a real browser interaction with a TEXT scene placeholder—not an executed 2D/3D simulation. You can decline. Answers and hints become evidence only after you submit.'));
 const items=p.items??[],targets=p.targets??[],choices=p.choices??[],vars=p.variables??[];
 addCreativeExperience(turn,section);
 const work=el('div','probe-workspace');const response={selection:'',ordered:[...items],matches:{},chosen:new Set(),values:Object.fromEntries(vars.map(v=>[v.key,v.initial])),answer:'',hints:0,events:[]};
 const event=(action,detail='')=>{if(response.events.length<98)response.events.push({action:String(action).slice(0,50),detail:String(detail).slice(0,400),at:new Date().toISOString()});else if(response.events.length===98)response.events.push({action:'event_limit_reached',detail:'Additional UI events omitted; final response and variable values still saved',at:new Date().toISOString()});};
 function addExplanation(prompt='Explain your thinking (optional unless this is an explanation or prediction probe)'){
  const label=el('label','probe-input-label',prompt),area=el('textarea','probe-answer');area.rows=2;area.maxLength=3500;area.placeholder='Your actual reasoning, not the answer you think MyWay expects...';area.onchange=()=>{response.answer=area.value;event('answer_edited',`length ${area.value.length}`)};label.append(area);work.append(label);
 }
 function addVariables(){if(!vars.length)return;for(const v of vars){const group=el('div','probe-variable');const top=el('div','probe-variable-head');top.append(el('label','',v.label));const number=el('span','probe-number',String(v.initial));top.append(number);group.append(top);const slider=el('input');slider.type='range';slider.min=v.min;slider.max=v.max;slider.step=v.step;slider.value=v.initial;slider.oninput=()=>{const n=Number(slider.value);response.values[v.key]=n;number.textContent=String(n)};slider.onchange=()=>event('set_variable',`${v.key}=${slider.value}`);group.append(slider);work.append(group);}const control=el('button','ghost-button','Record a what-if experiment');control.type='button';control.onclick=()=>{event('run_placeholder',JSON.stringify(response.values));log.textContent='Configuration recorded. No physical or numerical simulation was executed.';};work.append(control);}
 if(p.modality==='choice'){
  const group=el('div','probe-choices');for(const option of choices){const label=el('label','probe-choice'),radio=el('input');radio.type='radio';radio.name='probe_choice_'+turn.turn_id;radio.value=option;radio.onchange=()=>{response.selection=option;event('choose_option',option)};label.append(radio,document.createTextNode(option));group.append(label);}work.append(group);addExplanation();
 }else if(p.modality==='sequence'){
  const group=el('div','probe-sort');const rerender=()=>{clear(group);response.ordered.forEach((item,i)=>{const row=el('div','probe-sort-row');row.append(el('span','',`${i+1}. ${item}`));const up=el('button','probe-small','↑'),down=el('button','probe-small','↓');up.type='button';down.type='button';up.disabled=i===0;down.disabled=i===response.ordered.length-1;const move=d=>{const j=i+d;[response.ordered[i],response.ordered[j]]=[response.ordered[j],response.ordered[i]];event('reorder',`${item} to position ${j+1}`);rerender();};up.onclick=()=>move(-1);down.onclick=()=>move(1);row.append(up,down);group.append(row)});};rerender();work.append(group);addExplanation();
 }else if(p.modality==='match'){
  for(const item of items){const row=el('div','probe-match');row.append(el('label','',item));const select=el('select');select.append(el('option','','Choose a match'));for(const target of targets){const o=el('option','',target);o.value=target;select.append(o);}select.onchange=()=>{response.matches[item]=select.value;event('match',`${item} -> ${select.value}`)};row.append(select);work.append(row);}addExplanation();
 }else if(p.modality==='construct'){
  const set=el('div','probe-choices');for(const item of items){const label=el('label','probe-choice'),c=el('input');c.type='checkbox';c.onchange=()=>{if(c.checked)response.chosen.add(item);else response.chosen.delete(item);event('toggle_component',`${item}: ${c.checked}`)};label.append(c,document.createTextNode(item));set.append(label);}work.append(set);addExplanation('Why did you choose those components?');
 }else {addVariables();addExplanation(p.modality==='prediction'?'Your prediction and why you expect it':'Your reasoning or explanation');}
 const log=el('p','muted tiny','Your actions will be saved only when you submit. No automatic scoring.');work.append(log);
 const hint=el('button','ghost-button','Show a hint');hint.type='button';hint.onclick=()=>{if(response.hints>=20)return;response.hints++;event('hint_requested',String(response.hints));hintText.hidden=false;hint.textContent=`Hint shown · ${response.hints} request(s)`;};
 const hintText=el('p','probe-hint',p.hint||'Try reasoning from the original explanation. There is no additional hint for this activity.');hintText.hidden=true;work.append(hint,hintText);
 const existing=turn.probe_attempts??[];if(existing.length){const history=el('div','probe-prior');history.append(el('strong','',`${existing.length} saved attempt(s)`));for(const a of existing.slice(-3))history.append(el('p','muted tiny',`${a.attempt_id}: ${a.status} · ${a.hints_requested} hint(s) · unscored`));work.append(history);}
 const eligible=(existing??[]).findLast(a=>a.continuation_eligible);
 if(eligible){
  const resume=el('div','probe-prior');
  resume.append(el('strong','','Continue learning from your saved probe'));
  resume.append(el('p','muted tiny',`${eligible.attempt_id} was saved. Model A can now assess this attempt, and B/X can continue the same topic without another chat message. Your original response will remain unchanged.`));
  const btn=el('button','primary','Continue from saved attempt (paid)');btn.type='button';
  btn.onclick=async()=>{
   if(busy)return;
   if(!window.confirm('Authorize ONE paid A → B → X continuation using this saved probe? No automatic retry will occur.'))return;
   const budget=Number($('budget').value);
   if(!(budget>0&&budget<=10)){setError('Set a valid per-turn budget between $0 and $10 in model settings.');return;}
   setError('');setBusy(true,'Continuing from the original saved probe. Paid A/B/X calls may occur; no ROUTE call. Never auto-retry a failed call.');
   startThoughtBubbles(`Submitted probe ${eligible.attempt_id}: ${eligible.learner_answer||eligible.selection||eligible.modality}`,{probe:true});
   try{
    const data=await api('/api/probe-continue',{method:'POST',payload:{session_id:currentSession,attempt_id:eligible.attempt_id,model_a:$('modelA').value,model_b:$('modelB').value,model_x:$('modelX').value,budget_usd:budget,allow_spend:true}});
    stopThoughtBubbles();selectedTurn=-1;renderSession(data.session);await refreshSessionChoices();scrollToLatest({force:!chatDetached});setBusy(false,`Probe continuation complete: ${eligible.attempt_id} → ${data.result.turn_id}. Roles: ${data.result.model_calls.join(', ')}; estimated ${numberMoney(data.result.estimated_usd)}. No new probe correctness score was fabricated.`);
   }catch(e){stopThoughtBubbles();setBusy(false,'Probe continuation stopped. Inspect the original saved attempt and pending trace; no automatic retry.');setError(e.message);try{renderSession(await api('/api/session?id='+encodeURIComponent(currentSession)));}catch{}}
  };
  resume.append(btn);work.append(resume);
 }else if(existing.some(a=>a.continuation_turn_id)){
  const completed=existing.filter(a=>a.continuation_turn_id).at(-1);
  work.append(el('p','muted tiny',`${completed.attempt_id} already continued as ${completed.continuation_turn_id}. No duplicate paid continuation allowed.`));
 }else if(existing.some(a=>a.continuation_reserved)){
  work.append(el('p','muted tiny','A probe continuation was reserved; inspect the paid trace. Never retry this attempt automatically.'));
 }
 const controls=el('div','probe-actions'),submit=el('button','ghost-button','Save only (free)'),skip=el('button','ghost-button','Skip (free)');
 submit.type='button';skip.type='button';
 const canOfferPaid=currentData?.history?.at(-1)?.turn_id===turn.turn_id&&!currentData?.blocked_pending;
 if(canOfferPaid){const saveAndGo=el('button','primary','Submit & Continue (paid)');saveAndGo.type='button';saveAndGo.onclick=()=>save('submitted',true);controls.append(saveAndGo);}
 async function save(status,continueAfter=false){
  if(busy)return;
  setError('');
  const payload={session_id:currentSession,turn_id:turn.turn_id,status,learner_answer:response.answer,selection:response.selection,ordered_items:response.ordered,matches:response.matches,selected_items:[...response.chosen],values:response.values,hint_count:response.hints,events:response.events};
  if(status==='submitted'&&['prediction','explain'].includes(p.modality)&&!payload.learner_answer.trim()){setError('Please enter your prediction or reasoning before saving, or choose Skip.');return;}
  const budget=Number($('budget').value);
  if(continueAfter&&!(budget>0&&budget<=10)){setError('Choose a valid per-turn admission budget to continue.');return;}
  if(continueAfter&&!window.confirm('Submit this probe, then authorize ONE paid A → B → X continuation? Your attempt will be saved first, even if the paid turn fails.'))return;
  setBusy(true,continueAfter?'Saving the probe (free), then continuing with your explicitly approved paid A/B/X calls.':'Saving probe evidence locally, without model calls or scoring.');
  let saved;
  try{saved=await api('/api/probe-attempt',{method:'POST',payload});}
  catch(e){setBusy(false,'Probe save may have stopped. Inspect the session before submitting again.');setError(e.message);try{renderSession(await api('/api/session?id='+encodeURIComponent(currentSession)));}catch{}return;}
  if(!continueAfter){renderSession(saved.session);scrollToLatest({force:!chatDetached});setBusy(false,`${status==='skipped'?'Skip':'Attempt'} saved as ${saved.result.evidence_id}. ${status==='skipped'?'A skip is not failure.':'You can also approve a paid continuation under this saved probe.'}`);return;}
  const attemptId=saved.result.attempt_id;
  startThoughtBubbles(`Submitted probe ${attemptId}: ${response.answer||response.selection||p.modality}`,{probe:true});
  try{
   const data=await api('/api/probe-continue',{method:'POST',payload:{session_id:currentSession,attempt_id:attemptId,model_a:$('modelA').value,model_b:$('modelB').value,model_x:$('modelX').value,budget_usd:budget,allow_spend:true}});
   stopThoughtBubbles();selectedTurn=-1;renderSession(data.session);await refreshSessionChoices();scrollToLatest({force:!chatDetached});setBusy(false,`Probe saved and continued as ${data.result.turn_id}. Model calls: ${data.result.model_calls.join(', ')}; estimated ${numberMoney(data.result.estimated_usd)}. The original attempt remains unscored.`);
  }catch(e){stopThoughtBubbles();setBusy(false,`The probe was saved as ${saved.result.evidence_id}, but paid continuation stopped. Review any pending trace; no automatic retry.`);setError(e.message);try{renderSession(await api('/api/session?id='+encodeURIComponent(currentSession)));}catch{}}
 }
 submit.onclick=()=>save('submitted',false);skip.onclick=()=>save('skipped',false);controls.append(submit,skip);work.append(controls);if(turn.experience_design){const legacy=el('details','legacy-probe');legacy.append(el('summary','','Use original fixed-template probe instead'));legacy.append(work);section.append(legacy);}else section.append(work);teacher.append(section);
}
function renderTurn(turn,index){const card=el('article','turn');card.append(el('div','learner-bubble',turn.learner_message));if(turn.input_kind==='submitted_probe_attempt')card.append(el('p','muted tiny',`Probe-origin turn · ${turn.continuation_source?.attempt_id??'unknown attempt'} · actual learner actions preserved in source record`));const teacher=el('section','teacher-card');teacher.append(el('div','beam'));const hdr=el('div','teacher-top');hdr.append(el('div','role-label','MODEL B + MODEL X'));hdr.append(el('span','',turn.topic_title??'Untitled topic'));const inspect=el('button','inspect-btn','Inspect A / retrieval');inspect.onclick=()=>{selectedTurn=index;showInspector(turn);$('inspectorBody').scrollTo({top:0,behavior:'smooth'});};hdr.append(inspect);teacher.append(hdr);
 const grid=el('div','beat-grid');const narration=el('div','narration-panel'),scene=el('div','scene-panel');narration.append(el('div','section-label','WHAT YOU HEAR · MODEL B'));narration.append(el('div','narration'));scene.append(el('div','section-label','WHAT WOULD BE ON SCREEN · MODEL X'));scene.append(el('div','scene'));scene.append(el('div','subtitle-cues'));grid.append(narration,scene);teacher.append(grid);
 const tool=el('div','beat-toolbar');tool.append(el('span','beat-num',''));const dots=el('div','beat-dots');tool.append(dots);const arrows=el('div','beat-arrows'),prev=el('button','prev-beat','← Previous'),next=el('button','next-beat','Next →');prev.onclick=()=>showBeat(turn,teacher,(selectedBeats[turn.turn_id]??0)-1);next.onclick=()=>showBeat(turn,teacher,(selectedBeats[turn.turn_id]??0)+1);arrows.append(prev,next);tool.append(arrows);teacher.append(tool);addFeedbackSection(turn,card,teacher);addProbeSection(turn,teacher);card.append(teacher);
 const note=el('div','turn-note');note.append(el('span','tag',`Turn ${turn.turn_id} · ${turn.B_output?.beats?.length??0} narration beats`));note.append(el('span','',`Textual scenes only · ${(turn.targeted_retries??[]).length} targeted retry/retries`));card.append(note);if(turn.B_output?.beats?.length)showBeat(turn,teacher,selectedBeats[turn.turn_id]??0);return card;}
function renderSession(data){currentData=data;renderRoots(data);clear($('turns'));$('turnCount').textContent=data.turn_count;$('topicCount').textContent=data.topic_count;$('obsCount').textContent=data.observation_count;$('memoryCount').textContent=data.memory_record_count;
 $('historyNote').textContent=data.turn_count?`Resumed session ${data.session_id}; earlier learner turns remain in local history and can be retrieved by MiniLM.`:'New learner state: zero completed turns, no preloaded profile or gold-run answers.';
 $('pendingBanner').hidden=!data.blocked_pending;const hist=data.history??[];if(!hist.length){const empty=el('div','empty-view');empty.append(el('div','orbit','◎'));empty.append(el('h2','','A fresh learner, a fresh question.'));empty.append(el('p','','No invented history. Ask naturally and let the session accumulate observations, assessment and experience data.'));$('turns').append(empty);}else{for(let i=0;i<hist.length;i++)$('turns').append(renderTurn(hist[i],i));}
 showInspector(hist.at(selectedTurn>=0&&selectedTurn<hist.length?selectedTurn:-1)??null);refreshSend();}
function renderRoots(data){
 const memory=data?.root_memory??{records:[],backfill_history:[]},records=memory.records??[];
 $('rootCount').textContent=records.filter(r=>r.type==='root').length;
 $('sharedCount').textContent=records.filter(r=>r.type==='shared_root').length;
 const box=$('rootRecords');clear(box);
 const done=(memory.backfill_history??[]).some(r=>r.version==='r45')||records.length>0;
 $('rootAuthorize').disabled=!!done||!!data.blocked_pending;$('rootBackfillButton').disabled=!!done||!!data.blocked_pending||busy||!data.exists;
 if(!records.length){box.append(el('p','muted tiny',done?'Backfill recorded no sufficiently grounded roots. That is a valid result.':'No durable root hypothesis yet. Preview the original A reasoning before approving a backfill.'));}
 else for(const r of records){const card=el('div','root-card');card.append(el('strong','',`${r.id} · ${r.type==='shared_root'?'Potential shared root':'Topic root'} · ${r.status}`));card.append(el('p','',r.claim));card.append(el('p','muted',`Uncertainty: ${r.uncertainty} · Topics: ${(r.topics??[]).join(', ')}`));card.append(el('p','muted',`Supporting evidence IDs: ${(r.evidence?.supports_current??[]).join(', ')||'none'} · Contradictions: ${(r.evidence?.challenges_current??[]).join(', ')||'none'}`));if(r.type==='shared_root')card.append(el('p','muted','Compared candidate roots: '+(r.possible_instances??[]).join(', ')));if(r.backfill_provenance?.alternatives?.length)card.append(el('p','muted','Backfill alternatives (historical): '+r.backfill_provenance.alternatives.join(' / ')));card.append(el('p','muted',`Revisions: ${r.revisions?.length??0}. Hypothesis, not verified fact.`));box.append(card);}
}
async function onRootPreview(){if(busy)return;setError('');const target=$('rootPreviewResults');clear(target);try{if(!currentData?.exists)throw Error('Complete a turn before previewing history.');const res=await api('/api/roots?id='+encodeURIComponent(currentSession));target.append(el('p','root-note',`Original Model A assessments available: ${res.preview.available_prior_A_assessments}; source observations: ${res.preview.observation_count}. These are NOT yet verified roots.`));for(const item of res.preview.original_hypotheses??[]){const card=el('div','root-card');card.append(el('strong','',item.turn_id+' · '+item.topic_id));for(const h of item.hypotheses.slice(0,5))card.append(el('p','',h));target.append(card);}if(!res.preview.original_hypotheses?.length)target.append(el('p','muted tiny','No historical A interpretation found.'));}catch(e){setError(e.message);}}
async function onRootMatch(){if(busy)return;setError('');const target=$('rootMatchResults');clear(target);const q=$('rootMatchQuery').value.trim();if(!q){setError('Enter a question for the root comparison.');return;}setBusy(true,'Ranking existing provisional root descriptions with real local MiniLM; no model calls or state changes.');try{const r=await api('/api/root-match',{method:'POST',payload:{session_id:currentSession,query:q}});target.append(el('p','root-note','Semantic similarity is candidate discovery, not evidence of a common learning difficulty.'));for(const cand of r.candidates){const card=el('div','root-card');card.append(el('strong','',cand.id+' · cosine '+cand.cosine_score));card.append(el('p','',cand.claim));target.append(card);}if(!r.candidates.length)target.append(el('p','muted tiny','No stored roots to compare yet.'));setBusy(false,'MiniLM root comparison finished; nothing was written.');}catch(e){setBusy(false,'');setError(e.message);}}
async function onRootBackfill(){if(busy)return;setError('');if(!currentData?.exists||currentData?.blocked_pending){setError('Complete a learner turn and resolve any pending paid operations first.');return;}if(!$('rootAuthorize').checked){setError('Please explicitly approve the one-time paid Model A backfill.');return;}const budget=Number($('budget').value);if(!(budget>0&&budget<=10)){setError('Backfill budget must be $0–$10 USD.');return;}
 setBusy(true,'ONE retrospective Model A API call. A no-retry trace is reserved before billing. Existing turns remain unchanged.');try{const result=await api('/api/root-backfill',{method:'POST',payload:{session_id:currentSession,model_a:$('modelA').value,budget_usd:budget,allow_spend:true}});$('rootAuthorize').checked=false;renderSession(result.session);setBusy(false,`Backfill complete: ${result.result.root_count} provisional root(s), ${result.result.shared_root_candidate_count} shared candidate(s); estimated ${numberMoney(result.result.estimated_usd)} USD. Review the root inspector.`);}catch(e){setBusy(false,'Backfill stopped; inspect pending trace before any paid retry.');setError(e.message);try{renderSession(await api('/api/session?id='+encodeURIComponent(currentSession)));}catch{}}}

function refreshSend(){$('sendButton').disabled=busy||!$('authorize').checked||!$('message').value.trim()||!!currentData?.blocked_pending;}
async function loadSession(id){if(!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(id)){setError('Session ID must start with a letter and use only letters, digits, underscores or hyphens.');return;}currentSession=id;$('sessionInput').value=id;selectedBeats={};pendingHighlights={};selectedTurn=-1;try{const data=await api('/api/session?id='+encodeURIComponent(id));renderSession(data);setError('');scrollToLatest({force:true,smooth:false});}catch(e){setError(e.message);}}
async function refreshSessionChoices(){const s=await api('/api/status');csrf=s.csrf;if(!initialSessionRead){currentSession=s.default_session||currentSession;initialSessionRead=true;}const select=$('sessionSelect');clear(select);const items=s.existing_sessions??[];for(const item of items){const option=el('option','',`${item.session_id} · ${item.turn_count} turn${item.turn_count===1?'':'s'}${item.pending?' · PENDING':''}`);option.value=item.session_id;select.append(option);}if(!items.some(i=>i.session_id===currentSession)){const option=el('option','',currentSession+' · new');option.value=currentSession;select.prepend(option);}select.value=currentSession;}
async function onExport(){
 if(!currentSession||busy)return;
 setError('');const btn=$('exportButton');btn.disabled=true;const prior=$('busyNotice').textContent;
 $('busyNotice').textContent='Preparing a local, read-only session ZIP. No model or embedding calls.';
 try{
  const r=await fetch('/api/export?id='+encodeURIComponent(currentSession),{credentials:'same-origin',cache:'no-store'});
  if(!r.ok){let error='Export failed';try{const data=await r.json();error=data.error??error;}catch{}throw Error(error);}
  const archive=await r.blob();if(!archive.size)throw Error('Export returned an empty file');
  const downloadUrl=URL.createObjectURL(archive),a=document.createElement('a');
  a.href=downloadUrl;a.download='MyWay_GoldLoop_'+currentSession+'_Export.zip';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(downloadUrl),60000);
  $('busyNotice').textContent='Downloaded session ZIP. Please review learner messages and model records before uploading it.';
 }catch(e){setError(e.message);$('busyNotice').textContent=prior;}finally{btn.disabled=busy;}
}
async function onPreflight(){if(busy)return;setError('');setBusy(true,'Checking localhost MiniLM; no paid model calls.');try{const v=await api('/api/preflight',{method:'POST',payload:{}});embedOK=v.local_minilm_ok;$('embedBadge').textContent=`MiniLM: connected · ${v.vector_dimension} dimensions`;$('embedBadge').style.color='#99d6ff';setBusy(false,'Real local embedding service responded. This does not yet verify retrieval relevance.');}catch(e){embedOK=false;$('embedBadge').textContent='MiniLM: offline / failed';setBusy(false,'');setError(e.message);}}
async function onRetrieval(){if(busy)return;setError('');const q=$('retrievalQuery').value.trim();if(!q){setError('Enter a question to test retrieval.');return;}if(!currentData?.turn_count){setError('First complete at least one learner turn; there is no history to retrieve yet.');return;}setBusy(true,'Running real local MiniLM retrieval. No paid model calls.');try{const r=await api('/api/retrieval-check',{method:'POST',payload:{session_id:currentSession,query:q}});const dst=$('retrievalResults');clear(dst);dst.append(el('div','muted tiny',`${r.selected_evidence?.length??0} selected historical observations; ${r.omitted_evidence_ids?.length??0} omitted. Similarity ≠ proven relevance.`));for(const item of r.selected_evidence??[]){const card=el('div','mini-result');card.append(el('strong','',item.id+' · '+item.topic_id));card.append(el('p','',item.source_excerpt??''));dst.append(card);}if(!r.selected_evidence?.length)dst.append(el('p','', 'No historical evidence selected for this query.'));setBusy(false,'Retrieval check complete.');}catch(e){setBusy(false,'');setError(e.message);}}
// R5.1 thought bubbles: UI summaries of actual checkpoint statuses, never model chain-of-thought.
let thoughtTurn=null,thoughtTimer=null,thoughtFetching=false;
const THOUGHT_ROLES=[
 ['ROUTE','Finding your topic','Choosing whether this continues an earlier topic'],
 ['A','Understanding your question','Reviewing available learner evidence'],
 ['B','Building an explanation','Selecting teaching steps and helpful examples'],
 ['X','Imagining the scene','Aligning storyboard moments to the teaching beats']
];
function startThoughtBubbles(message,{probe=false}={}){
 stopThoughtBubbles();
 const card=el('article','turn thinking-turn');
 card.append(el('div','learner-bubble',message));
 const panel=el('section','thought-panel');panel.setAttribute('aria-label','Live model progress');
 const header=el('div','thought-head');header.append(el('span','thought-spark','✦'),el('strong','','MyWay is working on this…'));
 const details=el('p','thought-status','Preparing the turn');details.setAttribute('aria-live','polite');
 panel.append(header,details);
 const grid=el('div','thought-grid');
 for(const [role,label,sub] of THOUGHT_ROLES){
  const box=el('div','thought-step is-queued');box.dataset.role=role;
  const orb=el('span','thought-orb');orb.setAttribute('aria-hidden','true');orb.append(el('i'),el('i'),el('i'));
  const words=el('span','thought-words');words.append(el('strong','',label),el('small','',sub));
  if(probe&&role==='ROUTE'){words.querySelector('strong').textContent='Using the probe topic';words.querySelector('small').textContent='Already known; routing call skipped';box.classList.remove('is-queued');box.classList.add('is-done');}
  box.append(orb,words);grid.append(box);
 }
 panel.append(grid,el('p','thought-disclaimer','These are live workflow statuses, not private model thoughts. Only text scenes are being designed.'));
 card.append(panel);$('turns').append(card);thoughtTurn=card;
 scrollToLatest({force:true});
 thoughtTimer=setInterval(pollThoughtBubbles,1100);
 pollThoughtBubbles();
}
async function pollThoughtBubbles(){
 if(!thoughtTurn||thoughtFetching)return;
 thoughtFetching=true;
 try{
  const p=await api('/api/turn-progress?id='+encodeURIComponent(currentSession));
  if(!thoughtTurn||!p.active)return;
  const title=thoughtTurn.querySelector('.thought-status');
  if(title&&title.textContent!==p.stage_label)title.textContent=p.stage_label||'Processing your question';
  for(const role of ['ROUTE','A','B','X']){
   const item=thoughtTurn.querySelector('[data-role="'+role+'"]');
   const state=p.roles?.[role];
   if(!item||!['queued','running','done'].includes(state))continue;
   item.classList.toggle('is-queued',state==='queued');item.classList.toggle('is-running',state==='running');item.classList.toggle('is-done',state==='done');
  }
 }catch{
  // A transient progress failure must never trigger a paid retry or interrupt the turn.
 }finally{thoughtFetching=false;}
}
function stopThoughtBubbles(){
 if(thoughtTimer!==null){clearInterval(thoughtTimer);thoughtTimer=null;}
 thoughtTurn?.remove();thoughtTurn=null;
}

async function onSend(){if(busy)return;setError('');const msg=$('message').value.trim(),budget=Number($('budget').value);if(!msg||msg.length>4000||!$('authorize').checked){setError('Enter a learner message and explicitly authorize paid calls for this turn.');return;}if(!(budget>0&&budget<=10)){setError('Budget must be greater than $0 and no more than $10.');return;}
 setBusy(true,'Running independent topic routing, Model A assessment, B teaching and X storyboard calls. This turn may incur API charges. Please keep the local server running.');startThoughtBubbles(msg);try{const data=await api('/api/turn',{method:'POST',payload:{session_id:currentSession,message:msg,model_a:$('modelA').value,model_b:$('modelB').value,model_x:$('modelX').value,budget_usd:budget,allow_spend:true}});$('authorize').checked=false;$('message').value='';$('charCount').textContent='0 / 4000';selectedTurn=-1;stopThoughtBubbles();renderSession(data.session);await refreshSessionChoices();setBusy(false,`Turn complete. Estimated model usage: ${numberMoney(data.result?.estimated_usd)}. Current history saved locally.`);scrollToLatest({force:!chatDetached});}catch(e){stopThoughtBubbles();setBusy(false,'An error occurred. No automatic retry was attempted. Check for pending paid turns before continuing.');setError(e.message);try{const state=await api('/api/session?id='+encodeURIComponent(currentSession));renderSession(state);}catch{}}}
async function init(){try{const main=document.querySelector('main.main');if(main)main.addEventListener('scroll',trackChatScroll,{passive:true});window.addEventListener('scroll',trackChatScroll,{passive:true});if($('jumpLatest'))$('jumpLatest').onclick=()=>scrollToLatest({force:true});await refreshSessionChoices();await loadSession(currentSession);$('sessionSelect').addEventListener('change',e=>loadSession(e.target.value));$('sessionInput').addEventListener('change',e=>loadSession(e.target.value.trim()));$('newSession').addEventListener('click',async()=>{const x='human_'+Math.random().toString(36).slice(2,9);currentSession=x;await refreshSessionChoices();await loadSession(x);});$('message').addEventListener('input',()=>{$('charCount').textContent=`${$('message').value.length} / 4000`;refreshSend();});$('authorize').addEventListener('change',refreshSend);$('sendButton').addEventListener('click',onSend);$('preflightButton').addEventListener('click',onPreflight);$('retrievalButton').addEventListener('click',onRetrieval);$('exportButton').addEventListener('click',onExport);$('rootPreviewButton').addEventListener('click',onRootPreview);$('rootMatchButton').addEventListener('click',onRootMatch);$('rootBackfillButton').addEventListener('click',onRootBackfill);}catch(e){setError(e.message);}}
init();
