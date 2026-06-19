#!/usr/bin/env python
"""
Train MyWay Phase A Diagnosis Model v2 FIXED (CPU-friendly sklearn version).

This script trains two lightweight classifiers:
  1) DiagnosisModelInput -> diagnosis
  2) DiagnosisModelInput -> next_action

It tries multiple TF-IDF + classifier candidates, selects the best model for each
label using validation performance, evaluates train/validation/test, and saves
artifacts to models/diagnosis/phase-a-v2.

Run from repo root:
  python scripts/engine-datasets/training/train-diagnosis-classifier-v2.py

Rerun:
  python scripts/engine-datasets/training/train-diagnosis-classifier-v2.py --overwrite
"""

from __future__ import annotations

import argparse
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
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import joblib
import sklearn
from sklearn.base import BaseEstimator
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.naive_bayes import ComplementNB
from sklearn.pipeline import FeatureUnion, Pipeline


REPO_ROOT = Path.cwd()
DEFAULT_DATA_ROOT = Path("datasets/engine-datasets/splits/diagnosis")
DEFAULT_MODEL_DIR = Path("models/diagnosis/phase-a-v2")
BASELINE_REPORT = Path("datasets/engine-datasets/reports/phase-a-baseline-eval-report.json")

DIAGNOSIS_LABELS = {
    "unknown",
    "no_gap_detected",
    "recall_gap",
    "representation_gap",
    "procedure_gap",
    "discrimination_gap",
    "transfer_gap",
    "metacognitive_gap",
}

DIAGNOSIS_NEXT_ACTIONS = {
    "ask_clarifying_question",
    "generate_probe_contract",
    "give_feedback",
    "summarize_progress",
}

SPLITS = ["train", "validation", "test"]


@dataclass
class Example:
    example_id: str
    flow_id: Optional[str]
    split: str
    raw: Dict[str, Any]
    input_obj: Dict[str, Any]
    output_obj: Dict[str, Any]
    text: str
    diagnosis: str
    next_action: str
    diagnosis_confidence: float
    next_action_confidence: float


@dataclass
class CandidateResult:
    label_name: str
    candidate_name: str
    validation_accuracy: float
    validation_macro_f1: float
    validation_weighted_f1: float
    train_accuracy: float
    train_macro_f1: float
    selection_score: float


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    if not path.exists():
        raise FileNotFoundError(f"Missing required file: {path}")
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            text = line.strip()
            if not text:
                continue
            try:
                rows.append(json.loads(text))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON in {path} line {line_no}: {exc}") from exc
    return rows


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

    input_value = row.get("input")
    if input_value is None:
        input_value = row.get("input_json")

    output_value = row.get("output")
    if output_value is None:
        output_value = row.get("output_json")

    if input_value is None or output_value is None:
        # Some jsonl formats may store the training pair inside jsonl_line.
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
    """Extract useful semantic strings without including example IDs."""
    chunks: List[str] = []
    if value is None:
        return chunks
    if isinstance(value, str):
        if value.strip():
            if prefix:
                chunks.append(f"{prefix}: {value.strip()}")
            else:
                chunks.append(value.strip())
        return chunks
    if isinstance(value, (int, float, bool)):
        if prefix:
            chunks.append(f"{prefix}: {value}")
        return chunks
    if isinstance(value, list):
        for item in value:
            chunks.extend(flatten_strings(item, prefix=prefix))
        return chunks
    if isinstance(value, dict):
        for key, val in value.items():
            if key in {"example_id", "flow_id", "source_workbook", "source_sheet", "source_row_number"}:
                continue
            next_prefix = f"{prefix}.{key}" if prefix else str(key)
            chunks.extend(flatten_strings(val, next_prefix))
        return chunks
    return chunks


