#!/usr/bin/env python
"""Local MyWay Diagnosis Model service.

Loads the current swappable artifact from models/diagnosis/phase-a-v1 and
serves DiagnosisModelInput -> DiagnosisModelOutput over a tiny stdlib HTTP API.

Endpoints:
  GET  /health
  POST /predict   body: DiagnosisModelInput OR {"input": DiagnosisModelInput}
"""

from __future__ import annotations

import copy
import json
import os
import traceback
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib

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

SERVICE_NAME = "myway_diagnosis_local_service"
DEFAULT_PORT = 8011


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def resolve_model_dir() -> Path:
    configured = os.environ.get("MYWAY_DIAGNOSIS_MODEL_PATH", "models/diagnosis/phase-a-v1")
    path = Path(configured)
    if not path.is_absolute():
        path = repo_root() / path
    return path


def clamp01(value: Any, fallback: float = 0.0) -> float:
    try:
        x = float(value)
    except Exception:
        x = fallback
    if x < 0:
        return 0.0
    if x > 1:
        return 1.0
    return x


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


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def build_feature_text(input_obj: Dict[str, Any]) -> str:
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
                chunks.append(f"evidence_{key}={evidence.get(key)}")

        hits = evaluation.get("misconception_hits")
        if isinstance(hits, list):
            chunks.extend(flatten_strings(hits, "misconception_hits"))

    chunks.append("json=" + compact_json(input_obj))
    return "\n".join(chunks)


def confidence_for_label(model: Any, text: str, label: str, fallback: float = 0.55) -> float:
    try:
        if hasattr(model, "predict_proba"):
            probs = model.predict_proba([text])[0]
            classes = list(getattr(model, "classes_", []))
            if label in classes:
                return clamp01(probs[classes.index(label)], fallback)
            return clamp01(max(probs), fallback)
    except Exception:
        pass
    return fallback


def suggested_question_for(input_obj: Dict[str, Any], next_action: str) -> Optional[str]:
    if next_action != "ask_clarifying_question":
        return None
    if input_obj.get("input_kind") == "user_message":
        return "What part should MyWay check first?"
    return "Can you explain how you got that answer?"


class DiagnosisModelService:
    def __init__(self) -> None:
        self.model_dir = resolve_model_dir()
        self.metadata = self._read_json(self.model_dir / "metadata.json")
        self.diagnosis_model = joblib.load(self.model_dir / "diagnosis_label_classifier.joblib")
        self.next_action_model = joblib.load(self.model_dir / "next_action_classifier.joblib")
        self.model_name = str(self.metadata.get("model_name") or "myway_diagnosis_classifier_phase_a_v1")

    @staticmethod
    def _read_json(path: Path) -> Dict[str, Any]:
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

    def predict(self, input_obj: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        text = build_feature_text(input_obj)
        diagnosis = str(self.diagnosis_model.predict([text])[0])
        next_action = str(self.next_action_model.predict([text])[0])

        if diagnosis not in DIAGNOSIS_LABELS:
            diagnosis = "unknown"
        if next_action not in DIAGNOSIS_NEXT_ACTIONS:
            next_action = "ask_clarifying_question"

        diagnosis_confidence = confidence_for_label(self.diagnosis_model, text, diagnosis, fallback=0.5)
        next_action_confidence = confidence_for_label(self.next_action_model, text, next_action, fallback=0.5)

        output = {
            "schema_version": "diagnosis_model_output_v1",
            "diagnosis": diagnosis,
            "diagnosis_confidence": round(diagnosis_confidence, 4),
            "next_action": next_action,
            "next_action_confidence": round(next_action_confidence, 4),
            "suggested_question": suggested_question_for(input_obj, next_action),
        }
        meta = {
            "service_name": SERVICE_NAME,
            "model_name": self.model_name,
            "model_dir": str(self.model_dir),
            "feature_builder": "diagnosis_build_feature_text_phase_a_v1",
        }
        return output, meta


SERVICE = DiagnosisModelService()


class Handler(BaseHTTPRequestHandler):
    server_version = "MyWayDiagnosisService/1.0"

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
                raise ValueError("Request body must be DiagnosisModelInput or {input: DiagnosisModelInput}.")
            output, meta = SERVICE.predict(input_obj)
            self._send_json(200, {"ok": True, "output": output, "meta": meta})
        except Exception as exc:
            self._send_json(500, {
                "ok": False,
                "error": str(exc),
                "traceback": traceback.format_exc().splitlines()[-8:],
            })

    def log_message(self, fmt: str, *args: Any) -> None:
        if os.environ.get("MYWAY_SERVICE_QUIET") == "1":
            return
        super().log_message(fmt, *args)


def main() -> int:
    host = os.environ.get("MYWAY_DIAGNOSIS_HOST", "127.0.0.1")
    port = int(os.environ.get("MYWAY_DIAGNOSIS_PORT", str(DEFAULT_PORT)))
    print(f"{SERVICE_NAME} loaded {SERVICE.model_name} from {SERVICE.model_dir}")
    print(f"Listening on http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
