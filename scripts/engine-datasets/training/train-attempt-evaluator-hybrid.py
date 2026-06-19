#!/usr/bin/env python
"""
MyWay Phase A Attempt Evaluator Hybrid v1.

CPU-friendly first artifact for the Probe Attempt Evaluator.
It combines:
  - TF-IDF nearest-neighbor retrieval for rich schema-valid evaluator output structure
  - lightweight sklearn models for correctness, next_action, lucky-guess flag, and verification flag

This is a swappable structural artifact for local services/shadow mode, not the final evaluator.

Run from repo root:
  python scripts/engine-datasets/training/train-attempt-evaluator-hybrid.py
  python scripts/engine-datasets/training/train-attempt-evaluator-hybrid.py --overwrite
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import os
import platform
import shutil
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import joblib
import sklearn
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import f1_score, mean_absolute_error
from sklearn.metrics.pairwise import cosine_similarity

MODEL_NAME = "myway_attempt_evaluator_hybrid_phase_a_v1"
DEFAULT_DATA_ROOT = Path("datasets/engine-datasets/splits/attempt-evaluator")
DEFAULT_MODEL_DIR = Path("models/attempt-evaluator/phase-a-v1")
SPLITS = ["train", "validation", "test"]

VALID_NEXT_ACTIONS = {
    "give_feedback",
    "target_misconception",
    "generate_followup_probe",
    "ask_clarifying_question",
    "summarize_progress",
}

VALID_DIAGNOSIS_LABELS = {
    "unknown",
    "no_gap_detected",
    "recall_gap",
    "representation_gap",
    "procedure_gap",
    "discrimination_gap",
    "transfer_gap",
    "metacognitive_gap",
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

    probe = input_obj.get("probe") if isinstance(input_obj.get("probe"), dict) else {}
    if probe:
        for key in ["probe_type", "expected_attempt_type", "target_diagnosis"]:
            if probe.get(key):
                chunks.append(f"probe_{key}={probe.get(key)}")
        prompt = probe.get("prompt") if isinstance(probe.get("prompt"), dict) else {}
        for key in ["root_problem_explanation", "reshaping_explanation", "task", "full_prompt"]:
            if prompt.get(key):
                chunks.append(f"prompt_{key}: {prompt.get(key)}")

    answer_key = input_obj.get("answer_key")
    if isinstance(answer_key, dict):
        if answer_key.get("kind"):
            chunks.append(f"answer_key_kind={answer_key.get('kind')}")
        chunks.extend(flatten_strings(answer_key, "answer_key"))

    attempt = input_obj.get("attempt") if isinstance(input_obj.get("attempt"), dict) else {}
    if attempt:
        if attempt.get("attempt_type"):
            chunks.append(f"attempt_type={attempt.get('attempt_type')}")
        for key in [
            "text_response",
            "selected_option_id",
            "selected_option_ids",
            "ordered_item_ids",
            "placements",
            "numeric_response",
            "graph_features",
            "audio_response_transcript",
            "selected_click_seconds",
            "self_reported_confidence",
        ]:
            if key in attempt and attempt.get(key) is not None:
                chunks.extend(flatten_strings(attempt.get(key), f"attempt_{key}"))

    markers = input_obj.get("misconception_markers")
    if isinstance(markers, list):
        chunks.extend(flatten_strings(markers, "misconception_markers"))

    delivery = input_obj.get("delivery_context")
    if isinstance(delivery, dict):
        chunks.extend(flatten_strings(delivery, "delivery_context"))

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


def clamp01(value: Any) -> float:
    try:
        v = float(value)
    except Exception:
        return 0.0
    if math.isnan(v):
        return 0.0
    return max(0.0, min(1.0, v))


def bool_label(value: Any) -> int:
    return 1 if bool(value) else 0


def get_evidence(output: Dict[str, Any]) -> Dict[str, Any]:
    ev = output.get("understanding_evidence")
    return ev if isinstance(ev, dict) else {}


def make_classifier(y: List[Any]) -> Any:
    unique = sorted(set(y))
    if len(unique) <= 1:
        return DummyClassifier(strategy="constant", constant=unique[0] if unique else 0)
    return LogisticRegression(max_iter=2000, class_weight="balanced", solver="lbfgs")


def fit_models(train_x: List[str], train_examples: List[Example]) -> Dict[str, Any]:
    y_correctness = [clamp01(ex.output.get("correctness")) for ex in train_examples]
    y_next_action = [str(ex.output.get("next_action")) for ex in train_examples]
    y_lucky = [bool_label(get_evidence(ex.output).get("may_be_lucky_guess")) for ex in train_examples]
    y_verify = [bool_label(get_evidence(ex.output).get("needs_verification_probe")) for ex in train_examples]

    vectorizer = TfidfVectorizer(
        analyzer="word",
        ngram_range=(1, 2),
        min_df=1,
        max_df=0.95,
        sublinear_tf=True,
        max_features=30000,
    )
    train_matrix = vectorizer.fit_transform(train_x)

    correctness_model = Ridge(alpha=1.0)
    correctness_model.fit(train_matrix, y_correctness)

    next_action_model = make_classifier(y_next_action)
    next_action_model.fit(train_matrix, y_next_action)

    lucky_model = make_classifier(y_lucky)
    lucky_model.fit(train_matrix, y_lucky)

    verify_model = make_classifier(y_verify)
    verify_model.fit(train_matrix, y_verify)

    return {
        "vectorizer": vectorizer,
        "train_matrix": train_matrix,
        "correctness_model": correctness_model,
        "next_action_model": next_action_model,
        "lucky_model": lucky_model,
        "verify_model": verify_model,
    }


def classifier_confidence(model: Any, x_row: Any, predicted: Any) -> float:
    if hasattr(model, "predict_proba"):
        try:
            probs = model.predict_proba(x_row)[0]
            classes = list(getattr(model, "classes_", []))
            if predicted in classes:
                return clamp01(probs[classes.index(predicted)])
            return clamp01(max(probs))
        except Exception:
            return 0.65
    return 0.65


def nearest_output(x_row: Any, train_matrix: Any, train_examples: List[Example], k: int = 5) -> Tuple[Dict[str, Any], List[Dict[str, Any]], float]:
    sims = cosine_similarity(x_row, train_matrix)[0]
    ranked_indices = sims.argsort()[::-1][:k]
    best_i = int(ranked_indices[0])
    best = train_examples[best_i]
    nearest = []
    for idx in ranked_indices:
        idx = int(idx)
        nearest.append({
            "example_id": train_examples[idx].example_id,
            "similarity": round(float(sims[idx]), 6),
            "correctness": train_examples[idx].output.get("correctness"),
            "next_action": train_examples[idx].output.get("next_action"),
        })
    return copy.deepcopy(best.output), nearest, round(float(sims[best_i]), 6)


def make_prediction(ex: Example, models: Dict[str, Any], train_examples: List[Example], k: int = 5) -> Dict[str, Any]:
    vectorizer = models["vectorizer"]
    x_row = vectorizer.transform([ex.feature_text])
    base_output, nearest, similarity = nearest_output(x_row, models["train_matrix"], train_examples, k=k)

    correctness = clamp01(models["correctness_model"].predict(x_row)[0])
    next_action = str(models["next_action_model"].predict(x_row)[0])
    lucky = bool(int(models["lucky_model"].predict(x_row)[0]))
    verify = bool(int(models["verify_model"].predict(x_row)[0]))

    if next_action not in VALID_NEXT_ACTIONS:
        next_action = "give_feedback"

    pred = base_output
    pred["schema_version"] = "probe_attempt_evaluator_output_v1"
    pred["correctness"] = round(correctness, 4)
    pred["next_action"] = next_action
    pred["next_action_confidence"] = round(classifier_confidence(models["next_action_model"], x_row, next_action), 4)

    ev = pred.get("understanding_evidence")
    if not isinstance(ev, dict):
        ev = {}
    ev["evidence_strength"] = round(max(ev.get("evidence_strength", 0.0) if isinstance(ev.get("evidence_strength"), (int, float)) else correctness, correctness), 4)
    ev["may_be_lucky_guess"] = lucky
    ev["possible_guess"] = lucky
    ev["needs_verification_probe"] = verify
    ev.setdefault("supports_understanding", correctness >= 0.75 and not verify)
    ev.setdefault("supports_gap", correctness < 0.75 or verify)
    ev.setdefault("informational_only", False)
    if verify and not ev.get("verification_reason"):
        ev["verification_reason"] = "The model prediction suggests one more related probe is needed before treating this as stable understanding."
    pred["understanding_evidence"] = ev

    if not isinstance(pred.get("misconception_hits"), list):
        pred["misconception_hits"] = []
    if not isinstance(pred.get("correctness_summary"), str) or not pred.get("correctness_summary", "").strip():
        pred["correctness_summary"] = "The attempt was evaluated against the probe answer key and misconception markers."

    return {
        "schema_version": "myway_attempt_evaluator_prediction_v1",
        "model_name": MODEL_NAME,
        "example_id": ex.example_id,
        "source_split": ex.split,
        "similarity": similarity,
        "prediction": pred,
        "gold": ex.output,
        "nearest_neighbors": nearest,
    }


def validate_attempt_output(output: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if output.get("schema_version") != "probe_attempt_evaluator_output_v1":
        errors.append("bad schema_version")
    if not isinstance(output.get("correctness"), (int, float)):
        errors.append("correctness must be number")
    if not isinstance(output.get("correctness_summary"), str) or not output.get("correctness_summary", "").strip():
        errors.append("correctness_summary missing")
    ev = output.get("understanding_evidence")
    if not isinstance(ev, dict):
        errors.append("understanding_evidence missing")
    else:
        for key in ["evidence_strength", "may_be_lucky_guess", "needs_verification_probe"]:
            if key not in ev:
                errors.append(f"understanding_evidence.{key} missing")
    if not isinstance(output.get("misconception_hits"), list):
        errors.append("misconception_hits must be array")
    if output.get("next_action") not in VALID_NEXT_ACTIONS:
        errors.append(f"invalid next_action: {output.get('next_action')}")
    if not isinstance(output.get("next_action_confidence"), (int, float)):
        errors.append("next_action_confidence must be number")
    diagnosis_delta = output.get("diagnosis_delta")
    if isinstance(diagnosis_delta, dict):
        for key in diagnosis_delta.keys():
            if key not in VALID_DIAGNOSIS_LABELS:
                errors.append(f"invalid diagnosis_delta key: {key}")
    return errors


def eval_predictions(examples: List[Example], predictions: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(examples)
    schema_errors = 0
    within_025 = 0
    next_exact = 0
    lucky_exact = 0
    verify_exact = 0
    gold_correctness: List[float] = []
    pred_correctness: List[float] = []
    gold_next: List[str] = []
    pred_next: List[str] = []
    gold_hits: List[set] = []
    pred_hits: List[set] = []
    similarities: List[float] = []

    for ex, pred_row in zip(examples, predictions):
        pred = pred_row["prediction"]
        errors = validate_attempt_output(pred)
        if errors:
            schema_errors += 1

        g_corr = clamp01(ex.output.get("correctness"))
        p_corr = clamp01(pred.get("correctness"))
        gold_correctness.append(g_corr)
        pred_correctness.append(p_corr)
        if abs(g_corr - p_corr) <= 0.25:
            within_025 += 1

        g_next = str(ex.output.get("next_action"))
        p_next = str(pred.get("next_action"))
        gold_next.append(g_next)
        pred_next.append(p_next)
        if g_next == p_next:
            next_exact += 1

        g_ev = get_evidence(ex.output)
        p_ev = get_evidence(pred)
        if bool(g_ev.get("may_be_lucky_guess")) == bool(p_ev.get("may_be_lucky_guess")):
            lucky_exact += 1
        if bool(g_ev.get("needs_verification_probe")) == bool(p_ev.get("needs_verification_probe")):
            verify_exact += 1

        def hit_ids(output: Dict[str, Any]) -> set:
            hits = output.get("misconception_hits")
            if not isinstance(hits, list):
                return set()
            return {str(h.get("misconception_id")) for h in hits if isinstance(h, dict) and h.get("misconception_id")}

        gold_hits.append(hit_ids(ex.output))
        pred_hits.append(hit_ids(pred))
        similarities.append(float(pred_row.get("similarity") or 0.0))

    tp = fp = fn = 0
    for g, p in zip(gold_hits, pred_hits):
        tp += len(g & p)
        fp += len(p - g)
        fn += len(g - p)
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    hit_f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    def rate(n: int) -> float:
        return round(n / total, 4) if total else 0.0

    return {
        "total": total,
        "schema_valid_rate": rate(total - schema_errors),
        "validation_error_count": schema_errors,
        "exact_rates": {
            "correctness_within_0_25": rate(within_025),
            "next_action_exact": rate(next_exact),
            "lucky_guess_exact": rate(lucky_exact),
            "needs_verification_exact": rate(verify_exact),
        },
        "numeric_means": {
            "correctness_mae": round(float(mean_absolute_error(gold_correctness, pred_correctness)), 4) if total else 0.0,
            "misconception_hit_f1": round(float(hit_f1), 4),
            "mean_similarity": round(sum(similarities) / len(similarities), 4) if similarities else 0.0,
        },
        "macro_f1": {
            "next_action_macro_f1": round(float(f1_score(gold_next, pred_next, average="macro", zero_division=0)), 4) if total else 0.0,
        },
        "predicted_next_action_distribution": dict(Counter(pred_next)),
        "gold_next_action_distribution": dict(Counter(gold_next)),
    }


def build_summary(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("MyWay Phase A Attempt Evaluator Hybrid Training")
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
        lines.append(f"Numeric means: {json.dumps(metrics['numeric_means'], ensure_ascii=False)}")
        lines.append(f"Macro F1: {json.dumps(metrics['macro_f1'], ensure_ascii=False)}")
    lines.append("")
    lines.append("Artifacts:")
    for key, value in report["artifacts"].items():
        lines.append(f"- {key}: {value}")
    lines.append("")
    lines.append("Notes:")
    lines.append("- This is a CPU-friendly hybrid evaluator artifact, not the final semantic evaluator.")
    lines.append("- It uses retrieval for rich schema structure and small models for correctness/action/verification signals.")
    lines.append("- It is intended for service wiring, shadow mode, and future model swapping.")
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--k", type=int, default=5)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data_root: Path = args.data_root
    model_dir: Path = args.model_dir

    print(f"Loading attempt-evaluator splits from {data_root}...")
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
    print("Correctness rough distribution:", dict(Counter(round(clamp01(ex.output.get("correctness")) * 4) / 4 for ex in train_examples)))
    print("Next-action distribution:", dict(Counter(str(ex.output.get("next_action")) for ex in train_examples)))

    print("Fitting hybrid evaluator models...")
    train_x = [ex.feature_text for ex in train_examples]
    models = fit_models(train_x, train_examples)

    predictions_by_split: Dict[str, List[Dict[str, Any]]] = {}
    metrics_by_split: Dict[str, Any] = {}
    print("Evaluating splits...")
    for split in SPLITS:
        preds = [make_prediction(ex, models, train_examples, k=args.k) for ex in examples_by_split[split]]
        predictions_by_split[split] = preds
        metrics_by_split[split] = eval_predictions(examples_by_split[split], preds)

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
        "correctness_model": str(model_dir / "correctness_model.joblib"),
        "next_action_model": str(model_dir / "next_action_model.joblib"),
        "lucky_model": str(model_dir / "lucky_model.joblib"),
        "verification_model": str(model_dir / "verification_model.joblib"),
        "train_records": str(model_dir / "train_records.jsonl"),
        "metadata": str(model_dir / "metadata.json"),
        "eval_report": str(model_dir / "eval_report.json"),
        "eval_summary": str(model_dir / "eval_summary.txt"),
        "predictions_dir": str(model_dir / "predictions"),
    }

    metadata = {
        "schema_version": "myway_attempt_evaluator_hybrid_metadata_v1",
        "model_name": MODEL_NAME,
        "created_at": now_iso(),
        "data_root": str(data_root),
        "model_dir": str(model_dir),
        "strategy": "tfidf_retrieval_plus_lightweight_correctness_action_models",
        "runtime_contract": {
            "input_schema_version": "probe_attempt_evaluator_input_v1",
            "output_schema_version": "probe_attempt_evaluator_output_v1",
        },
        "split_counts": {split: len(examples_by_split[split]) for split in SPLITS},
        "artifacts": artifacts,
        "notes": [
            "This is a swappable Phase A artifact for service/client wiring and shadow mode.",
            "It retrieves rich output structure and overwrites core evaluator signals with small model predictions.",
        ],
    }

    report = {
        "schema_version": "myway_attempt_evaluator_hybrid_eval_report_v1",
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

    joblib.dump(models["vectorizer"], model_dir / "vectorizer.joblib")
    joblib.dump(models["train_matrix"], model_dir / "train_matrix.joblib")
    joblib.dump(models["correctness_model"], model_dir / "correctness_model.joblib")
    joblib.dump(models["next_action_model"], model_dir / "next_action_model.joblib")
    joblib.dump(models["lucky_model"], model_dir / "lucky_model.joblib")
    joblib.dump(models["verify_model"], model_dir / "verification_model.joblib")
    write_jsonl(model_dir / "train_records.jsonl", train_records)
    write_json(model_dir / "metadata.json", metadata)
    write_json(model_dir / "eval_report.json", report)
    (model_dir / "eval_summary.txt").write_text(build_summary(report), encoding="utf-8")
    for split, preds in predictions_by_split.items():
        write_jsonl(model_dir / "predictions" / f"{split}.jsonl", preds)

    print("\nDone. Attempt Evaluator hybrid training complete.")
    print("Validation errors:", sum(m["validation_error_count"] for m in metrics_by_split.values()))
    print("Model dir:", model_dir)
    print("Summary:", model_dir / "eval_summary.txt")
    print("Report:", model_dir / "eval_report.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
