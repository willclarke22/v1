/** S61-FIX1 bounded view of an append-only learner ledger. Candidate selection is not diagnosis. */
const copy = (x) => structuredClone(x);
export const INPUT_BUDGET_BYTES = 20500; // headroom beneath unchanged S59 25,000-byte input gate
const bytes = (v) => Buffer.byteLength(JSON.stringify(v));
function shrinkText(s, limit) { return typeof s === 'string' ? s.slice(0, limit) : s; }
export function compactObservation(o, currentId) {
  const sourceText = String(o.text ?? '');
  const text = o.id === currentId ? sourceText : shrinkText(sourceText, 1000);
  return {
    id: o.id, topic_id: o.topic_id, text,
    ...(text.length !== sourceText.length ? { excerpt_only: true, full_original_retained_in_ledger: true } : {}),
    evidence_type: o.evidence_type, task_conditions: shrinkText(o.task_conditions, 90),
    ...(o.probe ? { probe: { question: shrinkText(o.probe.question, 420), validity: o.probe.validity, accepted: o.probe.accepted } } : {}),
    source: shrinkText(o.source, 75)
  };
}
function memoryView(item) {
  const last = item.revisions?.at(-1);
  return {
    id: item.id, claim: shrinkText(item.claim, 480), status: item.status,
    contexts: (item.contexts ?? []).slice(-4),
    support_ids: (item.support_ids ?? []).slice(-5), counter_ids: (item.counter_ids ?? []).slice(-5),
    ...(last ? { latest_revision: {
      version: last.version, action: last.action, source_event_id: last.source_event_id,
      reason: shrinkText(last.reason, 350), observation_ids: (last.observation_ids ?? []).slice(-5),
      counter_ids: (last.counter_ids ?? []).slice(-5), alternatives: (last.alternatives ?? []).slice(-2).map(x=>shrinkText(x,200))
    }, historical_revision_count: item.revisions.length } : {})
  };
}
function compactDialogue(row) {
  return { learner_observation_id: row.learner_observation_id, topic_id: row.topic_id,
    learner: shrinkText(row.learner, 750), tutor: shrinkText(row.tutor, 900),
    probe_offered: shrinkText(row.probe_offered, 450) };
}
/** Never drop the current learner text or ID; remaining evidence can be re-requested. */
export function buildBoundedInput({state, current, packet, role, previousAnalysis, memoryMode='on', budget=INPUT_BUDGET_BYTES}) {
  if (!['A','B'].includes(role) || !['on','off'].includes(memoryMode)) throw Error('Bad role or memory ablation');
  const raw = packet.context;
  const all = raw.observations.map(x => compactObservation(x, current.id));
  const recentIds = new Set(state.obs.slice(-4).map(x=>x.id));
  const essential = new Set([current.id]);
  const evidence = all.filter(x=>memoryMode==='on'||role==='A'||essential.has(x.id)||recentIds.has(x.id));
  // Model B memory ablation retains *recent* dialogue, not historical personalized memory.
  const context = {
    role, observations: evidence,
    roots: memoryMode==='off'&&role==='B' ? [] : raw.roots.map(memoryView),
    relationships: memoryMode==='off'&&role==='B' ? [] : raw.relationships.map(memoryView),
    explicit_instructions: (raw.explicit_instructions??[]).slice(-3),
    topics: raw.topics?.slice(0,5).map(x=>({id:x.id??x.topic_id,title:x.title,cluster:x.cluster}))??[],
    curriculum_neighbors: raw.curriculum_neighbors?.slice(0,3)??[],
    coverage: {...raw.coverage, included_observation_ids: evidence.map(x=>x.id)}
  };
  const input = {
    research_only: true, learner_message: current.text, latest_observation_id: current.id,
    topic_id: current.topic_id, role, context,
    allowed_observation_ids: context.coverage.included_observation_ids,
    recent_dialogue: state.dialogue.slice(-3).map(compactDialogue),
    probe_conditions: current.probe ? {question:shrinkText(current.probe.question,450), validity:current.probe.validity, accepted:current.probe.accepted} : null,
    tools_available: ['request_more_context','explore_history'],
    evidence_validity: 'open_text_unscored; science/probe validity unverified',
    memory_policy: 'provisional hypotheses, never automatic mastery'
  };
  if(role==='B') {
    input.model_a_provisional_advisory = previousAnalysis && memoryMode==='on' ? {
      presenting_difficulty:shrinkText(previousAnalysis.presenting_difficulty,350),
      possible_underlying_causes:previousAnalysis.possible_underlying_causes.slice(0,1).map(x=>({claim:shrinkText(x.claim,400),support_ids:x.support_ids,counter_ids:x.counter_ids,uncertainty:x.uncertainty})),
      next_probe:previousAnalysis.next_probe,
      overall_uncertainty:previousAnalysis.overall_uncertainty
    }:null;
    input.explicit_instructions = (state.explicit_instructions??[]).slice(-3);
  }
  const initial = bytes(input);
  const dropped = [];
  // Remove least essential older observations, then oldest non-critical dialogue,
  // then historical hypotheses. Never omit current observation or alter the complete ledger.
  while (bytes(input)>budget) {
    const removable=context.observations.findIndex(x=>!essential.has(x.id) && !recentIds.has(x.id));
    if(removable>=0) { dropped.push(context.observations.splice(removable,1)[0].id); }
    else if(input.recent_dialogue.length>1) { input.recent_dialogue.shift(); }
    else if(context.roots.length>1) {context.roots.shift();}
    else if(context.relationships.length) {context.relationships.shift();}
    else if(context.curriculum_neighbors.length) {context.curriculum_neighbors.pop();}
    else if(context.topics.length>1) {context.topics.pop();}
    else { const secondary=context.observations.findIndex(x=>x.id!==current.id); if(secondary>=0) dropped.push(context.observations.splice(secondary,1)[0].id); else break; }
    context.coverage.included_observation_ids=context.observations.map(x=>x.id);
    input.allowed_observation_ids=context.coverage.included_observation_ids;
  }
  if(bytes(input)>budget)throw Error(`S61-FIX1 essential context exceeds ${budget} byte limit (actual ${bytes(input)}); complete ledger unchanged`);
  if(!context.coverage.included_observation_ids.includes(current.id))throw Error('Current observation was omitted');
  context.coverage.truncated = Boolean(context.coverage.truncated||dropped.length);
  return {input, diagnostics: {role, initial_bytes:initial, final_bytes:bytes(input), max_bytes:budget,
    original_selected_observations:all.length, included_observations:context.observations.length,
    dropped_observation_ids:dropped, complete_ledger_observations:state.obs.length,
    full_ledger_preserved:true, memory_mode:memoryMode, context_is_a_non_authoritative_view:true}};
}
export function compactCInput(data,budget=INPUT_BUDGET_BYTES) {
 const out=copy(data);
 out.historical_candidates=out.historical_candidates.slice(-4).map(memoryView);
 out.evidence=out.evidence.slice(-10).map(x=>compactObservation(x,''));
 while(bytes(out)>budget&&out.evidence.length>2)out.evidence.shift();
 out.allowed_observation_ids=out.evidence.map(x=>x.id);
 if(bytes(out)>budget)throw Error('S61-FIX1 Model C context too large');
 return out;
}
export function recordBytes(value) {return bytes(value);}
