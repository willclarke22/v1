# Blender Asset Foundry

Local-development sandbox:

`/sandbox/probe-lab/blender-python-builder`

The Foundry is now the focused foundation for creating missing MyWay assets with
Blender Python before those improvements are cascaded into other scene labs.

## Primary quality target

A valid GLB is necessary but not sufficient. The benchmark is the strongest
existing MyWay assets: readable silhouettes, believable proportions, coherent
connections, softened manufactured edges, layered construction, semantic
material regions, realistic PBR response, useful pivots, and detail appropriate
to the intended camera distance.

Initial benchmark classes:

- treasure chest: curved lid, wrapping bands, real hardware, wood/metal regions;
- camera: layered lens, recessed glass, body bevels, controls and strap;
- furniture: repeated slats, frame thickness, connected supports;
- apple: shaped silhouette, top depression, stem and surface response;
- burger: distinct irregular layers, controlled asymmetry and repeated details.

Organic characters remain a later advanced benchmark after direct native-bpy reliability is stable.

## Two page modes

### Guided build

`Describe -> Visual design + brief -> Match resources -> Prepare -> Generate -> Run -> Improve`

The main UI stays compact. The complete design JSON and detailed diagnostics are
collapsible.

### Code / paste

The full editable Blender Python workflow remains first-class. Manually pasted
code and GLM-generated code use the same trusted helper library, prepared
material slots, HDRI look-development, validation, inspection, export and
revision history.

## Asset Design Brief V2

`myway_asset_design_brief_v2` records:

- asset class, intended use, dimensions and triangle budget;
- silhouette shapes, identifying features, negative spaces and camera reads;
- proportions;
- semantic parts, hierarchy, connections, material slots and pivots;
- material intent and procedural fallbacks;
- HDRI look-development intent;
- measurable acceptance criteria and benchmark priorities.

Generation is staged: planning is separate from Blender Python generation.

## Text-authored visual description V1

The first guided-build action now creates an imagined reference sheet inside the
design brief instead of asking the code model to invent proportions while it is
writing Blender Python. `myway_asset_visual_description_v1` records:

- a design summary and explicit shape language;
- front, right, top and three-quarter descriptions;
- overall dimensions in asset-local metres;
- measurable normalized proportions with tolerances;
- one dimensioned and positioned layout entry for every semantic part;
- one visible material-region description for every semantic material slot;
- visual acceptance tests and uncertainty notes.

Planning uses two text-only GLM passes. The first authors the design and the
second independently audits dimensional consistency, supports, pivots,
orthographic agreement, material regions and missing construction choices. If
the review call fails, the normalized first-pass blueprint is retained and the
UI reports the fallback.

The visual description is included in the compact direct-GLM context and is the
primary source of truth for dimensions, part centres, normalized ratios and
view-dependent silhouette. This is the image-free reference-guided proof; an
automatic blockout and Nemotron comparison remain separate later steps.

## Direct GLM context package

GLM receives a compact direct-Blender context package rather than a procedural
geometry specification. The package contains the exact configured Blender and
Python versions, the semantic asset contract, only the selected material and
environment bindings, the compact MyWay resource/lifecycle boundary, and the
native vintage-camera script as the single proven code example.

Native `bpy`, `bmesh`, and `mathutils` are the primary modelling language.
MyWay remains responsible for trusted resource hydration, inspection, saving,
and export. The wheelchair reference path has been removed from the active
Foundry.

## R2 and AmbientCG resource boundary

- Cloudflare R2 is the authoritative ready-to-use library.
- The mirrored AmbientCG catalog is the discovery inventory.
- Original AmbientCG names and source ids remain unchanged.
- Runtime resolution never downloads.
- `Prepare resources` explicitly downloads the selected exact variant,
  normalizes it, publishes/verifies it in R2, updates the registry, and resolves
  the resource plan again.
- Draft, Standard, and Hero modes prefer 1K, 2K, and 4K variants respectively.
- Blender receives only a trusted temporary local resource manifest.
- Generated and pasted scripts use semantic calls such as
  `myway_material_slot("aged_metal")`; they never receive credentials, R2 object
  keys, or network access.
- A trusted procedural Principled material and neutral studio rig remain
  fallbacks.

## Trusted modelling framework