def build_feature_text(input_obj: Dict[str, Any]) -> str:
    """
    Build a text representation for CPU-friendly classifiers.

    This intentionally includes:
      - the important semantic fields as readable text
      - a compact canonical JSON copy for exact enum/key features

    It intentionally does not include workbook/source metadata.
    """
    chunks: List[str] = []

    schema_version = input_obj.get("schema_version")
    input_kind = input_obj.get("input_kind")
    if schema_version:
        chunks.append(f"schema_version={schema_version}")
    if input_kind:
        chunks.append(f"input_kind={input_kind}")

    user_message = input_obj.get("user_message")
    if isinstance(user_message, dict):
        text = user_message.get("text")
        if text:
            chunks.append(f"user_message_text: {text}")

    evaluated = input_obj.get("evaluated_probe_attempt")
    if isinstance(evaluated, dict):
        probe = evaluated.get("probe") if isinstance(evaluated.get("probe"), dict) else {}
        attempt = evaluated.get("attempt") if isinstance(evaluated.get("attempt"), dict) else {}
        evaluation = evaluated.get("evaluation") if isinstance(evaluated.get("evaluation"), dict) else {}

        for key in ["probe_type", "expected_attempt_type", "target_diagnosis"]:
            if probe.get(key):
                chunks.append(f"probe_{key}={probe.get(key)}")

        prompt = probe.get("prompt") if isinstance(probe.get("prompt"), dict) else {}
        for key in ["root_problem_explanation", "reshaping_explanation", "task", "full_prompt"]:
            if prompt.get(key):
                chunks.append(f"prompt_{key}: {prompt.get(key)}")

        if attempt.get("attempt_type"):
            chunks.append(f"attempt_type={attempt.get('attempt_type')}")
        if attempt.get("response_summary"):
            chunks.append(f"attempt_response_summary: {attempt.get('response_summary')}")

        if "correctness" in evaluation:
            chunks.append(f"evaluation_correctness={evaluation.get('correctness')}")
        if evaluation.get("correctness_summary"):
            chunks.append(f"evaluation_correctness_summary: {evaluation.get('correctness_summary')}")
        if evaluation.get("next_action"):
            chunks.append(f"evaluation_next_action={evaluation.get('next_action')}")

        evidence = evaluation.get("understanding_evidence") if isinstance(evaluation.get("understanding_evidence"), dict) else {}
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
            if key in evidence and evidence.get(key) is not None:
                chunks.append(f"evidence_{key}: {evidence.get(key)}")

        hits = evaluation.get("misconception_hits")
        if isinstance(hits, list):
            for hit in hits:
                if isinstance(hit, dict):
                    if hit.get("misconception_id"):
                        chunks.append(f"misconception_id={hit.get('misconception_id')}")
                    if hit.get("label"):
                        chunks.append(f"misconception_label: {hit.get('label')}")

    # Include flattened text for broader lexical signal.
    chunks.extend(flatten_strings(input_obj))

    # Include canonical JSON for field names/enums.
    chunks.append("CANONICAL_JSON " + compact_json(input_obj))

    return "\n".join(chunks)


def load_examples(data_root: Path) -> Dict[str, List[Example]]:
    by_split: Dict[str, List[Example]] = {}
    for split in SPLITS:
        path = data_root / f"{split}.jsonl"
        rows = read_jsonl(path)
        examples: List[Example] = []
        for idx, row in enumerate(rows, start=1):
            input_obj, output_obj = get_input_output(row)
            example_id = str(row.get("example_id") or row.get("id") or f"{split}_{idx:04d}")
            flow_id = row.get("flow_id")
            diagnosis = output_obj.get("diagnosis")
            next_action = output_obj.get("next_action")
            if diagnosis not in DIAGNOSIS_LABELS:
                raise ValueError(f"{example_id}: invalid diagnosis label in gold output: {diagnosis}")
            if next_action not in DIAGNOSIS_NEXT_ACTIONS:
                raise ValueError(f"{example_id}: invalid next_action in gold output: {next_action}")
            examples.append(
                Example(
                    example_id=example_id,
                    flow_id=str(flow_id) if flow_id is not None else None,
                    split=split,
                    raw=row,
                    input_obj=input_obj,
                    output_obj=output_obj,
                    text=build_feature_text(input_obj),
                    diagnosis=diagnosis,
                    next_action=next_action,
                    diagnosis_confidence=float(output_obj.get("diagnosis_confidence") or 0.0),
                    next_action_confidence=float(output_obj.get("next_action_confidence") or 0.0),
                )
            )
        by_split[split] = examples
    return by_split


