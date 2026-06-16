import {
  createModelCallRow,
  createRuleBasedDiagnosisProvider,
  logModelCall,
  routeEngineNextAction,
  runDiagnosis,
} from "@/lib/engine";
import type {
  DiagnosisLabel,
  DiagnosisModelInput,
} from "@/lib/engine";

type MessageShadowTopic = {
  id?: string | null;
  topic_label?: string | null;
  label?: string | null;
  topic_name?: string | null;
  name?: string | null;
};

type MessageShadowDecision = {
  active_diagnosis?: unknown;
  mode_selected?: unknown;
  target_topic_id?: unknown;
};

export type MessageDiagnosisEngineShadowInput = {
  runId: string;
  message: string;
  targetTopic?: MessageShadowTopic | null;
  activeDiagnosis?: unknown;
  decision?: MessageShadowDecision | null;
  resolutionKind?: unknown;
  matchConfidence?: unknown;
  createdTopic?: unknown;
};

export type MessageDiagnosisEngineShadowResult =
  | {
      status: "ok";
      diagnosis: DiagnosisLabel;
      next_action: string;
      route_next_action: string;
      keep_topic_open: boolean;
      validation_issue_count: number;
    }
  | {
      status: "error";
      error: string;
    };

function getTopicLabel(topic?: MessageShadowTopic | null): string | null {
  return (
    topic?.topic_label ??
    topic?.label ??
    topic?.topic_name ??
    topic?.name ??
    null
  );
}

function getTopicId(topic?: MessageShadowTopic | null): string | null {
  return topic?.id ?? null;
}

function shouldLogShadowOutput(): boolean {
  return process.env.MYWAY_ENGINE_SHADOW_LOG === "1";
}

function buildDiagnosisInput(
  input: MessageDiagnosisEngineShadowInput,
): DiagnosisModelInput {
  return {
    schema_version: "diagnosis_model_input_v1",
    input_kind: "user_message",
    user_message: {
      text: input.message,
    },
  };
}

export async function runMessageDiagnosisEngineShadow(
  input: MessageDiagnosisEngineShadowInput,
): Promise<MessageDiagnosisEngineShadowResult> {
  try {
    const provider = createRuleBasedDiagnosisProvider();
    const modelInput = buildDiagnosisInput(input);

    const run = await runDiagnosis({
      provider,
      model_input: modelInput,
    });

    const route = routeEngineNextAction({
      diagnosis_output: run.output,
    });

    await logModelCall(
      createModelCallRow({
        call_kind: "diagnosis",
        provider: {
          provider_kind: "fallback",
          provider_name: provider.provider_name,
          provider_version: provider.provider_kind,
        },
        input: modelInput,
        output: run.output,
        validation_issues: run.validation.issues,
        context: {
          request_id: input.runId,
          topic_id: getTopicId(input.targetTopic),
          topic_label: getTopicLabel(input.targetTopic),
        },
      }),
    );

    if (shouldLogShadowOutput()) {
      console.info("[MyWay engine shadow/message-diagnosis]", {
        runId: input.runId,
        topic_id: getTopicId(input.targetTopic),
        topic_label: getTopicLabel(input.targetTopic),
        legacy_active_diagnosis:
          input.decision?.active_diagnosis ?? input.activeDiagnosis ?? null,
        legacy_mode_selected: input.decision?.mode_selected ?? null,
        resolution_kind: input.resolutionKind ?? null,
        match_confidence:
          typeof input.matchConfidence === "number" &&
          Number.isFinite(input.matchConfidence)
            ? input.matchConfidence
            : null,
        created_topic: Boolean(input.createdTopic),
        diagnosis: run.output.diagnosis,
        diagnosis_confidence: run.output.diagnosis_confidence,
        route,
        validation_issue_count: run.validation.issues.length,
      });
    }

    return {
      status: "ok",
      diagnosis: run.output.diagnosis,
      next_action: run.output.next_action,
      route_next_action: route.next_action,
      keep_topic_open: route.keep_topic_open,
      validation_issue_count: run.validation.issues.length,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown message diagnosis shadow error.";

    console.warn("[MyWay engine shadow/message-diagnosis] skipped after error", {
      runId: input.runId,
      error: message,
    });

    return {
      status: "error",
      error: message,
    };
  }
}

