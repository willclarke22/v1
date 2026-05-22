from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import time

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parents[3]

MODEL_PATH = (
    ROOT
    / "models"
    / "confusion-insight"
    / "v1_1"
    / "hybrid_tfidf_features_ridge.joblib"
)

SERVICE_VERSION = "confusion-insight-v1_1"


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


def event_to_dict(event: ConfusionInsightEvent | dict[str, Any]) -> dict[str, Any]:
    if isinstance(event, ConfusionInsightEvent):
        return event.model_dump()

    if isinstance(event, dict):
        return event

    return {}


def render_events(events: list[ConfusionInsightEvent] | list[dict[str, Any]]) -> str:
    if not events:
        return "none"

    rendered: list[str] = []

    for raw_event in events[-3:]:
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
    row = request.model_dump()

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


@app.on_event("startup")
def load_model() -> None:
    global MODEL_BUNDLE, MODEL, MODEL_METADATA

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Could not find confusion/insight model at: {MODEL_PATH}"
        )

    MODEL_BUNDLE = joblib.load(MODEL_PATH)
    MODEL = MODEL_BUNDLE["model"]
    MODEL_METADATA = MODEL_BUNDLE.get("metadata", {})


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok" if MODEL is not None else "error",
        "service_version": SERVICE_VERSION,
        "model_loaded": MODEL is not None,
        "model_path": str(MODEL_PATH),
        "model_version": MODEL_METADATA.get("model_version"),
        "model_family": MODEL_METADATA.get("model_family"),
    }


@app.post("/score", response_model=ScoreResponse)
def score(request: ScoreRequest) -> ScoreResponse:
    start = time.perf_counter()

    try:
        if MODEL is None:
            raise RuntimeError("Model is not loaded.")

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
            model_version=MODEL_METADATA.get(
                "model_version",
                "confusion-insight-v1_1-hybrid-tfidf-features-ridge",
            ),
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
            model_version=MODEL_METADATA.get(
                "model_version",
                "confusion-insight-v1_1-hybrid-tfidf-features-ridge",
            ),
            inference_mode="service",
            status="error",
            latency_ms=latency_ms,
            error_message=str(error),
            raw_scores=None,
        )