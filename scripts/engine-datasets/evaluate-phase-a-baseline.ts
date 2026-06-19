#!/usr/bin/env tsx

/**
 * MyWay Phase A baseline evaluator.
 *
 * Reads validated Phase A split JSONL files produced by:
 *   scripts/engine-datasets/export-validate-phase-a-workbooks.ts
 *
 * Default input:
 *   datasets/engine-datasets/splits/{diagnosis,probe-contract,attempt-evaluator}/test.jsonl
 *
 * Writes:
 *   datasets/engine-datasets/reports/phase-a-baseline-eval-report.json
 *   datasets/engine-datasets/reports/phase-a-baseline-eval-summary.txt
 *   datasets/engine-datasets/reports/phase-a-baseline-errors.jsonl
 *   datasets/engine-datasets/predictions/baseline/{model}/{split}.jsonl
 *
 * Run from repo root:
 *   npx tsx scripts/engine-datasets/evaluate-phase-a-baseline.ts
 *
 * Useful options:
 *   --split validation       Evaluate one split. Default: test.
 *   --all-splits             Evaluate train, validation, and test.
 *   --no-predictions         Do not write prediction JSONL files.
 *   --splits-dir <path>      Override split input directory.
 *   --out-root <path>        Override datasets/engine-datasets output root.
 */

import fs from "node:fs";
import path from "node:path";

type ModelTarget = "diagnosis" | "probe_contract" | "attempt_evaluator";
type SplitName = "train" | "validation" | "test";
type JsonRecord = Record<string, unknown>;

type TrainingExample = {
  schema_version: "myway_engine_training_example_v1";
  example_id: string;
  source_workbook?: string;
  source_sheet?: string;
  source_row_number?: number;
  batch_id?: string;
  flow_id?: string;
  split_flow_key?: string;
  model_target: ModelTarget;
  input: unknown;
  output: unknown;
};

type PredictionRecord = {
  schema_version: "myway_phase_a_baseline_prediction_v1";
  baseline_name: string;
  split: SplitName;
  model_target: ModelTarget;
  example_id: string;
  source_workbook?: string;
  source_sheet?: string;
  source_row_number?: number;
  input: unknown;
  gold_output: unknown;
  predicted_output: unknown;
  validation_errors: ValidationIssue[];
  scores: Record<string, unknown>;
};

type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  model_target?: ModelTarget;
  example_id?: string;
  field_path?: string;
  value?: unknown;
};

type EvalAccumulator = {
  model_target: ModelTarget;
  split: SplitName;
  total: number;
  schemaValid: number;
  validationErrorCount: number;
  exactMatches: Record<string, number>;
  numericSums: Record<string, number>;
  numericCounts: Record<string, number>;
};

const REPO_ROOT = process.cwd();
const DEFAULT_OUT_ROOT = path.join(REPO_ROOT, "datasets", "engine-datasets");
const OUT_ROOT = getArgValue("--out-root") ?? DEFAULT_OUT_ROOT;
const SPLITS_DIR = getArgValue("--splits-dir") ?? path.join(OUT_ROOT, "splits");
const REPORTS_DIR = path.join(OUT_ROOT, "reports");
const PREDICTIONS_DIR = path.join(OUT_ROOT, "predictions", "baseline");

const BASELINE_NAME = "phase_a_deterministic_schema_baseline_v1";
const WRITE_PREDICTIONS = !process.argv.includes("--no-predictions");
const ALL_SPLITS = process.argv.includes("--all-splits");
const REQUESTED_SPLIT = (getArgValue("--split") ?? "test") as SplitName;
const SPLITS_TO_EVALUATE: SplitName[] = ALL_SPLITS ? ["train", "validation", "test"] : [REQUESTED_SPLIT];

const MODEL_DIR_BY_TARGET: Record<ModelTarget, string> = {
  diagnosis: "diagnosis",
  probe_contract: "probe-contract",
  attempt_evaluator: "attempt-evaluator",
};

const MODEL_TARGET_BY_DIR: Record<string, ModelTarget> = {
  diagnosis: "diagnosis",
  "probe-contract": "probe_contract",
  "attempt-evaluator": "attempt_evaluator",
};

const DIAGNOSIS_LABELS = new Set([
  "unknown",
  "no_gap_detected",
  "recall_gap",
  "representation_gap",
  "procedure_gap",
  "discrimination_gap",
  "transfer_gap",
  "metacognitive_gap",
]);

const DIAGNOSIS_NEXT_ACTIONS = new Set([
  "ask_clarifying_question",
  "generate_probe_contract",
  "give_feedback",
  "summarize_progress",
]);

const ATTEMPT_NEXT_ACTIONS = new Set([
  "give_feedback",
  "target_misconception",
  "generate_followup_probe",
  "ask_clarifying_question",
  "summarize_progress",
]);

const PROBE_TYPES = new Set([
  "explain",
  "discriminate",
  "apply_transfer",
  "sequence",
  "single_choice",
  "multi_choice",
  "drag_drop_placements",
  "predict",
  "slider",
  "graph_relationship",
  "audio_clip_question",
  "audio_response_question",
  "video_click_interval",
  "video_explanation",
]);

const ATTEMPT_TYPES = new Set([
  "text",
  "single_choice",
  "multi_choice",
  "ordered_items",
  "drag_drop_placements",
  "numeric",
  "graph",
  "audio_response",
  "video_click",
  "none",
  "unknown",
]);

const BRIDGE_LEVELS = new Set(["bridge_0", "bridge_1", "bridge_2", "full_bridge"]);
const JARGON_LEVELS = new Set(["none", "light", "standard", "full"]);

const PRESENTATION_STYLES = new Set([
  "plain_direct",
  "gentle_coaching",
  "analogy_based",
  "metaphor_based",
  "concrete_examples",
  "step_by_step",
  "visual_description",
  "curiosity_question",
  "real_world_connection",
]);

const SUPPORT_KINDS = new Set([
  "analogy",
  "metaphor",
  "contrast",
  "example",
  "real_world_connection",
  "visual_description",
  "step_by_step_frame",
  "curiosity_hook",
]);

const ALLOWED_ATTEMPTS_BY_PROBE: Record<string, Set<string>> = {
  explain: new Set(["text"]),
  discriminate: new Set(["single_choice"]),
  apply_transfer: new Set(["text"]),
  sequence: new Set(["ordered_items"]),
  single_choice: new Set(["single_choice"]),
  multi_choice: new Set(["multi_choice"]),
  drag_drop_placements: new Set(["drag_drop_placements"]),
  predict: new Set(["single_choice", "numeric"]),
  slider: new Set(["numeric"]),
  graph_relationship: new Set(["graph"]),
  audio_clip_question: new Set(["single_choice", "multi_choice"]),
  audio_response_question: new Set(["audio_response"]),
  video_click_interval: new Set(["video_click"]),
  video_explanation: new Set(["none"]),
};

main();

