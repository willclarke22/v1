import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)
from sklearn.pipeline import Pipeline


PROJECT_ROOT = Path.cwd()

DATASET_DIR = PROJECT_ROOT / "datasets" / "topic-labeling-dataset" / "v3_3"
SPLIT_DIR = DATASET_DIR / "splits"

TRAIN_PATH = SPLIT_DIR / "train.jsonl"
VALIDATION_PATH = SPLIT_DIR / "validation.jsonl"
TEST_PATH = SPLIT_DIR / "test.jsonl"

# Keep this as v3 on purpose.
# The running topic_labeler_v3 service already loads this path.
# So training from v3_3 data will replace the active V3 classifier.
MODEL_DIR = PROJECT_ROOT / "models" / "topic-labeler" / "v3" / "reference-type-classifier"
MODEL_PATH = MODEL_DIR / "topic_reference_type_classifier.joblib"

REPORT_DIR = DATASET_DIR / "reports"
REPORT_PATH = REPORT_DIR / "topic_reference_type_classifier_v3_3_report.json"
TEST_MISTAKES_PATH = REPORT_DIR / "topic_reference_type_classifier_v3_3_test_mistakes.jsonl"
VALIDATION_MISTAKES_PATH = REPORT_DIR / "topic_reference_type_classifier_v3_3_validation_mistakes.jsonl"

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
                raise ValueError(
                    f"Invalid JSONL at {path}, line {line_number}"
                ) from exc

    return rows


def format_record_for_model(record: dict[str, Any]) -> str:
    input_data = record["input"]

    message = input_data.get("message") or ""
    active_topic_name = input_data.get("active_topic_name") or "NONE"
    current_topic_names = input_data.get("current_topic_names") or []
    previous_user_messages = input_data.get("previous_user_messages") or []

    current_topics_text = " | ".join(current_topic_names)
    previous_messages_text = " | ".join(previous_user_messages)

    # Keep field names so the classifier can learn each field's role.
    return "\n".join(
        [
            f"message: {message}",
            f"active_topic_name: {active_topic_name}",
            f"current_topic_names: {current_topics_text}",
            f"previous_user_messages: {previous_messages_text}",
        ]
    )