def make_candidates(label_name: str) -> Dict[str, Pipeline]:
    """Return candidate sklearn pipelines. Kept small enough for CPU training."""
    # Different labels can prefer different regularization, so we provide the same
    # search space for diagnosis and next_action and select separately.
    candidates: Dict[str, Pipeline] = {}

    def lr(c: float = 1.0, class_weight: Optional[str] = "balanced") -> LogisticRegression:
        # Use a direct multiclass-safe solver. This avoids sklearn 1.8 liblinear
        # multiclass errors on labels such as representation_gap, procedure_gap, etc.
        return LogisticRegression(
            C=c,
            class_weight=class_weight,
            max_iter=4000,
            solver="lbfgs",
            random_state=42,
        )

    for c in [0.5, 1.0, 2.0, 4.0]:
        candidates[f"word12_lr_balanced_c{c}"] = Pipeline(
            [
                (
                    "features",
                    TfidfVectorizer(
                        analyzer="word",
                        ngram_range=(1, 2),
                        min_df=1,
                        max_df=0.95,
                        sublinear_tf=True,
                        strip_accents="unicode",
                        lowercase=True,
                        max_features=60000,
                    ),
                ),
                ("clf", lr(c=c, class_weight="balanced")),
            ]
        )

    for c in [1.0, 2.0]:
        candidates[f"word13_lr_balanced_c{c}"] = Pipeline(
            [
                (
                    "features",
                    TfidfVectorizer(
                        analyzer="word",
                        ngram_range=(1, 3),
                        min_df=1,
                        max_df=0.95,
                        sublinear_tf=True,
                        strip_accents="unicode",
                        lowercase=True,
                        max_features=80000,
                    ),
                ),
                ("clf", lr(c=c, class_weight="balanced")),
            ]
        )

    for c in [1.0, 2.0]:
        candidates[f"char35_lr_balanced_c{c}"] = Pipeline(
            [
                (
                    "features",
                    TfidfVectorizer(
                        analyzer="char_wb",
                        ngram_range=(3, 5),
                        min_df=1,
                        sublinear_tf=True,
                        lowercase=True,
                        max_features=100000,
                    ),
                ),
                ("clf", lr(c=c, class_weight="balanced")),
            ]
        )

    for c in [0.5, 1.0, 2.0]:
        candidates[f"hybrid_word12_char35_lr_balanced_c{c}"] = Pipeline(
            [
                (
                    "features",
                    FeatureUnion(
                        [
                            (
                                "word",
                                TfidfVectorizer(
                                    analyzer="word",
                                    ngram_range=(1, 2),
                                    min_df=1,
                                    max_df=0.95,
                                    sublinear_tf=True,
                                    strip_accents="unicode",
                                    lowercase=True,
                                    max_features=60000,
                                ),
                            ),
                            (
                                "char",
                                TfidfVectorizer(
                                    analyzer="char_wb",
                                    ngram_range=(3, 5),
                                    min_df=1,
                                    sublinear_tf=True,
                                    lowercase=True,
                                    max_features=80000,
                                ),
                            ),
                        ]
                    ),
                ),
                ("clf", lr(c=c, class_weight="balanced")),
            ]
        )

    candidates["word12_lr_unbalanced_c1.0"] = Pipeline(
        [
            (
                "features",
                TfidfVectorizer(
                    analyzer="word",
                    ngram_range=(1, 2),
                    min_df=1,
                    max_df=0.95,
                    sublinear_tf=True,
                    strip_accents="unicode",
                    lowercase=True,
                    max_features=60000,
                ),
            ),
            ("clf", lr(c=1.0, class_weight=None)),
        ]
    )

    candidates["word12_complement_nb_a0.1"] = Pipeline(
        [
            (
                "features",
                TfidfVectorizer(
                    analyzer="word",
                    ngram_range=(1, 2),
                    min_df=1,
                    max_df=0.95,
                    sublinear_tf=True,
                    strip_accents="unicode",
                    lowercase=True,
                    max_features=60000,
                ),
            ),
            ("clf", ComplementNB(alpha=0.1)),
        ]
    )

    return candidates


def selection_score(accuracy: float, macro_f1: float, weighted_f1: float) -> float:
    # Macro F1 matters because rare labels like recall_gap/unknown are important,
    # but accuracy still matters for app behavior.
    return round((0.50 * macro_f1) + (0.35 * accuracy) + (0.15 * weighted_f1), 6)


