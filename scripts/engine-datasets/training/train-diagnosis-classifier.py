#!/usr/bin/env python
"""
Train MyWay Phase A Diagnosis classifier artifacts.

This is a CPU-friendly first trained model for the 3-model plan.
It trains two lightweight scikit-learn classifiers:
  1) DiagnosisModelInput -> diagnosis
  2) DiagnosisModelInput -> next_action

It then wraps predictions back into DiagnosisModelOutput-compatible JSON:
  {
    "schema_version": "diagnosis_model_output_v1",
    "diagnosis": "...",
    "diagnosis_confidence": 0.0-1.0,
    "next_action": "...",
    "next_action_confidence": 0.0-1.0,
    "suggested_question": null | "..."
  }

Default paths assume this script is run from the repo root:
  C:\\Users\\willc\\projects\\MyWay\\v1

Inputs:
  datasets/engine-datasets/splits/diagnosis/train.jsonl
  datasets/engine-datasets/splits/diagnosis/validation.jsonl
  datasets/engine-datasets/splits/diagnosis/test.jsonl

Outputs:
  models/diagnosis/phase-a-v1/
    diagnosis_label_classifier.joblib
    next_action_classifier.joblib
    metadata.json
    eval_report.json
    eval_summary.txt
    predictions/{train,validation,test}.jsonl
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import joblib
import sklearn
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
)
from sklearn.pipeline import Pipeline


DIAGNOSIS_LABELS = [
    "unknown",
    "no_gap_detected",
    "recall_gap",
    "representation_gap",
    "procedure_gap",
    "discrimination_gap",
    "transfer_gap",
    "metacognitive_gap",
]

DIAGNOSIS_NEXT_ACTIONS = [
    "ask_clarifying_question",
    "generate_probe_contract",
    "give_feedback",
    "summarize_progress",
]

SPLITS = ["train", "validation", "test"]

MODEL_NAME = "myway_diagnosis_classifier_phase_a_v1"
TEXT_BUILDER_VERSION = "diagnosis_input_text_builder_v1"


@dataclass
class Example:
    example_id: str
    flow_id: str
    split: str
    source_workbook: Optional[str]
    source_sheet: Optional[str]
    source_row_number: Optional[int]
    input_obj: Dict[str, Any]
    output_obj: Dict[str, Any]
    text: str
    diagnosis: str
    diagnosis_confidence: Optional[float]
    next_action: str
    next_action_confidence: Optional[float]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def repo_relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except Exception:
        return path.as_posix()


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                rows.append(json.loads(stripped))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON in {path} line {line_no}: {exc}") from exc
    return rows


def stable_json(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def as_obj(value: Any, field_name: str, source: str) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{source}: {field_name} is not parseable JSON: {exc}") from exc
        if not isinstance(parsed, dict):
            raise ValueError(f"{source}: {field_name} parsed to {type(parsed).__name__}, expected object")
        return parsed
    raise ValueError(f"{source}: {field_name} has type {type(value).__name__}, expected object or JSON string")


def get_input_output(raw: Dict[str, Any], source: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    # Preferred validated export shape.
    if "input" in raw and "output" in raw:
        return as_obj(raw["input"], "input", source), as_obj(raw["output"], "output", source)

    # Fallback for workbook-derived rows or older exports.
    if "input_json" in raw and "output_json" in raw:
        return as_obj(raw["input_json"], "input_json", source), as_obj(raw["output_json"], "output_json", source)

    # Fallback for prompt/completion rows. We do not expect this for the default
    # script inputs, but it helps produce a clear error if someone points here.
    raise ValueError(f"{source}: expected input/output or input_json/output_json fields")


def compact_prompt(prompt: Optional[Dict[str, Any]]) -> str:
    if not isinstance(prompt, dict):
        return ""
    parts = []
    for key in ["root_problem_explanation", "reshaping_explanation", "task", "full_prompt"]:
        value = prompt.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(f"{key}: {value.strip()}")
    return "\n".join(parts)


def misconception_text(misconception_hits: Any) -> str:
    if not isinstance(misconception_hits, list):
        return ""
    parts: List[str] = []
    for hit in misconception_hits:
        if not isinstance(hit, dict):
            continue
        mid = hit.get("misconception_id")
        label = hit.get("label")
        confidence = hit.get("confidence")
        parts.append(f"{mid or ''} {label or ''} {confidence if confidence is not None else ''}".strip())
    return "; ".join(p for p in parts if p)


def build_input_text(input_obj: Dict[str, Any]) -> str:
    """Build deterministic text features from DiagnosisModelInput.

    We intentionally keep the original JSON summary too. The semantic fields help
    the classifier, while the stable JSON gives it access to structured keys.
    """
    pieces: List[str] = []

    schema_version = input_obj.get("schema_version")
    input_kind = input_obj.get("input_kind")
    pieces.append(f"schema_version: {schema_version}")
    pieces.append(f"input_kind: {input_kind}")

    if input_kind == "user_message":
        message = input_obj.get("user_message")
        if isinstance(message, dict):
            text = message.get("text")
            if isinstance(text, str):
                pieces.append(f"user_message_text: {text}")

    evaluated = input_obj.get("evaluated_probe_attempt")
    if isinstance(evaluated, dict):
        probe = evaluated.get("probe")
        if isinstance(probe, dict):
            pieces.append(f"probe_type: {probe.get('probe_type')}")
            pieces.append(f"expected_attempt_type: {probe.get('expected_attempt_type')}")
            pieces.append(f"target_diagnosis: {probe.get('target_diagnosis')}")
            prompt_text = compact_prompt(probe.get("prompt"))
            if prompt_text:
                pieces.append(f"probe_prompt:\n{prompt_text}")

        attempt = evaluated.get("attempt")
        if isinstance(attempt, dict):
            pieces.append(f"attempt_type: {attempt.get('attempt_type')}")
            response_summary = attempt.get("response_summary")
            if isinstance(response_summary, str):
                pieces.append(f"attempt_response_summary: {response_summary}")

        evaluation = evaluated.get("evaluation")
        if isinstance(evaluation, dict):
            pieces.append(f"correctness: {evaluation.get('correctness')}")
            correctness_summary = evaluation.get("correctness_summary")
            if isinstance(correctness_summary, str):
                pieces.append(f"correctness_summary: {correctness_summary}")

            evidence = evaluation.get("understanding_evidence")
            if isinstance(evidence, dict):
                for key in [
                    "evidence_strength",
                    "supports_understanding",
                    "supports_gap",
                    "may_be_lucky_guess",
                    "possible_guess",
                    "needs_verification_probe",
                    "informational_only",
                    "verification_reason",
                ]:
                    if key in evidence:
                        pieces.append(f"evidence_{key}: {evidence.get(key)}")

            hits_text = misconception_text(evaluation.get("misconception_hits"))
            if hits_text:
                pieces.append(f"misconception_hits: {hits_text}")

            if evaluation.get("next_action") is not None:
                pieces.append(f"previous_evaluator_next_action: {evaluation.get('next_action')}")

    # Stable raw JSON gives the model every field without hand-maintaining all keys.
    pieces.append("raw_input_json: " + stable_json(input_obj))
    return "\n".join(pieces)


def parse_example(raw: Dict[str, Any], split: str, index: int) -> Example:
    source = f"{split}[{index}]"
    input_obj, output_obj = get_input_output(raw, source)

    diagnosis = output_obj.get("diagnosis")
    next_action = output_obj.get("next_action")

    if diagnosis not in DIAGNOSIS_LABELS:
        raise ValueError(f"{source}: invalid output.diagnosis: {diagnosis!r}")
    if next_action not in DIAGNOSIS_NEXT_ACTIONS:
        raise ValueError(f"{source}: invalid output.next_action: {next_action!r}")

    example_id = str(raw.get("example_id") or raw.get("id") or f"{split}_{index:04d}")
    flow_id = str(raw.get("flow_id") or raw.get("connected_flow_id") or raw.get("flow") or example_id)

    source_row_number = raw.get("source_row_number", raw.get("row_number"))
    if source_row_number is not None:
        try:
            source_row_number = int(source_row_number)
        except Exception:
            source_row_number = None

    return Example(
        example_id=example_id,
        flow_id=flow_id,
        split=split,
        source_workbook=raw.get("source_workbook") or raw.get("workbook"),
        source_sheet=raw.get("source_sheet") or raw.get("sheet"),
        source_row_number=source_row_number,
        input_obj=input_obj,
        output_obj=output_obj,
        text=build_input_text(input_obj),
        diagnosis=diagnosis,
        diagnosis_confidence=float(output_obj["diagnosis_confidence"])
        if isinstance(output_obj.get("diagnosis_confidence"), (int, float))
        else None,
        next_action=next_action,
        next_action_confidence=float(output_obj["next_action_confidence"])
        if isinstance(output_obj.get("next_action_confidence"), (int, float))
        else None,
    )


def load_split(data_root: Path, split: str) -> List[Example]:
    path = data_root / f"{split}.jsonl"
    if not path.exists():
        raise FileNotFoundError(f"Missing split file: {path}")
    raw_rows = read_jsonl(path)
    return [parse_example(raw, split, i) for i, raw in enumerate(raw_rows, start=1)]


def make_classifier(seed: int, max_features: int, min_df: int, n_classes: int) -> Pipeline:
    vectorizer = TfidfVectorizer(
        lowercase=True,
        strip_accents="unicode",
        analyzer="word",
        ngram_range=(1, 2),
        max_features=max_features,
        min_df=min_df,
        sublinear_tf=True,
    )

    if n_classes <= 1:
        estimator = DummyClassifier(strategy="most_frequent")
    else:
        estimator = LogisticRegression(
            max_iter=2500,
            class_weight="balanced",
            solver="lbfgs",
            n_jobs=None,
            random_state=seed,
        )

    return Pipeline([
        ("tfidf", vectorizer),
        ("classifier", estimator),
    ])


def max_proba_for_prediction(model: Pipeline, texts: Sequence[str], preds: Sequence[str]) -> List[float]:
    if not hasattr(model, "predict_proba"):
        return [1.0 for _ in preds]

    try:
        probas = model.predict_proba(texts)
        classes = list(model.classes_)  # type: ignore[attr-defined]
    except Exception:
        return [1.0 for _ in preds]

    result: List[float] = []
    for i, pred in enumerate(preds):
        try:
            class_index = classes.index(pred)
            result.append(float(probas[i][class_index]))
        except Exception:
            result.append(float(max(probas[i])) if len(probas[i]) else 1.0)
    return [round(clamp01(x), 4) for x in result]


def clamp01(value: float) -> float:
    if math.isnan(value) or math.isinf(value):
        return 0.0
    return max(0.0, min(1.0, value))


def suggested_question_for(next_action: str, diagnosis: str) -> Optional[str]:
    if next_action != "ask_clarifying_question":
        return None
    if diagnosis == "unknown":
        return "Can you say a little more about what feels confusing or what you are trying to figure out?"
    return "Can you show one quick example of how you are thinking about this?"


def make_output(diagnosis: str, diagnosis_conf: float, next_action: str, next_action_conf: float) -> Dict[str, Any]:
    return {
        "schema_version": "diagnosis_model_output_v1",
        "diagnosis": diagnosis,
        "diagnosis_confidence": round(clamp01(diagnosis_conf), 4),
        "next_action": next_action,
        "next_action_confidence": round(clamp01(next_action_conf), 4),
        "suggested_question": suggested_question_for(next_action, diagnosis),
    }


def validate_prediction_output(output: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if output.get("schema_version") != "diagnosis_model_output_v1":
        errors.append("output.schema_version must be diagnosis_model_output_v1")
    if output.get("diagnosis") not in DIAGNOSIS_LABELS:
        errors.append(f"invalid output.diagnosis: {output.get('diagnosis')!r}")
    if output.get("next_action") not in DIAGNOSIS_NEXT_ACTIONS:
        errors.append(f"invalid output.next_action: {output.get('next_action')!r}")
    for key in ["diagnosis_confidence", "next_action_confidence"]:
        value = output.get(key)
        if not isinstance(value, (int, float)) or not 0 <= float(value) <= 1:
            errors.append(f"{key} must be a number from 0 to 1")
    if "suggested_question" in output and output["suggested_question"] is not None and not isinstance(output["suggested_question"], str):
        errors.append("suggested_question must be string or null")
    return errors


def safe_report(y_true: Sequence[str], y_pred: Sequence[str], labels: Sequence[str]) -> Dict[str, Any]:
    present_labels = sorted(set(y_true) | set(y_pred), key=lambda x: labels.index(x) if x in labels else 999)
    return classification_report(
        y_true,
        y_pred,
        labels=present_labels,
        zero_division=0,
        output_dict=True,
    )


def eval_split(
    split: str,
    examples: Sequence[Example],
    diagnosis_model: Pipeline,
    next_action_model: Pipeline,
    predictions_dir: Path,
) -> Dict[str, Any]:
    texts = [ex.text for ex in examples]
    y_diag = [ex.diagnosis for ex in examples]
    y_action = [ex.next_action for ex in examples]

    pred_diag = list(diagnosis_model.predict(texts))
    pred_action = list(next_action_model.predict(texts))

    diag_conf = max_proba_for_prediction(diagnosis_model, texts, pred_diag)
    action_conf = max_proba_for_prediction(next_action_model, texts, pred_action)

    output_path = predictions_dir / f"{split}.jsonl"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    validation_errors: List[Dict[str, Any]] = []
    with output_path.open("w", encoding="utf-8") as f:
        for i, ex in enumerate(examples):
            predicted_output = make_output(pred_diag[i], diag_conf[i], pred_action[i], action_conf[i])
            errs = validate_prediction_output(predicted_output)
            for err in errs:
                validation_errors.append({
                    "split": split,
                    "example_id": ex.example_id,
                    "error": err,
                })
            row = {
                "schema_version": "myway_diagnosis_prediction_v1",
                "model_name": MODEL_NAME,
                "split": split,
                "example_id": ex.example_id,
                "flow_id": ex.flow_id,
                "source_workbook": ex.source_workbook,
                "source_sheet": ex.source_sheet,
                "source_row_number": ex.source_row_number,
                "gold_output": ex.output_obj,
                "predicted_output": predicted_output,
                "matches": {
                    "diagnosis": pred_diag[i] == ex.diagnosis,
                    "next_action": pred_action[i] == ex.next_action,
                },
            }
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    diag_accuracy = accuracy_score(y_diag, pred_diag) if examples else 0.0
    action_accuracy = accuracy_score(y_action, pred_action) if examples else 0.0
    diag_macro_f1 = f1_score(y_diag, pred_diag, labels=DIAGNOSIS_LABELS, average="macro", zero_division=0) if examples else 0.0
    action_macro_f1 = f1_score(y_action, pred_action, labels=DIAGNOSIS_NEXT_ACTIONS, average="macro", zero_division=0) if examples else 0.0

    gold_diag_conf = [ex.diagnosis_confidence for ex in examples if ex.diagnosis_confidence is not None]
    pred_diag_conf_for_gold = [diag_conf[i] for i, ex in enumerate(examples) if ex.diagnosis_confidence is not None]
    gold_action_conf = [ex.next_action_confidence for ex in examples if ex.next_action_confidence is not None]
    pred_action_conf_for_gold = [action_conf[i] for i, ex in enumerate(examples) if ex.next_action_confidence is not None]

    return {
        "split": split,
        "total": len(examples),
        "prediction_file": repo_relative(output_path),
        "validation_error_count": len(validation_errors),
        "validation_errors": validation_errors[:25],
        "exact_rates": {
            "diagnosis_exact": round(float(diag_accuracy), 4),
            "next_action_exact": round(float(action_accuracy), 4),
        },
        "f1": {
            "diagnosis_macro_f1": round(float(diag_macro_f1), 4),
            "next_action_macro_f1": round(float(action_macro_f1), 4),
        },
        "confidence_mae": {
            "diagnosis_confidence_mae": round(float(mean_absolute_error(gold_diag_conf, pred_diag_conf_for_gold)), 4)
            if gold_diag_conf else None,
            "next_action_confidence_mae": round(float(mean_absolute_error(gold_action_conf, pred_action_conf_for_gold)), 4)
            if gold_action_conf else None,
        },
        "gold_distribution": {
            "diagnosis": dict(Counter(y_diag)),
            "next_action": dict(Counter(y_action)),
        },
        "predicted_distribution": {
            "diagnosis": dict(Counter(pred_diag)),
            "next_action": dict(Counter(pred_action)),
        },
        "classification_report": {
            "diagnosis": safe_report(y_diag, pred_diag, DIAGNOSIS_LABELS),
            "next_action": safe_report(y_action, pred_action, DIAGNOSIS_NEXT_ACTIONS),
        },
        "confusion_matrix": {
            "diagnosis_labels": DIAGNOSIS_LABELS,
            "diagnosis": confusion_matrix(y_diag, pred_diag, labels=DIAGNOSIS_LABELS).tolist(),
            "next_action_labels": DIAGNOSIS_NEXT_ACTIONS,
            "next_action": confusion_matrix(y_action, pred_action, labels=DIAGNOSIS_NEXT_ACTIONS).tolist(),
        },
    }


def write_summary(report: Dict[str, Any], path: Path) -> None:
    lines: List[str] = []
    lines.append("MyWay Phase A Diagnosis Classifier Training")
    lines.append("==========================================")
    lines.append(f"Model: {report['model_name']}")
    lines.append(f"Created: {report['created_at']}")
    lines.append(f"Data root: {report['data_root']}")
    lines.append(f"Model dir: {report['model_dir']}")
    lines.append("")
    lines.append("Environment:")
    for key, value in report["environment"].items():
        lines.append(f"- {key}: {value}")
    lines.append("")
    lines.append("Examples:")
    for split in SPLITS:
        lines.append(f"- {split}: {report['example_counts'][split]}")
    lines.append("")
    lines.append("Train label distribution:")
    lines.append(f"- diagnosis: {json.dumps(report['train_distribution']['diagnosis'], ensure_ascii=False)}")
    lines.append(f"- next_action: {json.dumps(report['train_distribution']['next_action'], ensure_ascii=False)}")
    lines.append("")
    lines.append("Evaluation:")
    for split in SPLITS:
        metrics = report["eval"][split]
        lines.append(f"\n{split}")
        lines.append("-" * len(split))
        lines.append(f"Total: {metrics['total']}")
        lines.append(f"Validation errors: {metrics['validation_error_count']}")
        lines.append(f"Exact/rate metrics: {json.dumps(metrics['exact_rates'], ensure_ascii=False)}")
        lines.append(f"F1 metrics: {json.dumps(metrics['f1'], ensure_ascii=False)}")
        lines.append(f"Confidence MAE: {json.dumps(metrics['confidence_mae'], ensure_ascii=False)}")
        lines.append(f"Predicted diagnosis distribution: {json.dumps(metrics['predicted_distribution']['diagnosis'], ensure_ascii=False)}")
        lines.append(f"Predicted next_action distribution: {json.dumps(metrics['predicted_distribution']['next_action'], ensure_ascii=False)}")
    lines.append("")
    lines.append("Artifacts:")
    for key, value in report["artifacts"].items():
        lines.append(f"- {key}: {value}")
    lines.append("")
    lines.append("Notes:")
    lines.append("- This is the first CPU-friendly trained artifact, not the final 3-model system.")
    lines.append("- The artifact is suitable for service integration and shadow-mode comparison.")
    lines.append("- Probe Contract remains a harder structured-generation task and should not be replaced by this classifier approach.")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Train CPU-friendly MyWay Phase A Diagnosis classifiers.")
    parser.add_argument(
        "--data-root",
        default="datasets/engine-datasets/splits/diagnosis",
        help="Directory containing train.jsonl, validation.jsonl, and test.jsonl for diagnosis.",
    )
    parser.add_argument(
        "--model-dir",
        default="models/diagnosis/phase-a-v1",
        help="Directory where trained artifacts and reports will be written.",
    )
    parser.add_argument("--max-features", type=int, default=12000)
    parser.add_argument("--min-df", type=int, default=1)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing model-dir files.")
    args = parser.parse_args()

    data_root = Path(args.data_root)
    model_dir = Path(args.model_dir)
    predictions_dir = model_dir / "predictions"

    if model_dir.exists() and any(model_dir.iterdir()) and not args.overwrite:
        print(f"Model dir already exists and is not empty: {model_dir}")
        print("Re-run with --overwrite to replace its contents.")
        return 2

    model_dir.mkdir(parents=True, exist_ok=True)
    predictions_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading diagnosis splits from {data_root}...")
    examples_by_split = {split: load_split(data_root, split) for split in SPLITS}

    train_examples = examples_by_split["train"]
    if not train_examples:
        raise ValueError("Training split is empty")

    train_texts = [ex.text for ex in train_examples]
    y_train_diag = [ex.diagnosis for ex in train_examples]
    y_train_action = [ex.next_action for ex in train_examples]

    print(f"Training examples: {len(train_examples)}")
    print("Diagnosis distribution:", dict(Counter(y_train_diag)))
    print("Next-action distribution:", dict(Counter(y_train_action)))

    diagnosis_model = make_classifier(
        seed=args.seed,
        max_features=args.max_features,
        min_df=args.min_df,
        n_classes=len(set(y_train_diag)),
    )
    next_action_model = make_classifier(
        seed=args.seed,
        max_features=args.max_features,
        min_df=args.min_df,
        n_classes=len(set(y_train_action)),
    )

    print("Training diagnosis label classifier...")
    diagnosis_model.fit(train_texts, y_train_diag)

    print("Training next-action classifier...")
    next_action_model.fit(train_texts, y_train_action)

    diagnosis_model_path = model_dir / "diagnosis_label_classifier.joblib"
    next_action_model_path = model_dir / "next_action_classifier.joblib"
    joblib.dump(diagnosis_model, diagnosis_model_path)
    joblib.dump(next_action_model, next_action_model_path)

    print("Evaluating splits...")
    eval_report = {
        split: eval_split(split, examples_by_split[split], diagnosis_model, next_action_model, predictions_dir)
        for split in SPLITS
    }

    validation_error_count = sum(v["validation_error_count"] for v in eval_report.values())

    metadata = {
        "schema_version": "myway_diagnosis_classifier_metadata_v1",
        "model_name": MODEL_NAME,
        "created_at": utc_now_iso(),
        "text_builder_version": TEXT_BUILDER_VERSION,
        "data_root": repo_relative(data_root),
        "model_dir": repo_relative(model_dir),
        "training_args": {
            "max_features": args.max_features,
            "min_df": args.min_df,
            "seed": args.seed,
            "vectorizer": "TfidfVectorizer word ngram_range=(1,2) sublinear_tf=True",
            "classifier": "LogisticRegression class_weight=balanced solver=lbfgs max_iter=2500",
        },
        "labels": {
            "diagnosis": DIAGNOSIS_LABELS,
            "next_action": DIAGNOSIS_NEXT_ACTIONS,
        },
        "example_counts": {split: len(examples_by_split[split]) for split in SPLITS},
        "train_distribution": {
            "diagnosis": dict(Counter(y_train_diag)),
            "next_action": dict(Counter(y_train_action)),
        },
        "environment": {
            "python": sys.version.replace("\n", " "),
            "platform": platform.platform(),
            "sklearn": sklearn.__version__,
            "joblib": joblib.__version__,
            "cwd": os.getcwd(),
        },
        "artifacts": {
            "diagnosis_label_classifier": repo_relative(diagnosis_model_path),
            "next_action_classifier": repo_relative(next_action_model_path),
            "metadata": repo_relative(model_dir / "metadata.json"),
            "eval_report": repo_relative(model_dir / "eval_report.json"),
            "eval_summary": repo_relative(model_dir / "eval_summary.txt"),
            "predictions_dir": repo_relative(predictions_dir),
        },
    }

    full_report = {
        **metadata,
        "schema_version": "myway_diagnosis_classifier_eval_report_v1",
        "validation_error_count": validation_error_count,
        "eval": eval_report,
    }

    metadata_path = model_dir / "metadata.json"
    report_path = model_dir / "eval_report.json"
    summary_path = model_dir / "eval_summary.txt"

    metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    report_path.write_text(json.dumps(full_report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_summary(full_report, summary_path)

    print("\nDone. Diagnosis classifier training complete.")
    print(f"Validation errors: {validation_error_count}")
    print(f"Model dir: {model_dir}")
    print(f"Summary: {summary_path}")
    print(f"Report: {report_path}")

    if validation_error_count:
        print("Prediction validation errors were found. Inspect eval_report.json before integration.")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
