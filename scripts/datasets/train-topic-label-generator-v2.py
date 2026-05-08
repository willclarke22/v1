import json
from pathlib import Path
from typing import Any

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import accuracy_score
from sklearn.pipeline import Pipeline


PROJECT_ROOT = Path.cwd()

DATASET_DIR = PROJECT_ROOT / "datasets" / "topic-labeling-dataset" / "v2"
LABEL_GENERATOR_DIR = DATASET_DIR / "label-generator"

TRAIN_PATH = LABEL_GENERATOR_DIR / "train.jsonl"
VALIDATION_PATH = LABEL_GENERATOR_DIR / "validation.jsonl"
TEST_PATH = LABEL_GENERATOR_DIR / "test.jsonl"

MODEL_DIR = PROJECT_ROOT / "models" / "topic-labeler" / "v2" / "label-generator"
MODEL_PATH = MODEL_DIR / "extracted_label_classifier.joblib"

REPORT_DIR = DATASET_DIR / "reports"
REPORT_PATH = REPORT_DIR / "extracted_label_classifier_report.json"
TEST_MISTAKES_PATH = REPORT_DIR / "extracted_label_classifier_test_mistakes.jsonl"


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


def normalize_label(label: str) -> str:
    return (
        label.lower()
        .replace("’", "'")
        .replace(" vs. ", " vs ")
        .replace(" versus ", " vs ")
        .replace("-", " ")
        .replace("_", " ")
        .strip()
    )


def labels_match(expected: str, predicted: str) -> bool:
    return normalize_label(expected) == normalize_label(predicted)


def get_x_y(records: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    x = [record["input_text"] for record in records]
    y = [record["target_text"] for record in records]
    return x, y


def evaluate_split(
    model: Pipeline,
    records: list[dict[str, Any]],
    split_name: str,
) -> dict[str, Any]:
    x, y_true = get_x_y(records)
    y_pred = list(model.predict(x))

    exact_matches = [
        labels_match(expected, predicted)
        for expected, predicted in zip(y_true, y_pred)
    ]

    normalized_exact_accuracy = (
        sum(exact_matches) / len(exact_matches) if exact_matches else 0.0
    )

    raw_accuracy = accuracy_score(y_true, y_pred)

    mistakes = []

    for record, expected, predicted, exact_match in zip(
        records, y_true, y_pred, exact_matches
    ):
        if not exact_match:
            mistakes.append(
                {
                    "id": record["id"],
                    "split": split_name,
                    "input_text": record["input_text"],
                    "expected_label": expected,
                    "predicted_label": predicted,
                    "source_record_id": record.get("metadata", {}).get(
                        "source_record_id"
                    ),
                }
            )

    return {
        "split": split_name,
        "total": len(records),
        "raw_accuracy": raw_accuracy,
        "normalized_exact_accuracy": normalized_exact_accuracy,
        "mistake_count": len(mistakes),
        "mistakes": mistakes,
    }


def top_label_counts(
    records: list[dict[str, Any]],
    limit: int = 20,
) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}

    for record in records:
        label = record["target_text"]
        counts[label] = counts.get(label, 0) + 1

    return [
        {"label": label, "count": count}
        for label, count in sorted(
            counts.items(),
            key=lambda item: item[1],
            reverse=True,
        )[:limit]
    ]


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    train_records = read_jsonl(TRAIN_PATH)
    validation_records = read_jsonl(VALIDATION_PATH)
    test_records = read_jsonl(TEST_PATH)

    x_train, y_train = get_x_y(train_records)

    unique_train_labels = sorted(set(y_train))
    unique_validation_labels = sorted(
        set(record["target_text"] for record in validation_records)
    )
    unique_test_labels = sorted(set(record["target_text"] for record in test_records))

    unseen_validation_labels = sorted(set(unique_validation_labels) - set(unique_train_labels))
    unseen_test_labels = sorted(set(unique_test_labels) - set(unique_train_labels))

    if unseen_validation_labels or unseen_test_labels:
        print("Warning: this classifier cannot predict labels not seen during training.")
        print(f"Unseen validation labels: {len(unseen_validation_labels)}")
        print(f"Unseen test labels: {len(unseen_test_labels)}")
        print("A true generative model will be needed for open-ended labels.")
        print("")

    model = Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    lowercase=True,
                    ngram_range=(1, 3),
                    min_df=1,
                    max_df=0.98,
                    sublinear_tf=True,
                    analyzer="word",
                ),
            ),
            (
                "classifier",
                SGDClassifier(
                    loss="log_loss",
                    penalty="l2",
                    alpha=1e-5,
                    max_iter=2000,
                    tol=1e-4,
                    class_weight="balanced",
                    random_state=42,
                ),
            ),
        ]
    )

    print("Training V2 extracted_label classifier...")
    print(f"Training rows: {len(train_records)}")
    print(f"Unique train labels: {len(unique_train_labels)}")
    print("")

    model.fit(x_train, y_train)

    validation_eval = evaluate_split(model, validation_records, "validation")
    test_eval = evaluate_split(model, test_records, "test")

    joblib.dump(model, MODEL_PATH)

    report = {
        "model_type": "tfidf_sgd_multiclass_label_classifier",
        "target": "extracted_label",
        "schema_version": "topic_label_v2_label_generator",
        "important_limitation": (
            "This is a closed-label classifier. It can only predict labels seen during "
            "training. It is a prototype baseline, not the final open-ended label generator."
        ),
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
            "unique_train_labels": len(unique_train_labels),
            "unique_validation_labels": len(unique_validation_labels),
            "unique_test_labels": len(unique_test_labels),
            "unseen_validation_labels": len(unseen_validation_labels),
            "unseen_test_labels": len(unseen_test_labels),
        },
        "top_train_label_counts": top_label_counts(train_records),
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
        "unseen_validation_labels": unseen_validation_labels[:100],
        "unseen_test_labels": unseen_test_labels[:100],
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    with TEST_MISTAKES_PATH.open("w", encoding="utf-8") as f:
        for mistake in test_eval["mistakes"]:
            f.write(json.dumps(mistake, ensure_ascii=False) + "\n")

    print("Training complete.")
    print("")
    print(f"Validation raw accuracy:        {validation_eval['raw_accuracy']:.3f}")
    print(
        f"Validation normalized accuracy: "
        f"{validation_eval['normalized_exact_accuracy']:.3f}"
    )
    print(f"Validation mistakes:            {validation_eval['mistake_count']}")
    print("")
    print(f"Test raw accuracy:              {test_eval['raw_accuracy']:.3f}")
    print(f"Test normalized accuracy:       {test_eval['normalized_exact_accuracy']:.3f}")
    print(f"Test mistakes:                  {test_eval['mistake_count']}")
    print("")
    print(f"Saved model:    {MODEL_PATH}")
    print(f"Saved report:   {REPORT_PATH}")
    print(f"Saved mistakes: {TEST_MISTAKES_PATH}")


if __name__ == "__main__":
    main()