from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any, Literal

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MODEL_PATH = (
    ROOT
    / "models"
    / "confusion-insight"
    / "v1_1"
    / "hybrid_tfidf_features_ridge.joblib"
)

SERVICE_VERSION = "confusion-insight-v1_1"
DEFAULT_MODEL_VERSION = "confusion-insight-v1_1-hybrid-tfidf-features-ridge"
MAX_RECENT_EVENTS = 5
RENDERED_RECENT_EVENTS = 3


def get_model_path() -> Path:
    """
    Keep the default local model path stable, but allow an external/GPU runtime
    or a future model folder to point the service at a different artifact without
    changing app code.
    """
    raw = os.getenv("MYWAY_CONFUSION_INSIGHT_MODEL_PATH") or os.getenv(
        "CONFUSION_INSIGHT_MODEL_PATH"
    )

    if raw and raw.strip():
        return Path(raw.strip()).expanduser().resolve()

    return DEFAULT_MODEL_PATH


MODEL_PATH = get_model_path()


class ConfusionInsightEvent(BaseModel):
    event_type: Literal["clarify", "probe", "attempt"] | str | None = None
    topic_label: str | None = None
    diagnosis_label: str | None = None

    clarification_prompt: str | None = None
    clarification_goal: str | None = None

    probe_type: str | None = None
    modality: str | None = None
    probe_prompt: str | None = None
    learning_objective: str | None = None
    expected_attempt_type: str | None = None
    success_marker: str | None = None
    misconception_being_tested: str | None = None

    attempt_type: str | None = None
    evidence: str | None = None


class ScoreRequest(BaseModel):
    input_type: str = "message"
    current_attempt_type: str | None = None
    current_evidence: str

    previous_active_topic_label: str | None = None
    target_topic_label: str | None = None
    topic_transition_type: str = "same_topic"
    topic_similarity: float | None = None

    previous_mode: str = "no_previous"
    is_response_to_clarify: bool = False
    is_response_to_probe: bool = False

    target_topic_recent_events: list[ConfusionInsightEvent] = Field(default_factory=list)

    most_related_topic_label: str | None = None
    most_related_topic_similarity: float | None = None
    most_related_topic_similarity_threshold: float | None = 0.65
    most_related_topic_recent_events: list[ConfusionInsightEvent] = Field(
        default_factory=list
    )

    target_topic_confusion_average: float | None = None
    target_topic_insight_average: float | None = None
    most_related_topic_confusion_average: float | None = None
    most_related_topic_insight_average: float | None = None


class ScoreResponse(BaseModel):
    model_confusion: float | None
    model_insight: float | None
    model_version: str
    inference_mode: Literal["service"]
    status: Literal["ok", "error"]
    latency_ms: float
    error_message: str | None = None
    raw_scores: dict[str, float] | None = None


app = FastAPI(title="MyWay Confusion/Insight Service", version=SERVICE_VERSION)

MODEL_BUNDLE: dict[str, Any] | None = None
MODEL: Any | None = None
MODEL_METADATA: dict[str, Any] = {}
MODEL_LOAD_ERROR: str | None = None
MODEL_LOADED_AT: str | None = None


def clamp_score(value: float) -> float:
    return float(np.clip(value, 0.0, 1.0))


def clean_value(value: Any, fallback: str = "none") -> Any:
    if value is None:
        return fallback

    try:
        if pd.isna(value):
            return fallback
    except Exception:
        pass

    if value == "":
        return fallback

    return value


def model_to_dict(model: BaseModel) -> dict[str, Any]:
    """
    Pydantic v2 uses model_dump(); v1 uses dict(). Supporting both makes the
    service less brittle across local Python environments.
    """
    if hasattr(model, "model_dump"):
        return model.model_dump()

    return model.dict()


def event_to_dict(event: ConfusionInsightEvent | dict[str, Any]) -> dict[str, Any]:
    if isinstance(event, ConfusionInsightEvent):
        return model_to_dict(event)

    if isinstance(event, dict):
        return event

    return {}


def render_events(events: list[ConfusionInsightEvent] | list[dict[str, Any]]) -> str:
    if not events:
        return "none"

    rendered: list[str] = []

    for raw_event in events[-RENDERED_RECENT_EVENTS:]:
        event = event_to_dict(raw_event)

        parts = [
            f"event_type={clean_value(event.get('event_type'))}",
            f"topic_label={clean_value(event.get('topic_label'))}",
            f"diagnosis_label={clean_value(event.get('diagnosis_label'))}",
            f"clarification_goal={clean_value(event.get('clarification_goal'))}",
            f"probe_type={clean_value(event.get('probe_type'))}",
            f"modality={clean_value(event.get('modality'))}",
            f"learning_objective={clean_value(event.get('learning_objective'))}",
            f"success_marker={clean_value(event.get('success_marker'))}",
            f"misconception_being_tested={clean_value(event.get('misconception_being_tested'))}",
            f"attempt_type={clean_value(event.get('attempt_type'))}",
            f"evidence={clean_value(event.get('evidence'))}",
        ]

        rendered.append("; ".join(parts))

    return " | ".join(rendered) if rendered else "none"