def evaluate_candidate(model: BaseEstimator, train_x: List[str], train_y: List[str], val_x: List[str], val_y: List[str], label_name: str, candidate_name: str) -> CandidateResult:
    train_pred = list(model.predict(train_x))
    val_pred = list(model.predict(val_x))
    train_acc = accuracy_score(train_y, train_pred)
    train_macro = f1_score(train_y, train_pred, average="macro", zero_division=0)
    val_acc = accuracy_score(val_y, val_pred)
    val_macro = f1_score(val_y, val_pred, average="macro", zero_division=0)
    val_weighted = f1_score(val_y, val_pred, average="weighted", zero_division=0)
    return CandidateResult(
        label_name=label_name,
        candidate_name=candidate_name,
        validation_accuracy=round(float(val_acc), 4),
        validation_macro_f1=round(float(val_macro), 4),
        validation_weighted_f1=round(float(val_weighted), 4),
        train_accuracy=round(float(train_acc), 4),
        train_macro_f1=round(float(train_macro), 4),
        selection_score=selection_score(float(val_acc), float(val_macro), float(val_weighted)),
    )


def choose_best_model(label_name: str, train_x: List[str], train_y: List[str], val_x: List[str], val_y: List[str]) -> Tuple[str, BaseEstimator, List[Dict[str, Any]]]:
    candidates = make_candidates(label_name)
    results: List[Tuple[CandidateResult, BaseEstimator]] = []

    print(f"Training {len(candidates)} candidate(s) for {label_name}...")
    failed: List[Dict[str, Any]] = []
    for idx, (name, model) in enumerate(candidates.items(), start=1):
        print(f"  [{idx}/{len(candidates)}] {name}")
        try:
            model.fit(train_x, train_y)
            result = evaluate_candidate(model, train_x, train_y, val_x, val_y, label_name, name)
        except Exception as exc:
            failed.append({"candidate_name": name, "error": str(exc)})
            print(f"      skipped: {exc}")
            continue
        results.append((result, model))
        print(
            "      val_acc={:.4f} val_macro_f1={:.4f} score={:.4f}".format(
                result.validation_accuracy,
                result.validation_macro_f1,
                result.selection_score,
            )
        )

    if not results:
        raise RuntimeError(f"No {label_name} candidates trained successfully. Failures: {failed}")

    results.sort(key=lambda item: (item[0].selection_score, item[0].validation_accuracy, item[0].validation_macro_f1), reverse=True)
    best_result, best_model = results[0]
    print(f"Selected {label_name}: {best_result.candidate_name} (score={best_result.selection_score})")
    return best_result.candidate_name, best_model, [r.__dict__ for r, _ in results]


def max_confidence(model: BaseEstimator, x_values: List[str]) -> List[float]:
    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(x_values)
        return [float(max(row)) for row in probs]

    # Fallback for estimators without predict_proba.
    if hasattr(model, "decision_function"):
        scores = model.decision_function(x_values)
        if len(x_values) == 1 and not hasattr(scores[0], "__iter__"):
            scores = [scores]
        confidences: List[float] = []
        for row in scores:
            if not hasattr(row, "__iter__"):
                # Binary margin.
                margin = float(row)
                p = 1.0 / (1.0 + math.exp(-abs(margin)))
                confidences.append(p)
            else:
                vals = [float(v) for v in row]
                m = max(vals)
                exps = [math.exp(v - m) for v in vals]
                s = sum(exps)
                confidences.append(max(exps) / s if s else 0.5)
        return confidences

    return [0.5 for _ in x_values]


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def build_prediction_output(diagnosis: str, diagnosis_confidence: float, next_action: str, next_action_confidence: float) -> Dict[str, Any]:
    suggested_question: Optional[str] = None
    if next_action == "ask_clarifying_question":
        suggested_question = "Can you tell me which part feels unclear or what you tried so far?"

    return {
        "schema_version": "diagnosis_model_output_v1",
        "diagnosis": diagnosis,
        "diagnosis_confidence": round(clamp01(diagnosis_confidence), 4),
        "next_action": next_action,
        "next_action_confidence": round(clamp01(next_action_confidence), 4),
        "suggested_question": suggested_question,
    }


