import json
from pathlib import Path
from typing import Any

import joblib


PROJECT_ROOT = Path.cwd()

DATASET_DIR = PROJECT_ROOT / "datasets" / "topic-labeling-dataset" / "v2"
LABEL_GENERATOR_DIR = DATASET_DIR / "label-generator"

TEST_PATH = LABEL_GENERATOR_DIR / "test.jsonl"

MODEL_PATH = (
    PROJECT_ROOT
    / "models"
    / "topic-labeler"
    / "v2"
    / "label-generator"
    / "extracted_label_classifier.joblib"
)

PREDICTIONS_DIR = LABEL_GENERATOR_DIR / "predictions"
PREDICTIONS_PATH = PREDICTIONS_DIR / "label_generator_predictions_test.jsonl"


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


def main() -> None:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Missing model file: {MODEL_PATH}")

    PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)

    records = read_jsonl(TEST_PATH)
    model = joblib.load(MODEL_PATH)

    inputs = [record["input_text"] for record in records]
    predictions = list(model.predict(inputs))

    with PREDICTIONS_PATH.open("w", encoding="utf-8") as f:
        for record, prediction in zip(records, predictions):
            f.write(
                json.dumps(
                    {
                        "id": record["id"],
                        "predicted_label": prediction,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    print("Generated label-generator predictions.")
    print("")
    print(f"Input:       {TEST_PATH}")
    print(f"Model:       {MODEL_PATH}")
    print(f"Predictions: {PREDICTIONS_PATH}")
    print(f"Rows:        {len(records)}")


if __name__ == "__main__":
    main()