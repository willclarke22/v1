
# Visual Experience Sandbox

Visual Experience is the educational directing and immediate interactive
playback lane.

## Canonical source of truth

`semantic_scene_plan.director_plan` uses
`myway_educational_scene_director_v1` and owns:

- the scene thesis and learner takeaway;
- representation strategy;
- stable actor ids and semantic roles;
- one learner-attention job per moment;
- semantic behaviours and timing;
- camera focus and framing intent;
- concise timed text cues;
- success observations;
- late-binding policy for missing actors.

The model no longer needs to author separate `directed_scene`,
`scene_moments`, `story_beats`, and renderer beats. MyWay derives those
compatibility views from the director plan.

## Current execution path

1. Build a compact semantic draft from the learner message and diagnosis.
2. Normalize and validate the director plan.
3. Derive and validate `myway_scene_resource_plan_v1`.
4. Derive legacy story beats and executable semantic beats.
5. Resolve reviewed assets without changing actor ids or direction.
6. Compile spatial constraints, motion tracks, camera tracks, and geometry.
7. Play immediately in React Three Fiber with scrubbing and guided interaction.
8. Preserve warnings for behaviours or actors that need a richer future
   compiler.

## Asset independence

The scene must remain exceptionally directed before final assets exist.
Diagrammatic actors, paths, labels, and procedural effects can communicate the
mechanism while physical actors are unresolved. Later GLBs bind to the same
entity ids.

## Renderer growth

The director behaviour vocabulary is intentionally broader than the current
Three.js implementation. Each semantic event keeps a simpler compatibility
behaviour so current playback remains functional while richer behaviour
compilers are added.

A future Blender Scene Compiler should consume the same director plan for
premium rendering rather than creating a second lesson-planning format.

## Key files

- `../director/` — canonical educational contract, normalization, validation, adapters.
- `../scene-resources/` — shared execution-resource intent, validation, and Director adapter.
- `visual-learning-turn-request.ts` — model prompt and response contract.
- `assemble-visual-learning-turn.ts` — semantic draft to canonical output.
- `ui/scene-player/` — compatibility compilation and interactive playback.
- `resolve-visual-learning-turn-assets.server.ts` — late-bound reviewed actors.

## Phase 1B.5A shared Director shadow bridge

Visual Experience still retains its existing renderer/camera for visual stability,
but each active beat now shadow-samples the canonical Director/Universal Motion
Program/scene-state stack through `shared-director-runtime-adapter.ts`. The small
`Shared Director bridge` badge confirms the shadow path is active. This is the
first convergence step: it makes divergence measurable before a later patch
replaces the older Visual Experience motion/camera path after visual parity is
qualified.

## September 2026 production convergence

Visual Experience now preserves the learner-intelligence spine as the first
authority boundary:

`learner message -> diagnosis -> learning_focus.root_problem -> target_takeaway -> full_prompt`

Assets and cinematography remain downstream of that learning need. The model receives a
compact manifest generated from the canonical Director authoring registry; qualification
fixtures, camera coordinates, directability operators, pair-resolution internals, and
Builder placement math remain MyWay-owned. New qualified cinematic mechanisms can
therefore enter the canonical Director registry (including future mechanisms extracted
from reference-film analysis) without adding Visual-Experience-specific prompt branches.

When `scene.director_plan` is present, Visual Experience executes actor motion, camera,
lighting, and cross-moment state through the shared Director V2 / Universal Motion
Program runtime. The older Visual Experience camera/motion path is retained only as a
compatibility fallback for content without a canonical Director plan.

BodyParts3D is the first complete structured collection exercised through this path.
The full 2,234-element atlas may be used under an explicit sandbox-only Needs Review
exception without changing review state. Late-bound bindings preserve collection
membership and `runtime_transform` metadata so structured collections can retain their
canonical shared-space relationships instead of being treated as unrelated loose GLBs.

## Provider/fallback and prompt-budget hardening

Visual Experience now defaults NVIDIA GLM traffic to `z-ai/glm-5.3`. A stale
Visual-Experience/GLM environment value of `z-ai/glm-5.2` is treated as a retired
alias and resolves to GLM-5.3 before the request is sent. HTTP 404/410 model
unavailability is classified as non-transient, so retry logic does not repeatedly
call an unavailable model.

