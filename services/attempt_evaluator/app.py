#!/usr/bin/env python
"""Local MyWay Attempt Evaluator service.

Loads models/attempt-evaluator/phase-a-v1 and serves
ProbeAttemptEvaluatorInput -> ProbeAttemptEvaluatorOutput.
"""

from __future__ import annotations

import copy
import json
import os
import traceback
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Tuple

import joblib
from sklearn.metrics.pairwise import cosine_similarity

SERVICE_NAME = "myway_attempt_evaluator_local_service"
DEFAULT_PORT = 8013

VALID_NEXT_ACTIONS = {
    "give_feedback",
    "target_misconception",
    "generate_followup_probe",
    "ask_clarifying_question",
    "summarize_progress",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def resolve_model_dir() -> Path:
    configured = os.environ.get("MYWAY_ATTEMPT_EVALUATOR_MODEL_PATH", "models/attempt-evaluator/phase-a-v1")
    path = Path(configured)
    if not path.is_absolute():
        path = repo_root() / path
    return path


def clamp01(value: Any, fallback: float = 0.0) -> float:
    try:
        x = float(value)
    except Exception:
        x = fallback
    return max(0.0, min(1.0, x))


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def flatten_strings(value: Any, prefix: str = "") -> List[str]:
    chunks: List[str] = []
    if value is None:
        return chunks
    if isinstance(value, str):
        if value.strip():
            chunks.append(f"{prefix}: {value.strip()}" if prefix else value.strip())
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

    delivery_context = input_obj.get("delivery_context")
    if isinstance(delivery_context, dict):
        chunks.extend(flatten_strings(delivery_context, "delivery_context"))

    chunks.append("json=" + compact_json(input_obj))
    return "\n".join(chunks)


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def classifier_confidence(model: Any, x_row: Any, label: str, fallback: float = 0.55) -> float:
    try:
        if hasattr(model, "predict_proba"):
            probs = model.predict_proba(x_row)[0]
            classes = list(getattr(model, "classes_", []))
            if label in classes:
                return clamp01(probs[classes.index(label)], fallback)
            return clamp01(max(probs), fallback)
    except Exception:
        pass
    return fallback


class AttemptEvaluatorService:
    def __init__(self) -> None:
        self.model_dir = resolve_model_dir()
        self.metadata = self._read_json(self.model_dir / "metadata.json")
        self.model_name = str(self.metadata.get("model_name") or "myway_attempt_evaluator_hybrid_phase_a_v1")
        self.vectorizer = joblib.load(self.model_dir / "vectorizer.joblib")
        self.train_matrix = joblib.load(self.model_dir / "train_matrix.joblib")
        self.correctness_model = joblib.load(self.model_dir / "correctness_model.joblib")
        self.next_action_model = joblib.load(self.model_dir / "next_action_model.joblib")
        self.lucky_model = joblib.load(self.model_dir / "lucky_model.joblib")
        self.verification_model = joblib.load(self.model_dir / "verification_model.joblib")
        self.train_records = read_jsonl(self.model_dir / "train_records.jsonl")
        if not self.train_records:
            raise RuntimeError(f"No train_records found in {self.model_dir}")

    @staticmethod
    def _read_json(path: Path) -> Dict[str, Any]:
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

    def predict(self, input_obj: Dict[str, Any], k: int = 5) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        text = build_feature_text(input_obj)
        x_row = self.vectorizer.transform([text])
        sims = cosine_similarity(x_row, self.train_matrix)[0]
        ranked = sims.argsort()[::-1][: max(1, k)]
        best_i = int(ranked[0])
        best = self.train_records[best_i]
        output = copy.deepcopy(best.get("output") or {})

        correctness = clamp01(self.correctness_model.predict(x_row)[0])
        next_action = str(self.next_action_model.predict(x_row)[0])
        lucky = bool(int(self.lucky_model.predict(x_row)[0]))
        verify = bool(int(self.verification_model.predict(x_row)[0]))
        if next_action not in VALID_NEXT_ACTIONS:
            next_action = "give_feedback"

        output["schema_version"] = "probe_attempt_evaluator_output_v1"
        output["correctness"] = round(correctness, 4)
        output["next_action"] = next_action
        output["next_action_confidence"] = round(classifier_confidence(self.next_action_model, x_row, next_action), 4)

        ev = output.get("understanding_evidence") if isinstance(output.get("understanding_evidence"), dict) else {}
        ev["evidence_strength"] = round(max(clamp01(ev.get("evidence_strength"), correctness), correctness), 4)
        ev["may_be_lucky_guess"] = lucky
        ev["possible_guess"] = lucky
        ev["needs_verification_probe"] = verify
        ev.setdefault("supports_understanding", correctness >= 0.75 and not verify)
        ev.setdefault("supports_gap", correctness < 0.75 or verify)
        ev.setdefault("informational_only", False)
        if verify and not ev.get("verification_reason"):
            ev["verification_reason"] = "The model prediction suggests one more related probe is needed before treating this as stable understanding."
        output["understanding_evidence"] = ev

        if not isinstance(output.get("misconception_hits"), list):
            output["misconception_hits"] = []
        if not isinstance(output.get("correctness_summary"), str) or not output.get("correctness_summary", "").strip():
            output["correctness_summary"] = "The attempt was evaluated against the probe answer key and misconception markers."

        nearest = []
        for idx in ranked:
            idx = int(idx)
            row = self.train_records[idx]
            row_output = row.get("output") if isinstance(row.get("output"), dict) else {}
            nearest.append({
                "example_id": row.get("example_id"),
                "similarity": round(float(sims[idx]), 6),
                "correctness": row_output.get("correctness"),
                "next_action": row_output.get("next_action"),
            })

        meta = {
            "service_name": SERVICE_NAME,
            "model_name": self.model_name,
            "model_dir": str(self.model_dir),
            "strategy": "tfidf_retrieval_plus_lightweight_correctness_action_models",
            "nearest_train_example_id": best.get("example_id"),
            "similarity": round(float(sims[best_i]), 6),
            "nearest_neighbors": nearest,
        }
        return output, meta


SERVICE = AttemptEvaluatorService()


class Handler(BaseHTTPRequestHandler):
    server_version = "MyWayAttemptEvaluatorService/1.0"

    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/health":
            self._send_json(404, {"ok": False, "error": "not_found"})
            return
        self._send_json(200, {
            "ok": True,
            "service_name": SERVICE_NAME,
            "model_name": SERVICE.model_name,
            "model_dir": str(SERVICE.model_dir),
            "train_records": len(SERVICE.train_records),
            "time": now_iso(),
        })

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/predict":
            self._send_json(404, {"ok": False, "error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8")
            payload = json.loads(raw) if raw else {}
            input_obj = payload.get("input") if isinstance(payload, dict) and isinstance(payload.get("input"), dict) else payload
            if not isinstance(input_obj, dict):
                raise ValueError("Request body must be ProbeAttemptEvaluatorInput or {input: ProbeAttemptEvaluatorInput}.")
            k = int(payload.get("k", 5)) if isinstance(payload, dict) else 5
            output, meta = SERVICE.predict(input_obj, k=k)
            self._send_json(200, {"ok": True, "output": output, "meta": meta})
        except Exception as exc:
            self._send_json(500, {"ok": False, "error": str(exc), "traceback": traceback.format_exc().splitlines()[-8:]})

    def log_message(self, fmt: str, *args: Any) -> None:
        if os.environ.get("MYWAY_SERVICE_QUIET") == "1":
            return
        super().log_message(fmt, *args)


def main() -> int:
    host = os.environ.get("MYWAY_ATTEMPT_EVALUATOR_HOST", "127.0.0.1")
    port = int(os.environ.get("MYWAY_ATTEMPT_EVALUATOR_PORT", str(DEFAULT_PORT)))
    print(f"{SERVICE_NAME} loaded {SERVICE.model_name} from {SERVICE.model_dir}")
    print(f"Listening on http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