function main() {
  ensureDir(REPORTS_DIR);
  if (WRITE_PREDICTIONS) ensureDir(PREDICTIONS_DIR);

  const startedAt = new Date().toISOString();
  const predictions: PredictionRecord[] = [];
  const allIssues: ValidationIssue[] = [];
  const accumulators = new Map<string, EvalAccumulator>();
  const missingFiles: string[] = [];

  console.log(`Evaluating Phase A baseline from ${relativeToRoot(SPLITS_DIR)}...`);
  console.log(`Split(s): ${SPLITS_TO_EVALUATE.join(", ")}`);

  for (const split of SPLITS_TO_EVALUATE) {
    for (const [modelDir, modelTarget] of Object.entries(MODEL_TARGET_BY_DIR)) {
      const splitPath = path.join(SPLITS_DIR, modelDir, `${split}.jsonl`);
      if (!fs.existsSync(splitPath)) {
        missingFiles.push(relativeToRoot(splitPath));
        continue;
      }

      const examples = readJsonl<TrainingExample>(splitPath);
      const acc = makeAccumulator(modelTarget, split);
      accumulators.set(`${modelTarget}:${split}`, acc);

      for (const example of examples) {
        if (example.model_target !== modelTarget) {
          allIssues.push({
            severity: "error",
            code: "model_target_mismatch",
            message: `File ${relativeToRoot(splitPath)} contains model_target=${example.model_target}.`,
            model_target: modelTarget,
            example_id: example.example_id,
          });
          continue;
        }

        const predictedOutput = runBaseline(example);
        const validationErrors = validatePredictedOutput(example.model_target, predictedOutput, example.example_id);
        allIssues.push(...validationErrors);

        const scores = scorePrediction(example, predictedOutput, validationErrors);
        updateAccumulator(acc, scores, validationErrors);

        predictions.push({
          schema_version: "myway_phase_a_baseline_prediction_v1",
          baseline_name: BASELINE_NAME,
          split,
          model_target: modelTarget,
          example_id: example.example_id,
          source_workbook: example.source_workbook,
          source_sheet: example.source_sheet,
          source_row_number: example.source_row_number,
          input: example.input,
          gold_output: example.output,
          predicted_output: predictedOutput,
          validation_errors: validationErrors,
          scores,
        });
      }
    }
  }

  if (missingFiles.length > 0) {
    for (const file of missingFiles) {
      allIssues.push({
        severity: "error",
        code: "missing_split_file",
        message: `Missing split file: ${file}`,
      });
    }
  }

  if (WRITE_PREDICTIONS) {
    writePredictions(predictions);
  }

  const report = buildReport(startedAt, predictions, accumulators, allIssues, missingFiles);
  const reportPath = path.join(REPORTS_DIR, "phase-a-baseline-eval-report.json");
  const summaryPath = path.join(REPORTS_DIR, "phase-a-baseline-eval-summary.txt");
  const errorsPath = path.join(REPORTS_DIR, "phase-a-baseline-errors.jsonl");

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(summaryPath, formatSummary(report), "utf8");
  fs.writeFileSync(errorsPath, allIssues.map((issue) => JSON.stringify(issue)).join("\n") + (allIssues.length ? "\n" : ""), "utf8");

  const errorCount = allIssues.filter((issue) => issue.severity === "error").length;
  const warningCount = allIssues.filter((issue) => issue.severity === "warning").length;

  console.log("\nDone. Baseline evaluation complete.");
  console.log(`Examples evaluated: ${predictions.length}`);
  console.log(`Validation errors: ${errorCount}`);
  console.log(`Warnings: ${warningCount}`);
  console.log(`Report: ${relativeToRoot(reportPath)}`);
  console.log(`Summary: ${relativeToRoot(summaryPath)}`);
  console.log(`Errors: ${relativeToRoot(errorsPath)}`);
  if (WRITE_PREDICTIONS) console.log(`Predictions: ${relativeToRoot(PREDICTIONS_DIR)}`);

  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

function runBaseline(example: TrainingExample): unknown {
  if (example.model_target === "diagnosis") return predictDiagnosis(example.input);
  if (example.model_target === "probe_contract") return predictProbeContract(example.input);
  if (example.model_target === "attempt_evaluator") return predictAttemptEvaluator(example.input);
  return null;
}

function predictDiagnosis(inputValue: unknown): JsonRecord {
  const input = recordOrEmpty(inputValue);

  if (input.input_kind === "evaluated_probe_attempt") {
    const signal = recordOrEmpty(input.evaluated_probe_attempt);
    const probe = recordOrEmpty(signal.probe);
    const evaluation = recordOrEmpty(signal.evaluation);
    const evidence = recordOrEmpty(evaluation.understanding_evidence);
    const correctness = numberOr(evaluation.correctness, 0.5);
    const targetDiagnosis = diagnosisOr(probe.target_diagnosis, "unknown");
    const supportsUnderstanding = evidence.supports_understanding === true;
    const needsVerification = evidence.needs_verification_probe === true || evidence.may_be_lucky_guess === true;
    const evalNextAction = stringOrNull(evaluation.next_action);

    let diagnosis = targetDiagnosis;
    let nextAction: string = "generate_probe_contract";
    let diagnosisConfidence = clamp(0.52 + Math.abs(correctness - 0.5) * 0.5);
    let nextActionConfidence = 0.72;

    if (correctness >= 0.88 && supportsUnderstanding && !needsVerification) {
      diagnosis = "no_gap_detected";
      nextAction = "summarize_progress";
      diagnosisConfidence = 0.78;
      nextActionConfidence = 0.76;
    } else if (evalNextAction === "target_misconception") {
      nextAction = "generate_probe_contract";
      diagnosisConfidence = clamp(diagnosisConfidence + 0.12);
      nextActionConfidence = 0.8;
    } else if (evalNextAction === "ask_clarifying_question") {
      diagnosis = "unknown";
      nextAction = "ask_clarifying_question";
      diagnosisConfidence = 0.64;
      nextActionConfidence = 0.76;
    } else if (correctness >= 0.72 && needsVerification) {
      nextAction = "generate_probe_contract";
      nextActionConfidence = 0.75;
    } else if (correctness >= 0.72) {
      nextAction = "give_feedback";
      nextActionConfidence = 0.7;
    } else if (correctness <= 0.25) {
      nextAction = "generate_probe_contract";
      diagnosisConfidence = clamp(diagnosisConfidence + 0.16);
      nextActionConfidence = 0.84;
    }

    return {
      schema_version: "diagnosis_model_output_v1",
      diagnosis,
      diagnosis_confidence: roundScore(diagnosisConfidence),
      next_action: nextAction,
      next_action_confidence: roundScore(nextActionConfidence),
      suggested_question: nextAction === "ask_clarifying_question" ? "What part feels most unclear right now?" : null,
    };
  }

  const text = lower(textFromUserMessage(input));
  const diagnosis = inferDiagnosisFromText(text);
  const isVague = text.trim().split(/\s+/).filter(Boolean).length < 6 || /^(help|idk|i don't know|confused|lost)\b/.test(text.trim());
  const nextAction = diagnosis === "unknown" || isVague ? "ask_clarifying_question" : "generate_probe_contract";

  return {
    schema_version: "diagnosis_model_output_v1",
    diagnosis,
    diagnosis_confidence: diagnosis === "unknown" ? 0.55 : 0.66,
    next_action: nextAction,
    next_action_confidence: nextAction === "ask_clarifying_question" ? 0.74 : 0.78,
    suggested_question: nextAction === "ask_clarifying_question" ? "What are you trying to figure out about this topic?" : null,
  };
}

function predictProbeContract(inputValue: unknown): JsonRecord {
  const input = recordOrEmpty(inputValue);
  const topic = recordOrEmpty(input.target_topic);
  const personalization = recordOrEmpty(input.personalization_context);
  const languagePolicy = normalizeLanguagePolicy(personalization.language_policy);
  const bridgeLevel = bridgeOr(personalization.bridge_level, "bridge_1");
  const targetDiagnosis = diagnosisOr(input.target_diagnosis, "unknown");
  const topicLabel = stringOr(topic.topic_label, "the current topic");
  const topicId = stringOrNull(topic.topic_id);
  const learnerSignal = recordOrEmpty(input.learner_signal);
  const signalText = learnerSignal.signal_kind === "user_message" ? stringOr(learnerSignal.user_message, "") : "";
  const preferredStyle = presentationStyleOr(personalization.preferred_style, "plain_direct");
  const firstInterest = getFirstInterest(personalization.user_interests);
  const pair = chooseProbePair(targetDiagnosis);
  const prompt = makeProbePrompt(topicLabel, targetDiagnosis, pair.probe_type, signalText, firstInterest);
  const answerKey = makeAnswerKey(pair.probe_type, pair.expected_attempt_type);
  const rendererParams = makeRendererParams(pair.probe_type, pair.expected_attempt_type);
  const supportKind = preferredStyleToSupportKind(preferredStyle);
  const supportText = firstInterest
    ? `Use a simple ${firstInterest} comparison only to make the structure easier to see.`
    : "Use a concrete example only when it helps reveal the learner's reasoning.";

  return {
    schema_version: "probe_contract_model_output_v1",
    probe_type: pair.probe_type,
    expected_attempt_type: pair.expected_attempt_type,
    prompt,
    presentation_support: [
      {
        kind: supportKind,
        style_used: preferredStyle,
        text: supportText,
        user_interest_used: firstInterest,
        confidence: 0.58,
      },
    ],
    answer_key: answerKey,
    misconception_markers: [
      {
        misconception_id: `${slugify(targetDiagnosis)}_baseline_marker`,
        label: `Possible ${targetDiagnosis.replace(/_/g, " ")}`,
        marker: "uses the old shortcut instead of the targeted distinction",
        description: "Baseline marker for schema/eval testing.",
        confidence: 0.55,
      },
    ],
    renderer_params: rendererParams,
    delivery_context: {
      bridge_level: bridgeLevel,
      language_policy: languagePolicy,
      presentation_styles_used: [preferredStyle],
      support_kinds_used: [supportKind],
      example_domains_used: firstInterest ? [simpleDomain(firstInterest)] : [],
      personalization_signals_used: firstInterest
        ? [
            {
              kind: "example_domain",
              value: simpleDomain(firstInterest),
              confidence: 0.58,
            },
          ]
        : [],
    },
    confidence: 0.62,
  };
}

function predictAttemptEvaluator(inputValue: unknown): JsonRecord {
  const input = recordOrEmpty(inputValue);
  const probe = recordOrEmpty(input.probe);
  const answerKey = recordOrEmpty(input.answer_key);
  const attempt = recordOrEmpty(input.attempt);
  const targetDiagnosis = diagnosisOr(probe.target_diagnosis, "unknown");
  const correctness = estimateCorrectness(answerKey, attempt);
  const responseText = collectAttemptText(attempt);
  const misconceptionMarkers = Array.isArray(input.misconception_markers) ? input.misconception_markers : [];
  const misconceptionHits = findMisconceptionHits(misconceptionMarkers, responseText, correctness);
  const attemptType = stringOr(attempt.attempt_type, "unknown");
  const selfConfidence = optionalNumberValue(attempt.self_reported_confidence);
  const choiceOnly = ["single_choice", "multi_choice", "video_click", "numeric"].includes(attemptType) && responseText.length < 20;
  const possibleGuess = correctness >= 0.8 && (choiceOnly || (selfConfidence !== null && selfConfidence < 0.45));
  const partial = correctness >= 0.45 && correctness < 0.85;
  const needsVerification = possibleGuess || partial;
  const hasMisconception = misconceptionHits.length > 0;

  let nextAction: string;
  if (hasMisconception && correctness < 0.75) nextAction = "target_misconception";
  else if (needsVerification) nextAction = "generate_followup_probe";
  else if (correctness >= 0.88) nextAction = "give_feedback";
  else nextAction = "generate_followup_probe";

  const diagnosisDelta: JsonRecord = {};
  if (targetDiagnosis !== "unknown") {
    diagnosisDelta[targetDiagnosis] = roundSigned(correctness >= 0.8 ? -0.08 : 0.1);
  }

  return {
    schema_version: "probe_attempt_evaluator_output_v1",
    correctness: roundScore(correctness),
    correctness_summary: summarizeCorrectness(correctness, possibleGuess, hasMisconception),
    understanding_evidence: {
      evidence_strength: roundScore(Math.max(0.2, Math.abs(correctness - 0.5) * 1.4)),
      supports_understanding: correctness >= 0.82 && !possibleGuess,
      supports_gap: correctness < 0.72 || hasMisconception,
      may_be_lucky_guess: possibleGuess,
      possible_guess: possibleGuess,
      needs_verification_probe: needsVerification,
      informational_only: stringOr(probe.probe_type, "") === "video_explanation",
      verification_reason: needsVerification
        ? "The attempt is correct or partly correct, but the evidence is not stable enough yet."
        : null,
    },
    misconception_hits: misconceptionHits,
    diagnosis_delta: Object.keys(diagnosisDelta).length ? diagnosisDelta : undefined,
    personalization_delta: null,
    next_action: nextAction,
    next_action_confidence: roundScore(hasMisconception || needsVerification ? 0.78 : 0.72),
  };
}

function chooseProbePair(diagnosis: string): { probe_type: string; expected_attempt_type: string } {
  switch (diagnosis) {
    case "recall_gap":
      return { probe_type: "single_choice", expected_attempt_type: "single_choice" };
    case "representation_gap":
      return { probe_type: "drag_drop_placements", expected_attempt_type: "drag_drop_placements" };
    case "procedure_gap":
      return { probe_type: "sequence", expected_attempt_type: "ordered_items" };
    case "discrimination_gap":
      return { probe_type: "discriminate", expected_attempt_type: "single_choice" };
    case "transfer_gap":
      return { probe_type: "apply_transfer", expected_attempt_type: "text" };
    case "metacognitive_gap":
      return { probe_type: "explain", expected_attempt_type: "text" };
    case "no_gap_detected":
      return { probe_type: "apply_transfer", expected_attempt_type: "text" };
    case "unknown":
    default:
      return { probe_type: "single_choice", expected_attempt_type: "single_choice" };
  }
}

function makeProbePrompt(topicLabel: string, diagnosis: string, probeType: string, signalText: string, interest: string | null): JsonRecord {
  const interestClause = interest ? ` I may use a small ${interest} example if it helps, but the task stays about ${topicLabel}.` : "";
  return {
    root_problem_explanation: `The learner may have a ${diagnosis.replace(/_/g, " ")} in ${topicLabel}.`,
    reshaping_explanation: `Use a ${probeType.replace(/_/g, " ")} probe to reveal the learner's current model without over-teaching first.`,
    task: `Answer the targeted check about ${topicLabel}.`,
    full_prompt: `Let's check ${topicLabel} with one focused task.${interestClause}${signalText ? ` You said: "${truncate(signalText, 120)}".` : ""} Give the answer that best shows how you are thinking.`,
  };
}

function makeAnswerKey(probeType: string, attemptType: string): JsonRecord | null {
  if (attemptType === "single_choice") {
    return {
      kind: probeType === "audio_clip_question" ? "audio_clip" : "single_choice",
      correct_option_id: "b",
      acceptable_option_ids: ["b"],
    };
  }
  if (attemptType === "multi_choice") {
    return {
      kind: probeType === "audio_clip_question" ? "audio_clip" : "multi_choice",
      correct_option_ids: ["b", "c"],
      acceptable_option_ids: ["b", "c"],
    };
  }
  if (attemptType === "ordered_items") {
    return { kind: "ordered_items", correct_order: ["first", "second", "third"] };
  }
  if (attemptType === "drag_drop_placements") {
    return {
      kind: "drag_drop_placements",
      correct_placements: {
        idea_a: "target_1",
        idea_b: "target_2",
        idea_c: "target_3",
      },
    };
  }
  if (attemptType === "numeric") {
    return { kind: "numeric", correct_numeric_range: { min: 0.45, max: 0.55 } };
  }
  if (attemptType === "graph") {
    return { kind: "graph", correct_graph_features: ["positive_relationship", "labeled_axes"] };
  }
  if (attemptType === "video_click") {
    return { kind: "video_click", correct_click_interval: { start_seconds: 8, end_seconds: 12 } };
  }
  if (attemptType === "text" || attemptType === "audio_response") {
    return {
      kind: "text",
      expected_ideas: ["names the key distinction", "explains why the tempting answer fails"],
      success_markers: ["because", "depends", "not just"],
    };
  }
  return null;
}

function makeRendererParams(probeType: string, attemptType: string): JsonRecord | null {
  if (attemptType === "single_choice") {
    return {
      options: [
        { id: "a", label: "A", text: "The tempting shortcut answer." },
        { id: "b", label: "B", text: "The answer that matches the key distinction." },
        { id: "c", label: "C", text: "A detail that is true but not enough." },
      ],
      ...(probeType === "audio_clip_question"
        ? { audio: { audio_id: "baseline_audio_clip", transcript: "Invented short clip for conceptual evaluation." } }
        : {}),
    };
  }
  if (attemptType === "multi_choice") {
    return {
      options: [
        { id: "a", label: "A", text: "Surface feature only." },
        { id: "b", label: "B", text: "One necessary idea." },
        { id: "c", label: "C", text: "Another necessary idea." },
        { id: "d", label: "D", text: "Unrelated distractor." },
      ],
    };
  }
  if (attemptType === "ordered_items") {
    return {
      items: [
        { id: "first", text: "Find the starting condition." },
        { id: "second", text: "Apply the rule to the condition." },
        { id: "third", text: "Check the result against the question." },
      ],
    };
  }
  if (attemptType === "drag_drop_placements") {
    return {
      items: [
        { id: "idea_a", text: "Idea A" },
        { id: "idea_b", text: "Idea B" },
        { id: "idea_c", text: "Idea C" },
      ],
      placement_targets: [
        { id: "target_1", label: "First target" },
        { id: "target_2", label: "Second target" },
        { id: "target_3", label: "Third target" },
      ],
    };
  }
  if (attemptType === "numeric") {
    return { slider: { min: 0, max: 1, step: 0.05, unit: null } };
  }
  if (attemptType === "video_click" || probeType === "video_explanation") {
    return { video: { video_id: "baseline_video", duration_seconds: 20, informational_only: probeType === "video_explanation" } };
  }
  return null;
}

function estimateCorrectness(answerKeyValue: unknown, attemptValue: unknown): number {
  const key = recordOrEmpty(answerKeyValue);
  const attempt = recordOrEmpty(attemptValue);
  const attemptType = stringOr(attempt.attempt_type, "unknown");

  if (attemptType === "single_choice") {
    const selected = stringOrNull(attempt.selected_option_id);
    const correct = stringOrNull(key.correct_option_id);
    if (!selected || !correct) return 0.5;
    return selected === correct ? 1 : 0;
  }

  if (attemptType === "multi_choice") {
    const selected = stringArray(attempt.selected_option_ids);
    const correct = stringArray(key.correct_option_ids);
    if (!selected.length || !correct.length) return 0.4;
    return jaccard(selected, correct);
  }

  if (attemptType === "ordered_items") {
    const selected = stringArray(attempt.ordered_item_ids);
    const correct = stringArray(key.correct_order);
    if (!selected.length || !correct.length) return 0.4;
    let matches = 0;
    for (let i = 0; i < Math.max(selected.length, correct.length); i += 1) {
      if (selected[i] === correct[i]) matches += 1;
    }
    return matches / Math.max(selected.length, correct.length);
  }

  if (attemptType === "drag_drop_placements") {
    const placements = stringRecord(attempt.placements);
    const correct = stringRecord(key.correct_placements);
    const keys = Object.keys(correct);
    if (!keys.length) return 0.5;
    const matches = keys.filter((itemId) => placements[itemId] === correct[itemId]).length;
    return matches / keys.length;
  }

  if (attemptType === "numeric") {
    const numeric = optionalNumberValue(attempt.numeric_response);
    const range = recordOrEmpty(key.correct_numeric_range);
    const min = optionalNumberValue(range.min);
    const max = optionalNumberValue(range.max);
    if (numeric === null || min === null || max === null) return 0.4;
    if (numeric >= min && numeric <= max) return 1;
    const center = (min + max) / 2;
    const width = Math.max(0.0001, (max - min) / 2);
    return clamp(1 - Math.abs(numeric - center) / (width * 4));
  }

  if (attemptType === "graph") {
    const features = stringArray(attempt.graph_features);
    const correct = stringArray(key.correct_graph_features);
    if (!features.length || !correct.length) return 0.4;
    return jaccard(features, correct);
  }

  if (attemptType === "audio_response") {
    return scoreTextAgainstMarkers(stringOr(attempt.audio_response_transcript, ""), key);
  }

  if (attemptType === "video_click") {
    const click = optionalNumberValue(attempt.selected_click_seconds);
    const interval = recordOrEmpty(key.correct_click_interval);
    const start = optionalNumberValue(interval.start_seconds);
    const end = optionalNumberValue(interval.end_seconds);
    if (click === null || start === null || end === null) return 0.4;
    return click >= start && click <= end ? 1 : 0;
  }

  if (attemptType === "text") {
    return scoreTextAgainstMarkers(stringOr(attempt.text_response, ""), key);
  }

  if (attemptType === "none") return 1;
  return 0.5;
}

function scoreTextAgainstMarkers(text: string, key: JsonRecord): number {
  const normalized = lower(text);
  const successMarkers = [...stringArray(key.success_markers), ...stringArray(key.expected_ideas)];
  if (!normalized.trim()) return 0.25;
  if (!successMarkers.length) return normalized.length > 30 ? 0.65 : 0.45;
  const hits = successMarkers.filter((marker) => normalized.includes(lower(marker)) || markerWordsHit(normalized, marker)).length;
  return clamp(0.25 + (hits / successMarkers.length) * 0.75);
}

function markerWordsHit(text: string, marker: string): boolean {
  const words = lower(marker)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4);
  if (!words.length) return false;
  const hitCount = words.filter((word) => text.includes(word)).length;
  return hitCount >= Math.ceil(words.length / 2);
}

function findMisconceptionHits(markers: unknown[], responseText: string, correctness: number): Array<JsonRecord> {
  const normalized = lower(responseText);
  const hits: Array<JsonRecord> = [];

  for (const markerValue of markers) {
    const marker = recordOrEmpty(markerValue);
    const id = stringOrNull(marker.misconception_id);
    if (!id) continue;
    const label = stringOrNull(marker.label);
    const markerText = lower(`${stringOr(marker.marker, "")} ${stringOr(marker.description, "")} ${label ?? ""}`);
    const markerWords = markerText.split(/[^a-z0-9]+/).filter((word) => word.length >= 5);
    const matched = markerWords.length > 0 && markerWords.some((word) => normalized.includes(word));
    if (matched) {
      hits.push({ misconception_id: id, label, confidence: 0.68 });
    }
  }

  if (!hits.length && correctness < 0.35 && markers.length > 0) {
    const first = recordOrEmpty(markers[0]);
    const id = stringOrNull(first.misconception_id);
    if (id) hits.push({ misconception_id: id, label: stringOrNull(first.label), confidence: 0.52 });
  }

  return hits.slice(0, 3);
}

function collectAttemptText(attempt: JsonRecord): string {
  return [
    stringOr(attempt.text_response, ""),
    stringOr(attempt.audio_response_transcript, ""),
    stringOr(attempt.selected_option_id, ""),
    stringArray(attempt.selected_option_ids).join(" "),
    stringArray(attempt.graph_features).join(" "),
  ]
    .join(" ")
    .trim();
}

function summarizeCorrectness(correctness: number, possibleGuess: boolean, hasMisconception: boolean): string {
  if (possibleGuess) return "The answer may be correct, but the attempt does not show enough reasoning to trust it yet.";
  if (hasMisconception) return "The attempt shows a misconception that should be targeted before moving on.";
  if (correctness >= 0.88) return "The attempt gives strong evidence of local understanding.";
  if (correctness >= 0.55) return "The attempt is partly correct but still needs a focused follow-up.";
  return "The attempt does not yet show stable understanding of the target idea.";
}

function inferDiagnosisFromText(text: string): string {
  if (/\b(forgot|remember|definition|what is|what does .* mean|term)\b/.test(text)) return "recall_gap";
  if (/\b(difference|different|which one|tell apart|versus| vs |confuse|confusing .* with)\b/.test(text)) return "discrimination_gap";
  if (/\b(step|steps|order|process|procedure|how do i|formula|algorithm|sequence)\b/.test(text)) return "procedure_gap";
  if (/\b(apply|new problem|transfer|another example|different situation|real world)\b/.test(text)) return "transfer_gap";
  if (/\b(graph|picture|model|visual|why does|relationship|represents|means)\b/.test(text)) return "representation_gap";
  if (/\b(guess|lucky|confidence|sure|not sure|i think but)\b/.test(text)) return "metacognitive_gap";
  if (/\b(i understand|got it|makes sense|no gap)\b/.test(text)) return "no_gap_detected";
  return "unknown";
}

function textFromUserMessage(input: JsonRecord): string {
  const userMessage = recordOrEmpty(input.user_message);
  return stringOr(userMessage.text, "");
}

function scorePrediction(example: TrainingExample, predictedOutput: unknown, validationErrors: ValidationIssue[]): Record<string, unknown> {
  const gold = recordOrEmpty(example.output);
  const pred = recordOrEmpty(predictedOutput);
  const schemaValid = validationErrors.filter((issue) => issue.severity === "error").length === 0;

  if (example.model_target === "diagnosis") {
    return {
      schema_valid: schemaValid,
      diagnosis_exact: pred.diagnosis === gold.diagnosis,
      next_action_exact: pred.next_action === gold.next_action,
      diagnosis_confidence_mae: mae(pred.diagnosis_confidence, gold.diagnosis_confidence),
      next_action_confidence_mae: mae(pred.next_action_confidence, gold.next_action_confidence),
    };
  }

  if (example.model_target === "probe_contract") {
    return {
      schema_valid: schemaValid,
      probe_type_exact: pred.probe_type === gold.probe_type,
      expected_attempt_type_exact: pred.expected_attempt_type === gold.expected_attempt_type,
      probe_attempt_pair_valid: isAllowedProbeAttemptPair(pred.probe_type, pred.expected_attempt_type),
      answer_key_kind_exact: recordOrEmpty(pred.answer_key).kind === recordOrEmpty(gold.answer_key).kind,
      confidence_mae: mae(pred.confidence, gold.confidence),
    };
  }

  const predEvidence = recordOrEmpty(pred.understanding_evidence);
  const goldEvidence = recordOrEmpty(gold.understanding_evidence);
  return {
    schema_valid: schemaValid,
    correctness_mae: mae(pred.correctness, gold.correctness),
    correctness_within_0_25: mae(pred.correctness, gold.correctness) <= 0.25,
    next_action_exact: pred.next_action === gold.next_action,
    lucky_guess_exact: predEvidence.may_be_lucky_guess === goldEvidence.may_be_lucky_guess,
    needs_verification_exact: predEvidence.needs_verification_probe === goldEvidence.needs_verification_probe,
    misconception_hit_f1: misconceptionF1(pred.misconception_hits, gold.misconception_hits),
    next_action_confidence_mae: mae(pred.next_action_confidence, gold.next_action_confidence),
  };
}

function updateAccumulator(acc: EvalAccumulator, scores: Record<string, unknown>, validationErrors: ValidationIssue[]) {
  acc.total += 1;
  if (scores.schema_valid === true) acc.schemaValid += 1;
  acc.validationErrorCount += validationErrors.filter((issue) => issue.severity === "error").length;

  for (const [key, value] of Object.entries(scores)) {
    if (key === "schema_valid") continue;
    if (typeof value === "boolean") {
      acc.exactMatches[key] = (acc.exactMatches[key] ?? 0) + (value ? 1 : 0);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      acc.numericSums[key] = (acc.numericSums[key] ?? 0) + value;
      acc.numericCounts[key] = (acc.numericCounts[key] ?? 0) + 1;
    }
  }
}

function buildReport(
  startedAt: string,
  predictions: PredictionRecord[],
  accumulators: Map<string, EvalAccumulator>,
  issues: ValidationIssue[],
  missingFiles: string[],
): JsonRecord {
  const completedAt = new Date().toISOString();
  const byModelAndSplit: JsonRecord = {};

  for (const [key, acc] of accumulators.entries()) {
    const exactRates: JsonRecord = {};
    const numericMeans: JsonRecord = {};

    for (const [metric, count] of Object.entries(acc.exactMatches)) {
      exactRates[metric] = acc.total ? round(count / acc.total, 4) : 0;
    }
    for (const [metric, sum] of Object.entries(acc.numericSums)) {
      const count = acc.numericCounts[metric] ?? 0;
      numericMeans[metric] = count ? round(sum / count, 4) : null;
    }

    byModelAndSplit[key] = {
      model_target: acc.model_target,
      split: acc.split,
      total: acc.total,
      schema_valid_rate: acc.total ? round(acc.schemaValid / acc.total, 4) : 0,
      validation_error_count: acc.validationErrorCount,
      exact_rates: exactRates,
      numeric_means: numericMeans,
    };
  }

  return {
    schema_version: "myway_phase_a_baseline_eval_report_v1",
    baseline_name: BASELINE_NAME,
    started_at: startedAt,
    completed_at: completedAt,
    splits_evaluated: SPLITS_TO_EVALUATE,
    examples_evaluated: predictions.length,
    validation_error_count: issues.filter((issue) => issue.severity === "error").length,
    warning_count: issues.filter((issue) => issue.severity === "warning").length,
    missing_files: missingFiles,
    by_model_and_split: byModelAndSplit,
    report_files: {
      report: relativeToRoot(path.join(REPORTS_DIR, "phase-a-baseline-eval-report.json")),
      summary: relativeToRoot(path.join(REPORTS_DIR, "phase-a-baseline-eval-summary.txt")),
      errors: relativeToRoot(path.join(REPORTS_DIR, "phase-a-baseline-errors.jsonl")),
      predictions_dir: WRITE_PREDICTIONS ? relativeToRoot(PREDICTIONS_DIR) : null,
    },
    interpretation_notes: [
      "This is a deterministic schema baseline, not the final model quality target.",
      "The most important early metric is schema_valid_rate, because app integration requires renderable structured outputs.",
      "Exact-match scores are intentionally conservative for free-form prompt and evaluator outputs.",
      "Use this harness later to compare mock providers, local trained services, and API-backed services on the same splits.",
    ],
  };
}

function formatSummary(report: JsonRecord): string {
  const lines: string[] = [];
  lines.push("MyWay Phase A Baseline Evaluation");
  lines.push("=================================");
  lines.push(`Baseline: ${report.baseline_name}`);
  lines.push(`Splits: ${Array.isArray(report.splits_evaluated) ? report.splits_evaluated.join(", ") : ""}`);
  lines.push(`Examples evaluated: ${report.examples_evaluated}`);
  lines.push(`Validation errors: ${report.validation_error_count}`);
  lines.push(`Warnings: ${report.warning_count}`);
  lines.push("");

  const byModel = recordOrEmpty(report.by_model_and_split);
  for (const [key, value] of Object.entries(byModel)) {
    const row = recordOrEmpty(value);
    lines.push(key);
    lines.push("-".repeat(key.length));
    lines.push(`Total: ${row.total}`);
    lines.push(`Schema-valid rate: ${row.schema_valid_rate}`);
    lines.push(`Validation errors: ${row.validation_error_count}`);
    lines.push(`Exact/rate metrics: ${JSON.stringify(row.exact_rates)}`);
    lines.push(`Numeric mean metrics: ${JSON.stringify(row.numeric_means)}`);
    lines.push("");
  }

  lines.push("Notes:");
  for (const note of Array.isArray(report.interpretation_notes) ? report.interpretation_notes : []) {
    lines.push(`- ${String(note)}`);
  }

  return `${lines.join("\n")}\n`;
}

function validatePredictedOutput(modelTarget: ModelTarget, output: unknown, exampleId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const out = asRecordForValidation(output, issues, modelTarget, exampleId, "output");
  if (!out) return issues;

  if (modelTarget === "diagnosis") {
    requireLiteral(issues, modelTarget, exampleId, out, "schema_version", "diagnosis_model_output_v1", "output.schema_version");
    requireEnum(issues, modelTarget, exampleId, out.diagnosis, DIAGNOSIS_LABELS, "output.diagnosis");
    requireScore(issues, modelTarget, exampleId, out.diagnosis_confidence, "output.diagnosis_confidence");
    requireEnum(issues, modelTarget, exampleId, out.next_action, DIAGNOSIS_NEXT_ACTIONS, "output.next_action");
    requireScore(issues, modelTarget, exampleId, out.next_action_confidence, "output.next_action_confidence");
    optionalStringOrNull(issues, modelTarget, exampleId, out.suggested_question, "output.suggested_question");
    return issues;
  }

  if (modelTarget === "probe_contract") {
    requireLiteral(issues, modelTarget, exampleId, out, "schema_version", "probe_contract_model_output_v1", "output.schema_version");
    requireEnum(issues, modelTarget, exampleId, out.probe_type, PROBE_TYPES, "output.probe_type");
    requireEnum(issues, modelTarget, exampleId, out.expected_attempt_type, ATTEMPT_TYPES, "output.expected_attempt_type");
    validateProbeAttemptPair(issues, modelTarget, exampleId, out.probe_type, out.expected_attempt_type, "output");
    validatePrompt(issues, modelTarget, exampleId, out.prompt, "output.prompt");
    validatePresentationSupport(issues, modelTarget, exampleId, out.presentation_support, "output.presentation_support");
    validateAnswerKeyLight(issues, modelTarget, exampleId, out.answer_key, "output.answer_key");
    validateMisconceptionMarkers(issues, modelTarget, exampleId, out.misconception_markers, "output.misconception_markers");
    validateDeliveryContext(issues, modelTarget, exampleId, out.delivery_context, "output.delivery_context");
    requireScore(issues, modelTarget, exampleId, out.confidence, "output.confidence");
    return issues;
  }

  requireLiteral(issues, modelTarget, exampleId, out, "schema_version", "probe_attempt_evaluator_output_v1", "output.schema_version");
  requireScore(issues, modelTarget, exampleId, out.correctness, "output.correctness");
  requireString(issues, modelTarget, exampleId, out.correctness_summary, "output.correctness_summary");
  validateUnderstandingEvidence(issues, modelTarget, exampleId, out.understanding_evidence, "output.understanding_evidence");
  validateMisconceptionHits(issues, modelTarget, exampleId, out.misconception_hits, "output.misconception_hits");
  validateDiagnosisDelta(issues, modelTarget, exampleId, out.diagnosis_delta, "output.diagnosis_delta");
  validatePersonalizationDeltaLight(issues, modelTarget, exampleId, out.personalization_delta, "output.personalization_delta");
  requireEnum(issues, modelTarget, exampleId, out.next_action, ATTEMPT_NEXT_ACTIONS, "output.next_action");
  requireScore(issues, modelTarget, exampleId, out.next_action_confidence, "output.next_action_confidence");
  return issues;
}

function validatePrompt(issues: ValidationIssue[], modelTarget: ModelTarget, exampleId: string, value: unknown, fieldPath: string) {
  const prompt = asRecordForValidation(value, issues, modelTarget, exampleId, fieldPath);
  if (!prompt) return;
  requireString(issues, modelTarget, exampleId, prompt.root_problem_explanation, `${fieldPath}.root_problem_explanation`);
  requireString(issues, modelTarget, exampleId, prompt.reshaping_explanation, `${fieldPath}.reshaping_explanation`);
  requireString(issues, modelTarget, exampleId, prompt.task, `${fieldPath}.task`);
  requireString(issues, modelTarget, exampleId, prompt.full_prompt, `${fieldPath}.full_prompt`);
}

function validatePresentationSupport(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    addValidationIssue(issues, modelTarget, exampleId, "invalid_type", `${fieldPath} must be an array.`, fieldPath, value);
    return;
  }
  value.forEach((item, index) => {
    const support = asRecordForValidation(item, issues, modelTarget, exampleId, `${fieldPath}[${index}]`);
    if (!support) return;
    requireEnum(issues, modelTarget, exampleId, support.kind, SUPPORT_KINDS, `${fieldPath}[${index}].kind`);
    requireEnum(issues, modelTarget, exampleId, support.style_used, PRESENTATION_STYLES, `${fieldPath}[${index}].style_used`);
    requireString(issues, modelTarget, exampleId, support.text, `${fieldPath}[${index}].text`);
    optionalStringOrNull(issues, modelTarget, exampleId, support.user_interest_used, `${fieldPath}[${index}].user_interest_used`);
    optionalScore(issues, modelTarget, exampleId, support.confidence, `${fieldPath}[${index}].confidence`);
  });
}

