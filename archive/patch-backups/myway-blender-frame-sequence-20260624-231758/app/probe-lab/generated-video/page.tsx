import { UniversalSceneRemotionLab } from "@/ui/learning-space/probes/generated-video/universal-scene";

export default function GeneratedVideoProbeLabPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(126,34,206,0.38),transparent_34%),linear-gradient(135deg,#150022,#2b0647_48%,#090014)] px-6 py-6 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-purple-100/70">
            MyWay Probe Lab · Video Director + 3D renderer experiment
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Generate a personalized animation director plan from any learner message or attempt
          </h1>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-zinc-200/78">
            Add the learner message, root problem, diagnosis, bridge level, interests, and profile context. A selected provider writes a high-level video director contract. MyWay validates it, previews a trusted 3D/WebGL renderer path, and keeps a Remotion/SVG fallback for timeline and export experiments.
          </p>
        </header>

        <UniversalSceneRemotionLab />
      </div>
    </main>
  );
}
