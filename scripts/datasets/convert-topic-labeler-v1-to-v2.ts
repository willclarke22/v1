import fs from "node:fs";
import path from "node:path";

type TopicReferenceTypeV1 =
  | "new_explicit_topic"
  | "existing_explicit_topic"
  | "active_topic_reference"
  | "unclear_topic"
  | "no_topic";

type TopicReferenceTypeV2 =
  | "explicit_topic_reference"
  | "active_topic_reference"
  | "unclear_topic"
  | "no_topic";

type TopicLabelRecordV1 = {
  id: string;
  input: {
    message: string;
    active_topic_name: string | null;
    current_topic_names: string[];
    previous_user_messages: string[];
  };
  output: {
    extracted_label: string | null;
    topic_reference_type: TopicReferenceTypeV1;
    confidence: number;
  };
  metadata?: Record<string, unknown>;
};

type TopicLabelRecordV2 = {
  id: string;
  input: TopicLabelRecordV1["input"];
  output: {
    extracted_label: string | null;
    topic_reference_type: TopicReferenceTypeV2;
    confidence: number;
  };
  metadata: Record<string, unknown>;
};

const PROJECT_ROOT = process.cwd();

const V1_DATASET_DIR = path.join(
  PROJECT_ROOT,
  "datasets",
  "topic-labeling-dataset",
  "v1"
);

const V2_DATASET_DIR = path.join(
  PROJECT_ROOT,
  "datasets",
  "topic-labeling-dataset",
  "v2"
);

const INPUT_JSONL = path.join(V1_DATASET_DIR, "topic_label_dataset_5000.jsonl");

const OUTPUT_JSONL = path.join(V2_DATASET_DIR, "topic_label_dataset_5000_v2.jsonl");
const OUTPUT_JSON = path.join(V2_DATASET_DIR, "topic_label_dataset_5000_v2.json");
const OUTPUT_CSV = path.join(V2_DATASET_DIR, "topic_label_dataset_5000_v2.csv");
const OUTPUT_README = path.join(V2_DATASET_DIR, "topic_label_dataset_README.md");

function readJsonl(filePath: string): TopicLabelRecordV1[] {
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
        return JSON.parse(line) as TopicLabelRecordV1;
      } catch {
        throw new Error(`Invalid JSONL at line ${index + 1}`);
      }
    });
}

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function arrayToPipeText(values: string[]): string {
  return values.join(" | ");
}

function writeJsonl(filePath: string, records: TopicLabelRecordV2[]) {
  const text = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
  fs.writeFileSync(filePath, text, "utf8");
}

function writeJson(filePath: string, records: TopicLabelRecordV2[]) {
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), "utf8");
}

function writeCsv(filePath: string, records: TopicLabelRecordV2[]) {
  const headers = [
    "id",
    "message",
    "active_topic_name",
    "current_topic_names",
    "previous_user_messages",
    "extracted_label",
    "topic_reference_type",
    "confidence",
    "needs_human_review",
    "reviewer_notes",
  ];

  const rows = records.map((record) => {
    return [
      record.id,
      record.input.message,
      record.input.active_topic_name ?? "",
      arrayToPipeText(record.input.current_topic_names),
      arrayToPipeText(record.input.previous_user_messages),
      record.output.extracted_label ?? "",
      record.output.topic_reference_type,
      record.output.confidence,
      "True",
      "",
    ]
      .map(escapeCsv)
      .join(",");
  });

  fs.writeFileSync(filePath, [headers.join(","), ...rows].join("\n") + "\n", "utf8");
}

function mapReferenceTypeV1ToV2(type: TopicReferenceTypeV1): TopicReferenceTypeV2 {
  if (type === "new_explicit_topic") {
    return "explicit_topic_reference";
  }

  if (type === "existing_explicit_topic") {
    return "explicit_topic_reference";
  }

  return type;
}

function countByReferenceType(records: TopicLabelRecordV2[]) {
  const counts: Record<string, number> = {};

  for (const record of records) {
    const type = record.output.topic_reference_type;
    counts[type] = (counts[type] ?? 0) + 1;
  }

  return counts;
}