function validateAnswerKeyLight(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  if (value === undefined || value === null) return;
  const key = asRecordForValidation(value, issues, modelTarget, exampleId, fieldPath);
  if (!key) return;
  if (key.correct_option_id !== undefined) optionalStringOrNull(issues, modelTarget, exampleId, key.correct_option_id, `${fieldPath}.correct_option_id`);
  if (key.correct_option_ids !== undefined) validateStringArray(issues, modelTarget, exampleId, key.correct_option_ids, `${fieldPath}.correct_option_ids`);
  if (key.correct_order !== undefined) validateStringArray(issues, modelTarget, exampleId, key.correct_order, `${fieldPath}.correct_order`);
  if (key.correct_placements !== undefined) validateStringRecord(issues, modelTarget, exampleId, key.correct_placements, `${fieldPath}.correct_placements`);
}

function validateMisconceptionMarkers(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  if (!Array.isArray(value)) {
    addValidationIssue(issues, modelTarget, exampleId, "invalid_type", `${fieldPath} must be an array.`, fieldPath, value);
    return;
  }
  value.forEach((item, index) => {
    const marker = asRecordForValidation(item, issues, modelTarget, exampleId, `${fieldPath}[${index}]`);
    if (!marker) return;
    requireString(issues, modelTarget, exampleId, marker.misconception_id, `${fieldPath}[${index}].misconception_id`);
    requireString(issues, modelTarget, exampleId, marker.label, `${fieldPath}[${index}].label`);
    optionalScore(issues, modelTarget, exampleId, marker.confidence, `${fieldPath}[${index}].confidence`);
  });
}

