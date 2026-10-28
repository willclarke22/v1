"use client";
/** Reuses the REAL Learning Space 3D renderer and panels. Deliberately imports
 * no learner transport, Supabase client, inference workflow or API endpoint.
 * This is a visual interaction milestone only; it never sends a user message.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import SpaceCanvas from "@/ui/learning-space/scene/canvas";
import Sidebar, { type SidebarTab } from "@/ui/learning-space/shell/sidebar";
import TopicPanel from "@/ui/learning-space/shell/topic-panel";
import { buildLearningSpace } from "@/lib/learning-space/build-learning-space";
import { deriveProgressSummary } from "@/lib/learning-progress/derive-progress-summary";
import type { RelationshipViewMode } from "@/types/learning-space";
import { DEMO_TOPICS } from "./demo-topics";

export default function CloudInteractiveDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<RelationshipViewMode>("semantic_similarity");
  const [tab, setTab] = useState<SidebarTab>("myway");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [notice, setNotice] = useState("Select or focus a sphere to explore this demonstration. All topics and scores here are fictional. No personal learning data is loaded.");
  const space = useMemo(() => buildLearningSpace(DEMO_TOPICS), []);
  const progress = useMemo(() => deriveProgressSummary(DEMO_TOPICS, focused), [focused]);
  const current = DEMO_TOPICS.find((t) => t.id === selected) ?? null;
  const reset = () => {
    setSelected(null); setFocused(null); setViewMode("semantic_similarity");
    setSceneRevision((n) => n + 1);
    setNotice("The demonstration camera and topic selection were reset.");
  };
  return <main className="relative h-screen overflow-hidden bg-[#080b1c] text-white">
    <div className="absolute inset-0">
      <SpaceCanvas key={sceneRevision} learningSpace={space} selectedTopicId={selected} focusedTopicId={focused}
        relationshipViewMode={viewMode} availableProbe={null} isEnteringProbe={false} probeEntryTopicId={null}
        onSelectTopic={setSelected} onFocusTopicChange={setFocused}
        onOpenProbe={() => setNotice("Probe interactions are disabled in this cloud demonstration.")}
        onProbeEntryComplete={() => {}} isBootstrappingTopics={false}/>
    </div>
    <div className="pointer-events-none absolute inset-y-0 left-0 z-40">
      <div className={`pointer-events-auto relative h-full w-70 rounded-r-[2rem] bg-gradient-to-r from-violet-950/20 via-indigo-950/10 to-transparent transition-transform duration-300 ${leftOpen ? "translate-x-0" : "-translate-x-[calc(100%-18px)]"}`}>
        <Sidebar activeTab={tab} onChangeTab={setTab} latestReply={notice}
          suggestedAction="3D demo · fictional topics · no models, storage or database access"
          isSending={false} progressSummary={progress} relationshipViewMode={viewMode}
          onChangeRelationshipViewMode={setViewMode}/>
        <button type="button" aria-label={leftOpen ? "Collapse MyWay panel" : "Expand MyWay panel"}
          onClick={() => setLeftOpen((v) => !v)}
          className="absolute right-0 top-1/2 rounded-r-xl border border-violet-300/20 bg-[#171b37]/90 px-1 py-5 text-xs text-blue-100">{leftOpen ? "‹" : "›"}</button>
      </div>
    </div>
    {current && <div className={`absolute inset-y-0 right-0 z-40 hidden w-90 bg-gradient-to-l from-blue-950/20 via-indigo-950/10 to-transparent transition-transform duration-300 xl:block ${rightOpen ? "translate-x-0" : "translate-x-[calc(100%-16px)]"}`}>
      <TopicPanel topic={current}/>
      <button type="button" aria-label={rightOpen ? "Collapse topic panel" : "Expand topic panel"}
        onClick={() => setRightOpen((v) => !v)}
        className="absolute left-0 top-1/2 rounded-l-xl border border-violet-300/20 bg-[#171b37]/90 px-1 py-5 text-xs text-blue-100">{rightOpen ? "›" : "‹"}</button>
    </div>}
    <div className="pointer-events-auto absolute left-1/2 top-3 z-50 flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-sky-300/20 bg-[#101630]/95 px-3 py-2 text-[11px] text-blue-100 shadow-xl backdrop-blur-xl xl:left-[290px] xl:right-[380px] xl:max-w-none xl:translate-x-0">
      <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-1 font-bold text-sky-200">CLOUD DEMO · FICTIONAL DATA · NO API ACCESS</span>
      <span className="text-slate-300">{DEMO_TOPICS.length} sample spheres</span>
      <button onClick={reset} type="button" className="rounded-full border border-indigo-300/25 bg-indigo-400/10 px-3 py-1 text-blue-100 hover:bg-indigo-400/20">Reset camera</button>
      <Link href="/sandbox/probe-lab/learning-space/workbench" className="rounded-full border border-indigo-300/25 px-3 py-1 hover:bg-indigo-400/20">Workbench status</Link>
    </div>
    <div className="pointer-events-none absolute bottom-4 left-3 right-3 z-40 flex justify-center xl:left-[310px] xl:right-[380px]">
      <div className="pointer-events-auto w-full max-w-3xl rounded-2xl border border-indigo-300/15 bg-[#0d1230]/75 px-4 py-3 shadow-lg backdrop-blur-md">
        <p className="text-center text-xs text-slate-300">Drag to rotate · Scroll to zoom · Select a sphere · View relationships in the left panel</p>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-500/20 bg-slate-900/70 p-2">
          <input disabled aria-label="Learning message input disabled in demonstration" placeholder="Messaging is disabled in this visual-only cloud demonstration" className="min-w-0 flex-1 bg-transparent px-3 py-1 text-sm text-slate-400 placeholder:text-slate-500" />
          <span className="rounded-lg border border-slate-600/40 px-3 py-1 text-xs text-slate-400">Demo only</span>
        </div>
      </div>
    </div>
  </main>;
}
