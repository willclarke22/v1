import { NextResponse } from "next/server";

import { auditManualTurnQuality, MANUAL_TURN_AUTHORING_CONTRACT } from "../quality-motion-audit";
import { buildManualTurnStorySync, MANUAL_TURN_STORY_CONTRACT } from "../story-script";
import { compileCinematicDirectorTimeline, CINEMATIC_DIRECTOR_CONTRACT } from "../cinematic-director";

import { assembleVisualLearningTurnFromSemanticDraft } from "../../visual-experience/assemble-visual-learning-turn";
import {
  buildSandboxDiagnosticRelationshipPreview,
  makeSandboxTopicDiagnosticState,
  normalizeDiagnosticSignal,
} from "../../visual-experience/diagnostic-relationships";
import { normalizeVisualLearningTurnOutput } from "../../visual-experience/normalize-visual-learning-turn-output";
import { resolveVisualLearningTurn } from "../../visual-experience/resolve-visual-learning-turn";
import { attachApprovedAssetsToVisualTurn } from "../../visual-experience/resolve-visual-learning-turn-assets.server";
import { isVisualLearningSemanticDraftLike } from "../../visual-experience/visual-learning-semantic-draft";
import {
  buildVisualLearningTurnInput,
  type VisualLearningTurnRequestBody,
} from "../../visual-experience/visual-learning-turn-request";
import type {
  VisualLearningTurnInput,
  VisualLearningTurnOutput,
} from "../../visual-experience/visual-learning-turn";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function looksLikeInput(value: unknown): value is VisualLearningTurnInput {
  return asRecord(value)?.schema_version === "myway_visual_learning_turn_input_v1";
}

function unwrapManualOutput(body: Record<string, unknown>): unknown {
  if (body.output !== undefined) return body.output;
  if (body.semantic_draft !== undefined) return body.semantic_draft;
  if (body.manual_output !== undefined) return body.manual_output;
  if (body.model_output !== undefined) return body.model_output;
  if (body.turn !== undefined) return body.turn;
  return body;
}

function requestBodyFromManualJson(
  body: Record<string, unknown>,
  rawOutput: unknown,
): VisualLearningTurnRequestBody {
  const output = asRecord(rawOutput);
  const topicResolution = asRecord(output?.topic_resolution);
  const learningFocus = asRecord(output?.learning_focus);
  const diagnosis = asRecord(output?.diagnosis);
  const metadata = asRecord(body.request_context) ?? asRecord(body.context) ?? {};

  return {
    learner_message:
      typeof metadata.learner_message === "string"
        ? metadata.learner_message
        : typeof body.learner_message === "string"
          ? body.learner_message
          : typeof learningFocus?.misunderstanding === "string"
            ? learningFocus.misunderstanding
            : typeof learningFocus?.root_problem === "string"
              ? learningFocus.root_problem
              : "Render this manually supplied MyWay learning turn.",
    topic_id:
      typeof metadata.topic_id === "string"
        ? metadata.topic_id
        : typeof topicResolution?.topic_id === "string"
          ? topicResolution.topic_id
          : null,
    topic_label:
      typeof metadata.topic_label === "string"
        ? metadata.topic_label
        : typeof topicResolution?.topic_label === "string"
          ? topicResolution.topic_label
          : typeof output?.topic_label === "string"
            ? output.topic_label
            : null,
    diagnosis:
      typeof metadata.diagnosis === "string"
        ? metadata.diagnosis
        : typeof diagnosis?.label === "string"
          ? diagnosis.label
          : "representation_gap",
    root_problem:
      typeof metadata.root_problem === "string"
        ? metadata.root_problem
        : typeof learningFocus?.misunderstanding === "string"
          ? learningFocus.misunderstanding
          : typeof learningFocus?.root_problem === "string"
            ? learningFocus.root_problem
            : null,
    bridge_level:
      typeof metadata.bridge_level === "string" ? metadata.bridge_level : "bridge_0",
    jargon_level:
      typeof metadata.jargon_level === "string" ? metadata.jargon_level : "plain_language",
    preferred_style:
      typeof metadata.preferred_style === "string"
        ? metadata.preferred_style
        : "visual_description",
    user_interests: Array.isArray(metadata.user_interests)
      ? metadata.user_interests.map(String).filter(Boolean)
      : [],
  } as VisualLearningTurnRequestBody;
}

