import type { NextConfig } from "next";

const blenderHydrationTraceExcludes = [
  "./.git/**/*",
  "./datasets/**/*",
  "./assets/**/*",
  "./public/sandbox-assets/myway/**/*",
  "./sandbox/probe-lab/assets/debug/**/*",
  "./sandbox/probe-lab/assets/jobs/**/*",
  "./sandbox/probe-lab/assets/inbox/**/*",
  "./sandbox/probe-lab/assets/downloads/**/*",
  "./sandbox/probe-lab/assets/embeddings/**/*",
  "./sandbox/probe-lab/assets/enrichment/cache/**/*",
  "./sandbox/probe-lab/blender-python-builder/jobs/**/*",
  "./myway-sandbox-active-files-one-notepad.txt",
  "./myway-blenderkit-tennis-ball-diagnosis.txt",
];

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "/api/sandbox/probe-lab/assets/import-local":
      blenderHydrationTraceExcludes,
    "/api/sandbox/probe-lab/assets/library":
      blenderHydrationTraceExcludes,
    "/api/sandbox/probe-lab/assets/attributions":
      blenderHydrationTraceExcludes,
    "/api/sandbox/probe-lab/blender-python-builder/execute-with-repair":
      blenderHydrationTraceExcludes,
    "/api/sandbox/probe-lab/blender-python-builder/execute":
      blenderHydrationTraceExcludes,
    "/api/sandbox/probe-lab/blender-python-builder/generate":
      blenderHydrationTraceExcludes,
    "/api/sandbox/probe-lab/blender-python-builder/improve":
      blenderHydrationTraceExcludes,
    "/api/sandbox/probe-lab/blender-python-builder/repair":
      blenderHydrationTraceExcludes,
    "/api/sandbox/probe-lab/blender-python-builder/plan":
      blenderHydrationTraceExcludes,
    "/api/sandbox/probe-lab/blender-python-builder/visual-critique":
      blenderHydrationTraceExcludes,
    "/api/sandbox/probe-lab/resource-runtime/blender-hydrate":
      blenderHydrationTraceExcludes,
    "/api/sandbox/probe-lab/resource-runtime/materials/blender-hydrate":
      blenderHydrationTraceExcludes,
    "/api/sandbox/probe-lab/resource-runtime/environments/blender-hydrate":
      blenderHydrationTraceExcludes,
  },
};

export default nextConfig;
