#!/usr/bin/env tsx
/*
  MyWay Phase A SFT Data Preparation
  ----------------------------------

  Reads validated Phase A split JSONL files and writes training-ready SFT data
  in two portable formats:

  1) chat JSONL
     {"messages":[{"role":"system"...},{"role":"user"...},{"role":"assistant"...}],"metadata":{...}}

  2) prompt/completion JSONL
     {"prompt":"...","completion":"...","metadata":{...}}

  Default input:
    datasets/engine-datasets/splits/{diagnosis,probe-contract,attempt-evaluator}/{train,validation,test}.jsonl

  Default output:
    datasets/engine-datasets/sft/phase-a-v1/

  Run:
    npx tsx scripts/engine-datasets/prepare-phase-a-sft-data.ts

  Useful options:
    --split train
    --split validation
    --split test
    --splits train,validation,test
    --model diagnosis
    --model probe-contract
    --model attempt-evaluator
    --input-root datasets/engine-datasets/splits
    --output-root datasets/engine-datasets/sft/phase-a-v1
    --no-chat
    --no-prompt-completion
    --pretty-assistant-json
    --allow-missing
*/

import * as fs from "node:fs";
import * as path from "node:path";

const MODEL_FOLDERS = ["diagnosis", "probe-contract", "attempt-evaluator"] as const;
const SPLITS = ["train", "validation", "test"] as const;

type ModelFolder = (typeof MODEL_FOLDERS)[number];
type SplitName = (typeof SPLITS)[number];

type AnyRecord = Record<string, unknown>;

type DatasetExample = {
  example_id: string;
  flow_id: string | null;
  model_target: string;
  source_workbook?: string | null;
  source_sheet?: string | null;
  source_row_number?: number | null;
  input: unknown;
  output: unknown;
  raw: AnyRecord;
};

type PreparedCounts = {
  examples: number;
  chat_examples: number;
  prompt_completion_examples: number;
  input_chars: number;
  output_chars: number;
  prompt_chars: number;
  completion_chars: number;
  approx_total_tokens: number;
};

type Report = {
  schema_version: "myway_phase_a_sft_prep_report_v1";
  created_at: string;
  script_name: string;
  input_root: string;
  output_root: string;
  model_folders: ModelFolder[];
  splits: SplitName[];
  formats_written: Array<"chat" | "prompt_completion">;
  pretty_assistant_json: boolean;
  allow_missing: boolean;
  totals: PreparedCounts;
  by_model_and_split: Record<string, PreparedCounts>;
  missing_files: string[];
  warnings: string[];
  output_files: Record<string, string>;
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const eq = arg.indexOf("=");
    if (eq >= 0) {
      args.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i += 1;
    } else {
      args.set(key, true);
    }
  }

  return args;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function writeText(filePath: string, text: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text, "utf8");
}

function appendLine(filePath: string, line: string) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${line}\n`, "utf8");
}

function resetFile(filePath: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, "", "utf8");
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function stableStringify(value: unknown, pretty = false): string {
  return JSON.stringify(sortJson(value), null, pretty ? 2 : 0);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;

  const input = value as AnyRecord;
  const out: AnyRecord = {};
  for (const key of Object.keys(input).sort()) {
    out[key] = sortJson(input[key]);
  }
  return out;
}

function parseJsonMaybe(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function readJsonl(filePath: string): AnyRecord[] {
  const text = readText(filePath);
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        const parsed = JSON.parse(line) as AnyRecord;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Line did not parse to an object.");
        }
        return parsed;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${filePath}:${index + 1}: invalid JSONL line: ${message}`);
      }
    });
}

