"use client";
/** Real data is minimally projected and read-only. This reuses the real 3D renderer.
 * Existing D2C4 fictional demo remains an immutable fallback module. */
import { useMemo,useState } from "react";
import Link from "next/link";
import SpaceCanvas from "@/ui/learning-space/scene/canvas";
import Sidebar,{type SidebarTab} from "@/ui/learning-space/shell/sidebar";
import TopicPanel from "@/ui/learning-space/shell/topic-panel";
import { buildLearningSpace } from "@/lib/learning-space/build-learning-space";
import { deriveProgressSummary } from "@/lib/learning-progress/derive-progress-summary";
import type { RelationshipViewMode } from "@/types/learning-space";
import type { Topic } from "@/types/topic";

export default function CloudSnapshotScene({topics}:{topics:Topic[]}){
  const [selected,setSelected]=useState<string|null>(null);
  const [focused,setFocused]=useState<string|null>(null);
  const [viewMode,setViewMode]=useState<RelationshipViewMode>("semantic_similarity");
  const [tab,setTab]=useState<SidebarTab>("myway");
  const [leftOpen,setLeftOpen]=useState(true);
  const [rightOpen,setRightOpen]=useState(true);
  const [sceneRevision,setSceneRevision]=useState(0);
  const [notice,setNotice]=useState("Private snapshot of real sandbox topics. Read-only: messaging, scoring, embeddings and topic writes are disabled.");
  const space=useMemo(()=>buildLearningSpace(topics),[topics]);
  const progress=useMemo(()=>deriveProgressSummary(topics,focused),[topics,focused]);
  const current=topics.find(t=>t.id===selected)??null;
  const reset=()=>{setSelected(null);setFocused(null);setViewMode("semantic_similarity");setSceneRevision(n=>n+1);setNotice("Private snapshot camera and selection reset.");};
  return <main className="relative h-screen overflow-hidden bg-[#080b1c] text-white">
    <div className="absolute inset-0">
      <SpaceCanvas key={sceneRevision} learningSpace={space} selectedTopicId={selected} focusedTopicId={focused}
        relationshipViewMode={viewMode} availableProbe={null} isEnteringProbe={false} probeEntryTopicId={null}
        onSelectTopic={setSelected} onFocusTopicChange={setFocused}
        onOpenProbe={()=>setNotice("Probes are disabled in this read-only cloud snapshot.")}
        onProbeEntryComplete={()=>{}} isBootstrappingTopics={false}/>
    </div>
    <div className="pointer-events-none absolute inset-y-0 left-0 z-40">
      <div className={`pointer-events-auto relative h-full w-70 rounded-r-[2rem] bg-gradient-to-r from-violet-950/20 via-indigo-950/10 to-transparent transition-transform duration-300 ${leftOpen?"translate-x-0":"-translate-x-[calc(100%-18px)]"}`}>
        <Sidebar activeTab={tab} onChangeTab={setTab} latestReply={notice}
          suggestedAction="Read-only real sandbox topics · no models or writes"
          isSending={false} progressSummary={progress} relationshipViewMode={viewMode}
          onChangeRelationshipViewMode={setViewMode}/>
        <button type="button" aria-label={leftOpen?"Collapse MyWay panel":"Expand MyWay panel"}
          onClick={()=>setLeftOpen(v=>!v)} className="absolute right-0 top-1/2 rounded-r-xl border border-violet-300/20 bg-[#171b37]/90 px-1 py-5 text-xs text-blue-100">{leftOpen?"‹":"›"}</button>
      </div>
    </div>
    {current&&<div className={`absolute inset-y-0 right-0 z-40 hidden w-90 bg-gradient-to-l from-blue-950/20 via-indigo-950/10 to-transparent transition-transform duration-300 xl:block ${rightOpen?"translate-x-0":"translate-x-[calc(100%-16px)]"}`}>
      <TopicPanel topic={current}/>
      <button type="button" aria-label={rightOpen?"Collapse topic panel":"Expand topic panel"}
        onClick={()=>setRightOpen(v=>!v)} className="absolute left-0 top-1/2 rounded-l-xl border border-violet-300/20 bg-[#171b37]/90 px-1 py-5 text-xs text-blue-100">{rightOpen?"›":"‹"}</button>
    </div>}
    <div className="pointer-events-auto absolute left-1/2 top-3 z-50 flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-sky-300/20 bg-[#101630]/95 px-3 py-2 text-[11px] text-blue-100 shadow-xl backdrop-blur-xl xl:left-[290px] xl:right-[380px] xl:max-w-none xl:translate-x-0">
      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 font-bold text-emerald-200">PRIVATE SANDBOX SNAPSHOT · READ ONLY</span>
      <span className="text-slate-300">{topics.length} real topic spheres</span>
      <button onClick={reset} type="button" className="rounded-full border border-indigo-300/25 bg-indigo-400/10 px-3 py-1 text-blue-100 hover:bg-indigo-400/20">Reset camera</button>
      <Link href="/sandbox/probe-lab/learning-space/workbench" className="rounded-full border border-indigo-300/25 px-3 py-1 hover:bg-indigo-400/20">Workbench account</Link>
    </div>
    <div className="pointer-events-none absolute bottom-4 left-3 right-3 z-40 flex justify-center xl:left-[310px] xl:right-[380px]">
      <div className="pointer-events-auto w-full max-w-3xl rounded-2xl border border-indigo-300/15 bg-[#0d1230]/75 px-4 py-3 shadow-lg backdrop-blur-md">
        <p className="text-center text-xs text-slate-300">Drag to rotate · Scroll to zoom · Select a topic · Relationship controls on the left</p>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-500/20 bg-slate-900/70 p-2">
          <input disabled aria-label="Learning message input disabled in read-only cloud snapshot" placeholder="Read-only snapshot · messaging disabled" className="min-w-0 flex-1 bg-transparent px-3 py-1 text-sm text-slate-400 placeholder:text-slate-500"/>
          <span className="rounded-lg border border-slate-600/40 px-3 py-1 text-xs text-slate-400">Read only</span>
        </div>
      </div>
    </div>
  </main>;
}
