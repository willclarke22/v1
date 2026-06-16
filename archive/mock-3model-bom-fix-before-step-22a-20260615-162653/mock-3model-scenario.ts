import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildEvaluatedProbeAttemptSignal,
  routeEngineNextAction,
  toEngineRenderableProbe,
} from "@/lib/engine";
import type {
  DiagnosisModelOutput,
  EngineRenderableProbe,
  ProbeAttemptEvaluatorOutput,
  ProbeContractModelOutput,
} from "@/lib/engine";

type MockArtifact<TOutput> = {
  artifact_kind: string;
  artifact_version: string;
  scenario_id: string;
  description?: string;
  input_hint?: unknown;
  output: TOutput;
};

export type MockThreeModelScenario = {
  scenario_id: string;
  diagnosis: MockArtifact<DiagnosisModelOutput>;
  probe_contract: MockArtifact<ProbeContractModelOutput>;
  attempt_evaluation: MockArtifact<ProbeAttemptEvaluatorOutput>;
};

function readJsonFile<T>(relativePath: string): T {
  const absolutePath = join(process.cwd(), relativePath);
  return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
}

export function loadMockThreeModelScenario(
  scenarioId = "spanish_se_discrimination",
): MockThreeModelScenario {
  if (scenarioId !== "spanish_se_discrimination") {
    throw new Error(`Unknown mock 3-model scenario: ${scenarioId}`);
  }

  return {
    scenario_id: scenarioId,
    diagnosis: readJsonFile<MockArtifact<DiagnosisModelOutput>>(
      "models/diagnosis/mock-v0/spanish-se-discrimination.json",
    ),
    probe_contract: readJsonFile<MockArtifact<ProbeContractModelOutput>>(
      "models/probe-contract/mock-v0/spanish-se-single-choice.json",
    ),
    attempt_evaluation: readJsonFile<MockArtifact<ProbeAttemptEvaluatorOutput>>(
      "models/attempt-evaluator/mock-v0/spanish-se-selected-reflexive.json",
    ),
  };
}

export function buildMockRenderableProbe(
  probeContractOutput: ProbeContractModelOutput,
): EngineRenderableProbe {
  return toEngineRenderableProbe(probeContractOutput);
}

export function buildMockThreeModelTurn(scenarioId = "spanish_se_discrimination") {
  const scenario = loadMockThreeModelScenario(scenarioId);
  const renderableProbe = buildMockRenderableProbe(scenario.probe_contract.output);

  const diagnosisRoute = routeEngineNextAction({
    diagnosis_output: scenario.diagnosis.output,
  });

  const attemptRoute = routeEngineNextAction({
    attempt_evaluation_output: scenario.attempt_evaluation.output,
  });

  const evaluatedProbeAttemptSignal = buildEvaluatedProbeAttemptSignal({
    probe: {
      probe_type: scenario.probe_contract.output.probe_type,
      expected_attempt_type: scenario.probe_contract.output.expected_attempt_type,
      prompt: scenario.probe_contract.output.prompt,
      target_diagnosis: scenario.diagnosis.output.diagnosis,
    },
    attempt: {
      attempt_type: scenario.probe_contract.output.expected_attempt_type,
      response_summary: "Learner selected the fixed/reflexive interpretation.",
    },
    evaluation: scenario.attempt_evaluation.output,
  });

  const deliveredProbePreview = {
    id: "mock-probe-spanish-se-single-choice",
    topicId: "topic_spanish_se",
    topicLabel: "Spanish se",
    title: "Check what se is doing",
    instruction: scenario.probe_contract.output.prompt.full_prompt,
    helperText:
      "This mock probe came from models/probe-contract/mock-v0 through lib/engine.",
    expectedResponseType: scenario.probe_contract.output.expected_attempt_type,
    probeType: scenario.probe_contract.output.probe_type,
    probeContractSnapshot: {
      schema_version: "mock_probe_contract_snapshot_v0",
      source: "models/probe-contract/mock-v0/spanish-se-single-choice.json",
      engine_contract: scenario.probe_contract.output,
      engine_renderable_probe: renderableProbe,
    },
    engineRenderableProbe: renderableProbe,
  };

  return {
    status: "ok" as const,
    scenario_id: scenario.scenario_id,
    model_artifact_paths: {
      diagnosis: "models/diagnosis/mock-v0/spanish-se-discrimination.json",
      probe_contract: "models/probe-contract/mock-v0/spanish-se-single-choice.json",
      attempt_evaluator:
        "models/attempt-evaluator/mock-v0/spanish-se-selected-reflexive.json",
    },
    diagnosis_output: scenario.diagnosis.output,
    diagnosis_route: diagnosisRoute,
    probe_contract_output: scenario.probe_contract.output,
    renderable_probe: renderableProbe,
    delivered_probe_preview: deliveredProbePreview,
    attempt_evaluation_output: scenario.attempt_evaluation.output,
    attempt_route: attemptRoute,
    evaluated_probe_attempt_signal: evaluatedProbeAttemptSignal,
  };
}