function validateDeliveryContext(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  if (value === undefined || value === null) return;
  const context = asRecordForValidation(value, issues, modelTarget, exampleId, fieldPath);
  if (!context) return;
  requireEnum(issues, modelTarget, exampleId, context.bridge_level, BRIDGE_LEVELS, `${fieldPath}.bridge_level`);
  const policy = asRecordForValidation(context.language_policy, issues, modelTarget, exampleId, `${fieldPath}.language_policy`);
  if (policy) requireEnum(issues, modelTarget, exampleId, policy.jargon_level, JARGON_LEVELS, `${fieldPath}.language_policy.jargon_level`);
  validateEnumArray(issues, modelTarget, exampleId, context.presentation_styles_used, PRESENTATION_STYLES, `${fieldPath}.presentation_styles_used`);
  validateEnumArray(issues, modelTarget, exampleId, context.support_kinds_used, SUPPORT_KINDS, `${fieldPath}.support_kinds_used`);
  validateStringArray(issues, modelTarget, exampleId, context.example_domains_used, `${fieldPath}.example_domains_used`, true);
  if (context.bridge_level === "bridge_0" && policy?.jargon_level !== "none") {
    addValidationIssue(issues, modelTarget, exampleId, "bridge_0_jargon_violation", "bridge_0 must use jargon_level none.", `${fieldPath}.language_policy.jargon_level`, policy?.jargon_level);
  }
}

