from __future__ import annotations

import time
from typing import List, Optional

import torch
from fastapi import FastAPI
from pydantic import BaseModel, Field
from transformers import AutoModelForSequenceClassification, AutoTokenizer


MODEL_DIR = r"C:\Users\willc\projects\MyWay\v1\models\confusion-model\checkpoint-4000"
TOKENIZER_NAME = "allenai/longformer-base-4096"
MODEL_VERSION = "longformer-confusion-insight-checkpoint-4000"
MAX_LENGTH = 256


app = FastAPI(title="MyWay Confusion/Insight Service")


class ScoreRequest(BaseModel):
    user_message: str = Field(..., min_length=1)
    chat_history: Optional[List[str]] = None


class ScoreResponse(BaseModel):
    model_confusion: float
    model_insight: float
    model_version: str
    inference_mode: str
    status: str
    latency_ms: int
    error_message: Optional[str] = None
    raw_logits: List[float]


tokenizer = None
model = None


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def build_model_text(user_message: str, chat_history: Optional[List[str]]) -> str:
    history = chat_history or []
    recent_history = history[-6:]

    if not recent_history:
        return user_message.strip()

    history_text = "\n".join(recent_history).strip()
    return f"Recent conversation:\n{history_text}\n\nCurrent learner message:\n{user_message.strip()}"


@app.on_event("startup")
def load_model() -> None:
    global tokenizer, model

    print("Loading confusion/insight tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)

    print("Loading confusion/insight model...")
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
    model.eval()

    print("Confusion/insight service ready.")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "tokenizer_loaded": tokenizer is not None,
        "model_version": MODEL_VERSION,
    }


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest) -> ScoreResponse:
    started = time.perf_counter()

    try:
        if model is None or tokenizer is None:
            raise RuntimeError("Model or tokenizer is not loaded.")

        text = build_model_text(req.user_message, req.chat_history)

        inputs = tokenizer(
            text,
            truncation=True,
            padding=True,
            max_length=MAX_LENGTH,
            return_tensors="pt",
        )

        with torch.no_grad():
            outputs = model(**inputs)
            logits_tensor = outputs.logits.squeeze()

        if logits_tensor.ndim == 0:
            raw_logits = [float(logits_tensor.item())]
        else:
            raw_logits = [float(x) for x in logits_tensor.tolist()]

        confusion = clamp01(raw_logits[0]) if len(raw_logits) > 0 else 0.0
        insight = clamp01(raw_logits[1]) if len(raw_logits) > 1 else 0.0

        latency_ms = int((time.perf_counter() - started) * 1000)

        return ScoreResponse(
            model_confusion=confusion,
            model_insight=insight,
            model_version=MODEL_VERSION,
            inference_mode="service",
            status="ok",
            latency_ms=latency_ms,
            error_message=None,
            raw_logits=raw_logits,
        )

    except Exception as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)

        return ScoreResponse(
            model_confusion=0.0,
            model_insight=0.0,
            model_version=MODEL_VERSION,
            inference_mode="service",
            status="error",
            latency_ms=latency_ms,
            error_message=str(exc),
            raw_logits=[],
        )