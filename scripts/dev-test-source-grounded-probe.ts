import {
  normalizeSourceInput,
} from "@/archive/old-engine/source-processing";
import {
  buildProbeAuthoringContext,
  buildSourceGroundedProbeInput,
} from "@/archive/old-engine/probe-authoring";
import {
  buildProbeContract,
} from "@/archive/old-engine/probes/build-probe-contract";

function printSection(title: string, value: unknown) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(value, null, 2));
}

const sourceText = `
Federalism is a system of government where authority is divided between a national government and regional governments. In the United States, the federal government has powers such as regulating interstate commerce, declaring war, and conducting foreign policy. States keep powers such as running most elections, managing local education systems, and creating many criminal and civil laws.

A key idea in American federalism is that neither level of government controls everything. When a political issue involves both national and state responsibilities, conflict can happen over which level has authority. For example, education policy, voting rules, public health responses, and environmental regulation can involve overlapping authority.

The Tenth Amendment is often used to express the idea that powers not delegated to the federal government are reserved to the states or the people. This does not mean states are always stronger than the federal government. It means the constitutional structure creates a division of powers, and many political disputes are partly disputes about where a power belongs.
`;

const normalized = normalizeSourceInput(
  {
    source_kind: "uploaded_document",
    title: "Federalism mini source",
    text: sourceText,
    origin_label: "dev-test-source-grounded-probe",
    topic_labels: ["American Politics", "Federalism"],
  },
  {
    max_chunk_chars: 900,
    min_chunk_chars: 250,
  },
);

const authoringContext = buildProbeAuthoringContext({
  topicLabel: "American Politics",
  sourceChunks: normalized.chunks,
  assessmentTarget: "representation",
  preferredRendererKinds: ["text_explanation", "multiple_choice"],
});

const sourceGroundedInput = buildSourceGroundedProbeInput(authoringContext, {
  targetDiagnosis: "representation_gap",
  intent: "diagnostic",
  probeType: "explain",
  preferTextExplanationUntilReviewed: true,
});

const contractResult = buildProbeContract(sourceGroundedInput.probe_input);
const contract = contractResult.contract;
const judgingScaffold =
  contract.judging_schema.source_grounded_judging_scaffold ?? null;

printSection("normalized source", {
  source_id: normalized.source.source_id,
  source_kind: normalized.source.source_kind,
  trust_level: normalized.source.trust_level,
  rights_scope: normalized.source.rights_scope,
  chunk_count: normalized.chunks.length,
  usable_for_probe_authoring: normalized.source.usable_for_probe_authoring,
  usable_for_strong_correctness_claims:
    normalized.source.usable_for_strong_correctness_claims,
});

printSection("normalized source chunks", normalized.chunks.map((chunk) => ({
  chunk_id: chunk.chunk_id,
  source_title: chunk.source_title,
  chunk_index: chunk.chunk_index,
  confidence: chunk.confidence,
  usable_for_probe_authoring: chunk.usable_for_probe_authoring,
  usable_for_strong_correctness_claims:
    chunk.usable_for_strong_correctness_claims,
  source_summary: chunk.source_summary,
  cautions: chunk.cautions,
})));

printSection("authoring context", {
  authoring_context_id: authoringContext.authoring_context_id,
  readiness: authoringContext.readiness,
  recommended_generation_mode: authoringContext.recommended_generation_mode,
  source_confidence: authoringContext.source_confidence,
  allowed_authoring_modes: authoringContext.allowed_authoring_modes,
  preferred_renderer_kinds: authoringContext.preferred_renderer_kinds,
  can_author_low_stakes_probe: authoringContext.can_author_low_stakes_probe,
  can_author_source_grounded_probe:
    authoringContext.can_author_source_grounded_probe,
  can_author_strong_answer_key: authoringContext.can_author_strong_answer_key,
  source_summary: authoringContext.source_summary,
});

