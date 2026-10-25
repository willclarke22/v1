"use client";

import { useState } from "react";
import styles from "./learning-decision-inspector.module.css";
import type { TeachingInput, TeachingPlan } from "./learning-plan";
import type { VisualHandoff } from "./visual-handoff";

type Candidate = { label: string; similarity: number };
type Difficulty = Candidate & { rootProblem: string };
type Connected = {
  subjects: Candidate[]; difficulties: Difficulty[]; backend: "wasm" | "webgpu";
  model: string; dimensions: number; referenceCount: number; totalMs: number;
  reusedReferences: boolean; referencesMs: number; queryMs: number;
};
type AttemptView = {
  id: number; provider: "edge" | "openai"; teachingProvider: "edge" | "openai";
  state: string; workflowStage?: string; resolution?: string; modelName?: string;
  assessment?: { topic_name: string; root_problem: string; evidence_quote: string; root_problem_confidence: number };
  connected?: Connected; connectedError?: string;
  teachingStage?: string; teaching?: TeachingPlan; teachingInput?: TeachingInput;
  teachingError?: string; teachingModel?: string; teachingMs?: number; handoff?: VisualHandoff; handoffError?: string;
  timing?: { totalMs: number }; workflowTotalMs?: number; warnings?: string[];
  systemPromptUsed?: string; responseSchemaUsed?: Record<string, unknown>; promptInput?: string;
  raw?: string; teachingRaw?: string;
};
type Tab = "relationships" | "personalization" | "handoff" | "trace";
const CANDIDATE_MIN = 0.50;
const fmt = (value?: number) => value === undefined ? "—" : value.toFixed(3);
const ms = (value?: number) => value === undefined ? "—" : `${Math.round(value).toLocaleString()} ms`;

