#!/usr/bin/env python
"""
MyWay Phase A Probe Contract Retriever v1.

CPU-friendly first artifact for the Probe Contract Model.
It does NOT try to generate new probe contracts from scratch. Instead, it:
  - reads validated Phase A probe-contract split JSONL files
  - builds a TF-IDF nearest-neighbor retriever over ProbeContractModelInput
  - returns the nearest training ProbeContractModelOutput, which is schema-valid by construction
  - evaluates retrieval quality on train/validation/test
  - saves a swappable artifact under models/probe-contract/phase-a-v1

Run from repo root:
  python scripts/engine-datasets/training/train-probe-contract-retriever.py
  python scripts/engine-datasets/training/train-probe-contract-retriever.py --overwrite
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import shutil
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import joblib
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import f1_score
from sklearn.metrics.pairwise import cosine_similarity

MODEL_NAME = "myway_probe_contract_retriever_phase_a_v1"
DEFAULT_DATA_ROOT = Path("datasets/engine-datasets/splits/probe-contract")
DEFAULT_MODEL_DIR = Path("models/probe-contract/phase-a-v1")
SPLITS = ["train", "validation", "test"]

VALID_PROBE_TYPES = {
    "explain",
    "discriminate",
    "apply_transfer",
    "sequence",
    "single_choice",
    "multi_choice",
    "drag_drop_placements",
    "predict",
    "slider",
    "graph_relationship",
    "audio_clip_question",
    "audio_response_question",
    "video_click_interval",
    "video_explanation",
}

VALID_ATTEMPT_TYPES = {
    "text",
    "single_choice",
    "multi_choice",
    "ordered_items",
    "drag_drop_placements",
    "numeric",
    "graph",
    "audio_response",
    "video_click",
    "none",
    "unknown",
}

# This mirrors the stricter dataset policy we validated before training.
VALID_PROBE_ATTEMPT_PAIRS = {
    "explain": {"text"},
    "discriminate": {"single_choice", "multi_choice"},
    "apply_transfer": {"text"},
    "sequence": {"ordered_items"},
    "single_choice": {"single_choice"},
    "multi_choice": {"multi_choice"},
    "drag_drop_placements": {"drag_drop_placements"},
    "predict": {"single_choice", "numeric"},
    "slider": {"numeric"},
    "graph_relationship": {"graph"},
    "audio_clip_question": {"single_choice", "multi_choice"},
    "audio_response_question": {"audio_response"},
    "video_click_interval": {"video_click"},
    "video_explanation": {"none"},
}

REQUIRED_PROMPT_KEYS = {
    "root_problem_explanation",
    "reshaping_explanation",
    "task",
    "full_prompt",
}

@dataclass
class Example:
    example_id: str
    split: str
    source_workbook: str
    source_row_number: int
    input: Dict[str, Any]
    output: Dict[str, Any]
    feature_text: str


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    if not path.exists():
        raise FileNotFoundError(path)
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_no}: invalid JSON") from exc
    return rows


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def write_jsonl(path: Path, rows: Iterable[Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def coerce_obj(value: Any, field_name: str, example_id: str) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{example_id}: {field_name} is not valid JSON") from exc
        if isinstance(parsed, dict):
            return parsed
    raise ValueError(f"{example_id}: {field_name} must be an object or JSON object string")


def get_input_output(row: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    example_id = str(row.get("example_id") or row.get("id") or "unknown_example")
    input_value = row.get("input", row.get("input_json"))
    output_value = row.get("output", row.get("output_json"))
    if input_value is None or output_value is None:
        jsonl_line = row.get("jsonl_line")
        if isinstance(jsonl_line, str) and jsonl_line.strip():
            parsed = json.loads(jsonl_line)
            input_value = input_value if input_value is not None else parsed.get("input")
            output_value = output_value if output_value is not None else parsed.get("output")
        elif isinstance(jsonl_line, dict):
            input_value = input_value if input_value is not None else jsonl_line.get("input")
            output_value = output_value if output_value is not None else jsonl_line.get("output")
    if input_value is None or output_value is None:
        raise ValueError(f"{example_id}: missing input/output")
    return coerce_obj(input_value, "input", example_id), coerce_obj(output_value, "output", example_id)


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def flatten_strings(value: Any, prefix: str = "") -> List[str]:
    chunks: List[str] = []
    if value is None:
        return chunks
    if isinstance(value, str):
        text = value.strip()
        if text:
            chunks.append(f"{prefix}: {text}" if prefix else text)
        return chunks
    if isinstance(value, (int, float, bool)):
        if prefix:
            chunks.append(f"{prefix}: {value}")
        return chunks
    if isinstance(value, list):
        for item in value:
            chunks.extend(flatten_strings(item, prefix))
        return chunks
    if isinstance(value, dict):
        for key, val in value.items():
            if key in {"example_id", "source_workbook", "source_sheet", "source_row_number"}:
                continue
            next_prefix = f"{prefix}.{key}" if prefix else str(key)
            chunks.extend(flatten_strings(val, next_prefix))
        return chunks
    return chunks


def build_feature_text(input_obj: Dict[str, Any]) -> str:
    chunks: List[str] = []
    if input_obj.get("schema_version"):
        chunks.append(f"schema_version={input_obj.get('schema_version')}")

    topic = input_obj.get("target_topic") if isinstance(input_obj.get("target_topic"), dict) else {}
    if topic.get("topic_label"):
        chunks.append(f"topic_label: {topic.get('topic_label')}")
    if topic.get("topic_id"):
        chunks.append(f"topic_id={topic.get('topic_id')}")

    if input_obj.get("target_diagnosis"):
        chunks.append(f"target_diagnosis={input_obj.get('target_diagnosis')}")

    learner_signal = input_obj.get("learner_signal") if isinstance(input_obj.get("learner_signal"), dict) else {}
    if learner_signal.get("signal_kind"):
        chunks.append(f"learner_signal_kind={learner_signal.get('signal_kind')}")
    if learner_signal.get("user_message"):
        chunks.append(f"learner_user_message: {learner_signal.get('user_message')}")
    if isinstance(learner_signal.get("evaluated_probe_attempt"), dict):
        chunks.append("evaluated_probe_attempt_context")
        chunks.extend(flatten_strings(learner_signal.get("evaluated_probe_attempt"), "evaluated_probe_attempt"))

    personalization = input_obj.get("personalization_context") if isinstance(input_obj.get("personalization_context"), dict) else {}
    if personalization:
        for key in ["bridge_level", "preferred_style", "preferred_order_confidence"]:
            if personalization.get(key) is not None:
                chunks.append(f"personalization_{key}: {personalization.get(key)}")
        lp = personalization.get("language_policy") if isinstance(personalization.get("language_policy"), dict) else {}
        if lp.get("jargon_level"):
            chunks.append(f"jargon_level={lp.get('jargon_level')}")
        interests = personalization.get("user_interests")
        if isinstance(interests, list):
            for item in interests:
                if isinstance(item, dict) and item.get("interest"):
                    chunks.append(f"user_interest: {item.get('interest')}")
        preferred_order = personalization.get("preferred_order")
        if isinstance(preferred_order, list):
            chunks.append("preferred_order: " + " ".join(str(x) for x in preferred_order))
        snapshot = personalization.get("profile_snapshot")
        if isinstance(snapshot, dict):
            chunks.extend(flatten_strings(snapshot, "profile_snapshot"))

    # Include a compact canonical copy so enum/key patterns are available to the retriever.
    chunks.append("canonical_input_json: " + compact_json(input_obj))
    return "\n".join(chunks)


def load_examples(data_root: Path) -> Dict[str, List[Example]]:
    by_split: Dict[str, List[Example]] = {}
    for split in SPLITS:
        path = data_root / f"{split}.jsonl"
        rows = read_jsonl(path)
        examples: List[Example] = []
        for row in rows:
            example_id = str(row.get("example_id") or "unknown_example")
            input_obj, output_obj = get_input_output(row)
            examples.append(
                Example(
                    example_id=example_id,
                    split=split,
                    source_workbook=str(row.get("source_workbook") or ""),
                    source_row_number=int(row.get("source_row_number") or 0),
                    input=input_obj,
                    output=output_obj,
                    feature_text=build_feature_text(input_obj),
                )
            )
        by_split[split] = examples
    return by_split


def validate_probe_contract_output(output: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if output.get("schema_version") != "probe_contract_model_output_v1":
        errors.append("bad schema_version")
    probe_type = output.get("probe_type")
    attempt_type = output.get("expected_attempt_type")
    if probe_type not in VALID_PROBE_TYPES:
        errors.append(f"invalid probe_type: {probe_type}")
    if attempt_type not in VALID_ATTEMPT_TYPES:
        errors.append(f"invalid expected_attempt_type: {attempt_type}")
    if probe_type in VALID_PROBE_ATTEMPT_PAIRS and attempt_type not in VALID_PROBE_ATTEMPT_PAIRS[probe_type]:
        errors.append(f"invalid probe/attempt pair: {probe_type}+{attempt_type}")
    prompt = output.get("prompt")
    if not isinstance(prompt, dict):
        errors.append("prompt missing/object required")
    else:
        for key in REQUIRED_PROMPT_KEYS:
            if not isinstance(prompt.get(key), str) or not prompt.get(key).strip():
                errors.append(f"prompt.{key} missing")
    if not isinstance(output.get("misconception_markers"), list):
        errors.append("misconception_markers must be array")
    confidence = output.get("confidence")
    if not isinstance(confidence, (int, float)) or math.isnan(float(confidence)):
        errors.append("confidence must be number")
    return errors


def answer_key_kind(output: Dict[str, Any]) -> Optional[str]:
    answer_key = output.get("answer_key")
    if isinstance(answer_key, dict):
        kind = answer_key.get("kind")
        return str(kind) if kind is not None else None
    return None


def eval_predictions(examples: List[Example], predictions: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(examples)
    schema_errors = 0
    probe_exact = 0
    attempt_exact = 0
    pair_valid = 0
    answer_kind_exact = 0
    top1_same_output = 0
    similarities: List[float] = []
    true_probe: List[str] = []
    pred_probe: List[str] = []
    true_attempt: List[str] = []
    pred_attempt: List[str] = []

    for ex, pred_row in zip(examples, predictions):
        pred_output = pred_row["prediction"]
        errors = validate_probe_contract_output(pred_output)
        if errors:
            schema_errors += 1
        if pred_output.get("probe_type") == ex.output.get("probe_type"):
            probe_exact += 1
        if pred_output.get("expected_attempt_type") == ex.output.get("expected_attempt_type"):
            attempt_exact += 1
        if pred_output.get("probe_type") in VALID_PROBE_ATTEMPT_PAIRS and pred_output.get("expected_attempt_type") in VALID_PROBE_ATTEMPT_PAIRS[pred_output.get("probe_type")]:
            pair_valid += 1
        if answer_key_kind(pred_output) == answer_key_kind(ex.output):
            answer_kind_exact += 1
        if compact_json(pred_output) == compact_json(ex.output):
            top1_same_output += 1
        similarities.append(float(pred_row.get("similarity") or 0.0))
        true_probe.append(str(ex.output.get("probe_type")))
        pred_probe.append(str(pred_output.get("probe_type")))
        true_attempt.append(str(ex.output.get("expected_attempt_type")))
        pred_attempt.append(str(pred_output.get("expected_attempt_type")))

    def rate(n: int) -> float:
        return round(n / total, 4) if total else 0.0

    return {
        "total": total,
        "schema_valid_rate": rate(total - schema_errors),
        "validation_error_count": schema_errors,
        "exact_rates": {
            "probe_type_exact": rate(probe_exact),
            "expected_attempt_type_exact": rate(attempt_exact),
            "probe_attempt_pair_valid": rate(pair_valid),
            "answer_key_kind_exact": rate(answer_kind_exact),
            "exact_output_match": rate(top1_same_output),
        },
        "macro_f1": {
            "probe_type_macro_f1": round(float(f1_score(true_probe, pred_probe, average="macro", zero_division=0)), 4) if total else 0.0,
            "expected_attempt_type_macro_f1": round(float(f1_score(true_attempt, pred_attempt, average="macro", zero_division=0)), 4) if total else 0.0,
        },
        "numeric_means": {
            "mean_similarity": round(sum(similarities) / len(similarities), 4) if similarities else 0.0,
        },
        "predicted_probe_distribution": dict(Counter(pred_probe)),
        "gold_probe_distribution": dict(Counter(true_probe)),
    }


def make_prediction(ex: Example, vectorizer: TfidfVectorizer, train_matrix: Any, train_examples: List[Example], k: int = 5) -> Dict[str, Any]:
    q = vectorizer.transform([ex.feature_text])
    sims = cosine_similarity(q, train_matrix)[0]
    ranked_indices = sims.argsort()[::-1][:k]
    best_i = int(ranked_indices[0])
    best = train_examples[best_i]
    nearest = []
    for idx in ranked_indices:
        idx = int(idx)
        nearest.append({
            "example_id": train_examples[idx].example_id,
            "similarity": round(float(sims[idx]), 6),
            "probe_type": train_examples[idx].output.get("probe_type"),
            "expected_attempt_type": train_examples[idx].output.get("expected_attempt_type"),
        })
    return {
        "schema_version": "myway_probe_contract_prediction_v1",
        "model_name": MODEL_NAME,
        "example_id": ex.example_id,
        "source_split": ex.split,
        "nearest_train_example_id": best.example_id,
        "similarity": round(float(sims[best_i]), 6),
        "prediction": best.output,
        "gold": ex.output,
        "nearest_neighbors": nearest,
    }


def build_summary(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("MyWay Phase A Probe Contract Retriever Training")
    lines.append("================================================")
    lines.append(f"Model: {report['model_name']}")
    lines.append(f"Created: {report['created_at']}")
    lines.append(f"Data root: {report['data_root']}")
    lines.append(f"Model dir: {report['model_dir']}")
    lines.append("")
    lines.append("Examples:")
    for split in SPLITS:
        lines.append(f"- {split}: {report['split_counts'].get(split, 0)}")
    lines.append("")
    lines.append("Evaluation:")
    for split in SPLITS:
        metrics = report["by_split"][split]
        lines.append("")
        lines.append(split)
        lines.append("-" * len(split))
        lines.append(f"Total: {metrics['total']}")
        lines.append(f"Schema-valid rate: {metrics['schema_valid_rate']}")
        lines.append(f"Validation errors: {metrics['validation_error_count']}")
        lines.append(f"Exact/rate metrics: {json.dumps(metrics['exact_rates'], ensure_ascii=False)}")
        lines.append(f"Macro F1: {json.dumps(metrics['macro_f1'], ensure_ascii=False)}")
        lines.append(f"Numeric means: {json.dumps(metrics['numeric_means'], ensure_ascii=False)}")
    lines.append("")
    lines.append("Artifacts:")
    for key, value in report["artifacts"].items():
        lines.append(f"- {key}: {value}")
    lines.append("")
    lines.append("Notes:")
    lines.append("- This is a CPU-friendly nearest-neighbor structured contract artifact, not the final generative Probe Contract Model.")
    lines.append("- It is useful for service wiring, shadow mode, renderer/schema validation, and future model swapping.")
    lines.append("- A future generative model can replace this artifact behind the same service/client surface.")
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--max-features", type=int, default=20000)
    parser.add_argument("--k", type=int, default=5)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data_root: Path = args.data_root
    model_dir: Path = args.model_dir

    print(f"Loading probe-contract splits from {data_root}...")
    examples_by_split = load_examples(data_root)
    train_examples = examples_by_split["train"]
    if not train_examples:
        raise SystemExit("No train examples found.")

    if model_dir.exists():
        if not args.overwrite:
            raise SystemExit(f"Model dir already exists: {model_dir}. Use --overwrite to replace it.")
        shutil.rmtree(model_dir)
    model_dir.mkdir(parents=True, exist_ok=True)

    print(f"Training examples: {len(train_examples)}")
    print("Probe type distribution:", dict(Counter(str(ex.output.get("probe_type")) for ex in train_examples)))
    print("Attempt type distribution:", dict(Counter(str(ex.output.get("expected_attempt_type")) for ex in train_examples)))

    vectorizer = TfidfVectorizer(
        analyzer="word",
        ngram_range=(1, 2),
        min_df=1,
        max_df=0.95,
        sublinear_tf=True,
        max_features=args.max_features,
    )
    train_texts = [ex.feature_text for ex in train_examples]
    print("Fitting TF-IDF vectorizer...")
    train_matrix = vectorizer.fit_transform(train_texts)

    predictions_by_split: Dict[str, List[Dict[str, Any]]] = {}
    metrics_by_split: Dict[str, Any] = {}
    print("Evaluating splits...")
    for split in SPLITS:
        preds = [make_prediction(ex, vectorizer, train_matrix, train_examples, k=args.k) for ex in examples_by_split[split]]
        predictions_by_split[split] = preds
        metrics_by_split[split] = eval_predictions(examples_by_split[split], preds)

    # Store training records without duplicating huge feature text in report.
    train_records = [
        {
            "example_id": ex.example_id,
            "source_workbook": ex.source_workbook,
            "source_row_number": ex.source_row_number,
            "input": ex.input,
            "output": ex.output,
            "feature_text": ex.feature_text,
        }
        for ex in train_examples
    ]

    artifacts = {
        "vectorizer": str(model_dir / "vectorizer.joblib"),
        "train_matrix": str(model_dir / "train_matrix.joblib"),
        "train_records": str(model_dir / "train_records.jsonl"),
        "metadata": str(model_dir / "metadata.json"),
        "eval_report": str(model_dir / "eval_report.json"),
        "eval_summary": str(model_dir / "eval_summary.txt"),
        "predictions_dir": str(model_dir / "predictions"),
    }

    metadata = {
        "schema_version": "myway_probe_contract_retriever_metadata_v1",
        "model_name": MODEL_NAME,
        "created_at": now_iso(),
        "data_root": str(data_root),
        "model_dir": str(model_dir),
        "strategy": "tfidf_nearest_neighbor_structured_output",
        "runtime_contract": {
            "input_schema_version": "probe_contract_model_input_v1",
            "output_schema_version": "probe_contract_model_output_v1",
        },
        "vectorizer": {
            "type": "TfidfVectorizer",
            "analyzer": "word",
            "ngram_range": [1, 2],
            "max_features": args.max_features,
        },
        "split_counts": {split: len(examples_by_split[split]) for split in SPLITS},
        "artifacts": artifacts,
        "notes": [
            "This is a swappable Phase A artifact for service/client wiring and shadow mode.",
            "It retrieves the nearest training ProbeContractModelOutput instead of generating novel contracts.",
        ],
    }

    report = {
        "schema_version": "myway_probe_contract_retriever_eval_report_v1",
        "model_name": MODEL_NAME,
        "created_at": metadata["created_at"],
        "data_root": str(data_root),
        "model_dir": str(model_dir),
        "environment": {
            "python": sys.version,
            "platform": platform.platform(),
            "sklearn": sklearn.__version__,
            "joblib": joblib.__version__,
            "cwd": os.getcwd(),
        },
        "split_counts": metadata["split_counts"],
        "by_split": metrics_by_split,
        "artifacts": artifacts,
    }

    joblib.dump(vectorizer, model_dir / "vectorizer.joblib")
    joblib.dump(train_matrix, model_dir / "train_matrix.joblib")
    write_jsonl(model_dir / "train_records.jsonl", train_records)
    write_json(model_dir / "metadata.json", metadata)
    write_json(model_dir / "eval_report.json", report)
    (model_dir / "eval_summary.txt").write_text(build_summary(report), encoding="utf-8")
    for split, preds in predictions_by_split.items():
        write_jsonl(model_dir / "predictions" / f"{split}.jsonl", preds)

    print("\nDone. Probe Contract retriever training complete.")
    print("Validation errors:", sum(m["validation_error_count"] for m in metrics_by_split.values()))
    print("Model dir:", model_dir)
    print("Summary:", model_dir / "eval_summary.txt")
    print("Report:", model_dir / "eval_report.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
