
# GLM 5.2 + Cosmos3 Nano Video Lab

This sandbox tests:

```text
learner need
→ GLM 5.2 educational video direction
→ Cosmos3 Nano text-to-video
→ saved MP4 + full diagnostics
```

## Environment

Add the current hosted Cosmos3 Nano inference URL shown in NVIDIA Build to
`.env.local`:

```dotenv
NVIDIA_API_KEY=nvapi-...
MYWAY_COSMOS3_NANO_ENDPOINT=<current NVIDIA Cosmos3 Nano generator endpoint>
MYWAY_COSMOS3_NANO_TIMEOUT_MS=300000
```

The endpoint is intentionally configurable. NVIDIA's public model card documents
the JSON request and `b64_video` response, while the hosted Preview API URL has
not been consistently exposed on the public model page.

## URLs

- Lab: `/sandbox/probe-lab/cosmos-video`
- API: `/api/sandbox/probe-lab/cosmos-video/generate`
- Latest debug:
  `sandbox/probe-lab/cosmos-video/debug/latest-run.json`
- Generated videos:
  `public/sandbox-generated/cosmos3-nano/*.mp4`

## Current scope

- GLM 5.2 only for direction.
- Cosmos3 Nano text-to-video only.
- No asset library, Three.js scene, or Primitive Builder dependency.
- No automatic fallback to a paid model.
- Image-to-video is intentionally reserved for the next comparison phase.
