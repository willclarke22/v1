import type { Topic } from "@/types/topic";

function LoadingDots() {
  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label="Loading model-backed signal"
    >
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-300 [animation-delay:-0.2s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-300 [animation-delay:-0.1s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-300" />
    </span>
  );
}

function SignalValue({
  value,
  pending = false,
}: {
  value: number;
  pending?: boolean;
}) {
  return (
    <p className="mt-2 min-h-6 text-base font-medium text-white">
      {pending ? <LoadingDots /> : value.toFixed(2)}
    </p>
  );
}

export default function MobileTopicCard({ topic }: { topic: Topic }) {
  const confusionInsightPending =
    topic.confusionInsightStatus?.isPending === true;

  return (
    <section className="border-t border-white/10 bg-zinc-950/90 px-4 py-4 xl:hidden">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-white/10 bg-white/4 p-4 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">
              Active Topic
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              {topic.topic_label}
            </h3>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="rounded-full border border-purple-300/20 bg-purple-400/10 px-3 py-1 text-xs text-purple-100">
              Selected
            </div>

            {confusionInsightPending && (
              <div className="rounded-full border border-sky-200/15 bg-sky-300/8 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-sky-100">
                Signals Loading
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-medium text-white">Diagnosis</p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {topic.diagnosis}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-medium text-white">Next Step</p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {topic.nextStep}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">Learning Signals</p>
              {confusionInsightPending && (
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Scoring with the local worker...
                </p>
              )}
            </div>

            {topic.confusionInsightStatus?.hasModelScore && (
              <span className="rounded-full border border-emerald-200/10 bg-emerald-300/[0.07] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-100">
                Ready
              </span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-2xl bg-white/3 p-3">
              <p className="text-zinc-500">Confusion</p>
              <SignalValue
                value={topic.confusion}
                pending={confusionInsightPending}
              />
            </div>

            <div className="rounded-2xl bg-white/3 p-3">
              <p className="text-zinc-500">Insight</p>
              <SignalValue
                value={topic.insight}
                pending={confusionInsightPending}
              />
            </div>

            <div className="rounded-2xl bg-white/3 p-3">
              <p className="text-zinc-500">Score</p>
              <SignalValue value={topic.learningScore} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
