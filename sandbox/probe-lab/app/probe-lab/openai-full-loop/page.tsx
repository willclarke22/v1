import { OpenAIFullLoopLab } from "@/ui/learning-space/probes/openai-full-loop";

export default function OpenAIFullLoopProbeLabPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.20),transparent_34%),linear-gradient(135deg,#07120b,#10281a_48%,#030805)] px-6 py-6 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100/70">
            MyWay Probe Lab · OpenAI full-loop brain sandbox
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Test the whole probe loop with topic state, personalization, and graph-aware probes
          </h1>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-zinc-200/78">
            Type a learner message or continue from an evaluated attempt. OpenAI generates a diagnosis, an EngineRenderableProbe-shaped contract, optional image prompt, and cautious MyWay brain updates. The existing probe templates render the result, including graph presets for algebra, calculus, trigonometry, and 3D surfaces.
          </p>
        </header>

        <OpenAIFullLoopLab />
      </div>
    </main>
  );
}
