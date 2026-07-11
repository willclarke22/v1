const activeLabs = [
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
    title: "Primitive Builder Lab",
    status: "active sandbox",
    description:
      "A Lego-style sandbox for building model-planned 3D structures from procedural primitives and reusable assets.",
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
            fontWeight: 900,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          MyWay Sandbox
        </p>

        <h1
          style={{
            margin: "0.75rem 0 0",
            fontSize: "clamp(2rem, 4vw, 4rem)",
          }}
        >
          Probe Lab
        </h1>

        <p
          style={{
            maxWidth: "760px",
            color: "rgba(255,255,255,0.72)",
            lineHeight: 1.65,
          }}
        >
          Visual Experience is the active learning lane. The shared Asset
          Library stores reusable 3D models, while Primitive Builder tests
          procedural and model-assisted scene construction.
        </p>

        <div
          style={{
            display: "grid",
            gap: "1rem",
            marginTop: "2rem",
          }}
        >
          {activeLabs.map((lab) => (
            <a
              key={lab.href}
              href={lab.href}
              style={{
                display: "block",
                border: "1px solid rgba(74,222,128,0.48)",
                borderRadius: "1.25rem",
                padding: "1.15rem",
                color: "white",
                background: "rgba(22,163,74,0.16)",
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                }}
              >
                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
                  {lab.title}
                </h2>
                <span
                  style={{
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "999px",
                    padding: "0.25rem 0.6rem",
                    color: "rgba(255,255,255,0.72)",
                    fontSize: "0.72rem",
                    fontWeight: 900,
                    textTransform: "uppercase",
                  }}
                >
                  {lab.status}
                </span>
              </div>
              <p
                style={{
                  margin: "0.55rem 0 0",
                  color: "rgba(255,255,255,0.68)",
                  lineHeight: 1.55,
                }}
              >
                {lab.description}
              </p>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
