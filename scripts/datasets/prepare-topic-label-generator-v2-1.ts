import fs from "node:fs";
import path from "node:path";

type TopicReferenceType =
  | "explicit_topic_reference"
  | "active_topic_reference"
  | "unclear_topic"
  | "no_topic";

type TopicLabelRecord = {
  id: string;
  input: {
    message: string;
    active_topic_name: string | null;
    current_topic_names: string[];
    previous_user_messages: string[];
  };
  output: {
    extracted_label: string | null;
    topic_reference_type: TopicReferenceType;
    confidence: number;
  };
  metadata?: Record<string, unknown>;
};

type LabelGeneratorRecord = {
  id: string;
  input_text: string;
  target_text: string;
  metadata: {
    source_record_id: string;
    schema_version: "topic_label_v2_1_label_generator";
    source_topic_reference_type: "explicit_topic_reference";
    input_format: "message_active_topic_previous_user_messages_no_current_topics";
  };
};

const PROJECT_ROOT = process.cwd();

const V2_DATASET_DIR = path.join(
  PROJECT_ROOT,
  "datasets",
  "topic-labeling-dataset",
  "v2"
);

const SPLIT_DIR = path.join(V2_DATASET_DIR, "splits");

const TRAIN_PATH = path.join(SPLIT_DIR, "train.jsonl");
const VALIDATION_PATH = path.join(SPLIT_DIR, "validation.jsonl");
const TEST_PATH = path.join(SPLIT_DIR, "test.jsonl");

const LABEL_GENERATOR_DIR = path.join(V2_DATASET_DIR, "label-generator-v2-1");

const OUT_TRAIN = path.join(LABEL_GENERATOR_DIR, "train.jsonl");
const OUT_VALIDATION = path.join(LABEL_GENERATOR_DIR, "validation.jsonl");
const OUT_TEST = path.join(LABEL_GENERATOR_DIR, "test.jsonl");
const OUT_README = path.join(LABEL_GENERATOR_DIR, "README.md");

function readJsonl(filePath: string): TopicLabelRecord[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as TopicLabelRecord;
      } catch {
        throw new Error(`Invalid JSONL at line ${index + 1}: ${filePath}`);
      }
    });
}

function writeJsonl(filePath: string, records: LabelGeneratorRecord[]) {
  const text = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
  fs.writeFileSync(filePath, text, "utf8");
}

function formatInputText(record: TopicLabelRecord): string {
  const { message, active_topic_name, previous_user_messages } = record.input;

  return [
    "Task: Extract the best concise topic label from the user's message.",
    "",
    `message: ${message}`,
    `active_topic_name: ${active_topic_name ?? "NONE"}`,
    `previous_user_messages: ${previous_user_messages.join(" | ")}`,
    "",
    "Important: Do not choose a topic just because it is active. Extract the topic the user is explicitly pointing to in the message.",
    "Return only the topic label."
  ].join("\n");
}

function convertRecords(records: TopicLabelRecord[]): LabelGeneratorRecord[] {
  const explicitRecords = records.filter((record) => {
    return (
      record.output.topic_reference_type === "explicit_topic_reference" &&
      typeof record.output.extracted_label === "string" &&
      record.output.extracted_label.trim().length > 0
    );
  });

  return explicitRecords.map((record) => {
    return {
      id: record.id,
      input_text: formatInputText(record),
      target_text: record.output.extracted_label!.trim(),
      metadata: {
        source_record_id: record.id,
        schema_version: "topic_label_v2_1_label_generator",
        source_topic_reference_type: "explicit_topic_reference",
        input_format: "message_active_topic_previous_user_messages_no_current_topics",
      },
    };
  });
}

function writeReadme(
  train: LabelGeneratorRecord[],
  validation: LabelGeneratorRecord[],
  test: LabelGeneratorRecord[]
) {
  const readme = `# Topic Label Generator V2.1 Dataset

This dataset is derived from the V2 topic-labeling splits.

It only includes rows where:

\`\`\`txt
topic_reference_type = explicit_topic_reference
extracted_label != null
\`\`\`

## Purpose

Train a label generator:

\`\`\`txt
message + active_topic_name + previous_user_messages
→ extracted_label
\`\`\`

## Main V2.1 change

This version removes \`current_topic_names\` from the label-generator input.

Reason: the first T5 label generator overused \`current_topic_names\` and sometimes copied an existing topic instead of extracting the explicit topic from the user's message.

The reference-type classifier can still use current topics.  
The label generator should focus on extracting the user's explicit topic phrase.

## Counts

- train: ${train.length}
- validation: ${validation.length}
- test: ${test.length}

## Files

- train.jsonl
- validation.jsonl
- test.jsonl
`;

  fs.writeFileSync(OUT_README, readme, "utf8");
}

function main() {
  fs.mkdirSync(LABEL_GENERATOR_DIR, { recursive: true });

  const trainRecords = convertRecords(readJsonl(TRAIN_PATH));
  const validationRecords = convertRecords(readJsonl(VALIDATION_PATH));
  const testRecords = convertRecords(readJsonl(TEST_PATH));

  writeJsonl(OUT_TRAIN, trainRecords);
  writeJsonl(OUT_VALIDATION, validationRecords);
  writeJsonl(OUT_TEST, testRecords);
  writeReadme(trainRecords, validationRecords, testRecords);

  console.log("Prepared V2.1 topic-label generator dataset.");
  console.log("");
  console.log(`Train: ${trainRecords.length}`);
  console.log(`Validation: ${validationRecords.length}`);
  console.log(`Test: ${testRecords.length}`);
  console.log("");
  console.log(`Wrote: ${OUT_TRAIN}`);
  console.log(`Wrote: ${OUT_VALIDATION}`);
  console.log(`Wrote: ${OUT_TEST}`);
  console.log(`Wrote: ${OUT_README}`);
}

main();