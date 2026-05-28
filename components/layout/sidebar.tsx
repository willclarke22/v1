"use client";

import {
  ChevronLeft,
  Eye,
  LayoutDashboard,
  Settings,
  Sparkles,
} from "lucide-react";
import type { ProgressSummary } from "@/lib/derive-progress-summary";
import type { RelationshipViewMode } from "@/types/learning-space";

export type SidebarTab = "myway" | "progress" | "view-options" | "settings";

type SidebarProps = {
  activeTab: SidebarTab;
  onChangeTab: (tab: SidebarTab) => void;
  latestReply?: string;
  suggestedAction?: string;
  isSending?: boolean;
  progressSummary: ProgressSummary;
  relationshipViewMode: RelationshipViewMode;
  onChangeRelationshipViewMode: (mode: RelationshipViewMode) => void;
};

const tabs: {
  id: SidebarTab;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "myway", shortLabel: "MyWay", icon: Sparkles },
  { id: "progress", shortLabel: "Progress", icon: LayoutDashboard },
  { id: "view-options", shortLabel: "View", icon: Eye },
  { id: "settings", shortLabel: "Settings", icon: Settings },
];



const relationshipViewModes: {
  id: RelationshipViewMode;
  label: string;
  description: string;
  dotClassName: string;
}[] = [
  {
    id: "semantic_similarity",
    label: "Semantic",
    description: "Show concept-neighborhood relationships.",
    dotClassName: "bg-[#7BAFD4]",
  },
  {
    id: "confusion",
    label: "Confusion",
    description: "Show topics with similar confusion patterns.",
    dotClassName: "bg-rose-400",
  },
  {
    id: "insight",
    label: "Insight",
    description: "Show topics with similar insight patterns.",
    dotClassName: "bg-emerald-400",
  },
  {
    id: "off",
    label: "Off",
    description: "Hide relationship lines.",
    dotClassName: "bg-zinc-500",
  },
];

function RelationshipModeButton({
  option,
  isActive,
  onClick,
}: {
  option: (typeof relationshipViewModes)[number];
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`w-full rounded-2xl border px-4 py-3 text-left shadow-[0_10px_24px_rgba(0,0,0,0.1)] backdrop-blur-md transition ${
        isActive
          ? "border-white/14 bg-white/[0.075] text-white"
          : "border-white/6 bg-white/[0.024] text-zinc-300 hover:border-white/10 hover:bg-white/4 hover:text-white"
      }`}
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <span className={`h-2.5 w-2.5 rounded-full ${option.dotClassName}`} />
        {option.label}
      </span>
      <span className="mt-1 block text-xs leading-5 text-zinc-500">
        {option.description}
      </span>
    </button>
  );
}