def render_training_text(row: dict[str, Any]) -> str:
    target_events = render_events(row.get("target_topic_recent_events") or [])
    related_events = render_events(row.get("most_related_topic_recent_events") or [])

    return f"""
Input type: {clean_value(row.get("input_type"))}
Current attempt type: {clean_value(row.get("current_attempt_type"))}
Current evidence: {clean_value(row.get("current_evidence"))}

Previous active topic: {clean_value(row.get("previous_active_topic_label"))}
Target topic: {clean_value(row.get("target_topic_label"))}
Topic transition type: {clean_value(row.get("topic_transition_type"))}
Topic similarity: {clean_value(row.get("topic_similarity"))}

Previous mode: {clean_value(row.get("previous_mode"))}
Is response to clarify: {clean_value(row.get("is_response_to_clarify"))}
Is response to probe: {clean_value(row.get("is_response_to_probe"))}

Target topic recent events: {target_events}

Most related topic: {clean_value(row.get("most_related_topic_label"))}
Most related topic similarity: {clean_value(row.get("most_related_topic_similarity"))}
Most related topic threshold: {clean_value(row.get("most_related_topic_similarity_threshold"))}
Most related topic recent events: {related_events}

Target topic confusion average: {clean_value(row.get("target_topic_confusion_average"))}
Target topic insight average: {clean_value(row.get("target_topic_insight_average"))}
Most related topic confusion average: {clean_value(row.get("most_related_topic_confusion_average"))}
Most related topic insight average: {clean_value(row.get("most_related_topic_insight_average"))}
""".strip()


def build_dataframe(request: ScoreRequest) -> pd.DataFrame:
    row = model_to_dict(request)

    # Keep feature sizes bounded for fast local CPU inference and predictable
    # future GPU/service behavior.
    row["target_topic_recent_events"] = (row.get("target_topic_recent_events") or [])[
        -MAX_RECENT_EVENTS:
    ]
    row["most_related_topic_recent_events"] = (
        row.get("most_related_topic_recent_events") or []
    )[-MAX_RECENT_EVENTS:]

    row["training_text"] = render_training_text(row)
    row["target_topic_recent_event_count"] = len(
        row.get("target_topic_recent_events") or []
    )
    row["most_related_topic_recent_event_count"] = len(
        row.get("most_related_topic_recent_events") or []
    )

    df = pd.DataFrame([row])

    categorical_columns = [
        "input_type",
        "current_attempt_type",
        "previous_active_topic_label",
        "target_topic_label",
        "topic_transition_type",
        "previous_mode",
        "is_response_to_clarify",
        "is_response_to_probe",
        "most_related_topic_label",
    ]

    numeric_columns = [
        "topic_similarity",
        "most_related_topic_similarity",
        "most_related_topic_similarity_threshold",
        "target_topic_confusion_average",
        "target_topic_insight_average",
        "most_related_topic_confusion_average",
        "most_related_topic_insight_average",
        "target_topic_recent_event_count",
        "most_related_topic_recent_event_count",
    ]

    for column in categorical_columns:
        df[column] = df[column].apply(lambda value: str(clean_value(value)))

    for column in numeric_columns:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    return df


def get_model_version() -> str:
    return str(MODEL_METADATA.get("model_version") or DEFAULT_MODEL_VERSION)


def load_model_bundle() -> None:
    global MODEL_BUNDLE, MODEL, MODEL_METADATA, MODEL_LOAD_ERROR, MODEL_LOADED_AT

    MODEL_LOAD_ERROR = None

    if not MODEL_PATH.exists():
        # Keep startup strict: the worker should fail clearly if the model artifact
        # is missing, rather than serving misleading fallback scores.
        raise FileNotFoundError(
            f"Could not find confusion/insight model at: {MODEL_PATH}"
        )

    bundle = joblib.load(MODEL_PATH)
    model = bundle.get("model") if isinstance(bundle, dict) else None

    if model is None:
        raise ValueError("Model bundle did not contain a 'model' entry.")

    MODEL_BUNDLE = bundle
    MODEL = model
    MODEL_METADATA = bundle.get("metadata", {}) if isinstance(bundle, dict) else {}
    MODEL_LOADED_AT = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@app.on_event("startup")
def load_model() -> None:
    try:
        load_model_bundle()
    except Exception as error:
        global MODEL_LOAD_ERROR
        MODEL_LOAD_ERROR = str(error)
        raise


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": MODEL is not None and MODEL_LOAD_ERROR is None,
        "status": "ok" if MODEL is not None and MODEL_LOAD_ERROR is None else "error",
        "service_version": SERVICE_VERSION,
        "model_loaded": MODEL is not None,
        "model_load_error": MODEL_LOAD_ERROR,
        "model_path": str(MODEL_PATH),
        "model_version": get_model_version(),
        "model_family": MODEL_METADATA.get("model_family"),
        "model_loaded_at": MODEL_LOADED_AT,
        "inference_mode": "service",
        "request_schema": "structured_v1_1",
    }


@app.post("/score", response_model=ScoreResponse)
def score(request: ScoreRequest) -> ScoreResponse:
    start = time.perf_counter()

    try:
        if MODEL is None:
            raise RuntimeError(MODEL_LOAD_ERROR or "Model is not loaded.")

        if not request.current_evidence.strip():
            raise ValueError("current_evidence is required.")

        df = build_dataframe(request)
        raw_prediction = MODEL.predict(df)[0]

        raw_confusion = float(raw_prediction[0])
        raw_insight = float(raw_prediction[1])

        model_confusion = clamp_score(raw_confusion)
        model_insight = clamp_score(raw_insight)

        latency_ms = (time.perf_counter() - start) * 1000

        return ScoreResponse(
            model_confusion=model_confusion,
            model_insight=model_insight,
            model_version=get_model_version(),
            inference_mode="service",
            status="ok",
            latency_ms=latency_ms,
            error_message=None,
            raw_scores={
                "confusion": raw_confusion,
                "insight": raw_insight,
            },
        )

    except Exception as error:
        latency_ms = (time.perf_counter() - start) * 1000

        return ScoreResponse(
            model_confusion=None,
            model_insight=None,
            model_version=get_model_version(),
            inference_mode="service",
            status="error",
            latency_ms=latency_ms,
            error_message=str(error),
            raw_scores=None,
        )