def validate_diagnosis_output(output: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if output.get("schema_version") != "diagnosis_model_output_v1":
        errors.append("schema_version must be diagnosis_model_output_v1")
    if output.get("diagnosis") not in DIAGNOSIS_LABELS:
        errors.append(f"invalid diagnosis: {output.get('diagnosis')}")
    if output.get("next_action") not in DIAGNOSIS_NEXT_ACTIONS:
        errors.append(f"invalid next_action: {output.get('next_action')}")
    for field in ["diagnosis_confidence", "next_action_confidence"]:
        value = output.get(field)
        if not isinstance(value, (int, float)) or math.isnan(float(value)) or not 0 <= float(value) <= 1:
            errors.append(f"{field} must be a number from 0 to 1")
    if "suggested_question" in output and output["suggested_question"] is not None and not isinstance(output["suggested_question"], str):
        errors.append("suggested_question must be string or null")
    return errors


def mae(values: Iterable[float]) -> float:
    vals = list(values)
    if not vals:
        return 0.0
    return round(float(sum(abs(v) for v in vals) / len(vals)), 4)


def evaluate_split(
    split: str,
    examples: List[Example],
    diagnosis_model: BaseEstimator,
    next_action_model: BaseEstimator,
    predictions_dir: Path,
) -> Dict[str, Any]:
    x = [ex.text for ex in examples]
    gold_diagnosis = [ex.diagnosis for ex in examples]
    gold_next = [ex.next_action for ex in examples]

    pred_diagnosis = list(diagnosis_model.predict(x))
    pred_next = list(next_action_model.predict(x))
    diagnosis_conf = max_confidence(diagnosis_model, x)
    next_conf = max_confidence(next_action_model, x)

    validation_errors: List[Dict[str, Any]] = []
    prediction_rows: List[Dict[str, Any]] = []

    for i, ex in enumerate(examples):
        pred_output = build_prediction_output(
            diagnosis=pred_diagnosis[i],
            diagnosis_confidence=diagnosis_conf[i],
            next_action=pred_next[i],
            next_action_confidence=next_conf[i],
        )
        errs = validate_diagnosis_output(pred_output)
        for err in errs:
            validation_errors.append(
                {
                    "split": split,
                    "example_id": ex.example_id,
                    "error": err,
                    "predicted_output": pred_output,
                }
            )
        prediction_rows.append(
            {
                "example_id": ex.example_id,
                "flow_id": ex.flow_id,
                "split": split,
                "model_target": "diagnosis",
                "input": ex.input_obj,
                "gold_output": ex.output_obj,
                "predicted_output": pred_output,
                "metrics": {
                    "diagnosis_exact": pred_diagnosis[i] == ex.diagnosis,
                    "next_action_exact": pred_next[i] == ex.next_action,
                    "diagnosis_confidence_abs_error": round(abs(pred_output["diagnosis_confidence"] - ex.diagnosis_confidence), 4),
                    "next_action_confidence_abs_error": round(abs(pred_output["next_action_confidence"] - ex.next_action_confidence), 4),
                },
            }
        )

    predictions_dir.mkdir(parents=True, exist_ok=True)
    pred_path = predictions_dir / f"{split}.jsonl"
    with pred_path.open("w", encoding="utf-8") as f:
        for row in prediction_rows:
            f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")

    diag_acc = accuracy_score(gold_diagnosis, pred_diagnosis) if examples else 0.0
    next_acc = accuracy_score(gold_next, pred_next) if examples else 0.0
    diag_macro = f1_score(gold_diagnosis, pred_diagnosis, average="macro", zero_division=0) if examples else 0.0
    next_macro = f1_score(gold_next, pred_next, average="macro", zero_division=0) if examples else 0.0

    result = {
        "split": split,
        "total": len(examples),
        "validation_error_count": len(validation_errors),
        "exact_rates": {
            "diagnosis_exact": round(float(diag_acc), 4),
            "next_action_exact": round(float(next_acc), 4),
        },
        "f1_metrics": {
            "diagnosis_macro_f1": round(float(diag_macro), 4),
            "next_action_macro_f1": round(float(next_macro), 4),
        },
        "confidence_mae": {
            "diagnosis_confidence_mae": mae([diagnosis_conf[i] - examples[i].diagnosis_confidence for i in range(len(examples))]),
            "next_action_confidence_mae": mae([next_conf[i] - examples[i].next_action_confidence for i in range(len(examples))]),
        },
        "gold_distribution": {
            "diagnosis": dict(Counter(gold_diagnosis)),
            "next_action": dict(Counter(gold_next)),
        },
        "predicted_distribution": {
            "diagnosis": dict(Counter(pred_diagnosis)),
            "next_action": dict(Counter(pred_next)),
        },
        "classification_reports": {
            "diagnosis": classification_report(gold_diagnosis, pred_diagnosis, zero_division=0, output_dict=True),
            "next_action": classification_report(gold_next, pred_next, zero_division=0, output_dict=True),
        },
        "prediction_file": str(pred_path).replace("\\", "/"),
        "validation_errors": validation_errors,
    }
    return result


def read_baseline_reference(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"available": False, "reason": f"Missing baseline report at {path}"}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"available": False, "reason": f"Could not parse baseline report: {exc}"}

    key = "diagnosis:test"
    metrics = data.get("by_model_and_split", {}).get(key)
    if not isinstance(metrics, dict):
        return {"available": False, "reason": f"No {key} entry in baseline report"}
    return {
        "available": True,
        "source": str(path).replace("\\", "/"),
        "diagnosis_test_exact": metrics.get("exact_rates", {}).get("diagnosis_exact"),
        "next_action_test_exact": metrics.get("exact_rates", {}).get("next_action_exact"),
        "raw": metrics,
    }


