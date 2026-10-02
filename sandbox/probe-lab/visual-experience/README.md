
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

### Search Bench V3 lexical hardening

The active lexical strategy is now `myway_asset_lexical_bm25_v2` while the V1 marker remains as a compatibility constant for historical verification. BodyParts3D hierarchy evidence is directional: asset concepts receive direct upward parent relations plus weak one-hop/two-hop ancestor context, but broad parent concepts no longer copy every child-specific term onto unrelated assets. This prevents high-fanout anatomy nodes from leaking terms such as `hip` into unrelated skull bones.

The prepared Search Document corpus and BM25 index are checked against the five-minute TTL **before** registry/catalog reads. Warm searches therefore measure resident retrieval rather than repeatedly paying cloud/registry/catalog preparation cost. Search Bench output breaks preparation into cache lookup, registry snapshot, catalog read, ontology-map construction, search-document construction, BM25-index construction, query scoring, and total search duration.

This remains the clean lexical/ontology baseline before the semantic-retrieval embedding pilot. It still performs zero embedding calls and zero extra model calls, and it intentionally does not hard-code functional paraphrase answers that should be solved by the later semantic layer.

## Semantic retrieval embedding pilot

The Orchestration Lab now keeps the fast lexical/ontology baseline and adds a
separate bounded semantic-retrieval experiment. The pilot intentionally does
not change BodyParts3D import: full-atlas Omni Vision and import-time embedding
generation remain OFF.

The pilot selects 96 deterministic, representative BodyParts3D search
documents, guarantees benchmark-relevant anatomy is included, then fills the
remaining sample across anatomical systems. Semantic retrieval text is derived
from Search Document V1 metadata/ontology only; it does not reuse the
appearance embedding text.

`nvidia/nemotron-3-embed-1b` is used through the existing asset embedding
provider contract with `input_type: "passage"` for indexed asset documents and
`input_type: "query"` for search requirements. Indexing is limited to four
passages per provider request. Every successful vector is written immediately
to the durable semantic-search embedding namespace and checkpointed in a
durable pilot state. Existing vectors are reused when model and source-text
hashes still match. Transient provider failures use bounded exponential
backoff and leave completed work resumable.

The Search Bench can compare:
- full-atlas lexical BM25 V2;
- semantic cosine ranking over whatever portion of the 96-asset pilot is
  durably indexed;
- a transparent hybrid pilot score combining lexical and semantic evidence.

Vectors remain retrieval evidence only. MyWay still owns ambiguity, review
state, grouping/region realization, geometry/directability checks, exact asset
binding, and runtime execution.

## Search Query / Search Document V2 candidate-generation benchmark

The next bounded retrieval experiment keeps every V1 baseline intact and adds a
separate V2 representation/indexing lane. `SearchQueryPacketV2` deterministically
compiles a semantic visual requirement into distinct identity-hint, full-intent,
and relationship/role query views plus structured anchors and execution constraints.
No exact asset id is authored by the model or query compiler.

`AssetSearchDocumentV2` derives separate identity, relationship, and optional
trusted role/use passages from Search Document V1. Relationship statements keep
source/provenance and graph distance. The role/use view is emitted only when
existing affordance/contains metadata supports it; V2 does not synthesize anatomy-
specific functional prose. Review state and runtime availability remain structured
execution facts rather than embedding authority.

The V2 semantic pilot deliberately reuses the same deterministic 96 source assets
but writes its multi-view vectors to a new `semantic-search-v2` durable namespace.
Identity and relationship passages are always indexed; a role passage is indexed
only when supported. Passage batches remain capped at four so the V1 operational
behavior remains comparable and resumable.

Comparison compiles three query embeddings and exposes independent lexical,
identity-vector, full-intent-vector, relationship-vector, and graph-anchor channels.
Candidate generation is a union problem, not a final selector: channels are
combined with Reciprocal Rank Fusion while preserving each channel rank as evidence.
The existing V1 fixed 35/65 hybrid remains available as a historical baseline and
is not promoted into the V2 grounding formula.

V2 also expands comparison timing so query compilation, pilot preparation/state,
document building, full/pilot lexical work, vector loading, query embedding wall
time, ranking, graph evidence, fusion, accounted time, unaccounted time, request
parsing, and route wrapper overhead are separately visible. This patch intentionally
adds no reranker, no GLM retrieval call, and no 2,234-asset semantic backfill. A
subsequent patch should evaluate the reranker only after V2 candidate recall and
latency are measured.

### Semantic Retrieval Reranker Pilot V1

After Query/Search Document V2 established bounded 96-asset candidate recall, the next benchmark adds a **separate second-stage reranker** without changing the historical V2 retrieval ranking. The serving path is intentionally split into a control plane and query plane:

