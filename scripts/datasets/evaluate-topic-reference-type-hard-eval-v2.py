import json
from pathlib import Path
from typing import Any

import joblib
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix


PROJECT_ROOT = Path.cwd()

DATASET_DIR = PROJECT_ROOT / "datasets" / "topic-labeling-dataset" / "v2"
HARD_EVAL_PATH = DATASET_DIR / "hard-eval" / "hard_eval_topic_reference_v2.jsonl"

MODEL_PATH = (
    PROJECT_ROOT
    / "models"
    / "topic-labeler"
    / "v2"
    / "reference-type-classifier"
    / "topic_reference_type_classifier.joblib"
)

REPORT_DIR = DATASET_DIR / "reports"
REPORT_PATH = REPORT_DIR / "topic_reference_type_classifier_hard_eval_report.json"
MISTAKES_PATH = REPORT_DIR / "topic_reference_type_classifier_hard_eval_mistakes.jsonl"

TOPIC_TYPES = [
    "explicit_topic_reference",
    "active_topic_reference",
    "unclear_topic",
    "no_topic",
]


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Missing file: {path}")

    rows: list[dict[str, Any]] = []

    with path.open("r", encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue

            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL at {path}, line {line_number}") from exc

    return rows


def format_record_for_model(record: dict[str, Any]) -> str:
    input_data = record["input"]

    message = input_data.get("message") or ""
    active_topic_name = input_data.get("active_topic_name") or "NONE"
    current_topic_names = input_data.get("current_topic_names") or []
    previous_user_messages = input_data.get("previous_user_messages") or []

    current_topics_text = " | ".join(current_topic_names)
    previous_messages_text = " | ".join(previous_user_messages)

    return "\n".join(
        [
            f"message: {message}",
            f"active_topic_name: {active_topic_name}",
            f"current_topic_names: {current_topics_text}",
            f"previous_user_messages: {previous_messages_text}",
        ]
    )


def make_confusion_matrix(y_true: list[str], y_pred: list[str]) -> dict[str, dict[str, int]]:
    matrix = confusion_matrix(y_true, y_pred, labels=TOPIC_TYPES)

    return {
        expected_label: {
            predicted_label: int(matrix[i][j])
            for j, predicted_label in enumerate(TOPIC_TYPES)
        }
        for i, expected_label in enumerate(TOPIC_TYPES)
    }


def main() -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    records = read_jsonl(HARD_EVAL_PATH)

    model = joblib.load(MODEL_PATH)

    x = [format_record_for_model(record) for record in records]
    y_true = [record["output"]["topic_reference_type"] for record in records]
    y_pred = list(model.predict(x))

    accuracy = accuracy_score(y_true, y_pred)

    report = {
        "input_file": str(HARD_EVAL_PATH),
        "model_file": str(MODEL_PATH),
        "total": len(records),
        "accuracy": accuracy,
        "classification_report": classification_report(
            y_true,
            y_pred,
            labels=TOPIC_TYPES,
            output_dict=True,
            zero_division=0,
        ),
        "confusion_matrix": make_confusion_matrix(y_true, y_pred),
    }

    mistakes = []

    for record, expected, predicted in zip(records, y_true, y_pred):
        if expected != predicted:
            mistakes.append(
                {
                    "id": record["id"],
                    "message": record["input"]["message"],
                    "active_topic_name": record["input"]["active_topic_name"],
                    "previous_user_messages": record["input"]["previous_user_messages"],
                    "expected_topic_reference_type": expected,
                    "predicted_topic_reference_type": predicted,
                    "extracted_label": record["output"].get("extracted_label"),
                }
            )

    report["mistake_count"] = len(mistakes)

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    with MISTAKES_PATH.open("w", encoding="utf-8") as f:
        for mistake in mistakes:
            f.write(json.dumps(mistake, ensure_ascii=False) + "\n")

    print("V2 hard eval complete.")
    print("")
    print(f"Input: {HARD_EVAL_PATH}")
    print(f"Total: {len(records)}")
    print(f"Accuracy: {accuracy:.3f}")
    print("")
    print("Classification report:")
    print(
        classification_report(
            y_true,
            y_pred,
            labels=TOPIC_TYPES,
            zero_division=0,
        )
    )
    print("")
    print(f"Mistakes: {len(mistakes)}")
    print(f"Wrote report: {REPORT_PATH}")
    print(f"Wrote mistakes: {MISTAKES_PATH}")


if __name__ == "__main__":
    main()