function pickString(record: AnyRecord, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function pickNumberOrNull(record: AnyRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function normalizeModelTarget(modelFolder: ModelFolder): string {
  if (modelFolder === "probe-contract") return "probe_contract";
  if (modelFolder === "attempt-evaluator") return "attempt_evaluator";
  return "diagnosis";
}

function normalizeExample(raw: AnyRecord, modelFolder: ModelFolder, lineIndex: number): DatasetExample {
  const modelTarget = pickString(raw, ["model_target", "target_model", "model"], normalizeModelTarget(modelFolder));
  const input = parseJsonMaybe(raw.input ?? raw.input_json ?? raw.model_input ?? raw.prompt_input);
  const output = parseJsonMaybe(raw.output ?? raw.output_json ?? raw.expected_output ?? raw.completion_output);

  if (input === undefined) {
    throw new Error(`Missing input/input_json on ${modelFolder} line ${lineIndex + 1}.`);
  }
  if (output === undefined) {
    throw new Error(`Missing output/output_json on ${modelFolder} line ${lineIndex + 1}.`);
  }

  return {
    example_id: pickString(raw, ["example_id", "id", "row_id"], `${modelFolder}_${lineIndex + 1}`),
    flow_id: pickString(raw, ["flow_id", "connected_flow_id", "flow"], "") || null,
    model_target: modelTarget,
    source_workbook: pickString(raw, ["source_workbook", "workbook", "source_file"], "") || null,
    source_sheet: pickString(raw, ["source_sheet", "sheet"], "") || null,
    source_row_number: pickNumberOrNull(raw, ["source_row_number", "row_number", "excel_row", "row"]),
    input,
    output,
    raw,
  };
}

function getSystemPrompt(modelFolder: ModelFolder): string {
  switch (modelFolder) {
    case "diagnosis":
      return [
        "You are the MyWay Diagnosis Model.",
        "Return only valid JSON matching DiagnosisModelOutput.",
        "Use exact schema_version: diagnosis_model_output_v1.",
        "Use only valid DiagnosisLabel and DiagnosisNextAction enum values from the MyWay shared schema.",
        "Do not include markdown, commentary, hidden reasoning, or extra top-level fields.",
      ].join(" ");

    case "probe-contract":
      return [
        "You are the MyWay Probe Contract Model.",
        "Return only valid JSON matching ProbeContractModelOutput.",
        "Use exact schema_version: probe_contract_model_output_v1.",
        "Choose schema-valid probe_type and expected_attempt_type values, include a ProbePrompt object, answer_key when appropriate, misconception_markers, renderer_params when needed, delivery_context, and confidence.",
        "Respect bridge_level and language_policy. bridge_0 should use no jargon.",
        "Do not include markdown, commentary, hidden reasoning, or extra top-level fields.",
      ].join(" ");

    case "attempt-evaluator":
      return [
        "You are the MyWay Probe Attempt Evaluator.",
        "Return only valid JSON matching ProbeAttemptEvaluatorOutput.",
        "Use exact schema_version: probe_attempt_evaluator_output_v1.",
        "Evaluate correctness, understanding_evidence, misconception_hits, diagnosis_delta when useful, cautious personalization_delta when justified, next_action, and next_action_confidence.",
        "Flag correct-but-weak attempts with may_be_lucky_guess and needs_verification_probe when the evidence is not stable.",
        "Do not include markdown, commentary, hidden reasoning, or extra top-level fields.",
      ].join(" ");
  }
}

function getUserPrompt(modelFolder: ModelFolder, input: unknown): string {
  const modelName =
    modelFolder === "diagnosis"
      ? "DiagnosisModelInput"
      : modelFolder === "probe-contract"
        ? "ProbeContractModelInput"
        : "ProbeAttemptEvaluatorInput";

  return [
    `Convert this ${modelName} into the correct MyWay model output.`,
    "Return JSON only.",
    "",
    "MODEL_INPUT_JSON:",
    stableStringify(input, true),
  ].join("\n");
}

function buildMetadata(example: DatasetExample, modelFolder: ModelFolder, split: SplitName): AnyRecord {
  return {
    example_id: example.example_id,
    flow_id: example.flow_id,
    model_folder: modelFolder,
    model_target: example.model_target,
    split,
    source_workbook: example.source_workbook,
    source_sheet: example.source_sheet,
    source_row_number: example.source_row_number,
  };
}

function buildChatExample(
  example: DatasetExample,
  modelFolder: ModelFolder,
  split: SplitName,
  prettyAssistantJson: boolean,
): AnyRecord {
  return {
    messages: [
      { role: "system", content: getSystemPrompt(modelFolder) },
      { role: "user", content: getUserPrompt(modelFolder, example.input) },
      { role: "assistant", content: stableStringify(example.output, prettyAssistantJson) },
    ],
    metadata: buildMetadata(example, modelFolder, split),
  };
}

function buildPromptCompletionExample(
  example: DatasetExample,
  modelFolder: ModelFolder,
  split: SplitName,
  prettyAssistantJson: boolean,
): AnyRecord {
  const system = getSystemPrompt(modelFolder);
  const user = getUserPrompt(modelFolder, example.input);
  const completion = stableStringify(example.output, prettyAssistantJson);

  return {
    prompt: [`### System`, system, "", `### User`, user, "", `### Assistant`, ""].join("\n"),
    completion,
    metadata: buildMetadata(example, modelFolder, split),
  };
}

function emptyCounts(): PreparedCounts {
  return {
    examples: 0,
    chat_examples: 0,
    prompt_completion_examples: 0,
    input_chars: 0,
    output_chars: 0,
    prompt_chars: 0,
    completion_chars: 0,
    approx_total_tokens: 0,
  };
}

function addCounts(a: PreparedCounts, b: PreparedCounts) {
  a.examples += b.examples;
  a.chat_examples += b.chat_examples;
  a.prompt_completion_examples += b.prompt_completion_examples;
  a.input_chars += b.input_chars;
  a.output_chars += b.output_chars;
  a.prompt_chars += b.prompt_chars;
  a.completion_chars += b.completion_chars;
  a.approx_total_tokens += b.approx_total_tokens;
}

function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / 4);
}