- `Publish query-ready snapshot` performs the expensive pilot-state/corpus validation once, builds the 96-asset lexical index, loads the existing V2 vectors, and publishes an in-memory versioned snapshot.
- query-time serving reads that snapshot directly; it does **not** call `getPreparedAssetSearchCorpus()` or rebuild the V2 selection on each request;
- lexical, identity-vector, full-intent-vector, relationship-vector, graph-anchor evidence and Reciprocal Rank Fusion remain the first-stage candidate generator;
- only the RRF Top 20 are passed to `nvidia/llama-nemotron-rerank-vl-1b-v2` through NVIDIA's ranking endpoint;
- reranker passages are compiled deterministically from Search Document V2 identity/relationship/trusted role evidence. RRF rank/score is intentionally excluded from the passage so the cross-encoder judges candidate content independently;
- returned logits and reranker ranks are evidence only. This patch does not add Grounding Policy V2, automatic final asset resolution, Director binding, GLM refinement, ANN infrastructure, or the 2,234-asset semantic backfill.

The Orchestration Lab exposes snapshot publish/status, a tiny NVIDIA connectivity probe, the current-query RRF→reranker comparison, and a bounded benchmark smoke run. The initial benchmark fixture catalog contains 12 cases spanning endpoint-vs-intermediary, laterality, functional paraphrase, source/destination, relative position, specificity, and same-region/part-neighbor distractors. Ground-truth asset ids exist only in that benchmark fixture module and never influence production retrieval/reranking code.

Stage 2/3 orchestration additionally compiles **Query Packet V2 shadow output** from the GLM-authored semantic concepts and Stage-3 relationships. This is inspection-only: the existing deterministic resolver and lexical search remain the live calibration result, and no reranker/provider call is added to the Stage 1-3 route.

### Asset Semantic Evidence Pilot V1

The next bounded precision experiment inserts an explicit **evidence inspection layer** between candidate generation and reranking without changing the 96-asset retrieval baseline. Evidence is derived in-memory from authorities MyWay already possesses:

- source-provenanced Search Document V2 identity and ontology statements;
- verified asset metadata only when semantic review is actually `verified`;
- measured local bounds plus persisted shared-collection transforms, reconstructed into collection space;
- query-conditioned distances/projections to resolved semantic anchors.

Evidence is classified as `source_asserted`, `measured`, `reviewed`, or `model_inferred`. Pilot V1 authors **zero model-inferred permanent facts** and does not mutate `MyWayAssetRecord`. Unreviewed role/affordance metadata is surfaced as excluded diagnostic material rather than promoted to trusted reranker evidence.

Shared-space geometry stays deliberately literal. It may report collection-space bounds, centroid/bounds distances, anchor-segment projection, perpendicular distance, and interior fraction. It does not translate geometry into anatomical claims such as “articulates with,” “transmits rotation,” or “connects,” unless such semantics arrive from a future explicit trusted source. BodyParts3D is the first collection exercised because its imports retain invertible shared-space transforms, but the evidence machinery keys off generic `collection_id` + `runtime_collection_space` + measured geometry rather than anatomy names.

The Orchestration Lab now presents one current Asset Retrieval pipeline and moves historical V1/V2 maintenance controls into collapsed Diagnostics/History sections. Raw JSON remains available for evidence audits, passages, timings, historical candidate generation, and reranker outputs so experimental state can be shared without relying on screenshots.

`Evidence Passage V2` is compact and provenance-aware: it omits opaque source ids/alias noise, keeps direct source-backed relations and limited ancestor context, adds reviewed metadata only when verified, and adds deterministic query-conditioned spatial measurements when available. It is evaluated through an A/B reranker path that sends the **same query and same exact RRF Top 20** to `nvidia/llama-nemotron-rerank-vl-1b-v2` twice: once with historical Passage V1 and once with Evidence Passage V2. Existing embeddings, RRF, Query Packet semantics, Grounding Policy, Director binding, and the 2,234-asset semantic backfill remain unchanged.

The experiment therefore separates two questions:

1. **Is the evidence true and inspectable?** Use the evidence audit first.
2. **Does better evidence improve precision?** Only then run the V1 vs Evidence V2 reranker comparison.

A rank improvement is not itself authority. Both reranker lanes remain evidence-only until a later grounding/confidence policy is designed and benchmarked.

### Anchor Resolution V2 + Evidence Passage V3 pilot

The 96-asset serving/RRF shortlist remains the candidate authority boundary. Evidence-only anchor resolution may consult the prepared full collection source-document corpus to find source-backed identity/concept references that are absent from the 96 selected assets. Those reference assets never enter the candidate set merely because they were used as anchors.

Anchor Resolution V2 uses only canonical identity, aliases, and named concepts from the source-backed search documents. If an abstract query anchor has no source-backed identity/concept asset, it remains unresolved rather than being forced onto a nearby object. For assets sharing an invertible collection space, Evidence V2 measures candidate-to-anchor bounds/centroid distance plus two-anchor projection/corridor geometry. Endpoint identity is query-conditioned evidence only: when the Query Packet says an endpoint-only match is insufficient, Evidence Passage V3 may state that a candidate is itself a context endpoint without inventing a domain-specific semantic rule.

Evidence Passage V3 deliberately prunes generic ontology volume and emphasizes direct source-backed class/part-of evidence plus resolved reference-anchor measurements. It does not write AI-authored facts, does not regenerate the existing 192 semantic vectors, does not change RRF, does not grant grounding/execution authority, and does not perform a 2,234-asset semantic-vector backfill. The Orchestration Lab retains V1/V2 outputs and raw JSON for controlled V1 vs V2 vs V3 comparison.