def get_x_y(records: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    x = [format_record_for_model(record) for record in records]
    y = [record["output"]["topic_reference_type"] for record in records]
    return x, y


def make_confusion_matrix(
    y_true: list[str],
    y_pred: list[str],
) -> dict[str, dict[str, int]]:
    matrix = confusion_matrix(y_true, y_pred, labels=TOPIC_TYPES)

    return {
        expected_label: {
            predicted_label: int(matrix[i][j])
            for j, predicted_label in enumerate(TOPIC_TYPES)
        }
        for i, expected_label in enumerate(TOPIC_TYPES)
    }


def evaluate_split(
    model: Pipeline,
    records: list[dict[str, Any]],
    split_name: str,
) -> dict[str, Any]:
    x, y_true = get_x_y(records)
    y_pred = list(model.predict(x))

    accuracy = accuracy_score(y_true, y_pred)

    report = classification_report(
        y_true,
        y_pred,
        labels=TOPIC_TYPES,
        output_dict=True,
        zero_division=0,
    )

    mistakes = []

    for record, expected, predicted in zip(records, y_true, y_pred):
        if expected != predicted:
            mistakes.append(
                {
                    "id": record["id"],
                    "split": split_name,
                    "message": record["input"]["message"],
                    "active_topic_name": record["input"].get("active_topic_name"),
                    "current_topic_names": record["input"].get("current_topic_names", []),
                    "previous_user_messages": record["input"].get(
                        "previous_user_messages", []
                    ),
                    "expected_topic_reference_type": expected,
                    "predicted_topic_reference_type": predicted,
                    "extracted_label": record["output"].get("extracted_label"),
                    "metadata": record.get("metadata", {}),
                }
            )

    return {
        "split": split_name,
        "total": len(records),
        "accuracy": accuracy,
        "classification_report": report,
        "confusion_matrix": make_confusion_matrix(y_true, y_pred),
        "mistakes": mistakes,
    }


def count_labels(records: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}

    for record in records:
        label = record["output"]["topic_reference_type"]
        counts[label] = counts.get(label, 0) + 1

    return counts


def count_metadata_sources(records: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}

    for record in records:
        source = record.get("metadata", {}).get("source")
        source_label = source if isinstance(source, str) and source else "unknown"
        counts[source_label] = counts.get(source_label, 0) + 1

    return counts


def count_metadata_scenarios(records: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}

    for record in records:
        scenario = record.get("metadata", {}).get("scenario")
        scenario_label = scenario if isinstance(scenario, str) and scenario else "unknown"
        counts[scenario_label] = counts.get(scenario_label, 0) + 1

    return counts


def write_mistakes(path: Path, mistakes: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for mistake in mistakes:
            f.write(json.dumps(mistake, ensure_ascii=False) + "\n")


def backup_existing_model() -> str | None:
    if not MODEL_PATH.exists():
        return None

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = MODEL_DIR / f"topic_reference_type_classifier_backup_before_v3_3_{timestamp}.joblib"

    shutil.copy2(MODEL_PATH, backup_path)

    return str(backup_path)


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    train_records = read_jsonl(TRAIN_PATH)
    validation_records = read_jsonl(VALIDATION_PATH)
    test_records = read_jsonl(TEST_PATH)

    x_train, y_train = get_x_y(train_records)

    model = Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    lowercase=True,
                    ngram_range=(1, 3),
                    min_df=2,
                    max_df=0.95,
                    sublinear_tf=True,
                ),
            ),
            (
                "classifier",
                LogisticRegression(
                    max_iter=2500,
                    class_weight="balanced",
                    solver="lbfgs",
                ),
            ),
        ]
    )

    print("Training V3.3 topic_reference_type classifier...")
    print("")
    print(f"Dataset dir:     {DATASET_DIR}")
    print(f"Training rows:   {len(train_records)}")
    print(f"Validation rows: {len(validation_records)}")
    print(f"Test rows:       {len(test_records)}")
    print("")
    print("Train label counts:")
    print(count_labels(train_records))
    print("")
    print("Validation label counts:")
    print(count_labels(validation_records))
    print("")
    print("Test label counts:")
    print(count_labels(test_records))
    print("")
    print("Train metadata source counts:")
    print(count_metadata_sources(train_records))
    print("")
    print("Train metadata scenario counts:")
    print(count_metadata_scenarios(train_records))
    print("")

    backup_path = backup_existing_model()
    if backup_path:
        print(f"Backed up existing classifier to: {backup_path}")
        print("")

    model.fit(x_train, y_train)

    validation_eval = evaluate_split(model, validation_records, "validation")
    test_eval = evaluate_split(model, test_records, "test")

    joblib.dump(model, MODEL_PATH)

    report = {
        "model_type": "tfidf_logistic_regression",
        "target": "topic_reference_type",
        "schema_version": "topic_label_v3_3",
        "description": (
            "V3.3 reference-type classifier. Uses full context: message, "
            "active_topic_name, current_topic_names, and previous_user_messages. "
            "Trained on the augmented 14,503-row V3.3 dataset with targeted "
            "discourse-boundary examples: active-topic deictic followups like "
            "'Can you explain that easier?' should be active_topic_reference, "
            "while followup-looking openers with explicit shifts like "
            "'This helped, but now I want to understand X' should be "
            "explicit_topic_reference. Unclear_topic remains reserved for true "
            "ambiguity between possible named targets."
        ),
        "paths": {
            "train": str(TRAIN_PATH),
            "validation": str(VALIDATION_PATH),
            "test": str(TEST_PATH),
            "model": str(MODEL_PATH),
            "backup_model": backup_path,
            "report": str(REPORT_PATH),
            "validation_mistakes": str(VALIDATION_MISTAKES_PATH),
            "test_mistakes": str(TEST_MISTAKES_PATH),
        },
        "dataset_counts": {
            "train": len(train_records),
            "validation": len(validation_records),
            "test": len(test_records),
            "train_label_counts": count_labels(train_records),
            "validation_label_counts": count_labels(validation_records),
            "test_label_counts": count_labels(test_records),
            "train_metadata_source_counts": count_metadata_sources(train_records),
            "validation_metadata_source_counts": count_metadata_sources(validation_records),
            "test_metadata_source_counts": count_metadata_sources(test_records),
            "train_metadata_scenario_counts": count_metadata_scenarios(train_records),
            "validation_metadata_scenario_counts": count_metadata_scenarios(validation_records),
            "test_metadata_scenario_counts": count_metadata_scenarios(test_records),
        },
        "validation": {
            key: value
            for key, value in validation_eval.items()
            if key != "mistakes"
        },
        "test": {
            key: value
            for key, value in test_eval.items()
            if key != "mistakes"
        },
        "mistake_counts": {
            "validation": len(validation_eval["mistakes"]),
            "test": len(test_eval["mistakes"]),
        },
        "sample_validation_mistakes": validation_eval["mistakes"][:25],
        "sample_test_mistakes": test_eval["mistakes"][:25],
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    write_mistakes(VALIDATION_MISTAKES_PATH, validation_eval["mistakes"])
    write_mistakes(TEST_MISTAKES_PATH, test_eval["mistakes"])

    print("Training complete.")
    print("")
    print(f"Validation accuracy: {validation_eval['accuracy']:.3f}")
    print(f"Test accuracy:       {test_eval['accuracy']:.3f}")
    print("")
    print("Test classification report:")
    print(
        classification_report(
            [record["output"]["topic_reference_type"] for record in test_records],
            model.predict([format_record_for_model(record) for record in test_records]),
            labels=TOPIC_TYPES,
            zero_division=0,
        )
    )
    print("")
    print(f"Saved model:                {MODEL_PATH}")
    print(f"Saved report:               {REPORT_PATH}")
    print(f"Saved validation mistakes:  {VALIDATION_MISTAKES_PATH}")
    print(f"Saved test mistakes:        {TEST_MISTAKES_PATH}")


if __name__ == "__main__":
    main()