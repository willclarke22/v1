import json
import os
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

DATASET_DIR = PROJECT_ROOT / "datasets" / "topic-labeling-dataset" / "v1"
SPLIT_DIR = DATASET_DIR / "splits"

TRAIN_PATH = SPLIT_DIR / "train.jsonl"
VALIDATION_PATH = SPLIT_DIR / "validation.jsonl"
TEST_PATH = SPLIT_DIR / "test.jsonl"

MODEL_DIR = PROJECT_ROOT / "models" / "topic-labeler" / "v1" / "reference-type-classifier"
MODEL_PATH = MODEL_DIR / "topic_reference_type_classifier.joblib"

REPORT_DIR = DATASET_DIR / "reports"
REPORT_PATH = REPORT_DIR / "topic_reference_type_classifier_report.json"
TEST_MISTAKES_PATH = REPORT_DIR / "topic_reference_type_classifier_test_mistakes.jsonl"


TOPIC_TYPES = [
    "new_explicit_topic",
    "existing_explicit_topic",
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

    # Keep field names in the text so the model learns the role of each part.
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


def evaluate_split(
    model: Pipeline,
    records: list[dict[str, Any]],
    split_name: str,
) -> dict[str, Any]:
    x, y_true = get_x_y(records)
    y_pred = model.predict(x)

    accuracy = accuracy_score(y_true, y_pred)

    report = classification_report(
        y_true,
        y_pred,
        labels=TOPIC_TYPES,
        output_dict=True,
        zero_division=0,
    )

    matrix = confusion_matrix(
        y_true,
        y_pred,
        labels=TOPIC_TYPES,
    )

    matrix_as_dict = {
        expected_label: {
            predicted_label: int(matrix[i][j])
            for j, predicted_label in enumerate(TOPIC_TYPES)
        }
        for i, expected_label in enumerate(TOPIC_TYPES)
    }

    mistakes = []

    for record, expected, predicted in zip(records, y_true, y_pred):
        if expected != predicted:
            mistakes.append(
                {
                    "id": record["id"],
                    "split": split_name,
                    "message": record["input"]["message"],
                    "active_topic_name": record["input"]["active_topic_name"],
                    "previous_user_messages": record["input"]["previous_user_messages"],
                    "expected_topic_reference_type": expected,
                    "predicted_topic_reference_type": predicted,
                    "extracted_label": record["output"].get("extracted_label"),
                }
            )

    return {
        "split": split_name,
        "total": len(records),
        "accuracy": accuracy,
        "classification_report": report,
        "confusion_matrix": matrix_as_dict,
        "mistakes": mistakes,
    }


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
                    max_iter=2000,
                    class_weight="balanced",
                    solver="lbfgs",
                ),
            ),
        ]
    )

    print("Training topic_reference_type classifier...")
    print(f"Training rows: {len(train_records)}")

    model.fit(x_train, y_train)

    validation_eval = evaluate_split(model, validation_records, "validation")
    test_eval = evaluate_split(model, test_records, "test")

    joblib.dump(model, MODEL_PATH)

    report = {
        "model_type": "tfidf_logistic_regression",
        "target": "topic_reference_type",
        "schema_version": "topic_label_v1",
        "paths": {
            "train": str(TRAIN_PATH),
            "validation": str(VALIDATION_PATH),
            "test": str(TEST_PATH),
            "model": str(MODEL_PATH),
            "report": str(REPORT_PATH),
            "test_mistakes": str(TEST_MISTAKES_PATH),
        },
        "dataset_counts": {
            "train": len(train_records),
            "validation": len(validation_records),
            "test": len(test_records),
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
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    with TEST_MISTAKES_PATH.open("w", encoding="utf-8") as f:
        for mistake in test_eval["mistakes"]:
            f.write(json.dumps(mistake, ensure_ascii=False) + "\n")

    print("")
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
    print(f"Saved model:   {MODEL_PATH}")
    print(f"Saved report:  {REPORT_PATH}")
    print(f"Saved mistakes:{TEST_MISTAKES_PATH}")


if __name__ == "__main__":
    main()