printSection("source-grounded probe input", {
  generationMode: sourceGroundedInput.probe_input.generationMode,
  rendererKind: sourceGroundedInput.probe_input.rendererKind,
  sourceContentIds: sourceGroundedInput.probe_input.sourceContentIds,
  sourceTopicIds: sourceGroundedInput.probe_input.sourceTopicIds,
  normalizedSourceChunkCount:
    sourceGroundedInput.probe_input.normalizedSourceChunks?.length ?? 0,
  authoringContextId: sourceGroundedInput.probe_input.authoringContextId,
  rendererConfigOverrides:
    sourceGroundedInput.probe_input.rendererConfigOverrides ?? null,
  judgingScaffoldOverrides:
    sourceGroundedInput.probe_input.judgingScaffoldOverrides ?? null,
  sourceGroundedScaffold:
    sourceGroundedInput.source_grounded_scaffold
      ? {
          scaffold_id:
            sourceGroundedInput.source_grounded_scaffold.scaffold_id,
          source_title:
            sourceGroundedInput.source_grounded_scaffold.source_title,
          source_chunk_ids:
            sourceGroundedInput.source_grounded_scaffold.source_chunk_ids,
          source_focus_summary:
            sourceGroundedInput.source_grounded_scaffold.source_focus_summary,
          scaffold_confidence:
            sourceGroundedInput.source_grounded_scaffold.scaffold_confidence,
          requires_review:
            sourceGroundedInput.source_grounded_scaffold.requires_review,
          renderer_config_overrides:
            sourceGroundedInput.source_grounded_scaffold
              .renderer_config_overrides,
          reasons: sourceGroundedInput.source_grounded_scaffold.reasons,
          cautions: sourceGroundedInput.source_grounded_scaffold.cautions,
        }
      : null,
  sourceGroundedJudgingScaffold:
    sourceGroundedInput.source_grounded_judging_scaffold
      ? {
          scaffold_id:
            sourceGroundedInput.source_grounded_judging_scaffold.scaffold_id,
          source_chunk_ids:
            sourceGroundedInput.source_grounded_judging_scaffold
              .source_chunk_ids,
          source_focus_summary:
            sourceGroundedInput.source_grounded_judging_scaffold
              .source_focus_summary,
          success_hint_candidates:
            sourceGroundedInput.source_grounded_judging_scaffold
              .success_hint_candidates,
          failure_hint_candidates:
            sourceGroundedInput.source_grounded_judging_scaffold
              .failure_hint_candidates,
          misconception_hint_candidates:
            sourceGroundedInput.source_grounded_judging_scaffold
              .misconception_hint_candidates,
          confidence:
            sourceGroundedInput.source_grounded_judging_scaffold.confidence,
          requires_review:
            sourceGroundedInput.source_grounded_judging_scaffold
              .requires_review,
          reasons: sourceGroundedInput.source_grounded_judging_scaffold.reasons,
          cautions:
            sourceGroundedInput.source_grounded_judging_scaffold.cautions,
        }
      : null,
  sourceMetadata: {
    contract_source: sourceGroundedInput.source_metadata.contract_source,
    grounding_source_ids:
      sourceGroundedInput.source_metadata.grounding_source_ids,
    source_refs_count: sourceGroundedInput.source_metadata.source_refs.length,
    content_confidence: sourceGroundedInput.source_metadata.content_confidence,
    allowed_claim_strength:
      sourceGroundedInput.source_metadata.allowed_claim_strength,
    requires_review: sourceGroundedInput.source_metadata.requires_review,
  },
});

