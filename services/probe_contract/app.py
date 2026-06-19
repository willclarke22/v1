#!/usr/bin/env python
"""Local MyWay Probe Contract service.

Loads models/probe-contract/phase-a-v1 and serves
ProbeContractModelInput -> ProbeContractModelOutput.
"""

from __future__ import annotations

import copy
import json
import os
import traceback
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import joblib
from sklearn.metrics.pairwise import cosine_similarity

SERVICE_NAME = "myway_probe_contract_local_service"
DEFAULT_PORT = 8012


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def resolve_model_dir() -> Path:
    configured = os.environ.get("MYWAY_PROBE_CONTRACT_MODEL_PATH", "models/probe-contract/phase-a-v1")
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


class ProbeContractService:
    def __init__(self) -> None:
        self.model_dir = resolve_model_dir()
        self.metadata = self._read_json(self.model_dir / "metadata.json")
        self.model_name = str(self.metadata.get("model_name") or "myway_probe_contract_retriever_phase_a_v1")
        self.vectorizer = joblib.load(self.model_dir / "vectorizer.joblib")
        self.train_matrix = joblib.load(self.model_dir / "train_matrix.joblib")
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
        q = self.vectorizer.transform([text])
        sims = cosine_similarity(q, self.train_matrix)[0]
        ranked = sims.argsort()[::-1][: max(1, k)]
        best_i = int(ranked[0])
        best = self.train_records[best_i]
        output = copy.deepcopy(best.get("output") or {})
        output["schema_version"] = "probe_contract_model_output_v1"
        output["confidence"] = round(max(0.2, min(0.95, float(sims[best_i]))), 4)

        nearest = []
        for idx in ranked:
            idx = int(idx)
            row = self.train_records[idx]
            row_output = row.get("output") if isinstance(row.get("output"), dict) else {}
            nearest.append({
                "example_id": row.get("example_id"),
                "similarity": round(float(sims[idx]), 6),
                "probe_type": row_output.get("probe_type"),
                "expected_attempt_type": row_output.get("expected_attempt_type"),
            })

        meta = {
            "service_name": SERVICE_NAME,
            "model_name": self.model_name,
            "model_dir": str(self.model_dir),
            "strategy": "tfidf_nearest_neighbor_structured_output",
            "nearest_train_example_id": best.get("example_id"),
            "similarity": round(float(sims[best_i]), 6),
            "nearest_neighbors": nearest,
        }
        return output, meta


SERVICE = ProbeContractService()


class Handler(BaseHTTPRequestHandler):
    server_version = "MyWayProbeContractService/1.0"

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
                raise ValueError("Request body must be ProbeContractModelInput or {input: ProbeContractModelInput}.")
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
    host = os.environ.get("MYWAY_PROBE_CONTRACT_HOST", "127.0.0.1")
    port = int(os.environ.get("MYWAY_PROBE_CONTRACT_PORT", str(DEFAULT_PORT)))
    print(f"{SERVICE_NAME} loaded {SERVICE.model_name} from {SERVICE.model_dir}")
    print(f"Listening on http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
