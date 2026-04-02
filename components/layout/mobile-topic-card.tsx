import type { Topic } from "@/types/topic";

export default function MobileTopicCard({ topic }: { topic: Topic }) {
  return (
    <section className="border-t border-white/10 bg-zinc-950/90 px-4 py-4 xl:hidden">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">
              Active Topic
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">{topic.name}</h3>
          </div>

          <div className="rounded-full border border-purple-300/20 bg-purple-400/10 px-3 py-1 text-xs text-purple-100">
            Selected
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-medium text-white">Diagnosis</p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{topic.diagnosis}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-medium text-white">Next Step</p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{topic.nextStep}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm font-medium text-white">Learning Signals</p>

          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-2xl bg-white/[0.03] p-3">
              <p className="text-zinc-500">Confusion</p>
              <p className="mt-2 text-base font-medium text-white">
                {topic.confusion.toFixed(2)}
              </p>
            </div>

            <div className="rounded-2xl bg-white/[0.03] p-3">
              <p className="text-zinc-500">Insight</p>
              <p className="mt-2 text-base font-medium text-white">
                {topic.insight.toFixed(2)}
              </p>
            </div>

            <div className="rounded-2xl bg-white/[0.03] p-3">
              <p className="text-zinc-500">Score</p>
              <p className="mt-2 text-base font-medium text-white">
                {topic.learningScore.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}