function validateRecord(record: TopicLabelRecordV1) {
  if (!record.id) return false;
  if (!record.input) return false;
  if (typeof record.input.message !== "string") return false;
  if (!Array.isArray(record.input.current_topic_names)) return false;
  if (!Array.isArray(record.input.previous_user_messages)) return false;
  if (!record.output) return false;
  if (typeof record.output.topic_reference_type !== "string") return false;
  if (typeof record.output.confidence !== "number") return false;

  return true;
}

function convertRecord(record: TopicLabelRecordV1, index: number): TopicLabelRecordV2 {
  const v2ReferenceType = mapReferenceTypeV1ToV2(record.output.topic_reference_type);

  return {
    id: `topic_label_v2_5000_${String(index + 1).padStart(4, "0")}`,
    input: record.input,
    output: {
      extracted_label: record.output.extracted_label,
      topic_reference_type: v2ReferenceType,
      confidence: record.output.confidence,
    },
    metadata: {
      ...(record.metadata ?? {}),
      schema_version: "topic_label_v2",
      dataset_version: "topic_label_dataset_5000_v2",
      converted_from: {
        source_schema_version: "topic_label_v1",
        source_record_id: record.id,
        source_topic_reference_type: record.output.topic_reference_type,
      },
      conversion_rule:
        "new_explicit_topic and existing_explicit_topic were merged into explicit_topic_reference. Router/code should decide whether explicit labels map to existing topics or new topics.",
      synthetic: true,
      needs_human_review: true,
    },
  };
}

function writeReadme(filePath: string, records: TopicLabelRecordV2[]) {
  const counts = countByReferenceType(records);

  const readme = `# MyWay Topic Label V2 Dataset

This dataset was converted from the V1 5,000-row topic-labeling dataset.

## Main conceptual change

V1 asked the model to distinguish:

\`\`\`ts
"new_explicit_topic" | "existing_explicit_topic"
\`\`\`

V2 merges both into:

\`\`\`ts
"explicit_topic_reference"
\`\`\`

The labeler should identify whether the user explicitly refers to a topic and extract the topic label.  
The router/code should decide whether that extracted label maps to an existing topic or should create a new one.

## V2 input schema

\`\`\`ts
type TopicLabelInput = {
  message: string;
  active_topic_name: string | null;
  current_topic_names: string[];
  previous_user_messages: string[];
};
\`\`\`

## V2 output schema

\`\`\`ts
type TopicLabelOutput = {
  extracted_label: string | null;
  topic_reference_type:
    | "explicit_topic_reference"
    | "active_topic_reference"
    | "unclear_topic"
    | "no_topic";
  confidence: number;
};
\`\`\`

## Distribution

Rows: ${records.length}

Reference type counts:

\`\`\`json
${JSON.stringify(counts, null, 2)}
\`\`\`

## Files

- \`topic_label_dataset_5000_v2.csv\`
- \`topic_label_dataset_5000_v2.jsonl\`
- \`topic_label_dataset_5000_v2.json\`
- \`topic_label_dataset_README.md\`

## Caveat

This remains synthetic seed data. All rows should still be treated as needing human review before production use.
`;

  fs.writeFileSync(filePath, readme, "utf8");
}

function main() {
  fs.mkdirSync(V2_DATASET_DIR, { recursive: true });

  const v1Records = readJsonl(INPUT_JSONL);

  const invalidRecords = v1Records.filter((record) => !validateRecord(record));
  if (invalidRecords.length > 0) {
    throw new Error(`Found ${invalidRecords.length} invalid V1 records.`);
  }

  const v2Records = v1Records.map(convertRecord);

  writeJsonl(OUTPUT_JSONL, v2Records);
  writeJson(OUTPUT_JSON, v2Records);
  writeCsv(OUTPUT_CSV, v2Records);
  writeReadme(OUTPUT_README, v2Records);

  console.log("Converted topic label dataset from V1 to V2.");
  console.log("");
  console.log(`Input: ${INPUT_JSONL}`);
  console.log(`Rows: ${v2Records.length}`);
  console.log("");
  console.log("V2 reference type counts:");
  console.log(countByReferenceType(v2Records));
  console.log("");
  console.log(`Wrote: ${OUTPUT_CSV}`);
  console.log(`Wrote: ${OUTPUT_JSONL}`);
  console.log(`Wrote: ${OUTPUT_JSON}`);
  console.log(`Wrote: ${OUTPUT_README}`);
}

main();