def format_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def write_summary(report: Dict[str, Any], summary_path: Path) -> None:
    lines: List[str] = []
    lines.append("MyWay Phase A Diagnosis Classifier Training v2")
    lines.append("=============================================")
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
        lines.append(f"- {split}: {report['examples'][split]}")
    lines.append("")
    lines.append("Selected candidates:")
    lines.append(f"- diagnosis: {report['selected_candidates']['diagnosis']}")
    lines.append(f"- next_action: {report['selected_candidates']['next_action']}")
    lines.append("")
    lines.append("Candidate search top rows:")
    for label in ["diagnosis", "next_action"]:
        lines.append(f"\n{label}")
        lines.append("-" * len(label))
        for row in report["candidate_results"][label][:5]:
            lines.append(
                f"- {row['candidate_name']}: score={row['selection_score']} "
                f"val_acc={row['validation_accuracy']} val_macro_f1={row['validation_macro_f1']} "
                f"train_acc={row['train_accuracy']}"
            )
    lines.append("")
    lines.append("Evaluation:")
    for split in SPLITS:
        metrics = report["evaluation"][split]
        lines.append(f"\n{split}")
        lines.append("-" * len(split))
        lines.append(f"Total: {metrics['total']}")
        lines.append(f"Validation errors: {metrics['validation_error_count']}")
        lines.append(f"Exact/rate metrics: {format_json(metrics['exact_rates'])}")
        lines.append(f"F1 metrics: {format_json(metrics['f1_metrics'])}")
        lines.append(f"Confidence MAE: {format_json(metrics['confidence_mae'])}")
        lines.append(f"Gold diagnosis distribution: {format_json(metrics['gold_distribution']['diagnosis'])}")
        lines.append(f"Predicted diagnosis distribution: {format_json(metrics['predicted_distribution']['diagnosis'])}")
        lines.append(f"Predicted next_action distribution: {format_json(metrics['predicted_distribution']['next_action'])}")
    lines.append("")
    lines.append("Baseline comparison:")
    baseline = report.get("baseline_reference", {})
    if baseline.get("available"):
        lines.append(f"- baseline diagnosis test exact: {baseline.get('diagnosis_test_exact')}")
        lines.append(f"- v2 diagnosis test exact: {report['evaluation']['test']['exact_rates']['diagnosis_exact']}")
        lines.append(f"- baseline next_action test exact: {baseline.get('next_action_test_exact')}")
        lines.append(f"- v2 next_action test exact: {report['evaluation']['test']['exact_rates']['next_action_exact']}")
        lines.append(f"- beats baseline diagnosis exact: {report['baseline_comparison'].get('beats_diagnosis_exact')}")
        lines.append(f"- beats baseline next_action exact: {report['baseline_comparison'].get('beats_next_action_exact')}")
    else:
        lines.append(f"- baseline unavailable: {baseline.get('reason')}")
    lines.append("")
    lines.append("Artifacts:")
    for key, path in report["artifacts"].items():
        lines.append(f"- {key}: {path}")
    lines.append("")
    lines.append("Notes:")
    for note in report["notes"]:
        lines.append(f"- {note}")
    summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train MyWay diagnosis classifier v2.")
    parser.add_argument("--data-root", default=str(DEFAULT_DATA_ROOT), help="Diagnosis split root containing train/validation/test.jsonl")
    parser.add_argument("--model-dir", default=str(DEFAULT_MODEL_DIR), help="Output model directory")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite an existing model directory")
    parser.add_argument("--baseline-report", default=str(BASELINE_REPORT), help="Optional baseline eval report for comparison")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data_root = Path(args.data_root)
    model_dir = Path(args.model_dir)
    predictions_dir = model_dir / "predictions"

    if model_dir.exists():
        if not args.overwrite:
            print(f"ERROR: {model_dir} already exists. Re-run with --overwrite to replace it.", file=sys.stderr)
            return 2
        shutil.rmtree(model_dir)

    model_dir.mkdir(parents=True, exist_ok=True)
    predictions_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading diagnosis splits from {data_root}...")
    examples_by_split = load_examples(data_root)

    train = examples_by_split["train"]
    validation = examples_by_split["validation"]
    test = examples_by_split["test"]

    train_x = [ex.text for ex in train]
    train_diag_y = [ex.diagnosis for ex in train]
    train_next_y = [ex.next_action for ex in train]
    val_x = [ex.text for ex in validation]
    val_diag_y = [ex.diagnosis for ex in validation]
    val_next_y = [ex.next_action for ex in validation]

    print(f"Training examples: {len(train)}")
    print(f"Validation examples: {len(validation)}")
    print(f"Test examples: {len(test)}")
    print(f"Diagnosis distribution: {dict(Counter(train_diag_y))}")
    print(f"Next-action distribution: {dict(Counter(train_next_y))}")

    diagnosis_candidate_name, diagnosis_model, diagnosis_candidate_results = choose_best_model(
        "diagnosis", train_x, train_diag_y, val_x, val_diag_y
    )
    next_candidate_name, next_action_model, next_candidate_results = choose_best_model(
        "next_action", train_x, train_next_y, val_x, val_next_y
    )

    print("Evaluating selected models...")
    evaluation: Dict[str, Any] = {}
    all_validation_errors: List[Dict[str, Any]] = []
    for split in SPLITS:
        split_result = evaluate_split(
            split=split,
            examples=examples_by_split[split],
            diagnosis_model=diagnosis_model,
            next_action_model=next_action_model,
            predictions_dir=predictions_dir,
        )
        all_validation_errors.extend(split_result.pop("validation_errors"))
        evaluation[split] = split_result

    baseline_reference = read_baseline_reference(Path(args.baseline_report))
    baseline_comparison: Dict[str, Any] = {"available": baseline_reference.get("available", False)}
    if baseline_reference.get("available"):
        base_diag = baseline_reference.get("diagnosis_test_exact")
        base_next = baseline_reference.get("next_action_test_exact")
        v2_diag = evaluation["test"]["exact_rates"]["diagnosis_exact"]
        v2_next = evaluation["test"]["exact_rates"]["next_action_exact"]
        baseline_comparison.update(
            {
                "baseline_diagnosis_test_exact": base_diag,
                "v2_diagnosis_test_exact": v2_diag,
                "beats_diagnosis_exact": bool(base_diag is not None and v2_diag > float(base_diag)),
                "ties_or_beats_diagnosis_exact": bool(base_diag is not None and v2_diag >= float(base_diag)),
                "baseline_next_action_test_exact": base_next,
                "v2_next_action_test_exact": v2_next,
                "beats_next_action_exact": bool(base_next is not None and v2_next > float(base_next)),
                "ties_or_beats_next_action_exact": bool(base_next is not None and v2_next >= float(base_next)),
            }
        )

    diagnosis_artifact = model_dir / "diagnosis_label_classifier.joblib"
    next_action_artifact = model_dir / "next_action_classifier.joblib"
    metadata_path = model_dir / "metadata.json"
    report_path = model_dir / "eval_report.json"
    summary_path = model_dir / "eval_summary.txt"
    candidates_path = model_dir / "candidate_report.json"
    errors_path = model_dir / "validation_errors.jsonl"

    joblib.dump(diagnosis_model, diagnosis_artifact)
    joblib.dump(next_action_model, next_action_artifact)

    report: Dict[str, Any] = {
        "schema_version": "myway_diagnosis_classifier_training_report_v2",
        "model_name": "myway_diagnosis_classifier_phase_a_v2",
        "created_at": utc_now_iso(),
        "data_root": str(data_root).replace("\\", "/"),
        "model_dir": str(model_dir).replace("\\", "/"),
        "environment": {
            "python": sys.version,
            "platform": platform.platform(),
            "sklearn": sklearn.__version__,
            "joblib": joblib.__version__,
            "cwd": str(Path.cwd()),
        },
        "examples": {split: len(examples_by_split[split]) for split in SPLITS},
        "train_label_distribution": {
            "diagnosis": dict(Counter(train_diag_y)),
            "next_action": dict(Counter(train_next_y)),
        },
        "selected_candidates": {
            "diagnosis": diagnosis_candidate_name,
            "next_action": next_candidate_name,
        },
        "candidate_results": {
            "diagnosis": diagnosis_candidate_results,
            "next_action": next_candidate_results,
        },
        "evaluation": evaluation,
        "validation_error_count": len(all_validation_errors),
        "baseline_reference": baseline_reference,
        "baseline_comparison": baseline_comparison,
        "artifacts": {
            "diagnosis_label_classifier": str(diagnosis_artifact).replace("\\", "/"),
            "next_action_classifier": str(next_action_artifact).replace("\\", "/"),
            "metadata": str(metadata_path).replace("\\", "/"),
            "eval_report": str(report_path).replace("\\", "/"),
            "eval_summary": str(summary_path).replace("\\", "/"),
            "candidate_report": str(candidates_path).replace("\\", "/"),
            "predictions_dir": str(predictions_dir).replace("\\", "/"),
            "validation_errors": str(errors_path).replace("\\", "/"),
        },
        "notes": [
            "This is a stronger CPU-friendly diagnosis classifier sweep, not the final generative 3-model system.",
            "The model is suitable for service integration and shadow-mode comparison if schema validation remains clean.",
            "If test diagnosis accuracy does not beat the deterministic baseline, keep this artifact shadow-only and expand/balance the dataset.",
            "Probe Contract remains a structured-generation task and should not be replaced by this classifier approach.",
        ],
    }

    metadata = {
        "schema_version": "myway_diagnosis_classifier_metadata_v2",
        "model_name": report["model_name"],
        "created_at": report["created_at"],
        "selected_candidates": report["selected_candidates"],
        "diagnosis_labels": sorted(DIAGNOSIS_LABELS),
        "diagnosis_next_actions": sorted(DIAGNOSIS_NEXT_ACTIONS),
        "input_contract": "DiagnosisModelInput",
        "output_contract": "DiagnosisModelOutput",
        "output_schema_version": "diagnosis_model_output_v1",
        "feature_builder": "build_feature_text_v2",
        "artifact_files": report["artifacts"],
        "test_metrics": evaluation["test"],
        "baseline_comparison": baseline_comparison,
    }

    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    candidates_path.write_text(
        json.dumps(report["candidate_results"], ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    with errors_path.open("w", encoding="utf-8") as f:
        for err in all_validation_errors:
            f.write(json.dumps(err, ensure_ascii=False, sort_keys=True) + "\n")
    write_summary(report, summary_path)

    print("\nDone. Diagnosis classifier v2 training complete.")
    print(f"Validation errors: {len(all_validation_errors)}")
    print(f"Selected diagnosis candidate: {diagnosis_candidate_name}")
    print(f"Selected next_action candidate: {next_candidate_name}")
    print(f"Test diagnosis exact: {evaluation['test']['exact_rates']['diagnosis_exact']}")
    print(f"Test next_action exact: {evaluation['test']['exact_rates']['next_action_exact']}")
    if baseline_reference.get("available"):
        print(f"Baseline diagnosis test exact: {baseline_reference.get('diagnosis_test_exact')}")
        print(f"Baseline next_action test exact: {baseline_reference.get('next_action_test_exact')}")
        print(f"Beats diagnosis baseline: {baseline_comparison.get('beats_diagnosis_exact')}")
        print(f"Beats next_action baseline: {baseline_comparison.get('beats_next_action_exact')}")
    print(f"Model dir: {model_dir}")
    print(f"Summary: {summary_path}")
    print(f"Report: {report_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