function validatePreparedChat(record: AnyRecord): string[] {
  const errors: string[] = [];
  const messages = record.messages;
  if (!Array.isArray(messages) || messages.length !== 3) {
    errors.push("chat example must have exactly 3 messages");
    return errors;
  }
  const roles = messages.map((m) => (m && typeof m === "object" ? (m as AnyRecord).role : null));
  if (roles.join(",") !== "system,user,assistant") {
    errors.push(`chat roles must be system,user,assistant; got ${roles.join(",")}`);
  }
  for (const [index, message] of messages.entries()) {
    if (!message || typeof message !== "object") errors.push(`message[${index}] is not an object`);
    const content = (message as AnyRecord).content;
    if (typeof content !== "string" || !content.trim()) errors.push(`message[${index}].content is empty`);
  }
  const assistant = messages[2] as AnyRecord;
  if (typeof assistant.content === "string") {
    try {
      JSON.parse(assistant.content);
    } catch {
      errors.push("assistant content must be parseable JSON");
    }
  }
  return errors;
}

function validatePreparedPromptCompletion(record: AnyRecord): string[] {
  const errors: string[] = [];
  if (typeof record.prompt !== "string" || !record.prompt.trim()) errors.push("prompt is empty");
  if (typeof record.completion !== "string" || !record.completion.trim()) errors.push("completion is empty");
  if (typeof record.completion === "string") {
    try {
      JSON.parse(record.completion);
    } catch {
      errors.push("completion must be parseable JSON");
    }
  }
  return errors;
}

function parseSplitList(value: string | boolean | undefined): SplitName[] {
  if (!value || value === true) return [...SPLITS];
  const raw = String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const out: SplitName[] = [];
  for (const split of raw) {
    if (!SPLITS.includes(split as SplitName)) {
      throw new Error(`Invalid split "${split}". Expected one of: ${SPLITS.join(", ")}`);
    }
    out.push(split as SplitName);
  }
  return out.length ? out : [...SPLITS];
}