The V2 helper library adds profile extrusion, lathe surfaces, lofts, tubes,
arrays, mirrors, booleans, solidify, subdivision, UV helpers, PBR material-slot
construction, HDRI world setup, grounding, extent normalization, hinges, pivots,
and repeated placement.

## Inspection and quality loop

Every successful run writes:

- `.blend` and GLB;
- structural and topology validation;
- quality report;
- beauty, front, right, back, left and top views;
- neutral clay;
- material-ID;
- normal-orientation;
- wireframe;
- bounding-box/dimension view.

`Critique + revise code` sends the existing script, approved design brief,
validation, quality findings, and optional user feedback to GLM for a targeted
revision. Revisions keep separate job ids and can be restored from the page.

## Candidate boundary

`Save as library candidate` stores the source code, design/resource provenance,
validation and output references with status `needs_review`. Export success
never auto-approves an asset for normal scene use.

## Execution-workspace lifecycle

The active Blender Foundry still uses repository-local private/public workspaces
while a run is being inspected, critiqued, or restored in the lab. Those
workspaces are temporary review state, not durable asset storage.

Before every new Foundry execution, MyWay prunes both sides of the workspace
pair together:

- `MYWAY_FOUNDRY_WORKSPACE_LIMIT=5`
  keeps at most five active/recent Foundry execution workspaces by default.
- `MYWAY_FOUNDRY_WORKSPACE_MAX_AGE_HOURS=24`
  removes abandoned workspaces older than 24 hours.
- `MYWAY_KEEP_FOUNDRY_WORKSPACES=true`
  disables pruning only for an explicit debugging session.

The runner reserves one slot before starting the new job, so continued
experimentation cannot grow the Foundry workspace directories without bound.
A saved candidate is durable through the existing R2 candidate pipeline; its
local source execution remains only temporary review state and is governed by
the same bounded lifecycle.

## Safety

This remains a local sandbox, not a public Python execution service. User/model
code is size-limited, checked for unsafe imports/calls, run under
`--factory-startup`, timed out, and given no network/resource credentials.
Production execution still belongs in an isolated worker/container.

## Native vintage-camera cloud proof

The Foundry includes a focused proof fixture for the successful native-Blender
camera approach. Click `Load native camera proof`, then use the normal guided
resource steps:

1. `Match materials + HDRI` ranks the mirrored AmbientCG catalog automatically.
2. `Prepare uncached resources` downloads the exact selected variants, publishes
   them to Cloudflare R2, and resolves the plan again.
3. `Run code` hydrates only temporary local map/HDRI files for the installed
   Blender process, while the camera geometry remains ordinary native `bpy`.

The proof deliberately uses MyWay helpers only at the trusted resource boundary
(`myway_material_slot`) and for the appended inspection/export lifecycle. It does
not use the custom primitive geometry helpers. This separates modelling quality
from resource acquisition and avoids the earlier helper-signature failure mode.

A live proof execution writes `.blend`, `.glb`, inspection renders, and job
records only into the bounded Foundry review workspace. `Save as library
candidate` uses the existing R2 candidate pipeline for durable runtime/private
artifacts. The local execution workspace is not authoritative storage and is
removed by the Foundry age/count retention policy as experimentation continues.

## Compile smoke and execution diagnostics

Before a full asset run, Blender compiles both the model-authored source and the
assembled helper/source/footer script under `--background --factory-startup`.
Failures are classified as model code, trusted helper, trusted footer, or trusted
resource-layer failures. Traceback lines are mapped back to the editable source
line when possible and are passed into the bounded GLM repair loop.


## Material selection V2

Material matching now treats the ambientCG id as identity, not as a visual
description. Cached R2 materials and uncached catalog candidates pass the same
hard family gate. A material-family mismatch cannot be rescued by an R2-ready
bonus or a previous selection.

When an ambientCG material has a ready appearance profile, the Foundry compares
the slot's color, brightness, visible texture, finish, and avoid tags against the
profile's concise Nemotron description plus measured dominant colors and
brightness. A low-confidence material no longer automatically wins; the trusted
procedural material remains selected when no texture candidate clears the
confidence threshold.

Product-studio environment intent rejects forest, natural-exterior, urban, and
other incompatible HDRIs. The neutral studio rig wins when no compatible HDRI is
available. NormalDX maps are identified separately and their green channel is
inverted before Blender's Normal Map node.