function LoadingDots() {
  return (
    <span
      className="inline-flex min-h-8 items-center gap-1"
      aria-label="Loading metric"
    >
      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-200 [animation-delay:-0.2s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-200 [animation-delay:-0.1s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-200" />
    </span>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
  isLoading = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "attention";
  isLoading?: boolean;
}) {
  const valueClassName =
    tone === "good"
      ? "text-emerald-300"
      : tone === "attention"
        ? "text-amber-300"
        : "text-white";

  return (
    <div className="rounded-2xl border border-white/6 bg-white/[0.024] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.13)] backdrop-blur-md">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-3 text-2xl font-semibold tracking-tight ${valueClassName}`}
      >
        {isLoading ? <LoadingDots /> : value}
      </p>
    </div>
  );
}

export default function Sidebar({
  activeTab,
  onChangeTab,
  latestReply = "",
  suggestedAction = "",
  isSending = false,
  progressSummary,
  relationshipViewMode,
  onChangeRelationshipViewMode,
}: SidebarProps) {
  const hasPendingConfusionInsightSignals =
    progressSummary.pendingSignalTopics > 0;

  return (
    <aside className="relative h-full w-full overflow-hidden rounded-r-4xl bg-transparent text-white">
      <div className="absolute inset-0 flex h-full flex-col bg-[linear-gradient(270deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.08)_10%,rgba(0,0,0,0.18)_22%,rgba(0,0,0,0.34)_42%,rgba(0,0,0,0.54)_100%)] backdrop-blur-sm">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-[linear-gradient(270deg,rgba(255,255,255,0.02)_0%,rgba(255,255,255,0.01)_22%,rgba(255,255,255,0.00)_100%)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/2.5" />

        <div className="relative flex h-full flex-col">
          <div className="border-b border-white/5 px-5 py-5">
            <h1 className="text-[2.1rem] font-semibold tracking-tight text-white">
              MyWay
            </h1>
            <p className="mt-2 max-w-55 text-sm leading-6 text-zinc-400">
              Adaptive learning, visualized
            </p>
          </div>

          <div className="border-b border-white/5 px-3 py-3">
            <div className="hide-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => onChangeTab(tab.id)}
                    type="button"
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-t-xl rounded-b-md border px-2.5 py-1.5 text-[10px] font-medium tracking-[0.01em] transition ${
                      isActive
                        ? "border-white/12 bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                        : "border-white/6 bg-white/1.5 text-zinc-400 hover:border-white/10 hover:bg-white/4 hover:text-white"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="whitespace-nowrap">{tab.shortLabel}</span>
                  </button>
                );
              })}

              <button
                className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/6 bg-white/1.5 text-zinc-400 transition hover:border-white/10 hover:bg-white/4 hover:text-white"
                aria-label="Collapse sidebar"
                type="button"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5">
            {activeTab === "myway" && (
              <div className="space-y-4">
                <div>
                  <p className="mb-3 px-1 text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">
                    MyWay Response
                  </p>

                  <div className="rounded-[1.75rem] border border-white/6 bg-white/[0.024] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.13)] backdrop-blur-md">
                    <p className="text-sm leading-7 text-zinc-200">
                      {isSending
                        ? "MyWay is interpreting your message and deciding where to guide you next..."
                        : latestReply ||
                          "Ask a question to begin a guided MyWay response."}
                    </p>

                    {!isSending && suggestedAction && (
                      <p className="mt-4 text-sm leading-6 text-zinc-400">
                        {suggestedAction}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "progress" && (
              <div className="space-y-4">
                <p className="mb-3 px-1 text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">
                  Progress
                </p>

                <div className="grid grid-cols-1 gap-3">
                  <MetricCard
                    label="Topics in your space"
                    value={String(progressSummary.totalTopics)}
                  />
                  <MetricCard
                    label="Average confusion"
                    value={progressSummary.averageConfusion.toFixed(2)}
                    tone="attention"
                    isLoading={hasPendingConfusionInsightSignals}
                  />
                  <MetricCard
                    label="Average insight"
                    value={progressSummary.averageInsight.toFixed(2)}
                    tone="good"
                    isLoading={hasPendingConfusionInsightSignals}
                  />
                  <MetricCard
                    label="Average learning score"
                    value={progressSummary.averageLearningScore.toFixed(2)}
                    tone="good"
                  />
                </div>
              </div>
            )}

            {activeTab === "view-options" && (
              <div className="space-y-4">
                <p className="mb-3 px-1 text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">
                  View Options
                </p>

                <div className="rounded-2xl border border-white/6 bg-white/[0.024] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.13)] backdrop-blur-md">
                  <p className="text-sm font-medium text-white">
                    Relationship Lines
                  </p>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    Choose what the scanner-style relationship arcs represent in
                    the learning space.
                  </p>

                  <div className="mt-4 space-y-2.5">
                    {relationshipViewModes.map((option) => (
                      <RelationshipModeButton
                        key={option.id}
                        option={option}
                        isActive={relationshipViewMode === option.id}
                        onClick={() => onChangeRelationshipViewMode(option.id)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    className="w-full rounded-2xl border border-white/6 bg-white/[0.024] px-4 py-3 text-left text-sm text-zinc-200 shadow-[0_10px_24px_rgba(0,0,0,0.1)] backdrop-blur-md transition hover:bg-white/4"
                    type="button"
                  >
                    Toggle labels
                  </button>
                  <button
                    className="w-full rounded-2xl border border-white/6 bg-white/[0.024] px-4 py-3 text-left text-sm text-zinc-200 shadow-[0_10px_24px_rgba(0,0,0,0.1)] backdrop-blur-md transition hover:bg-white/4"
                    type="button"
                  >
                    Toggle stars / satellites
                  </button>
                  <button
                    className="w-full rounded-2xl border border-white/6 bg-white/[0.024] px-4 py-3 text-left text-sm text-zinc-200 shadow-[0_10px_24px_rgba(0,0,0,0.1)] backdrop-blur-md transition hover:bg-white/4"
                    type="button"
                  >
                    Reset camera
                  </button>
                </div>

                <div className="rounded-2xl border border-white/6 bg-white/[0.024] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.13)] backdrop-blur-md">
                  <p className="text-sm font-medium text-white">Scene controls</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Relationship modes are now the first active visual lens.
                    Labels, satellites, clusters, and other overlays can be
                    added here later.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "settings" && (
              <div className="space-y-4">
                <p className="mb-3 px-1 text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">
                  Settings
                </p>

                <div className="rounded-2xl border border-white/6 bg-white/[0.024] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.13)] backdrop-blur-md">
                  <p className="text-sm font-medium text-white">Prototype</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Settings can later include personalization, debug toggles, and
                    UI preferences.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/6 bg-white/[0.024] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.13)] backdrop-blur-md">
                  <p className="text-sm font-medium text-white">
                    Current environment
                  </p>
                  <p className="mt-2 text-sm text-zinc-400">Local prototype shell</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
