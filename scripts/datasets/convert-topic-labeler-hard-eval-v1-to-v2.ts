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

type HardEvalRecordV1 = {
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
};

type HardEvalRecordV2 = {
  id: string;
  input: HardEvalRecordV1["input"];
  output: {
    extracted_label: string | null;
    topic_reference_type: TopicReferenceTypeV2;
    confidence: number;
  };
  metadata: {
    schema_version: "topic_label_v2";
    converted_from: {
      source_schema_version: "topic_label_v1";
      source_record_id: string;
      source_topic_reference_type: TopicReferenceTypeV1;
    };
    conversion_rule: string;
    needs_human_review: true;
  };
};

const PROJECT_ROOT = process.cwd();

const V1_HARD_EVAL_PATH = path.join(
  PROJECT_ROOT,
  "datasets",
  "topic-labeling-dataset",
  "v1",
  "hard-eval",
  "hard_eval_topic_reference_v1.jsonl"
);

const V2_HARD_EVAL_DIR = path.join(
  PROJECT_ROOT,
  "datasets",
  "topic-labeling-dataset",
  "v2",
  "hard-eval"
);

const V2_HARD_EVAL_PATH = path.join(
  V2_HARD_EVAL_DIR,
  "hard_eval_topic_reference_v2.jsonl"
);

function readJsonl(filePath: string): HardEvalRecordV1[] {
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
        return JSON.parse(line) as HardEvalRecordV1;
      } catch {
        throw new Error(`Invalid JSONL at line ${index + 1}`);
      }
    });
}

function writeJsonl(filePath: string, records: HardEvalRecordV2[]) {
  const text = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
  fs.writeFileSync(filePath, text, "utf8");
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

function validateRecord(record: HardEvalRecordV1) {
  if (!record.id) return false;
  if (!record.input) return false;
  if (typeof record.input.message !== "string") return false;
  if (
    typeof record.input.active_topic_name !== "string" &&
    record.input.active_topic_name !== null
  ) {
    return false;
  }
  if (!Array.isArray(record.input.current_topic_names)) return false;
  if (!Array.isArray(record.input.previous_user_messages)) return false;
  if (!record.output) return false;
  if (
    typeof record.output.extracted_label !== "string" &&
    record.output.extracted_label !== null
  ) {
    return false;
  }
  if (typeof record.output.topic_reference_type !== "string") return false;
  if (typeof record.output.confidence !== "number") return false;

  return true;
}

function convertRecord(record: HardEvalRecordV1): HardEvalRecordV2 {
  const v2ReferenceType = mapReferenceTypeV1ToV2(
    record.output.topic_reference_type
  );

  return {
    id: record.id.replace("hard_eval_", "hard_eval_v2_"),
    input: record.input,
    output: {
      extracted_label: record.output.extracted_label,
      topic_reference_type: v2ReferenceType,
      confidence: record.output.confidence,
    },
    metadata: {
      schema_version: "topic_label_v2",
      converted_from: {
        source_schema_version: "topic_label_v1",
        source_record_id: record.id,
        source_topic_reference_type: record.output.topic_reference_type,
      },
      conversion_rule:
        "new_explicit_topic and existing_explicit_topic were merged into explicit_topic_reference. Router/code should decide whether explicit labels map to existing topics or new topics.",
      needs_human_review: true,
    },
  };
}

function countByReferenceType(records: HardEvalRecordV2[]) {
  const counts: Record<string, number> = {};

  for (const record of records) {
    const type = record.output.topic_reference_type;
    counts[type] = (counts[type] ?? 0) + 1;
  }

  return counts;
}

function main() {
  fs.mkdirSync(V2_HARD_EVAL_DIR, { recursive: true });

  const v1Records = readJsonl(V1_HARD_EVAL_PATH);

  const invalidRecords = v1Records.filter((record) => !validateRecord(record));
  if (invalidRecords.length > 0) {
    throw new Error(`Found ${invalidRecords.length} invalid hard-eval records.`);
  }

  const v2Records = v1Records.map(convertRecord);

  writeJsonl(V2_HARD_EVAL_PATH, v2Records);

  console.log("Converted hard eval from V1 to V2.");
  console.log("");
  console.log(`Input: ${V1_HARD_EVAL_PATH}`);
  console.log(`Rows: ${v2Records.length}`);
  console.log("");
  console.log("V2 reference type counts:");
  console.log(countByReferenceType(v2Records));
  console.log("");
  console.log(`Wrote: ${V2_HARD_EVAL_PATH}`);
}

main();