function parseModelList(value: string | boolean | undefined): ModelFolder[] {
  if (!value || value === true) return [...MODEL_FOLDERS];
  const raw = String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const out: ModelFolder[] = [];
  for (const model of raw) {
    if (!MODEL_FOLDERS.includes(model as ModelFolder)) {
      throw new Error(`Invalid model "${model}". Expected one of: ${MODEL_FOLDERS.join(", ")}`);
    }
    out.push(model as ModelFolder);
  }
  return out.length ? out : [...MODEL_FOLDERS];
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const inputRoot = String(args.get("input-root") ?? "datasets/engine-datasets/splits");
  const outputRoot = String(args.get("output-root") ?? "datasets/engine-datasets/sft/phase-a-v1");

  const splitArg = args.get("split") ?? args.get("splits");
  const splits = parseSplitList(splitArg);
  const modelFolders = parseModelList(args.get("model") ?? args.get("models"));

  const writeChat = !args.has("no-chat");
  const writePromptCompletion = !args.has("no-prompt-completion");
  const prettyAssistantJson = args.has("pretty-assistant-json");
  const allowMissing = args.has("allow-missing");

  if (!writeChat && !writePromptCompletion) {
    throw new Error("Nothing to write. Remove --no-chat or --no-prompt-completion.");
  }

  const formatsWritten: Array<"chat" | "prompt_completion"> = [];
  if (writeChat) formatsWritten.push("chat");
  if (writePromptCompletion) formatsWritten.push("prompt_completion");

  console.log(`Preparing Phase A SFT data from ${inputRoot}...`);
  console.log(`Models: ${modelFolders.join(", ")}`);
  console.log(`Splits: ${splits.join(", ")}`);
  console.log(`Formats: ${formatsWritten.join(", ")}`);
  console.log(`Output: ${outputRoot}`);
  console.log("");

  const report: Report = {
    schema_version: "myway_phase_a_sft_prep_report_v1",
    created_at: new Date().toISOString(),
    script_name: "prepare-phase-a-sft-data.ts",
    input_root: toPosix(inputRoot),
    output_root: toPosix(outputRoot),
    model_folders: modelFolders,
    splits,
    formats_written: formatsWritten,
    pretty_assistant_json: prettyAssistantJson,
    allow_missing: allowMissing,
    totals: emptyCounts(),
    by_model_and_split: {},
    missing_files: [],
    warnings: [],
    output_files: {},
  };

  const prepErrorsPath = path.join(outputRoot, "reports", "phase-a-sft-prep-errors.jsonl");
  resetFile(prepErrorsPath);

  for (const modelFolder of modelFolders) {
    for (const split of splits) {
      const sourceFile = path.join(inputRoot, modelFolder, `${split}.jsonl`);
      const key = `${modelFolder}:${split}`;
      const counts = emptyCounts();
      report.by_model_and_split[key] = counts;

      if (!fs.existsSync(sourceFile)) {
        const missing = toPosix(sourceFile);
        report.missing_files.push(missing);
        const warning = `Missing split file: ${missing}`;
        report.warnings.push(warning);
        console.warn(`Warning: ${warning}`);
        if (!allowMissing) continue;
      }

      if (!fs.existsSync(sourceFile)) continue;

      const rawRows = readJsonl(sourceFile);
      const examples = rawRows.map((row, index) => normalizeExample(row, modelFolder, index));

      const chatOut = path.join(outputRoot, "chat", modelFolder, `${split}.jsonl`);
      const promptCompletionOut = path.join(outputRoot, "prompt-completion", modelFolder, `${split}.jsonl`);

      if (writeChat) {
        resetFile(chatOut);
        report.output_files[`chat:${key}`] = toPosix(chatOut);
      }
      if (writePromptCompletion) {
        resetFile(promptCompletionOut);
        report.output_files[`prompt_completion:${key}`] = toPosix(promptCompletionOut);
      }

      for (const example of examples) {
        counts.examples += 1;

        const inputJson = stableStringify(example.input, false);
        const outputJson = stableStringify(example.output, prettyAssistantJson);
        counts.input_chars += inputJson.length;
        counts.output_chars += outputJson.length;

        if (writeChat) {
          const chatExample = buildChatExample(example, modelFolder, split, prettyAssistantJson);
          const errors = validatePreparedChat(chatExample);
          if (errors.length) {
            appendLine(
              prepErrorsPath,
              stableStringify({
                format: "chat",
                modelFolder,
                split,
                example_id: example.example_id,
                errors,
              }),
            );
          }
          const line = stableStringify(chatExample);
          appendLine(chatOut, line);
          counts.chat_examples += 1;
          counts.prompt_chars += JSON.stringify((chatExample.messages as AnyRecord[]).slice(0, 2)).length;
          counts.completion_chars += String((chatExample.messages as AnyRecord[])[2].content).length;
        }

        if (writePromptCompletion) {
          const pcExample = buildPromptCompletionExample(example, modelFolder, split, prettyAssistantJson);
          const errors = validatePreparedPromptCompletion(pcExample);
          if (errors.length) {
            appendLine(
              prepErrorsPath,
              stableStringify({
                format: "prompt_completion",
                modelFolder,
                split,
                example_id: example.example_id,
                errors,
              }),
            );
          }
          const line = stableStringify(pcExample);
          appendLine(promptCompletionOut, line);
          counts.prompt_completion_examples += 1;
          counts.prompt_chars += String(pcExample.prompt).length;
          counts.completion_chars += String(pcExample.completion).length;
        }
      }

      counts.approx_total_tokens = estimateTokensFromChars(counts.prompt_chars + counts.completion_chars);
      addCounts(report.totals, counts);

      console.log(
        `${key.padEnd(34)} examples=${String(counts.examples).padStart(4)} chat=${String(
          counts.chat_examples,
        ).padStart(4)} prompt_completion=${String(counts.prompt_completion_examples).padStart(4)} approx_tokens=${counts.approx_total_tokens}`,
      );
    }
  }

  if (report.missing_files.length && !allowMissing) {
    const message = `Missing ${report.missing_files.length} required split file(s). Re-run with --allow-missing to ignore.`;
    report.warnings.push(message);
  }

  const reportPath = path.join(outputRoot, "reports", "phase-a-sft-prep-report.json");
  const summaryPath = path.join(outputRoot, "reports", "phase-a-sft-prep-summary.txt");

  writeText(reportPath, `${stableStringify(report, true)}\n`);

  const summaryLines = [
    "MyWay Phase A SFT Data Preparation",
    "===================================",
    `Created: ${report.created_at}`,
    `Input root: ${report.input_root}`,
    `Output root: ${report.output_root}`,
    `Models: ${report.model_folders.join(", ")}`,
    `Splits: ${report.splits.join(", ")}`,
    `Formats: ${report.formats_written.join(", ")}`,
    "",
    `Examples: ${report.totals.examples}`,
    `Chat examples: ${report.totals.chat_examples}`,
    `Prompt/completion examples: ${report.totals.prompt_completion_examples}`,
    `Approx total tokens across written formats: ${report.totals.approx_total_tokens}`,
    `Warnings: ${report.warnings.length}`,
    `Missing files: ${report.missing_files.length}`,
    "",
    "By model and split:",
    ...Object.entries(report.by_model_and_split).map(([key, counts]) => {
      return `- ${key}: examples=${counts.examples}, chat=${counts.chat_examples}, prompt_completion=${counts.prompt_completion_examples}, approx_tokens=${counts.approx_total_tokens}`;
    }),
    "",
    "Output files:",
    ...Object.entries(report.output_files).map(([key, file]) => `- ${key}: ${file}`),
    "",
    `Report: ${toPosix(reportPath)}`,
    `Errors: ${toPosix(prepErrorsPath)}`,
  ];

  writeText(summaryPath, `${summaryLines.join("\n")}\n`);

  console.log("");
  console.log("Done. SFT data prepared.");
  console.log(`Examples: ${report.totals.examples}`);
  console.log(`Chat examples: ${report.totals.chat_examples}`);
  console.log(`Prompt/completion examples: ${report.totals.prompt_completion_examples}`);
  console.log(`Warnings: ${report.warnings.length}`);
  console.log(`Report: ${toPosix(reportPath)}`);
  console.log(`Summary: ${toPosix(summaryPath)}`);
  console.log(`Errors: ${toPosix(prepErrorsPath)}`);

  if (report.missing_files.length && !allowMissing) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
}
