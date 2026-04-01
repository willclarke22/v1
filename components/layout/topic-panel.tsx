import type { Topic } from "@/types/topic";

function formatDiagnosisLabel(diagnosis: Topic["diagnosis"]) {
  switch (diagnosis) {
    case "recall_gap":
      return "Recall Gap";
    case "representation_gap":
      return "Representation Gap";
    case "procedure_gap":
      return "Procedure Gap";
    case "discrimination_gap":
      return "Discrimination Gap";
    case "transfer_gap":
      return "Transfer Gap";
    default:
      return "Unknown";
  }
}

function formatRelativeTimestamp(timestamp?: string | null) {
  if (!timestamp) return "Unknown";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function signalBarWidth(value: number) {
  return `${Math.max(0, Math.min(100, value * 100))}%`;
}

function SignalRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-200">{value.toFixed(2)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-white/70 transition-[width] duration-300"
          style={{ width: signalBarWidth(value) }}
        />
      </div>
    </div>
  );
}

export default function TopicPanel({ topic }: { topic: Topic }) {
  const diagnosisLabel = formatDiagnosisLabel(topic.diagnosis);
  const lastUpdatedLabel = formatRelativeTimestamp(topic.lastUpdated);

  return (
    <aside className="h-screen w-[360px] bg-transparent text-white">
      <div className="flex h-full flex-col bg-[linear-gradient(90deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.08)_10%,rgba(0,0,0,0.18)_22%,rgba(0,0,0,0.34)_42%,rgba(0,0,0,0.54)_100%)] backdrop-blur-[8px]">
        <div className="px-6 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-zinc-500">
            Active Topic
          </p>

          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            {topic.name}
          </h2>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-300">
              {diagnosisLabel}
            </span>

            {topic.hasAvailableProbe && (
              <span className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white">
                Probe Available
              </span>
            )}
          </div>

          <p className="mt-4 text-sm leading-6 text-zinc-400">
            This panel reflects the current engine-derived state for the topic
            you are focused on in the learning space.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <section className="rounded-3xl border border-white/7 bg-white/[0.03] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.16)] backdrop-blur-md">
            <p className="text-lg font-medium text-white">Diagnosis</p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              {diagnosisLabel}
            </p>
          </section>

          <section className="rounded-3xl border border-white/7 bg-white/[0.03] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.16)] backdrop-blur-md">
            <p className="text-lg font-medium text-white">Next Step</p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              {topic.nextStep}
            </p>
          </section>

          <section className="rounded-3xl border border-white/7 bg-white/[0.03] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.16)] backdrop-blur-md">
            <p className="text-lg font-medium text-white">Learning Signals</p>

            <div className="mt-4 space-y-4">
              <SignalRow label="Confusion" value={topic.confusion} />
              <SignalRow label="Insight" value={topic.insight} />
              <SignalRow label="Learning Score" value={topic.learningScore} />
            </div>
          </section>

          <section className="rounded-3xl border border-white/7 bg-white/[0.03] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.16)] backdrop-blur-md">
            <p className="text-lg font-medium text-white">State Snapshot</p>

            <div className="mt-4 space-y-3 text-sm text-zinc-400">
              <div className="flex items-center justify-between">
                <span>Message Count</span>
                <span className="text-zinc-200">
                  {topic.messageCount ?? 0}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Last Updated</span>
                <span className="text-zinc-200">{lastUpdatedLabel}</span>
              </div>

              <div className="flex items-center justify-between">
                <span>Probe Status</span>
                <span className="text-zinc-200">
                  {topic.hasAvailableProbe ? "Available" : "None"}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}