const activeLabs = [
  {
    href: "/sandbox/probe-lab/blender-python-builder",
    title: "Blender Python Asset Builder",
    status: "GLM 5.2 procedural experiment",
    description:
      "Ask GLM 5.2 to write editable Blender Python, paste or revise scripts, run Blender headlessly, and inspect the exported GLB in Three.js.",
  },
  {
    href: "/sandbox/probe-lab/motion-camera-library",
    title: "Motion & Camera Library",
    status: "3D execution catalogue",
    description:
      "Inspect every registered motion and camera direction in richer 3D preview scenes with varied objects, JSON keywords, and direct/controller/declared capability status.",
  },{
    href: "/sandbox/probe-lab/manual-turn",
    title: "Manual Turn Lab",
    status: "manual model lane",
    description:
      "Paste MyWay learning-turn JSON, normalize and validate it, resolve assets, and run the existing semantic scene renderer without calling a model.",
  },  {
    href: "/sandbox/probe-lab/cosmos-video",
    title: "GLM + Cosmos Video Lab",
    status: "new experiment",
    description:
      "GLM 5.2 converts a learner need into a constrained video brief, then Cosmos3 Nano generates and saves an MP4.",
  },
  {
    href: "/sandbox/probe-lab/visual-experience",
    title: "Visual Experience Workbench",
    status: "active lane",
    description:
      "The current MyWay sandbox lane for model-directed, interactive visual learning scenes.",
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
                border: "1px solid rgba(255,255,255,0.08)",
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