function validateUnderstandingEvidence(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  const evidence = asRecordForValidation(value, issues, modelTarget, exampleId, fieldPath);
  if (!evidence) return;
  requireScore(issues, modelTarget, exampleId, evidence.evidence_strength, `${fieldPath}.evidence_strength`);
  requireBoolean(issues, modelTarget, exampleId, evidence.may_be_lucky_guess, `${fieldPath}.may_be_lucky_guess`);
  requireBoolean(issues, modelTarget, exampleId, evidence.needs_verification_probe, `${fieldPath}.needs_verification_probe`);
}

function validateMisconceptionHits(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  if (!Array.isArray(value)) {
    addValidationIssue(issues, modelTarget, exampleId, "invalid_type", `${fieldPath} must be an array.`, fieldPath, value);
    return;
  }
  value.forEach((item, index) => {
    const hit = asRecordForValidation(item, issues, modelTarget, exampleId, `${fieldPath}[${index}]`);
    if (!hit) return;
    requireString(issues, modelTarget, exampleId, hit.misconception_id, `${fieldPath}[${index}].misconception_id`);
    optionalStringOrNull(issues, modelTarget, exampleId, hit.label, `${fieldPath}[${index}].label`);
    requireScore(issues, modelTarget, exampleId, hit.confidence, `${fieldPath}[${index}].confidence`);
  });
}

