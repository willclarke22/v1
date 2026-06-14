import json
import re
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path.cwd()

DATASET_DIR = PROJECT_ROOT / "datasets" / "topic-labeling-dataset" / "v3"
LABEL_GENERATOR_DIR = DATASET_DIR / "label-generator-message-only"

TEST_PATH = LABEL_GENERATOR_DIR / "test.jsonl"

PREDICTIONS_PATH = (
    LABEL_GENERATOR_DIR
    / "predictions"
    / "label_generator_predictions_test.jsonl"
)

REPORT_DIR = DATASET_DIR / "reports"
REPORT_PATH = REPORT_DIR / "label_generator_message_only_v3_eval_report.json"
MISTAKES_PATH = REPORT_DIR / "label_generator_message_only_v3_eval_mistakes.jsonl"


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


def normalize_label(label: str | None) -> str:
    if label is None:
        return ""

    text = label.lower().strip()

    replacements = {
        "’": "'",
        "“": '"',
        "”": '"',
        " vs. ": " vs ",
        " versus ": " vs ",
        "&": " and ",
        "_": " ",
        "-": " ",
        "/": " ",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    # Keep useful technical characters like +, #, and .
    text = re.sub(r"[^a-z0-9+#.\s]", " ", text)

    # Remove weak generic label filler words.
    text = re.sub(r"\b(the|a|an|topic|concept|idea|about)\b", " ", text)

    text = re.sub(r"\s+", " ", text).strip()

    return text


def token_set(label: str | None) -> set[str]:
    normalized = normalize_label(label)

    if not normalized:
        return set()

    return set(normalized.split())


def sequence_similarity(expected: str, predicted: str) -> float:
    expected_norm = normalize_label(expected)
    predicted_norm = normalize_label(predicted)

    if not expected_norm and not predicted_norm:
        return 1.0

    if not expected_norm or not predicted_norm:
        return 0.0

    return SequenceMatcher(None, expected_norm, predicted_norm).ratio()


def token_f1(expected: str, predicted: str) -> float:
    expected_tokens = token_set(expected)
    predicted_tokens = token_set(predicted)

    if not expected_tokens and not predicted_tokens:
        return 1.0

    if not expected_tokens or not predicted_tokens:
        return 0.0

    overlap = expected_tokens & predicted_tokens

    if not overlap:
        return 0.0

    precision = len(overlap) / len(predicted_tokens)
    recall = len(overlap) / len(expected_tokens)

    return 2 * precision * recall / (precision + recall)


def is_too_long(label: str | None) -> bool:
    if not label:
        return False

    words = label.strip().split()

    return len(words) > 8 or len(label) > 80


def looks_like_sentence(label: str | None) -> bool:
    if not label:
        return False

    text = label.strip()
    lowered = f" {text.lower()} "

    sentence_markers = [
        " i ",
        " i'm ",
        " i am ",
        " don't ",
        " dont ",
        " can't ",
        " cant ",
        " because ",
        " but ",
        " when ",
        " where ",
        " why ",
        " how ",
        " can we ",
        " i think ",
        " i don't ",
        " i dont ",
    ]

    if any(marker in lowered for marker in sentence_markers):
        return True

    return text.endswith((".", "?", "!"))


def contains_expected_as_substring(expected: str, predicted: str) -> bool:
    expected_norm = normalize_label(expected)
    predicted_norm = normalize_label(predicted)

    if not expected_norm or not predicted_norm:
        return False

    return expected_norm in predicted_norm or predicted_norm in expected_norm


def score_prediction(expected: str, predicted: str | None) -> dict[str, Any]:
    predicted_text = predicted or ""

    normalized_expected = normalize_label(expected)
    normalized_predicted = normalize_label(predicted_text)

    exact_match = expected == predicted_text
    normalized_exact_match = normalized_expected == normalized_predicted

    seq_sim = sequence_similarity(expected, predicted_text)
    tok_f1 = token_f1(expected, predicted_text)

    fuzzy_match = (
        normalized_exact_match
        or seq_sim >= 0.88
        or tok_f1 >= 0.80
        or contains_expected_as_substring(expected, predicted_text)
    )

    blank = normalized_predicted == ""
    too_long = is_too_long(predicted_text)
    sentence_like = looks_like_sentence(predicted_text)

    return {
        "expected_label": expected,
        "predicted_label": predicted_text,
        "normalized_expected_label": normalized_expected,
        "normalized_predicted_label": normalized_predicted,
        "exact_match": exact_match,
        "normalized_exact_match": normalized_exact_match,
        "sequence_similarity": seq_sim,
        "token_f1": tok_f1,
        "fuzzy_match": fuzzy_match,
        "blank_prediction": blank,
        "too_long": too_long,
        "sentence_like": sentence_like,
    }


def main() -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    expected_records = read_jsonl(TEST_PATH)
    prediction_records = read_jsonl(PREDICTIONS_PATH)

    expected_by_id = {record["id"]: record for record in expected_records}
    predictions_by_id = {
        record["id"]: record.get("predicted_label")
        for record in prediction_records
    }

    missing_prediction_ids = sorted(set(expected_by_id) - set(predictions_by_id))
    extra_prediction_ids = sorted(set(predictions_by_id) - set(expected_by_id))

    scored_rows = []
    mistakes = []

    for record_id, expected_record in expected_by_id.items():
        expected_label = expected_record["target_text"]
        predicted_label = predictions_by_id.get(record_id)

        score = score_prediction(expected_label, predicted_label)

        row = {
            "id": record_id,
            "input_text": expected_record["input_text"],
            **score,
        }

        scored_rows.append(row)

        if not score["fuzzy_match"]:
            mistakes.append(row)

    total = len(scored_rows)

    def rate(key: str) -> float:
        if total == 0:
            return 0.0
        return sum(1 for row in scored_rows if row[key]) / total

    avg_sequence_similarity = (
        sum(row["sequence_similarity"] for row in scored_rows) / total
        if total
        else 0.0
    )

    avg_token_f1 = (
        sum(row["token_f1"] for row in scored_rows) / total
        if total
        else 0.0
    )

    report = {
        "evaluation_target": str(TEST_PATH),
        "predictions_file": str(PREDICTIONS_PATH),
        "model_variant": "label-generator-message-only-v3",
        "input_format": "message only",
        "total_expected_records": len(expected_records),
        "total_prediction_records": len(prediction_records),
        "matched_records_evaluated": total,
        "missing_prediction_count": len(missing_prediction_ids),
        "extra_prediction_count": len(extra_prediction_ids),
        "metrics": {
            "exact_match_accuracy": rate("exact_match"),
            "normalized_exact_match_accuracy": rate("normalized_exact_match"),
            "fuzzy_match_accuracy": rate("fuzzy_match"),
            "blank_prediction_rate": rate("blank_prediction"),
            "too_long_rate": rate("too_long"),
            "sentence_like_rate": rate("sentence_like"),
            "average_sequence_similarity": avg_sequence_similarity,
            "average_token_f1": avg_token_f1,
        },
        "missing_prediction_ids": missing_prediction_ids[:100],
        "extra_prediction_ids": extra_prediction_ids[:100],
        "mistake_count": len(mistakes),
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    with MISTAKES_PATH.open("w", encoding="utf-8") as f:
        for mistake in mistakes:
            f.write(json.dumps(mistake, ensure_ascii=False) + "\n")

    print("V3 message-only label-generation evaluation complete.")
    print("")
    print(f"Expected file:    {TEST_PATH}")
    print(f"Predictions file: {PREDICTIONS_PATH}")
    print("")
    print(f"Expected records:    {len(expected_records)}")
    print(f"Prediction records:  {len(prediction_records)}")
    print(f"Evaluated records:   {total}")
    print(f"Missing predictions: {len(missing_prediction_ids)}")
    print(f"Extra predictions:   {len(extra_prediction_ids)}")
    print("")
    print("Metrics:")
    for key, value in report["metrics"].items():
        print(f"{key}: {value:.3f}")
    print("")
    print(f"Mistakes: {len(mistakes)}")
    print(f"Wrote report:   {REPORT_PATH}")
    print(f"Wrote mistakes: {MISTAKES_PATH}")


if __name__ == "__main__":
    main()