printSection("final probe contract", {
  contract_id: contract.contract_id,
  version: contract.version,
  renderer_config: {
    renderer_kind: contract.renderer_config.renderer_kind,
    title: contract.renderer_config.title,
    instructions: contract.renderer_config.instructions,
    prompt: contract.renderer_config.prompt,
    thumbnail_label: contract.renderer_config.thumbnail_label,
    thumbnail_icon: contract.renderer_config.thumbnail_icon,
    estimated_seconds: contract.renderer_config.estimated_seconds,
    ui_hints: contract.renderer_config.ui_hints,
  },
  generation_metadata: contract.generation_metadata,
  source_metadata: {
    contract_source: contract.source_metadata?.contract_source,
    grounding_source_ids: contract.source_metadata?.grounding_source_ids,
    source_refs_count: contract.source_metadata?.source_refs.length,
    source_refs: contract.source_metadata?.source_refs,
    content_confidence: contract.source_metadata?.content_confidence,
    allowed_claim_strength: contract.source_metadata?.allowed_claim_strength,
    can_make_strong_correctness_claim:
      contract.source_metadata?.can_make_strong_correctness_claim,
    requires_review: contract.source_metadata?.requires_review,
    normalized_source_chunk_ids:
      contract.source_metadata?.normalized_source_chunk_ids,
  },
  judging_schema_summary: {
    success_markers: contract.judging_schema.success_markers.map((marker) => ({
      label: marker.label,
      description: marker.description,
      required: marker.required,
      weight: marker.weight,
    })),
    failure_markers: contract.judging_schema.failure_markers.map((marker) => ({
      label: marker.label,
      description: marker.description,
      maps_to_diagnosis: marker.maps_to_diagnosis,
      severity: marker.severity,
    })),
    source_grounded_judging_scaffold: judgingScaffold
      ? {
          scaffold_id: judgingScaffold.scaffold_id,
          source_chunk_ids: judgingScaffold.source_chunk_ids,
          source_focus_summary: judgingScaffold.source_focus_summary,
          success_hint_candidates: judgingScaffold.success_hint_candidates,
          failure_hint_candidates: judgingScaffold.failure_hint_candidates,
          misconception_hint_candidates:
            judgingScaffold.misconception_hint_candidates,
          confidence: judgingScaffold.confidence,
          requires_review: judgingScaffold.requires_review,
          reasons: judgingScaffold.reasons,
          cautions: judgingScaffold.cautions,
        }
      : null,
    expected_judging_methods: contract.judging_schema.expected_judging_methods,
    expected_evidence_tier: contract.judging_schema.expected_evidence_tier,
    deterministic_judging_available:
      contract.judging_schema.deterministic_judging_available,
    rubric_judging_required: contract.judging_schema.rubric_judging_required,
  },
  quality_metadata: {
    quality_score: contract.quality_metadata?.quality_score,
    reuse_status: contract.quality_metadata?.reuse_status,
    review_priority: contract.quality_metadata?.review_priority,
    can_be_cached_as_learning_object:
      contract.quality_metadata?.can_be_cached_as_learning_object,
    safe_to_reuse_without_review:
      contract.quality_metadata?.safe_to_reuse_without_review,
  },
  cache_candidate: {
    cache_action: contract.cache_candidate?.cache_action,
    reuse_status: contract.cache_candidate?.reuse_status,
    promote_when: contract.cache_candidate?.promote_when,
  },
  reasons: contract.reasons.slice(0, 16),
  cautions: contract.cautions.slice(0, 16),
});

printSection("quick check", {
  prompt_is_source_shaped:
    contract.renderer_config.prompt.includes("Federalism mini source") ||
    contract.renderer_config.prompt.includes("source"),
  has_renderer_config_overrides:
    Boolean(sourceGroundedInput.probe_input.rendererConfigOverrides?.prompt),
  has_judging_scaffold_overrides:
    Boolean(sourceGroundedInput.probe_input.judgingScaffoldOverrides),
  contract_has_source_grounded_judging_scaffold:
    Boolean(contract.judging_schema.source_grounded_judging_scaffold),
  judging_scaffold_remains_provisional:
    contract.judging_schema.source_grounded_judging_scaffold
      ?.requires_review === true,
  remains_conservative:
    contract.source_metadata?.allowed_claim_strength === "conservative",
  remains_debug_only:
    contract.cache_candidate?.cache_action === "debug_only",
});
