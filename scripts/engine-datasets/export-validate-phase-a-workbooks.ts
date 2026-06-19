#!/usr/bin/env tsx

/**
 * MyWay Phase A 3-model dataset exporter + validator.
 *
 * Reads audited Batch 01-10 workbooks from:
 *   datasets/engine-datasets/phase-a-workbooks
 *
 * Writes validated JSONL exports to:
 *   datasets/engine-datasets/exports
 *   datasets/engine-datasets/splits
 *   datasets/engine-datasets/merged
 *
 * Run from the repo root:
 *   npx tsx scripts/engine-datasets/export-validate-phase-a-workbooks.ts
 *
 * Dependency:
 *   pnpm add -D xlsx
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as XLSX from "xlsx";

type ModelTarget = "diagnosis" | "probe_contract" | "attempt_evaluator";
type SplitName = "train" | "validation" | "test";

type JsonRecord = Record<string, unknown>;

type TrainingExample = {
  schema_version: "myway_engine_training_example_v1";
  example_id: string;
  source_workbook: string;
  source_sheet: string;
  source_row_number: number;
  batch_id: string;
  flow_id: string;
  split_flow_key: string;
  model_target: ModelTarget;
  input: unknown;
  output: unknown;
};

type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  source_workbook?: string;
  source_sheet?: string;
  source_row_number?: number;
  example_id?: string;
  model_target?: string;
  field_path?: string;
  value?: unknown;
};

type ExtractedRow = {
  row: Record<string, unknown>;
  workbookPath: string;
  workbookName: string;
  sheetName: string;
  rowNumber: number;
  batchId: string;
};

const REPO_ROOT = process.cwd();
const DEFAULT_WORKBOOK_DIR = path.join(REPO_ROOT, "datasets", "engine-datasets", "phase-a-workbooks");
const DEFAULT_OUT_ROOT = path.join(REPO_ROOT, "datasets", "engine-datasets");
const WORKBOOK_DIR = getArgValue("--workbooks-dir") ?? DEFAULT_WORKBOOK_DIR;
const OUT_ROOT = getArgValue("--out-root") ?? DEFAULT_OUT_ROOT;
const ALLOW_INVALID = process.argv.includes("--allow-invalid");

const EXPORTS_DIR = path.join(OUT_ROOT, "exports");
const SPLITS_DIR = path.join(OUT_ROOT, "splits");
const MERGED_DIR = path.join(OUT_ROOT, "merged");
const REPORTS_DIR = path.join(OUT_ROOT, "reports");

const MODEL_FILE_STEMS: Record<ModelTarget, string> = {
  diagnosis: "diagnosis-training",
  probe_contract: "probe-contract-training",
  attempt_evaluator: "attempt-evaluator-training",
};

const MODEL_BY_INPUT_VERSION: Record<string, ModelTarget> = {
  diagnosis_model_input_v1: "diagnosis",
  probe_contract_model_input_v1: "probe_contract",
  probe_attempt_evaluator_input_v1: "attempt_evaluator",
};

const MODEL_BY_OUTPUT_VERSION: Record<string, ModelTarget> = {
  diagnosis_model_output_v1: "diagnosis",
  probe_contract_model_output_v1: "probe_contract",
  probe_attempt_evaluator_output_v1: "attempt_evaluator",
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

const ANSWER_KEY_KINDS = new Set([
  "single_choice",
  "multi_choice",
  "text",
  "numeric",
  "ordered_items",
  "drag_drop_placements",
  "graph",
  "audio_clip",
  "video_click",
]);

const PERSONALIZATION_SIGNAL_KINDS = new Set([
  "bridge_level",
  "jargon_level",
  "presentation_style",
  "support_kind",
  "probe_type",
  "verification_pattern",
]);

const PERSONALIZATION_DIRECTIONS = new Set(["prefer", "avoid", "verify"]);
const PERSONALIZATION_SCOPES = new Set(["global", "topic", "diagnosis_label", "probe_type"]);
const EXAMPLE_DOMAIN_SCOPES = new Set(["global", "topic", "diagnosis_label"]);
const OUTCOME_TAGS = new Set([
  "misconception_persisted",
  "partial_improvement",
  "strong_local_success",
  "correct_but_needs_verification",
  "neutral_or_unclear",
  "user_correction",
]);
const UPDATE_REASONS = new Set([
  "teaching_move_helped",
  "teaching_move_did_not_repair",
  "try_lower_jargon",
  "try_more_targeted_probe",
  "avoid_repetition",
  "needs_verification",
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

const COLUMN_ALIASES = {
  inputJson: ["input_json", "model_input_json", "input json", "input"],
  outputJson: ["output_json", "model_output_json", "output json", "output"],
  jsonlLine: ["jsonl_line", "jsonl", "jsonl record", "jsonl_record", "training_jsonl_line"],
  modelTarget: ["model_target", "target_model", "model", "task", "task_family", "model_name"],
  flowId: ["flow_id", "connected_flow_id", "flow", "connected_flow", "conversation_flow_id"],
  exampleId: ["example_id", "row_id", "id", "training_example_id", "case_id"],
  batchId: ["batch_id", "batch", "batch_number"],
};

const issues: ValidationIssue[] = [];
const skippedRows: Array<Pick<ValidationIssue, "source_workbook" | "source_sheet" | "source_row_number" | "message">> = [];

main();

function main() {
  ensureDir(EXPORTS_DIR);
  ensureDir(SPLITS_DIR);
  ensureDir(MERGED_DIR);
  ensureDir(REPORTS_DIR);

  if (!fs.existsSync(WORKBOOK_DIR)) {
    fail(`Workbook directory does not exist: ${WORKBOOK_DIR}`);
  }

  const workbookFiles = fs
    .readdirSync(WORKBOOK_DIR)
    .filter((fileName) => fileName.toLowerCase().endsWith(".xlsx") && !fileName.startsWith("~$"))
    .sort((a, b) => a.localeCompare(b));

  if (workbookFiles.length === 0) {
    fail(`No .xlsx files found in: ${WORKBOOK_DIR}`);
  }

  console.log(`Reading ${workbookFiles.length} workbook(s) from ${relativeToRoot(WORKBOOK_DIR)}...`);

  const extractedRows = workbookFiles.flatMap((fileName) =>
    extractWorkbookRows(path.join(WORKBOOK_DIR, fileName)),
  );

  console.log(`Found ${extractedRows.length} candidate training row(s).`);

  const examples: TrainingExample[] = [];

  for (const extracted of extractedRows) {
    const example = buildTrainingExample(extracted);
    if (example) {
      examples.push(example);
    }
  }

  validateGlobalNoSplitLeakage(examples);

  const errorCountBeforeWrite = countIssues("error");
  if (errorCountBeforeWrite > 0 && !ALLOW_INVALID) {
    writeReports(examples, workbookFiles);
    console.error(`\nValidation failed with ${errorCountBeforeWrite} error(s).`);
    console.error(`Report: ${relativeToRoot(path.join(REPORTS_DIR, "phase-a-validation-report.json"))}`);
    console.error(`Errors: ${relativeToRoot(path.join(REPORTS_DIR, "phase-a-validation-errors.jsonl"))}`);
    process.exit(1);
  }

  const splitByFlowKey = makeFlowSplits(examples.map((ex) => ex.split_flow_key));
  writeExports(examples, splitByFlowKey);
  writeReports(examples, workbookFiles, splitByFlowKey);

  const byModel = countBy(examples, (ex) => ex.model_target);
  const bySplit = countBy(examples, (ex) => splitByFlowKey[ex.split_flow_key]);

  console.log("\nDone. Validated exports written.");
  console.log(`Examples: ${examples.length}`);
  console.log(`By model: ${JSON.stringify(byModel)}`);
  console.log(`By split: ${JSON.stringify(bySplit)}`);
  console.log(`Warnings: ${countIssues("warning")}`);
  console.log(`Errors: ${countIssues("error")}`);
  console.log(`Exports: ${relativeToRoot(EXPORTS_DIR)}`);
  console.log(`Splits: ${relativeToRoot(SPLITS_DIR)}`);
  console.log(`Report: ${relativeToRoot(path.join(REPORTS_DIR, "phase-a-validation-report.json"))}`);
}

function extractWorkbookRows(workbookPath: string): ExtractedRow[] {
  const workbookName = path.basename(workbookPath);
  const batchId = inferBatchId(workbookName);
  const wb = XLSX.readFile(workbookPath, { cellDates: false, raw: false });
  const sheetNames = wb.SheetNames;

  const preferredSheet = sheetNames.find((sheet) => normalizeName(sheet) === "trainingall");
  const jsonlSheets = sheetNames.filter((sheet) =>
    ["diagnosisjsonl", "probecontractjsonl", "attemptevaluatorjsonl"].includes(normalizeName(sheet)),
  );

  const sheetsToRead = preferredSheet ? [preferredSheet] : jsonlSheets;
  if (sheetsToRead.length === 0) {
    addIssue({
      severity: "error",
      code: "missing_training_sheet",
      message: "Workbook has neither Training_All nor model-specific JSONL sheets.",
      source_workbook: workbookName,
    });
    return [];
  }

  const rows: ExtractedRow[] = [];

  for (const sheetName of sheetsToRead) {
    const sheet = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
      blankrows: false,
    });

    rawRows.forEach((row, index) => {
      rows.push({
        row,
        workbookPath,
        workbookName,
        sheetName,
        rowNumber: index + 2,
        batchId,
      });
    });
  }

  return rows;
}

function buildTrainingExample(extracted: ExtractedRow): TrainingExample | null {
  const { row, workbookName, sheetName, rowNumber, batchId } = extracted;

  const inputCell = getAliasedValue(row, COLUMN_ALIASES.inputJson);
  const outputCell = getAliasedValue(row, COLUMN_ALIASES.outputJson);
  const jsonlCell = getAliasedValue(row, COLUMN_ALIASES.jsonlLine);

  let input: unknown | undefined;
  let output: unknown | undefined;

  if (hasUsefulValue(inputCell) && hasUsefulValue(outputCell)) {
    input = parseJsonCell(inputCell, extracted, "input_json");
    output = parseJsonCell(outputCell, extracted, "output_json");
  } else if (hasUsefulValue(jsonlCell)) {
    const parsedLine = parseJsonCell(jsonlCell, extracted, "jsonl_line");
    if (isRecord(parsedLine)) {
      input = parsedLine.input ?? parsedLine.input_json ?? parsedLine.model_input;
      output = parsedLine.output ?? parsedLine.output_json ?? parsedLine.model_output;
    }
  }

  if (input === undefined && output === undefined) {
    skippedRows.push({
      source_workbook: workbookName,
      source_sheet: sheetName,
      source_row_number: rowNumber,
      message: "No parseable input/output JSON found.",
    });
    return null;
  }

  if (!isRecord(input) || !isRecord(output)) {
    addIssue({
      severity: "error",
      code: "missing_input_or_output",
      message: "Row did not contain object-shaped input and output JSON.",
      source_workbook: workbookName,
      source_sheet: sheetName,
      source_row_number: rowNumber,
      value: { input, output },
    });
    return null;
  }

  const inferredTarget = inferModelTarget(input, output, getAliasedValue(row, COLUMN_ALIASES.modelTarget));
  if (!inferredTarget) {
    addIssue({
      severity: "error",
      code: "unknown_model_target",
      message: "Could not infer model target from schema_version or model_target column.",
      source_workbook: workbookName,
      source_sheet: sheetName,
      source_row_number: rowNumber,
      value: { input_schema_version: input.schema_version, output_schema_version: output.schema_version },
    });
    return null;
  }

  const rawFlowId = stringifyCell(getAliasedValue(row, COLUMN_ALIASES.flowId));
  const flowId = rawFlowId || `${batchId}_flow_unknown_${rowNumber}`;
  const exampleId =
    stringifyCell(getAliasedValue(row, COLUMN_ALIASES.exampleId)) ||
    `${batchId}_${inferredTarget}_${sheetName}_${rowNumber}`.replace(/[^A-Za-z0-9_-]/g, "_");
  const rowBatchId = stringifyCell(getAliasedValue(row, COLUMN_ALIASES.batchId)) || batchId;
  const splitFlowKey = `${rowBatchId}::${flowId}`;

  const example: TrainingExample = {
    schema_version: "myway_engine_training_example_v1",
    example_id: exampleId,
    source_workbook: workbookName,
    source_sheet: sheetName,
    source_row_number: rowNumber,
    batch_id: rowBatchId,
    flow_id: flowId,
    split_flow_key: splitFlowKey,
    model_target: inferredTarget,
    input,
    output,
  };

  validateExample(example);
  return example;
}

function validateExample(example: TrainingExample): void {
  if (example.model_target === "diagnosis") {
    validateDiagnosisInput(example, asRecord(example.input, example, "input"));
    validateDiagnosisOutput(example, asRecord(example.output, example, "output"));
  } else if (example.model_target === "probe_contract") {
    validateProbeContractInput(example, asRecord(example.input, example, "input"));
    validateProbeContractOutput(example, asRecord(example.output, example, "output"));
  } else if (example.model_target === "attempt_evaluator") {
    validateAttemptEvaluatorInput(example, asRecord(example.input, example, "input"));
    validateAttemptEvaluatorOutput(example, asRecord(example.output, example, "output"));
  }
}

function validateDiagnosisInput(example: TrainingExample, input: JsonRecord | null): void {
  if (!input) return;
  requireLiteral(example, input, "schema_version", "diagnosis_model_input_v1", "input.schema_version");
  requireEnum(example, input.input_kind, new Set(["user_message", "evaluated_probe_attempt"]), "input.input_kind");

  if (input.input_kind === "user_message") {
    const userMessage = asRecord(input.user_message, example, "input.user_message");
    requireString(example, userMessage?.text, "input.user_message.text");
  }

  if (input.input_kind === "evaluated_probe_attempt") {
    validateEvaluatedProbeAttemptSignal(example, input.evaluated_probe_attempt, "input.evaluated_probe_attempt");
  }
}

function validateDiagnosisOutput(example: TrainingExample, output: JsonRecord | null): void {
  if (!output) return;
  strictKeys(example, output, "output", [
    "schema_version",
    "diagnosis",
    "diagnosis_confidence",
    "next_action",
    "next_action_confidence",
    "suggested_question",
  ]);
  requireLiteral(example, output, "schema_version", "diagnosis_model_output_v1", "output.schema_version");
  requireEnum(example, output.diagnosis, DIAGNOSIS_LABELS, "output.diagnosis");
  requireScore(example, output.diagnosis_confidence, "output.diagnosis_confidence");
  requireEnum(example, output.next_action, DIAGNOSIS_NEXT_ACTIONS, "output.next_action");
  requireScore(example, output.next_action_confidence, "output.next_action_confidence");
  optionalStringOrNull(example, output.suggested_question, "output.suggested_question");
}

function validateProbeContractInput(example: TrainingExample, input: JsonRecord | null): void {
  if (!input) return;
  requireLiteral(example, input, "schema_version", "probe_contract_model_input_v1", "input.schema_version");

  const targetTopic = asRecord(input.target_topic, example, "input.target_topic");
  optionalStringOrNull(example, targetTopic?.topic_id, "input.target_topic.topic_id");
  requireString(example, targetTopic?.topic_label, "input.target_topic.topic_label");

  requireEnum(example, input.target_diagnosis, DIAGNOSIS_LABELS, "input.target_diagnosis");

  const learnerSignal = asRecord(input.learner_signal, example, "input.learner_signal");
  requireEnum(
    example,
    learnerSignal?.signal_kind,
    new Set(["user_message", "evaluated_probe_attempt"]),
    "input.learner_signal.signal_kind",
  );

  if (learnerSignal?.signal_kind === "user_message") {
    optionalStringOrNull(example, learnerSignal.user_message, "input.learner_signal.user_message");
  }
  if (learnerSignal?.signal_kind === "evaluated_probe_attempt") {
    validateEvaluatedProbeAttemptSignal(
      example,
      learnerSignal.evaluated_probe_attempt,
      "input.learner_signal.evaluated_probe_attempt",
    );
  }

  if (input.personalization_context !== undefined && input.personalization_context !== null) {
    validatePersonalizationContext(example, input.personalization_context, "input.personalization_context");
  }
}

function validateProbeContractOutput(example: TrainingExample, output: JsonRecord | null): void {
  if (!output) return;
  strictKeys(example, output, "output", [
    "schema_version",
    "probe_type",
    "expected_attempt_type",
    "prompt",
    "presentation_support",
    "answer_key",
    "misconception_markers",
    "renderer_params",
    "delivery_context",
    "confidence",
  ]);

  requireLiteral(example, output, "schema_version", "probe_contract_model_output_v1", "output.schema_version");
  requireEnum(example, output.probe_type, PROBE_TYPES, "output.probe_type");
  requireEnum(example, output.expected_attempt_type, ATTEMPT_TYPES, "output.expected_attempt_type");
  validateProbeAttemptPair(example, output.probe_type, output.expected_attempt_type, "output");
  validatePrompt(example, output.prompt, "output.prompt");
  validatePresentationSupportArray(example, output.presentation_support, "output.presentation_support");
  validateAnswerKey(example, output.answer_key, "output.answer_key");
  validateMisconceptionMarkers(example, output.misconception_markers, "output.misconception_markers", true);
  validateRendererParams(example, output.renderer_params, "output.renderer_params");
  validateDeliveryContext(example, output.delivery_context, "output.delivery_context");
  requireScore(example, output.confidence, "output.confidence");
}

function validateAttemptEvaluatorInput(example: TrainingExample, input: JsonRecord | null): void {
  if (!input) return;
  requireLiteral(example, input, "schema_version", "probe_attempt_evaluator_input_v1", "input.schema_version");

  const probe = asRecord(input.probe, example, "input.probe");
  if (probe) {
    requireEnum(example, probe.probe_type, PROBE_TYPES, "input.probe.probe_type");
    requireEnum(example, probe.expected_attempt_type, ATTEMPT_TYPES, "input.probe.expected_attempt_type");
    validateProbeAttemptPair(example, probe.probe_type, probe.expected_attempt_type, "input.probe");
    validatePrompt(example, probe.prompt, "input.probe.prompt");
    optionalDiagnosisLabel(example, probe.target_diagnosis, "input.probe.target_diagnosis");
  }

  validateAnswerKey(example, input.answer_key, "input.answer_key");
  validateAttempt(example, input.attempt, "input.attempt");
  validateMisconceptionMarkers(example, input.misconception_markers, "input.misconception_markers", false);
  validateDeliveryContext(example, input.delivery_context, "input.delivery_context");
}

function validateAttemptEvaluatorOutput(example: TrainingExample, output: JsonRecord | null): void {
  if (!output) return;
  strictKeys(example, output, "output", [
    "schema_version",
    "correctness",
    "correctness_summary",
    "understanding_evidence",
    "misconception_hits",
    "diagnosis_delta",
    "personalization_delta",
    "next_action",
    "next_action_confidence",
  ]);
  requireLiteral(
    example,
    output,
    "schema_version",
    "probe_attempt_evaluator_output_v1",
    "output.schema_version",
  );
  requireScore(example, output.correctness, "output.correctness");
  requireString(example, output.correctness_summary, "output.correctness_summary");
  validateUnderstandingEvidence(example, output.understanding_evidence, "output.understanding_evidence");
  validateMisconceptionHits(example, output.misconception_hits, "output.misconception_hits");
  validateDiagnosisDelta(example, output.diagnosis_delta, "output.diagnosis_delta");
  validatePersonalizationDelta(example, output.personalization_delta, "output.personalization_delta");
  requireEnum(example, output.next_action, ATTEMPT_NEXT_ACTIONS, "output.next_action");
  requireScore(example, output.next_action_confidence, "output.next_action_confidence");
}

function validateEvaluatedProbeAttemptSignal(example: TrainingExample, value: unknown, pathName: string): void {
  const signal = asRecord(value, example, pathName);
  if (!signal) return;

  const probe = asRecord(signal.probe, example, `${pathName}.probe`);
  if (probe) {
    requireEnum(example, probe.probe_type, PROBE_TYPES, `${pathName}.probe.probe_type`);
    requireEnum(example, probe.expected_attempt_type, ATTEMPT_TYPES, `${pathName}.probe.expected_attempt_type`);
    validateProbeAttemptPair(example, probe.probe_type, probe.expected_attempt_type, `${pathName}.probe`);
    validatePrompt(example, probe.prompt, `${pathName}.probe.prompt`);
    optionalDiagnosisLabel(example, probe.target_diagnosis, `${pathName}.probe.target_diagnosis`);
  }

  const attempt = asRecord(signal.attempt, example, `${pathName}.attempt`);
  if (attempt) {
    requireEnum(example, attempt.attempt_type, ATTEMPT_TYPES, `${pathName}.attempt.attempt_type`);
    optionalStringOrNull(example, attempt.response_summary, `${pathName}.attempt.response_summary`);
  }

  const evaluation = asRecord(signal.evaluation, example, `${pathName}.evaluation`);
  if (evaluation) {
    requireScore(example, evaluation.correctness, `${pathName}.evaluation.correctness`);
    requireString(example, evaluation.correctness_summary, `${pathName}.evaluation.correctness_summary`);
    validateUnderstandingEvidence(example, evaluation.understanding_evidence, `${pathName}.evaluation.understanding_evidence`);
    validateMisconceptionHits(example, evaluation.misconception_hits, `${pathName}.evaluation.misconception_hits`, false);
    if (evaluation.next_action !== undefined && evaluation.next_action !== null) {
      requireEnum(example, evaluation.next_action, ATTEMPT_NEXT_ACTIONS, `${pathName}.evaluation.next_action`);
    }
    validatePersonalizationDelta(example, evaluation.personalization_delta, `${pathName}.evaluation.personalization_delta`);
  }
}

function validatePersonalizationContext(example: TrainingExample, value: unknown, pathName: string): void {
  const context = asRecord(value, example, pathName);
  if (!context) return;
  requireEnum(example, context.bridge_level, BRIDGE_LEVELS, `${pathName}.bridge_level`);
  validateLanguagePolicy(example, context.language_policy, `${pathName}.language_policy`);
  optionalEnum(example, context.preferred_style, PRESENTATION_STYLES, `${pathName}.preferred_style`);
  validateEnumArray(example, context.preferred_order, PRESENTATION_STYLES, `${pathName}.preferred_order`, false);
  optionalScore(example, context.preferred_order_confidence, `${pathName}.preferred_order_confidence`);

  if (Array.isArray(context.user_interests)) {
    context.user_interests.forEach((interest, index) => {
      const item = asRecord(interest, example, `${pathName}.user_interests[${index}]`);
      requireString(example, item?.interest, `${pathName}.user_interests[${index}].interest`);
      requireScore(
        example,
        item?.user_interest_confidence,
        `${pathName}.user_interests[${index}].user_interest_confidence`,
      );
    });
  } else if (context.user_interests !== undefined) {
    issueType(example, `${pathName}.user_interests`, "array", context.user_interests);
  }

  if (context.profile_snapshot !== undefined && context.profile_snapshot !== null) {
    validatePersonalizationSnapshot(example, context.profile_snapshot, `${pathName}.profile_snapshot`);
  }

  enforceBridge0NoJargon(example, context.bridge_level, context.language_policy, pathName);
}

function validatePersonalizationSnapshot(example: TrainingExample, value: unknown, pathName: string): void {
  const snapshot = asRecord(value, example, pathName);
  if (!snapshot) return;
  requireLiteral(
    example,
    snapshot,
    "schema_version",
    "personalization_profile_snapshot_v1",
    `${pathName}.schema_version`,
  );
  requireString(example, snapshot.summary, `${pathName}.summary`);
  // Snapshot internals are validated lightly because older profile snapshots can be compact summaries.
  if (snapshot.teaching_signals !== undefined && !Array.isArray(snapshot.teaching_signals)) {
    issueType(example, `${pathName}.teaching_signals`, "array", snapshot.teaching_signals);
  }
  if (snapshot.example_domains !== undefined && !Array.isArray(snapshot.example_domains)) {
    issueType(example, `${pathName}.example_domains`, "array", snapshot.example_domains);
  }
}

function validatePrompt(example: TrainingExample, value: unknown, pathName: string): void {
  const prompt = asRecord(value, example, pathName);
  if (!prompt) return;
  requireString(example, prompt.root_problem_explanation, `${pathName}.root_problem_explanation`);
  requireString(example, prompt.reshaping_explanation, `${pathName}.reshaping_explanation`);
  requireString(example, prompt.task, `${pathName}.task`);
  requireString(example, prompt.full_prompt, `${pathName}.full_prompt`);
}

function validatePresentationSupportArray(example: TrainingExample, value: unknown, pathName: string): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    issueType(example, pathName, "array", value);
    return;
  }
  value.forEach((item, index) => {
    const support = asRecord(item, example, `${pathName}[${index}]`);
    if (!support) return;
    requireEnum(example, support.kind, SUPPORT_KINDS, `${pathName}[${index}].kind`);
    requireEnum(example, support.style_used, PRESENTATION_STYLES, `${pathName}[${index}].style_used`);
    requireString(example, support.text, `${pathName}[${index}].text`);
    optionalStringOrNull(example, support.user_interest_used, `${pathName}[${index}].user_interest_used`);
    optionalScore(example, support.confidence, `${pathName}[${index}].confidence`);
  });
}

function validateAnswerKey(example: TrainingExample, value: unknown, pathName: string): void {
  if (value === undefined || value === null || value === "") return;
  const key = asRecord(value, example, pathName);
  if (!key) return;
  optionalEnum(example, key.kind, ANSWER_KEY_KINDS, `${pathName}.kind`);
  optionalStringOrNull(example, key.correct_option_id, `${pathName}.correct_option_id`);
  validateStringArray(example, key.correct_option_ids, `${pathName}.correct_option_ids`, false);
  validateStringArray(example, key.acceptable_option_ids, `${pathName}.acceptable_option_ids`, false);
  validateStringArray(example, key.expected_ideas, `${pathName}.expected_ideas`, false);
  validateStringArray(example, key.success_markers, `${pathName}.success_markers`, false);
  validateStringArray(example, key.correct_order, `${pathName}.correct_order`, false);
  validateStringRecord(example, key.correct_placements, `${pathName}.correct_placements`, false);
  validateStringArray(example, key.correct_graph_features, `${pathName}.correct_graph_features`, false);

  if (key.correct_numeric_range !== undefined && key.correct_numeric_range !== null) {
    const range = asRecord(key.correct_numeric_range, example, `${pathName}.correct_numeric_range`);
    requireNumber(example, range?.min, `${pathName}.correct_numeric_range.min`);
    requireNumber(example, range?.max, `${pathName}.correct_numeric_range.max`);
  }

  if (key.correct_click_interval !== undefined && key.correct_click_interval !== null) {
    const interval = asRecord(key.correct_click_interval, example, `${pathName}.correct_click_interval`);
    requireNumber(example, interval?.start_seconds, `${pathName}.correct_click_interval.start_seconds`);
    requireNumber(example, interval?.end_seconds, `${pathName}.correct_click_interval.end_seconds`);
  }
}

function validateMisconceptionMarkers(
  example: TrainingExample,
  value: unknown,
  pathName: string,
  required: boolean,
): void {
  if (value === undefined || value === null) {
    if (required) issueType(example, pathName, "array", value);
    return;
  }
  if (!Array.isArray(value)) {
    issueType(example, pathName, "array", value);
    return;
  }
  value.forEach((marker, index) => {
    const item = asRecord(marker, example, `${pathName}[${index}]`);
    requireString(example, item?.misconception_id, `${pathName}[${index}].misconception_id`);
    requireString(example, item?.label, `${pathName}[${index}].label`);
    optionalStringOrNull(example, item?.marker, `${pathName}[${index}].marker`);
    optionalStringOrNull(example, item?.description, `${pathName}[${index}].description`);
    optionalScore(example, item?.confidence, `${pathName}[${index}].confidence`);
  });
}

function validateMisconceptionHits(
  example: TrainingExample,
  value: unknown,
  pathName: string,
  required = true,
): void {
  if (value === undefined || value === null) {
    if (required) issueType(example, pathName, "array", value);
    return;
  }
  if (!Array.isArray(value)) {
    issueType(example, pathName, "array", value);
    return;
  }
  value.forEach((hit, index) => {
    const item = asRecord(hit, example, `${pathName}[${index}]`);
    requireString(example, item?.misconception_id, `${pathName}[${index}].misconception_id`);
    optionalStringOrNull(example, item?.label, `${pathName}[${index}].label`);
    requireScore(example, item?.confidence, `${pathName}[${index}].confidence`);
  });
}

function validateRendererParams(example: TrainingExample, value: unknown, pathName: string): void {
  if (value === undefined || value === null || value === "") return;
  const renderer = asRecord(value, example, pathName);
  if (!renderer) return;

  if (renderer.options !== undefined) {
    if (!Array.isArray(renderer.options)) issueType(example, `${pathName}.options`, "array", renderer.options);
    else {
      renderer.options.forEach((option, index) => {
        const item = asRecord(option, example, `${pathName}.options[${index}]`);
        requireString(example, item?.id, `${pathName}.options[${index}].id`);
        requireString(example, item?.label, `${pathName}.options[${index}].label`);
        requireString(example, item?.text, `${pathName}.options[${index}].text`);
      });
    }
  }

  if (renderer.items !== undefined) {
    if (!Array.isArray(renderer.items)) issueType(example, `${pathName}.items`, "array", renderer.items);
    else {
      renderer.items.forEach((itemValue, index) => {
        const item = asRecord(itemValue, example, `${pathName}.items[${index}]`);
        requireString(example, item?.id, `${pathName}.items[${index}].id`);
        requireString(example, item?.text, `${pathName}.items[${index}].text`);
      });
    }
  }

  if (renderer.placement_targets !== undefined) {
    if (!Array.isArray(renderer.placement_targets)) {
      issueType(example, `${pathName}.placement_targets`, "array", renderer.placement_targets);
    } else {
      renderer.placement_targets.forEach((targetValue, index) => {
        const target = asRecord(targetValue, example, `${pathName}.placement_targets[${index}]`);
        requireString(example, target?.id, `${pathName}.placement_targets[${index}].id`);
        requireString(example, target?.label, `${pathName}.placement_targets[${index}].label`);
      });
    }
  }

  if (renderer.slider !== undefined) {
    const slider = asRecord(renderer.slider, example, `${pathName}.slider`);
    requireNumber(example, slider?.min, `${pathName}.slider.min`);
    requireNumber(example, slider?.max, `${pathName}.slider.max`);
    optionalNumber(example, slider?.step, `${pathName}.slider.step`);
    optionalStringOrNull(example, slider?.unit, `${pathName}.slider.unit`);
  }

  if (renderer.audio !== undefined) {
    const audio = asRecord(renderer.audio, example, `${pathName}.audio`);
    optionalStringOrNull(example, audio?.audio_id, `${pathName}.audio.audio_id`);
    optionalStringOrNull(example, audio?.audio_url, `${pathName}.audio.audio_url`);
    optionalStringOrNull(example, audio?.transcript, `${pathName}.audio.transcript`);
  }

  if (renderer.video !== undefined) {
    const video = asRecord(renderer.video, example, `${pathName}.video`);
    optionalStringOrNull(example, video?.video_id, `${pathName}.video.video_id`);
    optionalStringOrNull(example, video?.video_url, `${pathName}.video.video_url`);
    optionalNumber(example, video?.duration_seconds, `${pathName}.video.duration_seconds`);
    optionalBoolean(example, video?.informational_only, `${pathName}.video.informational_only`);
  }
}

function validateDeliveryContext(example: TrainingExample, value: unknown, pathName: string): void {
  if (value === undefined || value === null || value === "") return;
  const context = asRecord(value, example, pathName);
  if (!context) return;
  requireEnum(example, context.bridge_level, BRIDGE_LEVELS, `${pathName}.bridge_level`);
  validateLanguagePolicy(example, context.language_policy, `${pathName}.language_policy`);
  validateEnumArray(example, context.presentation_styles_used, PRESENTATION_STYLES, `${pathName}.presentation_styles_used`, false);
  validateEnumArray(example, context.support_kinds_used, SUPPORT_KINDS, `${pathName}.support_kinds_used`, false);
  validateStringArray(example, context.example_domains_used, `${pathName}.example_domains_used`, false);

  if (context.personalization_signals_used !== undefined) {
    if (!Array.isArray(context.personalization_signals_used)) {
      issueType(example, `${pathName}.personalization_signals_used`, "array", context.personalization_signals_used);
    } else {
      context.personalization_signals_used.forEach((signal, index) => {
        const item = asRecord(signal, example, `${pathName}.personalization_signals_used[${index}]`);
        optionalStringOrNull(example, item?.signal_id, `${pathName}.personalization_signals_used[${index}].signal_id`);
        requireEnum(
          example,
          item?.kind,
          new Set([...PERSONALIZATION_SIGNAL_KINDS, "example_domain"]),
          `${pathName}.personalization_signals_used[${index}].kind`,
        );
        requireString(example, item?.value, `${pathName}.personalization_signals_used[${index}].value`);
        optionalScore(example, item?.confidence, `${pathName}.personalization_signals_used[${index}].confidence`);
      });
    }
  }

  enforceBridge0NoJargon(example, context.bridge_level, context.language_policy, pathName);
}

function validateLanguagePolicy(example: TrainingExample, value: unknown, pathName: string): void {
  const policy = asRecord(value, example, pathName);
  if (!policy) return;
  requireEnum(example, policy.jargon_level, JARGON_LEVELS, `${pathName}.jargon_level`);
}

function validateAttempt(example: TrainingExample, value: unknown, pathName: string): void {
  const attempt = asRecord(value, example, pathName);
  if (!attempt) return;
  requireEnum(example, attempt.attempt_type, ATTEMPT_TYPES, `${pathName}.attempt_type`);
  optionalStringOrNull(example, attempt.text_response, `${pathName}.text_response`);
  optionalStringOrNull(example, attempt.selected_option_id, `${pathName}.selected_option_id`);
  validateStringArray(example, attempt.selected_option_ids, `${pathName}.selected_option_ids`, false);
  validateStringArray(example, attempt.ordered_item_ids, `${pathName}.ordered_item_ids`, false);
  validateStringRecord(example, attempt.placements, `${pathName}.placements`, false);
  optionalNumber(example, attempt.numeric_response, `${pathName}.numeric_response`);
  validateStringArray(example, attempt.graph_features, `${pathName}.graph_features`, false);
  optionalStringOrNull(example, attempt.audio_response_transcript, `${pathName}.audio_response_transcript`);
  optionalNumber(example, attempt.selected_click_seconds, `${pathName}.selected_click_seconds`);
  optionalScore(example, attempt.self_reported_confidence, `${pathName}.self_reported_confidence`);
}

function validateUnderstandingEvidence(example: TrainingExample, value: unknown, pathName: string): void {
  const evidence = asRecord(value, example, pathName);
  if (!evidence) return;
  requireScore(example, evidence.evidence_strength, `${pathName}.evidence_strength`);
  optionalBoolean(example, evidence.supports_understanding, `${pathName}.supports_understanding`);
  optionalBoolean(example, evidence.supports_gap, `${pathName}.supports_gap`);
  requireBoolean(example, evidence.may_be_lucky_guess, `${pathName}.may_be_lucky_guess`);
  optionalBoolean(example, evidence.possible_guess, `${pathName}.possible_guess`);
  requireBoolean(example, evidence.needs_verification_probe, `${pathName}.needs_verification_probe`);
  optionalBoolean(example, evidence.informational_only, `${pathName}.informational_only`);
  optionalStringOrNull(example, evidence.verification_reason, `${pathName}.verification_reason`);
}

function validateDiagnosisDelta(example: TrainingExample, value: unknown, pathName: string): void {
  if (value === undefined || value === null) return;
  const delta = asRecord(value, example, pathName);
  if (!delta) return;
  for (const [key, rawValue] of Object.entries(delta)) {
    if (!DIAGNOSIS_LABELS.has(key)) {
      addIssue({
        severity: "error",
        code: "invalid_diagnosis_delta_key",
        message: `diagnosis_delta key is not a valid DiagnosisLabel: ${key}`,
        ...issueContext(example, `${pathName}.${key}`, rawValue),
      });
    }
    requireNumber(example, rawValue, `${pathName}.${key}`);
  }
}

function validatePersonalizationDelta(example: TrainingExample, value: unknown, pathName: string): void {
  if (value === undefined || value === null || value === "") return;
  const delta = asRecord(value, example, pathName);
  if (!delta) return;

  requireLiteral(
    example,
    delta,
    "schema_version",
    "personalization_profile_delta_v1",
    `${pathName}.schema_version`,
  );
  requireString(example, delta.summary, `${pathName}.summary`);

  if (delta.teaching_signal_updates !== undefined) {
    if (!Array.isArray(delta.teaching_signal_updates)) {
      issueType(example, `${pathName}.teaching_signal_updates`, "array", delta.teaching_signal_updates);
    } else {
      delta.teaching_signal_updates.forEach((update, index) => {
        const item = asRecord(update, example, `${pathName}.teaching_signal_updates[${index}]`);
        if (!item) return;
        requireString(example, item.signal_id, `${pathName}.teaching_signal_updates[${index}].signal_id`);
        requireEnum(example, item.kind, PERSONALIZATION_SIGNAL_KINDS, `${pathName}.teaching_signal_updates[${index}].kind`);
        requireString(example, item.value, `${pathName}.teaching_signal_updates[${index}].value`);
        requireEnum(example, item.direction, PERSONALIZATION_DIRECTIONS, `${pathName}.teaching_signal_updates[${index}].direction`);
        requireEnum(example, item.scope, PERSONALIZATION_SCOPES, `${pathName}.teaching_signal_updates[${index}].scope`);
        optionalStringOrNull(example, item.scope_key, `${pathName}.teaching_signal_updates[${index}].scope_key`);
        requireEnum(example, item.outcome_tag, OUTCOME_TAGS, `${pathName}.teaching_signal_updates[${index}].outcome_tag`);
        requireEnum(example, item.update_reason, UPDATE_REASONS, `${pathName}.teaching_signal_updates[${index}].update_reason`);
        requireNumber(example, item.preference_score_delta, `${pathName}.teaching_signal_updates[${index}].preference_score_delta`);
        requireNumber(example, item.confidence_delta, `${pathName}.teaching_signal_updates[${index}].confidence_delta`);
        requireNumber(example, item.evidence_count_delta, `${pathName}.teaching_signal_updates[${index}].evidence_count_delta`);
        requireString(example, item.summary, `${pathName}.teaching_signal_updates[${index}].summary`);
      });
    }
  }

  if (delta.example_domain_updates !== undefined) {
    if (!Array.isArray(delta.example_domain_updates)) {
      issueType(example, `${pathName}.example_domain_updates`, "array", delta.example_domain_updates);
    } else {
      delta.example_domain_updates.forEach((update, index) => {
        const item = asRecord(update, example, `${pathName}.example_domain_updates[${index}]`);
        if (!item) return;
        requireString(example, item.domain, `${pathName}.example_domain_updates[${index}].domain`);
        requireEnum(example, item.scope, EXAMPLE_DOMAIN_SCOPES, `${pathName}.example_domain_updates[${index}].scope`);
        optionalStringOrNull(example, item.scope_key, `${pathName}.example_domain_updates[${index}].scope_key`);
        requireEnum(example, item.outcome_tag, OUTCOME_TAGS, `${pathName}.example_domain_updates[${index}].outcome_tag`);
        requireEnum(example, item.update_reason, UPDATE_REASONS, `${pathName}.example_domain_updates[${index}].update_reason`);
        requireNumber(example, item.preference_score_delta, `${pathName}.example_domain_updates[${index}].preference_score_delta`);
        requireNumber(example, item.confidence_delta, `${pathName}.example_domain_updates[${index}].confidence_delta`);
        requireNumber(example, item.evidence_count_delta, `${pathName}.example_domain_updates[${index}].evidence_count_delta`);
        optionalNumber(example, item.recent_use_count_delta, `${pathName}.example_domain_updates[${index}].recent_use_count_delta`);
        optionalStringOrNull(example, item.last_used_at, `${pathName}.example_domain_updates[${index}].last_used_at`);
        requireString(example, item.summary, `${pathName}.example_domain_updates[${index}].summary`);
      });
    }
  }
}

function validateProbeAttemptPair(
  example: TrainingExample,
  probeType: unknown,
  attemptType: unknown,
  pathName: string,
): void {
  if (typeof probeType !== "string" || typeof attemptType !== "string") return;
  const allowed = ALLOWED_ATTEMPTS_BY_PROBE[probeType];
  if (!allowed) return;
  if (!allowed.has(attemptType)) {
    addIssue({
      severity: "error",
      code: "invalid_probe_attempt_pair",
      message: `Probe type ${probeType} should not use expected attempt type ${attemptType}.`,
      ...issueContext(example, `${pathName}.expected_attempt_type`, attemptType),
    });
  }
}

function enforceBridge0NoJargon(
  example: TrainingExample,
  bridgeLevel: unknown,
  languagePolicy: unknown,
  pathName: string,
): void {
  if (bridgeLevel !== "bridge_0") return;
  const policy = isRecord(languagePolicy) ? languagePolicy : null;
  if (policy?.jargon_level !== "none") {
    addIssue({
      severity: "error",
      code: "bridge_0_jargon_violation",
      message: "bridge_0 must use language_policy.jargon_level = none.",
      ...issueContext(example, `${pathName}.language_policy.jargon_level`, policy?.jargon_level),
    });
  }
}

function validateGlobalNoSplitLeakage(examples: TrainingExample[]): void {
  const idCounts = countBy(examples, (ex) => ex.example_id);
  for (const [exampleId, count] of Object.entries(idCounts)) {
    if (count > 1) {
      addIssue({
        severity: "warning",
        code: "duplicate_example_id",
        message: `example_id appears ${count} times. This may be okay if IDs are only local, but unique IDs are preferred.`,
        example_id: exampleId,
      });
    }
  }
}

function makeFlowSplits(flowKeys: string[]): Record<string, SplitName> {
  const uniqueFlowKeys = Array.from(new Set(flowKeys));
  const sorted = uniqueFlowKeys.sort((a, b) => stableHash(a).localeCompare(stableHash(b)));

  const trainCutoff = Math.floor(sorted.length * 0.8);
  const validationCutoff = Math.floor(sorted.length * 0.9);

  const splitByFlow: Record<string, SplitName> = {};
  sorted.forEach((flowKey, index) => {
    if (index < trainCutoff) splitByFlow[flowKey] = "train";
    else if (index < validationCutoff) splitByFlow[flowKey] = "validation";
    else splitByFlow[flowKey] = "test";
  });

  return splitByFlow;
}

function writeExports(examples: TrainingExample[], splitByFlowKey: Record<string, SplitName>): void {
  emptyAndRecreateDir(EXPORTS_DIR);
  emptyAndRecreateDir(SPLITS_DIR);
  ensureDir(MERGED_DIR);
  ensureDir(REPORTS_DIR);

  const sortedExamples = [...examples].sort(sortExamples);

  writeJsonl(path.join(MERGED_DIR, "training-corpus.jsonl"), sortedExamples);

  for (const modelTarget of Object.keys(MODEL_FILE_STEMS) as ModelTarget[]) {
    const modelExamples = sortedExamples.filter((ex) => ex.model_target === modelTarget);
    writeJsonl(path.join(EXPORTS_DIR, `${MODEL_FILE_STEMS[modelTarget]}.jsonl`), modelExamples);

    const modelSplitDir = path.join(SPLITS_DIR, modelTarget.replace("_", "-"));
    ensureDir(modelSplitDir);

    for (const splitName of ["train", "validation", "test"] as SplitName[]) {
      const splitExamples = modelExamples.filter((ex) => splitByFlowKey[ex.split_flow_key] === splitName);
      writeJsonl(path.join(modelSplitDir, `${splitName}.jsonl`), splitExamples);
    }
  }

  fs.writeFileSync(
    path.join(SPLITS_DIR, "flow-splits.json"),
    `${JSON.stringify(splitByFlowKey, null, 2)}\n`,
    "utf8",
  );
}

function writeReports(
  examples: TrainingExample[],
  workbookFiles: string[],
  splitByFlowKey: Record<string, SplitName> = {},
): void {
  ensureDir(REPORTS_DIR);

  const splitFor = (ex: TrainingExample): SplitName | "unassigned" => splitByFlowKey[ex.split_flow_key] ?? "unassigned";

  const report = {
    generated_at: new Date().toISOString(),
    repo_root: REPO_ROOT,
    workbooks_dir: WORKBOOK_DIR,
    out_root: OUT_ROOT,
    workbook_count: workbookFiles.length,
    workbooks: workbookFiles,
    total_examples: examples.length,
    skipped_row_count: skippedRows.length,
    unique_split_flow_keys: new Set(examples.map((ex) => ex.split_flow_key)).size,
    by_model: countBy(examples, (ex) => ex.model_target),
    by_split: countBy(examples, splitFor),
    by_model_and_split: countModelAndSplit(examples, splitFor),
    diagnosis_labels: countDiagnosisLabels(examples),
    probe_types: countProbeTypes(examples),
    attempt_types: countAttemptTypes(examples),
    bridge_levels: countBridgeLevels(examples),
    issue_count: issues.length,
    error_count: countIssues("error"),
    warning_count: countIssues("warning"),
    issues_by_code: countBy(issues, (issue) => issue.code),
    first_50_issues: issues.slice(0, 50),
    first_50_skipped_rows: skippedRows.slice(0, 50),
    output_files: {
      merged: path.join(MERGED_DIR, "training-corpus.jsonl"),
      diagnosis: path.join(EXPORTS_DIR, "diagnosis-training.jsonl"),
      probe_contract: path.join(EXPORTS_DIR, "probe-contract-training.jsonl"),
      attempt_evaluator: path.join(EXPORTS_DIR, "attempt-evaluator-training.jsonl"),
      splits: SPLITS_DIR,
    },
  };

  fs.writeFileSync(
    path.join(REPORTS_DIR, "phase-a-validation-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  writeJsonl(path.join(REPORTS_DIR, "phase-a-validation-errors.jsonl"), issues);
  writeJsonl(path.join(REPORTS_DIR, "phase-a-skipped-rows.jsonl"), skippedRows);
}

function countDiagnosisLabels(examples: TrainingExample[]): Record<string, number> {
  const labels: string[] = [];
  for (const ex of examples) {
    if (isRecord(ex.output) && typeof ex.output.diagnosis === "string") labels.push(ex.output.diagnosis);
    if (isRecord(ex.input) && typeof ex.input.target_diagnosis === "string") labels.push(ex.input.target_diagnosis);
    if (isRecord(ex.output) && isRecord(ex.output.diagnosis_delta)) {
      labels.push(...Object.keys(ex.output.diagnosis_delta));
    }
  }
  return countBy(labels, (label) => label);
}

function countProbeTypes(examples: TrainingExample[]): Record<string, number> {
  const probeTypes: string[] = [];
  for (const ex of examples) {
    if (isRecord(ex.output) && typeof ex.output.probe_type === "string") probeTypes.push(ex.output.probe_type);
    if (isRecord(ex.input) && isRecord(ex.input.probe) && typeof ex.input.probe.probe_type === "string") {
      probeTypes.push(ex.input.probe.probe_type);
    }
  }
  return countBy(probeTypes, (value) => value);
}

function countAttemptTypes(examples: TrainingExample[]): Record<string, number> {
  const attemptTypes: string[] = [];
  for (const ex of examples) {
    if (isRecord(ex.output) && typeof ex.output.expected_attempt_type === "string") {
      attemptTypes.push(ex.output.expected_attempt_type);
    }
    if (isRecord(ex.input) && isRecord(ex.input.probe) && typeof ex.input.probe.expected_attempt_type === "string") {
      attemptTypes.push(ex.input.probe.expected_attempt_type);
    }
    if (isRecord(ex.input) && isRecord(ex.input.attempt) && typeof ex.input.attempt.attempt_type === "string") {
      attemptTypes.push(ex.input.attempt.attempt_type);
    }
  }
  return countBy(attemptTypes, (value) => value);
}

function countBridgeLevels(examples: TrainingExample[]): Record<string, number> {
  const values: string[] = [];
  for (const ex of examples) {
    collectBridgeLevels(ex.input, values);
    collectBridgeLevels(ex.output, values);
  }
  return countBy(values, (value) => value);
}

function collectBridgeLevels(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectBridgeLevels(item, out));
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.bridge_level === "string") out.push(value.bridge_level);
  Object.values(value).forEach((child) => collectBridgeLevels(child, out));
}

function countModelAndSplit(
  examples: TrainingExample[],
  splitFor: (ex: TrainingExample) => SplitName | "unassigned",
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const ex of examples) {
    const model = ex.model_target;
    const split = splitFor(ex);
    result[model] ??= {};
    result[model][split] = (result[model][split] ?? 0) + 1;
  }
  return result;
}

function inferModelTarget(
  input: JsonRecord,
  output: JsonRecord,
  modelTargetCell: unknown,
): ModelTarget | null {
  const fromInput = typeof input.schema_version === "string" ? MODEL_BY_INPUT_VERSION[input.schema_version] : undefined;
  const fromOutput = typeof output.schema_version === "string" ? MODEL_BY_OUTPUT_VERSION[output.schema_version] : undefined;
  if (fromInput && fromOutput && fromInput !== fromOutput) return null;
  if (fromInput) return fromInput;
  if (fromOutput) return fromOutput;

  const normalized = normalizeName(stringifyCell(modelTargetCell));
  if (["diagnosis", "diagnosismodel"].includes(normalized)) return "diagnosis";
  if (["probecontract", "probecontractmodel", "contract"].includes(normalized)) return "probe_contract";
  if (["attemptevaluator", "probeattemptevaluator", "evaluator"].includes(normalized)) return "attempt_evaluator";
  return null;
}

function parseJsonCell(value: unknown, extracted: ExtractedRow, fieldName: string): unknown | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "object") return value;

  let text = String(value).trim();
  if (!text) return undefined;

  if (text.startsWith("'")) text = text.slice(1).trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  try {
    return JSON.parse(text);
  } catch (error) {
    addIssue({
      severity: "error",
      code: "json_parse_error",
      message: `Could not parse ${fieldName} as JSON: ${(error as Error).message}`,
      source_workbook: extracted.workbookName,
      source_sheet: extracted.sheetName,
      source_row_number: extracted.rowNumber,
      field_path: fieldName,
      value: text.slice(0, 500),
    });
    return undefined;
  }
}

function getAliasedValue(row: Record<string, unknown>, aliases: string[]): unknown {
  const aliasSet = new Set(aliases.map(normalizeName));
  for (const [key, value] of Object.entries(row)) {
    if (aliasSet.has(normalizeName(key))) return value;
  }
  return undefined;
}

function strictKeys(example: TrainingExample, value: JsonRecord, pathName: string, allowedKeys: string[]): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      addIssue({
        severity: "error",
        code: "unexpected_field",
        message: `Unexpected field in schema-bound JSON: ${pathName}.${key}`,
        ...issueContext(example, `${pathName}.${key}`, value[key]),
      });
    }
  }
}

function requireLiteral(
  example: TrainingExample,
  record: JsonRecord,
  key: string,
  expected: string,
  pathName: string,
): void {
  if (record[key] !== expected) {
    addIssue({
      severity: "error",
      code: "invalid_literal",
      message: `Expected ${pathName} to be ${expected}.`,
      ...issueContext(example, pathName, record[key]),
    });
  }
}

function requireEnum(example: TrainingExample, value: unknown, allowed: Set<string>, pathName: string): void {
  if (typeof value !== "string" || !allowed.has(value)) {
    addIssue({
      severity: "error",
      code: "invalid_enum",
      message: `Invalid enum value at ${pathName}.`,
      ...issueContext(example, pathName, value),
    });
  }
}

function optionalEnum(example: TrainingExample, value: unknown, allowed: Set<string>, pathName: string): void {
  if (value === undefined || value === null || value === "") return;
  requireEnum(example, value, allowed, pathName);
}

function optionalDiagnosisLabel(example: TrainingExample, value: unknown, pathName: string): void {
  if (value === undefined || value === null || value === "") return;
  requireEnum(example, value, DIAGNOSIS_LABELS, pathName);
}

function validateEnumArray(
  example: TrainingExample,
  value: unknown,
  allowed: Set<string>,
  pathName: string,
  required: boolean,
): void {
  if (value === undefined || value === null || value === "") {
    if (required) issueType(example, pathName, "array", value);
    return;
  }
  if (!Array.isArray(value)) {
    issueType(example, pathName, "array", value);
    return;
  }
  value.forEach((item, index) => requireEnum(example, item, allowed, `${pathName}[${index}]`));
}

function requireString(example: TrainingExample, value: unknown, pathName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    issueType(example, pathName, "non-empty string", value);
  }
}

function optionalStringOrNull(example: TrainingExample, value: unknown, pathName: string): void {
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string") issueType(example, pathName, "string | null", value);
}

function requireBoolean(example: TrainingExample, value: unknown, pathName: string): void {
  if (typeof value !== "boolean") issueType(example, pathName, "boolean", value);
}

function optionalBoolean(example: TrainingExample, value: unknown, pathName: string): void {
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "boolean") issueType(example, pathName, "boolean | null", value);
}

function requireNumber(example: TrainingExample, value: unknown, pathName: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) issueType(example, pathName, "number", value);
}

function optionalNumber(example: TrainingExample, value: unknown, pathName: string): void {
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "number" || !Number.isFinite(value)) issueType(example, pathName, "number | null", value);
}

function requireScore(example: TrainingExample, value: unknown, pathName: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    addIssue({
      severity: "error",
      code: "invalid_score",
      message: `Expected ${pathName} to be a number from 0 to 1.`,
      ...issueContext(example, pathName, value),
    });
  }
}

function optionalScore(example: TrainingExample, value: unknown, pathName: string): void {
  if (value === undefined || value === null || value === "") return;
  requireScore(example, value, pathName);
}

function validateStringArray(
  example: TrainingExample,
  value: unknown,
  pathName: string,
  required: boolean,
): void {
  if (value === undefined || value === null || value === "") {
    if (required) issueType(example, pathName, "array", value);
    return;
  }
  if (!Array.isArray(value)) {
    issueType(example, pathName, "array", value);
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== "string") issueType(example, `${pathName}[${index}]`, "string", item);
  });
}

function validateStringRecord(
  example: TrainingExample,
  value: unknown,
  pathName: string,
  required: boolean,
): void {
  if (value === undefined || value === null || value === "") {
    if (required) issueType(example, pathName, "Record<string,string>", value);
    return;
  }
  const record = asRecord(value, example, pathName);
  if (!record) return;
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== "string") issueType(example, `${pathName}.${key}`, "string", item);
  }
}

function issueType(example: TrainingExample, pathName: string, expected: string, value: unknown): void {
  addIssue({
    severity: "error",
    code: "invalid_type",
    message: `Expected ${pathName} to be ${expected}.`,
    ...issueContext(example, pathName, value),
  });
}

function asRecord(value: unknown, example: TrainingExample, pathName: string): JsonRecord | null {
  if (!isRecord(value)) {
    issueType(example, pathName, "object", value);
    return null;
  }
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUsefulValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function stringifyCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeName(value: string): string {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function inferBatchId(fileName: string): string {
  const match = fileName.match(/batch\s*[_-]?(\d{1,2})/i) ?? fileName.match(/batch(\d{1,2})/i);
  if (!match) return path.basename(fileName, path.extname(fileName)).replace(/[^A-Za-z0-9_-]/g, "_");
  return `batch${match[1].padStart(2, "0")}`;
}

function sortExamples(a: TrainingExample, b: TrainingExample): number {
  return (
    a.batch_id.localeCompare(b.batch_id) ||
    a.flow_id.localeCompare(b.flow_id) ||
    a.model_target.localeCompare(b.model_target) ||
    a.example_id.localeCompare(b.example_id)
  );
}

function stableHash(value: string): string {
  return crypto.createHash("sha256").update(`myway-phase-a-v1::${value}`).digest("hex");
}

function writeJsonl(filePath: string, records: unknown[]): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item) || "unknown";
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function countIssues(severity: "error" | "warning"): number {
  return issues.filter((issue) => issue.severity === severity).length;
}

function addIssue(issue: ValidationIssue): void {
  issues.push(issue);
}

function issueContext(example: TrainingExample, fieldPath: string, value: unknown) {
  return {
    source_workbook: example.source_workbook,
    source_sheet: example.source_sheet,
    source_row_number: example.source_row_number,
    example_id: example.example_id,
    model_target: example.model_target,
    field_path: fieldPath,
    value,
  } satisfies Partial<ValidationIssue>;
}

function emptyAndRecreateDir(dir: string): void {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return path.resolve(value);
}

function relativeToRoot(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
