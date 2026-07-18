import { ProbeTemplateGallery } from "@/sandbox/probe-lab/ui/learning-space/probes/probe-lab/probe-template-gallery";

export default function ProbeGalleryPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem",
        color: "white",
        background:
          "radial-gradient(circle at top left, rgba(126,34,206,0.24), transparent 36%), linear-gradient(135deg, #050816, #111827)",
      }}
    >
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <p
          style={{
            margin: 0,
            color: "rgba(255,255,255,0.58)",
            fontSize: "0.75rem",
            fontWeight: 900,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          MyWay Probe Lab
        </p>

        <h1
          style={{
            margin: "0.75rem 0 0.6rem",
            fontSize: "clamp(2rem, 4vw, 3.5rem)",
          }}
        >
          Probe Template Gallery
        </h1>

        <p
          style={{
            margin: "0 0 2rem",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          Preview and test the available MyWay probe renderers.
        </p>

        <ProbeTemplateGallery />
      </div>
    </main>
  );
}