function validateDiagnosisDelta(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  if (value === undefined || value === null) return;
  const delta = asRecordForValidation(value, issues, modelTarget, exampleId, fieldPath);
  if (!delta) return;
  for (const [key, rawValue] of Object.entries(delta)) {
    if (!DIAGNOSIS_LABELS.has(key)) {
      addValidationIssue(issues, modelTarget, exampleId, "invalid_enum", `${fieldPath}.${key} is not a diagnosis label.`, `${fieldPath}.${key}`, rawValue);
    }
    if (typeof rawValue !== "number") {
      addValidationIssue(issues, modelTarget, exampleId, "invalid_type", `${fieldPath}.${key} must be a number.`, `${fieldPath}.${key}`, rawValue);
    }
  }
}

function validatePersonalizationDeltaLight(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  if (value === undefined || value === null) return;
  const delta = asRecordForValidation(value, issues, modelTarget, exampleId, fieldPath);
  if (!delta) return;
  requireLiteral(issues, modelTarget, exampleId, delta, "schema_version", "personalization_profile_delta_v1", `${fieldPath}.schema_version`);
  requireString(issues, modelTarget, exampleId, delta.summary, `${fieldPath}.summary`);
}

function validateProbeAttemptPair(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  probeType: unknown,
  attemptType: unknown,
  fieldPath: string,
) {
  if (typeof probeType !== "string" || typeof attemptType !== "string") return;
  const allowed = ALLOWED_ATTEMPTS_BY_PROBE[probeType];
  if (!allowed || allowed.has(attemptType)) return;
  addValidationIssue(
    issues,
    modelTarget,
    exampleId,
    "invalid_probe_attempt_pair",
    `Probe type ${probeType} should not use expected attempt type ${attemptType}.`,
    `${fieldPath}.expected_attempt_type`,
    attemptType,
  );
}