export function LearningDecisionInspector({attempt,backend,connectedStatus}:{attempt:AttemptView | null;backend:"wasm"|"webgpu";connectedStatus:string}) {
  const [tab,setTab] = useState<Tab>("relationships");
  const [fullDetail,setFullDetail] = useState(false);
  const selectTab = (next:Tab) => {setTab(next);setFullDetail(false)};
  const connected=attempt?.connected;
  const plan=attempt?.teaching;
  const profile=attempt?.teachingInput?.profile;
  const candidates=attempt?.teachingInput?.candidate_relationships??[];
  const showRankings=Boolean(connected?.difficulties.length);
  return <section className={styles.inspector} aria-label="MyWay Decision Inspector">
    <header className={styles.header}>
      <div><h2>Decision Inspector</h2><p>Evidence, choices and stage diagnostics</p></div>
      <span>READ-ONLY</span>
    </header>
    <nav className={styles.tabs} aria-label="Inspector sections">
      {(["relationships","personalization","handoff","trace"] as const).map(next=><button type="button" key={next} onClick={()=>selectTab(next)} className={tab===next?styles.active:""} aria-pressed={tab===next}>{next==="handoff"?"Handoff":next==="trace"?"Trace":next.charAt(0).toUpperCase()+next.slice(1)}</button>)}
    </nav>
    {!attempt ? <div className={styles.empty}>Submit a learner message to inspect the actual relationship rankings, personalization decisions, and model handoff. No fabricated demo state is shown here.</div> : <>
    {tab==="relationships" && <div className={styles.content}>
      <div className={styles.line}><strong>Relationship discovery</strong><span className={styles.status}>PROVISIONAL</span></div>
      <p>Similarity means potential relevance, not shared understanding or proof of a misconception.</p>
      <div className={styles.metrics}><span>Source</span><b>50 mock-topic MiniLM index</b><span>Embedding backend</span><b>{connected?.backend.toUpperCase()??backend.toUpperCase()} · {connected?.dimensions??384}-D</b><span>Candidate rule</span><b>Difficulty similarity ≥ {CANDIDATE_MIN.toFixed(2)} and nonempty description</b></div>
      {connected ? <>
        <h3>Learning-difficulty matches</h3>
        {showRankings ? connected.difficulties.slice(0,fullDetail?connected.difficulties.length:5).map((d,i)=>{
          const passed=d.similarity>=CANDIDATE_MIN && !!d.rootProblem.trim() && i<2;
          return <div key={`${d.label}-${i}`} className={styles.match}>
            <div className={styles.line}><strong>{d.label}</strong><span>{fmt(d.similarity)}</span></div>
            <div className={styles.bar}><div style={{width:`${Math.max(0,Math.min(100,d.similarity*100))}%`}}/></div>
            <p>{d.rootProblem}</p><small>{passed?"Eligible for provisional candidate (not verified)":d.similarity<CANDIDATE_MIN?`Not promoted: below ${CANDIDATE_MIN.toFixed(2)} threshold`:!d.rootProblem.trim()?"Not promoted: no described difficulty":"Not promoted: top-two candidate limit"}</small>
          </div>;
        }) : <p>Withheld: no grounded root problem was available for difficulty retrieval.</p>}
        <h3>Subject similarity</h3>
        {connected.subjects.slice(0,fullDetail?connected.subjects.length:3).map((s,i)=><div key={`${s.label}-${i}`} className={styles.line}><span>{s.label}</span><strong>{fmt(s.similarity)}</strong></div>)}
        <div className={styles.result}>{candidates.length ? `${candidates.length} provisional relationship candidate(s).` : "No cross-topic difficulty candidate qualified."}</div>
        <button type="button" className={styles.action} onClick={()=>setFullDetail(!fullDetail)}>{fullDetail?"Show fewer matches":"Show all rankings"}</button>
      </> : <p>{attempt.connectedError ? `Retrieval unavailable: ${attempt.connectedError}` : attempt.state==="running"?`Retrieval pending · ${connectedStatus}`:"No retrieval result for this turn."}</p>}
    </div>}
    {tab==="personalization" && <div className={styles.content}>
      <h3>Input provenance</h3>
      <div className={styles.metrics}><span>Stated interests</span><b>{profile?.interests.length?profile.interests.join(", "):"None provided"}</b><span>Preferred starting approach</span><b>{profile?.preferred_style??"Not captured yet"}</b><span>Optional goal</span><b>{profile?.goal||"None provided"}</b><span>Observed preferences</span><b>Not measured</b><span>Demonstrated teaching effectiveness</span><b>Not measured</b></div>
      <h3>Model B decision</h3>
      {plan ? <>
        <div className={styles.result}>{plan.use_interest==="do_not_use"?"Do not use interests":plan.use_interest==="light_tone"?`Light use: ${plan.chosen_interest}`:`Structural bridge: ${plan.chosen_interest}`}</div>
        <p><strong>Model's rationale:</strong> {plan.reason}</p>
        <p className={styles.caution}>This is a model-generated justification, not evidence that the personalization improved learning.</p>
        <details><summary>Exact profile and planner input</summary><pre>{JSON.stringify(attempt.teachingInput,null,2)}</pre></details>
      </>:<p>{attempt.teachingError?`Planner failed: ${attempt.teachingError}`:attempt.teachingStage==="skipped"?"Teaching was intentionally skipped while clarification or grounding is unresolved.":"No teaching decision recorded yet."}</p>}
    </div>}
    {tab==="handoff" && <div className={styles.content}>
      <h3>Validated visual handoff</h3>
      {attempt.handoff ? <>
        <div className={styles.metrics}><span>Schema</span><b>{attempt.handoff.schema_version}</b><span>Topic</span><b>{attempt.handoff.topic}</b><span>Root problem</span><b>{attempt.handoff.root_problem}</b><span>Evidence</span><b>{attempt.handoff.learner_evidence}</b><span>Teaching strategy</span><b>{attempt.handoff.teaching_strategy}</b><span>Visual intent</span><b>{attempt.handoff.visual_intent}</b></div>
        <p className={styles.caution}>Model C not called. Handoff preserves upstream decisions; no scene has been rendered or verified.</p>
        <button type="button" className={styles.action} onClick={()=>setFullDetail(!fullDetail)}>{fullDetail?"Hide complete handoff JSON":"Show complete handoff JSON"}</button>
        {fullDetail&&<pre>{JSON.stringify(attempt.handoff,null,2)}</pre>}
      </>:<p>{attempt.handoffError?`Handoff rejected: ${attempt.handoffError}`:attempt.teachingStage==="complete"?"Teaching finished, but handoff is unavailable.":"Awaiting a validated teaching plan. No director inference is triggered."}</p>}
    </div>}
    {tab==="trace" && <div className={styles.content}>
      <h3>Workflow trace · turn #{attempt.id}</h3>
      <div className={styles.metrics}><span>A · Assessment</span><b>{attempt.provider.toUpperCase()} · {attempt.state} · {ms(attempt.timing?.totalMs)}</b><span>Retrieval</span><b>{connected?`Complete · ${ms(connected.totalMs)}`:attempt.connectedError?"Failed":"Pending or skipped"}</b><span>B · Teaching</span><b>{attempt.teachingProvider.toUpperCase()} · {attempt.teachingStage??"not started"} · {ms(attempt.teachingMs)}</b><span>Visual handoff</span><b>{attempt.handoff?"Ready · frozen contract":attempt.handoffError?"Rejected":"Not ready"}</b><span>C · Visual director</span><b>Not called (planned next milestone)</b><span>Verify learning</span><b>Not implemented · no mastery update</b><span>Total elapsed</span><b>{ms(attempt.workflowTotalMs)}</b></div>
      {attempt.warnings?.length?<><h3>Deterministic validation corrections</h3>{attempt.warnings.map((w,i)=><p key={i}>{w}</p>)}</>:null}
      {attempt.teachingError&&<p className={styles.caution}>{attempt.teachingError}</p>}
      <button type="button" className={styles.action} onClick={()=>setFullDetail(!fullDetail)}>{fullDetail?"Hide raw inputs and outputs":"Show raw inputs and outputs"}</button>
      {fullDetail&&<div className={styles.raw}><h3>Assessment prompt</h3><pre>{attempt.promptInput}</pre><pre>{attempt.systemPromptUsed}</pre><h3>Assessment raw response</h3><pre>{attempt.raw}</pre><h3>Teaching model</h3><pre>{attempt.teachingModel??"Not called"}</pre><h3>Teaching raw response</h3><pre>{attempt.teachingRaw??"Not called"}</pre><h3>Teaching input</h3><pre>{JSON.stringify(attempt.teachingInput??null,null,2)}</pre></div>}
    </div>}
    </>}
  </section>;
}