The deterministic scaffold is a canonical MyWay fallback, not model output. Provider
failure therefore validates/resolves that scaffold directly instead of re-normalizing
it through the model lane. Director-to-legacy semantic beats keep explanation-piece
ids and orientation-segment ids in their separate namespaces.

The Director model context is now a bounded, turn-specific palette derived from the
canonical production-active registry. Category breadth is preserved first, then
remaining slots are ranked against the learner message, preferred style, and active
asset collection. The canonical library can keep growing while per-turn prompt size
stays bounded.

## GLM-5.3 native reasoning and launch observability

Visual Experience resolves a GLM-5.3 request profile before the external model call.
Cinematic turns request `reasoning_effort: "max"` and reliable turns request
`reasoning_effort: "high"`. GLM sampling keeps `temperature` explicit while leaving
`top_p` neutral at `1` by default.

NVIDIA's GLM-5.3 model documentation recommends `clear_thinking=true` for chat, but
the current hosted `/v1/chat/completions` request schema does not expose
`clear_thinking` or `chat_template_kwargs` for this endpoint. Visual Experience
therefore records `clear_thinking_policy: "not_sent_hosted_api_schema"` instead of
sending an undocumented request field.

The hosted endpoint also may lag the model card's native `reasoning_effort` field.
MyWay prefers the documented model-native field first. If NVIDIA rejects that exact
request with HTTP 422, the provider performs one immediate same-model compatibility
retry without `reasoning_effort` and records both attempts. GLM-5.3's documented
server default is max reasoning, so a cinematic turn remains deep-reasoning even in
that compatibility path.

Pressing **Generate full turn** now runs the existing local full-turn debug route
first. That preflight does not call NVIDIA. It resolves and displays the actual
server-side provider/model, reasoning profile, sampling values, streaming/fallback
policy, and prompt size. Only after that contract is visible does the external model
call begin. After completion, the same panel switches to the actual successful
request profile and provider diagnostics.

## Orchestration Lab calibration ladder

The Visual Experience workbench now keeps the existing **Full Turn** integration lane intact and adds a sibling **Orchestration Lab** tab. The calibration lane deliberately starts from a much smaller model contract so GLM capability and latency can be measured before the full Visual Experience responsibilities are recombined.

The first three active stages are cumulative:

1. **Root problem** — infer the precise missing mental model only.
2. **Anatomy requirements** — add the minimum semantic anatomical concepts required to make that root problem visible. GLM never authors BodyParts3D ids; MyWay resolves exact/ambiguous atlas candidates deterministically.
3. **Target takeaway + relationships** — add the smallest corrective mental model and semantic mechanism relationships between the requested concepts.

Later teaching, semantic-scene, visual-thesis, Director orchestration, interaction, probe, and full-turn stages remain visibly locked until the early stages are fast and reliable. The calibration route uses the shared NVIDIA/GLM provider transport but intentionally runs one non-streamed attempt with no fallback so latency and capability are not hidden by retries. The Full Turn path remains unchanged and continues to be the end-to-end integration target.

## Semantic Asset Search Bench V1

The Orchestration Lab now keeps the original Stage 2 exact/phrase BodyParts3D resolver as a calibration baseline and adds the first generalized retrieval layer beside it.

`Asset Search Document V1` is built deterministically from real Asset Library records. For the BodyParts3D full atlas it augments each asset with named concepts, concept ids, static IS-A/PART-OF relationship terms, anatomical system, laterality, aliases/tags, affordances, collection identity, and review/runtime state. This search document is a retrieval representation; it does not grant scene-execution authority.

The first Search Bench strategy is intentionally lexical-only (`myway_asset_lexical_bm25_v1`). It uses a cached weighted BM25-style inverted index with identity/concept phrase bonuses. Stage 2/3 runs automatically search the semantic requirements produced by GLM, and the standalone search-only control can benchmark a concept/role/tags packet without making another GLM call. The response exposes index-build/search latency, matched terms, evidence fields, and ranked real asset candidates.

This phase deliberately makes **zero embedding calls** and **zero extra model calls**. Full BodyParts3D import continues to keep Omni Vision and embeddings OFF. Appearance embeddings remain a separate existing concept. Semantic-retrieval embeddings, a representative 50–100 asset pilot, hybrid fusion, reranking, resumable full-atlas backfill, and a dedicated ANN/vector index remain later benchmark-driven phases.
