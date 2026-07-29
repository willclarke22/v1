# Blender Python Asset Builder

Local-development sandbox for:

1. Asking GLM 5.2 to write Blender Python.
2. Inspecting, editing, or pasting Python in the browser.
3. Running Blender headlessly.
4. Saving the `.blend`, GLB, logs, manifest, and preview render.
5. Loading the GLB in a Three.js viewer.

## Page

`/sandbox/probe-lab/blender-python-builder`

## Environment

- `NVIDIA_API_KEY`
- Optional `NVIDIA_BASE_URL`
- Optional `MYWAY_GLM_BLENDER_PYTHON_MODEL`
- `BLENDER_EXECUTABLE` when Blender is not found automatically

## Safety boundary

This is a local sandbox, not a public production execution service. The server rejects several unsafe Python imports/calls, applies a script-size limit, runs Blender with `--factory-startup`, and terminates long jobs. This is not a complete security sandbox; production use should execute jobs in an isolated worker/container.

## Output

Private job records:

`sandbox/probe-lab/blender-python-builder/jobs/<job-id>/`

Browser-facing outputs:

`public/sandbox-assets/myway/blender-python-builder/<job-id>/`

## GLM generation / repair behavior

- GLM generation and repair requests now allow up to 300 seconds.
- The NVIDIA chat-completions request uses `stream: true` and assembles the streamed code server-side.
- Timeout errors are converted into a clear message instead of the raw â€œThis operation was abortedâ€.
- Generation metadata includes elapsed time and transport type for the UI.
- Prompts continue to enforce Blender mode, active-object, selection, modifier, BMesh refresh, and version-compatibility rules.