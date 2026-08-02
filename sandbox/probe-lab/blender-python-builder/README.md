
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
- wheelchair: connected tube frame, layered wheels, spokes, casters, fabric;
- camera: layered lens, recessed glass, body bevels, controls and strap;
- furniture: repeated slats, frame thickness, connected supports;
- apple: shaped silhouette, top depression, stem and surface response;
- burger: distinct irregular layers, controlled asymmetry and repeated details.

Dog and human-character quality remain later advanced-organic benchmarks.

## Two page modes

### Guided build

`Describe -> Design brief -> Match resources -> Prepare -> Generate -> Run -> Improve`

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

The first proof still writes generated `.blend`, `.glb`, inspection renders, and
job records to the existing local Foundry output folders. After the visual result
is approved, the next storage step is to publish those generated outputs to R2
and clean the local job/output copies after successful verification.