## Context fidelity and image-grounded visual critic

The direct GLM context now preserves every part's `geometry_strategy` instead of
silently dropping the construction approach after planning. Code generation and
targeted improvement receive only the active asset-class strategy; the complete
class reference remains limited to the planning step. `soft_goods_upholstery` is
available for padded furniture, bags, cushions, and related non-character assets.

After a successful Blender run, `Analyze rendered asset` sends a controlled set
of standardized inspection views to the configured Nemotron vision model. The
critic compares visible evidence with the approved design brief and selected
resource intent, then stores `visual-critique.json` beside the job outputs.
Findings are routed explicitly:

- silhouette, proportion, structural connection, construction detail, part
  readability, and material-region assignment -> Blender code revision;
- texture scale/orientation/stretching and PBR response -> material mapping;
- exposure, reflections, and HDRI concerns -> look development;
- findings that the supplied views cannot diagnose -> human review.

`Critique + revise code` receives only the findings routed to Blender code while
also seeing the deferred findings and selected resource plan. It is told not to
rewrite geometry as a substitute for future material-mapping or look-development
controls. Saved review candidates retain the visual critique provenance, but no
visual score automatically approves an asset for normal scene use.

Optional Foundry-specific overrides are `MYWAY_FOUNDRY_VISION_MODEL`,
`MYWAY_FOUNDRY_VISION_BASE_URL`, and `MYWAY_FOUNDRY_VISION_API_KEY`. Without
those overrides, the critic reuses the Asset Library vision configuration and
then the normal NVIDIA configuration.

## Patch 3C: actionable material mapping and look development

The selected material and HDRI identities remain immutable after resource resolution.
The Foundry stores a separate `myway_foundry_look_adjustments_v1` layer that can be
changed without asking GLM to rewrite geometry:

- material physical scale, UV repeat, rotation and offset;
- UV or object-box mapping;
- normal, roughness and height strength;
- slot defaults with optional per-part overrides;
- HDRI strength and rotation, renderer exposure, background visibility and
  fallback-light energy.

`Re-run same code with look adjustments` executes the current Blender Python again
with the same resource IDs and a new look-adjustment manifest. Visual-critic
material-mapping and look-development findings may include one bounded adjustment
direction. Applying it changes one reviewable step only; the vision model never
writes unrestricted numerical settings.

## Patch 3D: frozen benchmark and regression harness

The frozen benchmark manifest covers the camera reference, treasure chest, thin-part
desk fan, upholstered chair, layered burger and an unseen hand-crank egg-beater
holdout. The holdout runs twice so planner, required-part, repair, visual-blocker and
material-selection stability can be compared.

The technical footer now uses `technical_ready` / `technical_strong` language. A
technical score is not release approval. Benchmark release requires all three gates:

1. measurable technical checks pass;
2. no unresolved high-confidence error-level geometry, mapping or look-development
   blocker remains;
3. a human reviewer approves the final revision.

Start the local app, then run the complete resumable harness:

```powershell
pnpm dev
```

In another PowerShell window:

```powershell
pnpm foundry:benchmark
```

Run one case or resume a prior run:

```powershell
pnpm foundry:benchmark -- -CaseId treasure_chest_connections
pnpm foundry:benchmark -- -ResumeRunId 20260803-013000
```

Benchmark checkpoints and reports are written outside the repository under
`Documents\MyWayBenchmarkRuns` by default. Successful expensive stages are reused
when a run is resumed. Automated passes remain pending until human review.

### Optional human-review input

Automated benchmark passes remain `pending_human_review`. To apply an explicit review without rerunning expensive planning, generation, Blender, or vision stages, create a JSON file keyed by `case_id` or by the repeated `case_run_id`:

```json
{
  "treasure_chest_connections": {
    "status": "approved",
    "reviewer": "Will",
    "reviewed_at": "2026-08-03T00:00:00.000Z",
    "notes": "Silhouette, connections, mapping, and look development approved."
  }
}
```

Then resume the existing benchmark run:

```powershell
pnpm foundry:benchmark -- -ResumeRunId <run-id> -HumanReviewFile C:\path\to\foundry-reviews.json
```

The inexpensive gate evaluation is recalculated on every resume, while successful expensive stages remain checkpointed.