function isAllowedProbeAttemptPair(probeType: unknown, attemptType: unknown): boolean {
  if (typeof probeType !== "string" || typeof attemptType !== "string") return false;
  return ALLOWED_ATTEMPTS_BY_PROBE[probeType]?.has(attemptType) ?? false;
}

function requireLiteral(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  obj: JsonRecord,
  key: string,
  expected: string,
  fieldPath: string,
) {
  if (obj[key] !== expected) addValidationIssue(issues, modelTarget, exampleId, "invalid_literal", `${fieldPath} must be ${expected}.`, fieldPath, obj[key]);
}

function requireEnum(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  allowed: Set<string>,
  fieldPath: string,
) {
  if (typeof value !== "string" || !allowed.has(value)) {
    addValidationIssue(issues, modelTarget, exampleId, "invalid_enum", `${fieldPath} has invalid enum value.`, fieldPath, value);
  }
}

function validateEnumArray(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  allowed: Set<string>,
  fieldPath: string,
) {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    addValidationIssue(issues, modelTarget, exampleId, "invalid_type", `${fieldPath} must be an array.`, fieldPath, value);
    return;
  }
  value.forEach((item, index) => requireEnum(issues, modelTarget, exampleId, item, allowed, `${fieldPath}[${index}]`));
}