function buildRelationshipPreview(output: VisualLearningTurnOutput) {
  if (output.turn_status !== "proceed") return null;

  const topicId = output.topic_resolution?.topic_id ?? "manual_topic";
  const topicLabel = output.topic_resolution?.topic_label ?? "Manual topic";
  const signal = normalizeDiagnosticSignal(output.diagnostic_signal);

  return buildSandboxDiagnosticRelationshipPreview({
    topic: makeSandboxTopicDiagnosticState({
      topic_id: topicId,
      topic_label: topicLabel,
      diagnostic_signal: signal,
    }),
  });
}

export async function POST(request: Request) {
  try {
    const body = asRecord(await request.json());
    if (!body) {
      return NextResponse.json(
        { ok: false, route: "manual-turn/render", error: "The request body must be a JSON object." },
        { status: 400 },
      );
    }

    const rawOutput = unwrapManualOutput(body);
    const input = looksLikeInput(body.input)
      ? body.input
      : buildVisualLearningTurnInput(requestBodyFromManualJson(body, rawOutput));

    const storySync = buildManualTurnStorySync(body);
    const qualityAudit = auditManualTurnQuality(body);
    const cinematicTimeline = compileCinematicDirectorTimeline(body);
    const semanticDraftDetected = isVisualLearningSemanticDraftLike(rawOutput);
    const assembly = semanticDraftDetected
      ? assembleVisualLearningTurnFromSemanticDraft(rawOutput, input)
      : null;
    const assemblyOutput = assembly?.output ?? rawOutput;
    const normalized = normalizeVisualLearningTurnOutput(assemblyOutput, input);
    const output = normalized.output as VisualLearningTurnOutput;
    const resolved = await attachApprovedAssetsToVisualTurn(
      resolveVisualLearningTurn(output, input),
      output,
    );
    const relationshipPreview = buildRelationshipPreview(output);

    return NextResponse.json({
      ok: true,
      route: "manual-turn/render",
      source: "manual_json",
      detected_source_shape: semanticDraftDetected ? "semantic_draft" : "strict_or_near_miss_output",
      input,
      raw_output: rawOutput,
      semantic_draft: semanticDraftDetected ? rawOutput : null,
      assembly: assembly?.report ?? null,
      assembled_output: assembly?.output ?? null,
      output,
      normalization: normalized.report,
      story_sync: storySync,
      cinematic_timeline: cinematicTimeline,
      cinematic_director_contract: CINEMATIC_DIRECTOR_CONTRACT,
      learner_script: {
        full_prompt: storySync.full_prompt,
        story_steps: storySync.story_steps,
      },
      diagnostic_signal: output.turn_status === "proceed" ? output.diagnostic_signal ?? null : null,
      relationship_preview: relationshipPreview,
      quality_audit: qualityAudit,
      story_contract: MANUAL_TURN_STORY_CONTRACT,
      authoring_contract: MANUAL_TURN_AUTHORING_CONTRACT,
      director_plan:
        output.turn_status === "proceed"
          ? output.visual_experience?.semantic_scene_plan?.director_plan ?? null
          : null,
      compatibility_scene:
        output.turn_status === "proceed"
          ? output.visual_experience?.semantic_scene_plan ?? null
          : null,
      resolved,
      diagnostics: {
        semantic_draft_detected: semanticDraftDetected,
        assembly_applied: Boolean(assembly),
        story_one_to_one_valid: storySync.one_to_one_valid,
        continuous_timeline_duration_ms: cinematicTimeline.duration_ms,
        exact_script_cue_count: cinematicTimeline.script_cues.length,
        motion_track_count: cinematicTimeline.motion_tracks.length,
        camera_keyframe_count: cinematicTimeline.camera_track.length,
        capability_warning_count: cinematicTimeline.capability_warnings.length,
        source_output_valid: resolved.source_output_valid,
        validation: resolved.validation,
        render_binding_count: resolved.render_bindings.length,
        queued_asset_need_count: resolved.queued_asset_needs.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isSyntaxError = error instanceof SyntaxError;
    return NextResponse.json(
      {
        ok: false,
        route: "manual-turn/render",
        error: isSyntaxError ? `Invalid JSON: ${message}` : message,
      },
      { status: isSyntaxError ? 400 : 500 },
    );
  }
}
