


const activeLabs = [
  {
    href: "/sandbox/probe-lab/cinematic-production",
    title: "Cinematic Production",
    status: "CP.2A Golden benchmark",
    description:
      "Keep the Lunch Golden as the controlled reproduction benchmark for fidelity, camera, timing, choreography, and visual-observation experiments.",
  },
  {
    href: "/sandbox/probe-lab/cinematic-production/freeform",
    title: "Freeform Closed-Loop Production",
    status: "CP.2B GLM → MyWay → Omni → GLM",
    description:
      "Give GLM a creative request with no Golden choreography, preserve generic MyWay geometry/contact/clearance/camera-safety math, let Omni review the actual V1 render, and patch the same plan into V2 while measuring wall-clock latency.",
  },
  {
    href: "/sandbox/probe-lab/blender-python-builder",
    title: "Blender Asset Foundry",
    status: "focused asset-quality foundation",
    description:
      "Design benchmark-quality procedural assets, match R2 or AmbientCG materials and HDRIs, generate or paste Blender Python, inspect geometry and look-development passes, improve revisions, and save review candidates.",
  },
  {
    href: "/sandbox/probe-lab/director-capability-library",
    title: "Director Capability Library",
    status: "hierarchical directing + real-asset proof",
    description:
      "Use one canonical directing library: Golden-derived perceptual/composite capabilities compile into the stable atomic camera, motion, blocking, lighting, transition, and continuity vocabulary, with film-wide policies and real reviewed Asset Library proofs.",
  },
  {
    href: "/sandbox/probe-lab/manual-turn",
    title: "Manual Turn Lab",
    status: "manual model lane",
    description:
      "Paste MyWay learning-turn JSON, normalize and validate it, resolve assets, and run the existing semantic scene renderer without calling a model.",
  },
  {
    href: "/sandbox/probe-lab/resource-runtime",
    title: "Reviewed Resource Runtime",
    status: "Phase 2 shared runtime + closeout",
    description:
      "Resolve reviewed R2 models, PBR materials, HDRIs, and mixed primitives through one shared runtime with cache, fallback, Blender hydration, and run-inspector diagnostics.",
  },
  {
    href: "/sandbox/probe-lab/visual-experience",
    title: "Visual Experience Workbench",
    status: "active lane",
    description:
      "The current MyWay sandbox lane for model-directed, interactive visual learning scenes.",
  },
  {
    href: "/sandbox/probe-lab/directable-assets",
    title: "Directable Assets",
    status: "Phase 1B.5C qualification + interactions",
    description:
      "Use one canonical workbench with Asset Qualification and Asset Interactions tabs: inspect hardened per-asset affordances, then resolve Place On, Surface Attach, Precise Attach, Insert, and Flow across two Affordance Graphs.",
  },
  {
    href: "/sandbox/probe-lab/asset-library",
    title: "Asset Library",
    status: "shared library",
    description:
      "Search every registered MyWay asset, inspect metadata and licenses, and rotate GLB files in a live 3D viewer.",
  },
  {
    href: "/sandbox/probe-lab/primitive-builder",
    title: "Asset Scene Builder",
    status: "active sandbox",
    description:
      "An asset-first sandbox where the model plans invisible layout proxies and MyWay renders verified GLB assets.",
  },
];

export default function ProbeLabPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "min(5vw, 3rem)",
        color: "white",
        background:
          "radial-gradient(circle at top left, rgba(34,197,94,0.22), transparent 34%), linear-gradient(135deg, #050816, #111827)",
      }}
    >
      <div style={{ maxWidth: "980px", margin: "0 auto" }}>
        <p
          style={{
            margin: 0,
            color: "rgba(255,255,255,0.56)",
            fontSize: "0.75rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          MyWay Sandbox
        </p>
        <h1 style={{ margin: "0.75rem 0 0.5rem", fontSize: "clamp(2.1rem, 4vw, 3.6rem)" }}>
          Probe Lab
        </h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.72)", lineHeight: 1.7 }}>
          Focused sandboxes for inspecting the manual-turn path, visual experience rendering, asset handling, and motion/camera execution in isolation.
        </p>

        <section
          style={{
            marginTop: "2rem",
            display: "grid",
            gap: "1rem",
          }}
        >
          {activeLabs.map((lab) => (
            <a
              key={lab.href}
              href={lab.href}
              style={{
                display: "grid",
                gap: "0.45rem",
                textDecoration: "none",
                color: "inherit",
                padding: "1rem 1.1rem",
                borderRadius: "1rem",
                border: "1px solid rgba(255,255,255,0.09)",
                background: "rgba(255,255,255,0.04)",
                boxShadow: "0 18px 40px rgba(0,0,0,0.24)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}>
                <strong style={{ fontSize: "1.05rem" }}>{lab.title}</strong>
                <span style={{ color: "#93c5fd", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  {lab.status}
                </span>
              </div>
              <span style={{ color: "rgba(255,255,255,0.72)", lineHeight: 1.6 }}>{lab.description}</span>
            </a>
          ))}
        </section>
      </div>
    </main>
  );
}