function requireString(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  if (typeof value !== "string" || value.length === 0) {
    addValidationIssue(issues, modelTarget, exampleId, "invalid_type", `${fieldPath} must be a non-empty string.`, fieldPath, value);
  }
}

function optionalStringOrNull(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  if (value === undefined || value === null) return;
  if (typeof value !== "string") {
    addValidationIssue(issues, modelTarget, exampleId, "invalid_type", `${fieldPath} must be string or null.`, fieldPath, value);
  }
}

function requireScore(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    addValidationIssue(issues, modelTarget, exampleId, "invalid_score", `${fieldPath} must be a number from 0 to 1.`, fieldPath, value);
  }
}

function optionalScore(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  if (value === undefined || value === null) return;
  requireScore(issues, modelTarget, exampleId, value, fieldPath);
}

function requireBoolean(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  if (typeof value !== "boolean") {
    addValidationIssue(issues, modelTarget, exampleId, "invalid_type", `${fieldPath} must be boolean.`, fieldPath, value);
  }
}

function validateStringArray(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
  optional = false,
) {
  if ((value === undefined || value === null) && optional) return;
  if (!Array.isArray(value)) {
    addValidationIssue(issues, modelTarget, exampleId, "invalid_type", `${fieldPath} must be an array.`, fieldPath, value);
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      addValidationIssue(issues, modelTarget, exampleId, "invalid_type", `${fieldPath}[${index}] must be a string.`, `${fieldPath}[${index}]`, item);
    }
  });
}

function validateStringRecord(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  value: unknown,
  fieldPath: string,
) {
  const record = asRecordForValidation(value, issues, modelTarget, exampleId, fieldPath);
  if (!record) return;
  for (const [key, rawValue] of Object.entries(record)) {
    if (typeof rawValue !== "string") {
      addValidationIssue(issues, modelTarget, exampleId, "invalid_type", `${fieldPath}.${key} must be a string.`, `${fieldPath}.${key}`, rawValue);
    }
  }
}

function asRecordForValidation(
  value: unknown,
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  fieldPath: string,
): JsonRecord | null {
  if (isRecord(value)) return value;
  addValidationIssue(issues, modelTarget, exampleId, "invalid_type", `${fieldPath} must be an object.`, fieldPath, value);
  return null;
}

function addValidationIssue(
  issues: ValidationIssue[],
  modelTarget: ModelTarget,
  exampleId: string,
  code: string,
  message: string,
  fieldPath?: string,
  value?: unknown,
) {
  issues.push({ severity: "error", code, message, model_target: modelTarget, example_id: exampleId, field_path: fieldPath, value });
}

function writePredictions(predictions: PredictionRecord[]) {
  const byKey = new Map<string, PredictionRecord[]>();
  for (const prediction of predictions) {
    const modelDir = MODEL_DIR_BY_TARGET[prediction.model_target];
    const key = `${modelDir}/${prediction.split}`;
    const existing = byKey.get(key) ?? [];
    existing.push(prediction);
    byKey.set(key, existing);
  }

  for (const [key, rows] of byKey.entries()) {
    const [modelDir, split] = key.split("/");
    const dir = path.join(PREDICTIONS_DIR, modelDir);
    ensureDir(dir);
    const filePath = path.join(dir, `${split}.jsonl`);
    writeJsonl(filePath, rows);
  }
}

function makeAccumulator(modelTarget: ModelTarget, split: SplitName): EvalAccumulator {
  return {
    model_target: modelTarget,
    split,
    total: 0,
    schemaValid: 0,
    validationErrorCount: 0,
    exactMatches: {},
    numericSums: {},
    numericCounts: {},
  };
}

function readJsonl<T>(filePath: string): T[] {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch (error) {
        throw new Error(`Invalid JSONL at ${relativeToRoot(filePath)} line ${index + 1}: ${(error as Error).message}`);
      }
    });
}

function writeJsonl(filePath: string, rows: unknown[]) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getArgValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function relativeToRoot(value: string): string {
  return path.relative(REPO_ROOT, value).replace(/\\/g, "/");
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordOrEmpty(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function diagnosisOr(value: unknown, fallback: string): string {
  return typeof value === "string" && DIAGNOSIS_LABELS.has(value) ? value : fallback;
}

function bridgeOr(value: unknown, fallback: string): string {
  return typeof value === "string" && BRIDGE_LEVELS.has(value) ? value : fallback;
}

function presentationStyleOr(value: unknown, fallback: string): string {
  return typeof value === "string" && PRESENTATION_STYLES.has(value) ? value : fallback;
}

function normalizeLanguagePolicy(value: unknown): JsonRecord {
  const policy = recordOrEmpty(value);
  const jargonLevel = typeof policy.jargon_level === "string" && JARGON_LEVELS.has(policy.jargon_level) ? policy.jargon_level : "none";
  return { jargon_level: jargonLevel };
}

function getFirstInterest(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const record = recordOrEmpty(item);
    const interest = stringOrNull(record.interest);
    if (interest) return interest;
  }
  return null;
}

function preferredStyleToSupportKind(style: string): string {
  switch (style) {
    case "analogy_based":
      return "analogy";
    case "metaphor_based":
      return "metaphor";
    case "visual_description":
      return "visual_description";
    case "step_by_step":
      return "step_by_step_frame";
    case "curiosity_question":
      return "curiosity_hook";
    case "real_world_connection":
      return "real_world_connection";
    case "concrete_examples":
      return "example";
    case "gentle_coaching":
    case "plain_direct":
    default:
      return "example";
  }
}

function simpleDomain(interest: string): string {
  return lower(interest).split(/[^a-z0-9]+/).filter(Boolean).slice(0, 2).join("_") || "general";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue === "string") out[key] = rawValue;
  }
  return out;
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const union = new Set([...setA, ...setB]);
  if (!union.size) return 1;
  const intersection = [...setA].filter((item) => setB.has(item)).length;
  return intersection / union.size;
}

function misconceptionF1(predValue: unknown, goldValue: unknown): number {
  const predIds = new Set(
    (Array.isArray(predValue) ? predValue : [])
      .map((item) => recordOrEmpty(item).misconception_id)
      .filter((id): id is string => typeof id === "string"),
  );
  const goldIds = new Set(
    (Array.isArray(goldValue) ? goldValue : [])
      .map((item) => recordOrEmpty(item).misconception_id)
      .filter((id): id is string => typeof id === "string"),
  );
  if (!predIds.size && !goldIds.size) return 1;
  if (!predIds.size || !goldIds.size) return 0;
  const tp = [...predIds].filter((id) => goldIds.has(id)).length;
  const precision = tp / predIds.size;
  const recall = tp / goldIds.size;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function mae(a: unknown, b: unknown): number {
  if (typeof a !== "number" || typeof b !== "number") return 1;
  return Math.abs(a - b);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundScore(value: number): number {
  return round(clamp(value), 3);
}

function roundSigned(value: number): number {
  return round(value, 3);
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function lower(value: string): string {
  return value.toLowerCase();
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function slugify(value: string): string {
  return lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "baseline";
}
