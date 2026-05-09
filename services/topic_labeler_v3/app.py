import re
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Literal

import joblib
import torch
from fastapi import FastAPI
from pydantic import BaseModel, Field
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


PROJECT_ROOT = Path(__file__).resolve().parents[2]

REFERENCE_TYPE_MODEL_PATH = (
    PROJECT_ROOT
    / "models"
    / "topic-labeler"
    / "v3"
    / "reference-type-classifier"
    / "topic_reference_type_classifier.joblib"
)

LABEL_GENERATOR_MODEL_DIR = (
    PROJECT_ROOT
    / "models"
    / "topic-labeler"
    / "v3"
    / "label-generator-t5-small-message-only"
)

MAX_INPUT_LENGTH = 384
MAX_LABEL_TOKENS = 32


TopicReferenceType = Literal[
    "explicit_topic_reference",
    "active_topic_reference",
    "unclear_topic",
    "no_topic",
]


RouteDecision = Literal[
    "stay_active",
    "switch_existing",
    "create_new",
    "clarify_topic_intent",
    "clarify_no_topic",
    "error_unknown_reference_type",
]


CANONICAL_ALIAS_MAP: dict[str, str] = {
    "sign in handoff": "OAuth Flow",
    "signin handoff": "OAuth Flow",
    "login handoff": "OAuth Flow",
    "login redirect": "OAuth Flow",
    "login redirect thing": "OAuth Flow",
    "authorization redirect": "OAuth Flow",
    "authorization flow": "OAuth Flow",
    "oauth": "OAuth Flow",

    "electrical panel": "Circuit Breakers",
    "breaker panel": "Circuit Breakers",
    "breaker panel thing": "Circuit Breakers",
    "safety switch": "Circuit Breakers",
    "thing in the electrical panel": "Circuit Breakers",
    "switch that cuts power": "Circuit Breakers",

    "customer value": "Lifetime Value",
    "customer value over time": "Lifetime Value",
    "how much a customer is worth": "Lifetime Value",
    "customer worth": "Lifetime Value",

    "past tense": "Preterite vs Imperfect",
    "which past tense to use": "Preterite vs Imperfect",
    "two past tenses": "Preterite vs Imperfect",

    "required vs sufficient conditions": "Necessary vs Sufficient Conditions",
    "required versus sufficient conditions": "Necessary vs Sufficient Conditions",
    "needed vs enough": "Necessary vs Sufficient Conditions",
    "necessary and sufficient": "Necessary vs Sufficient Conditions",

    "flour or liquid": "Measuring Ingredients",
    "measurement ingredients": "Measuring Ingredients",
    "measuring cups": "Measuring Ingredients",
    "how much flour or liquid to use": "Measuring Ingredients",

    "plea deals": "Plea Bargains",
    "plea deal": "Plea Bargains",

    "vote voting": "Electoral College",
    "electoral vote thing": "Electoral College",
    "electoral vote": "Electoral College",

    "seeing only what supports your view": "Confirmation Bias",
    "only noticing evidence that agrees": "Confirmation Bias",

    "finding similar ideas with vectors": "Vector Search",
    "vectors": "Vector Search",
}


class TopicLabelRequest(BaseModel):
    message: str = Field(..., min_length=1)
    active_topic_name: str | None = None
    current_topic_names: list[str] = Field(default_factory=list)
    previous_user_messages: list[str] = Field(default_factory=list)


class ModelPrediction(BaseModel):
    topic_reference_type: TopicReferenceType
    extracted_label: str | None = None


class RouteResult(BaseModel):
    route_decision: RouteDecision
    topic_reference_type: TopicReferenceType | str
    extracted_label: str | None = None
    matched_topic_name: str | None = None
    match_type: str | None = None
    score: float | None = None
    sequence_similarity: float | None = None
    token_f1: float | None = None
    reason: str


class TopicLabelResponse(BaseModel):
    ok: bool
    model_version: str
    model_prediction: ModelPrediction
    route: RouteResult


app = FastAPI(title="MyWay Topic Labeler V3", version="0.1.0")

_reference_type_classifier = None
_tokenizer = None
_label_generator = None
_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def normalize_text(text: str | None) -> str:
    if not text:
        return ""

    normalized = text.lower().strip()

    replacements = {
        "’": "'",
        "“": '"',
        "”": '"',
        "&": " and ",
        "_": " ",
        "-": " ",
        "/": " ",
        " vs. ": " vs ",
        " versus ": " vs ",
    }

    for old, new in replacements.items():
        normalized = normalized.replace(old, new)

    normalized = re.sub(r"[^a-z0-9+#.\s]", " ", normalized)
    normalized = re.sub(r"\b(the|a|an|topic|concept|idea|about)\b", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()

    return normalized


def title_case_label(text: str) -> str:
    small_words = {"and", "or", "vs", "of", "in", "on", "to", "for", "the", "a", "an"}
    words = text.split()
    output: list[str] = []

    for index, word in enumerate(words):
        lower = word.lower()

        if lower == "vs":
            output.append("vs")
        elif lower in {"api", "json", "sql", "oauth", "dna", "ph"}:
            output.append(lower.upper() if lower != "oauth" else "OAuth")
        elif index > 0 and lower in small_words:
            output.append(lower)
        else:
            output.append(word[:1].upper() + word[1:].lower())

    return " ".join(output)


def sequence_similarity(a: str, b: str) -> float:
    a_norm = normalize_text(a)
    b_norm = normalize_text(b)

    if not a_norm and not b_norm:
        return 1.0

    if not a_norm or not b_norm:
        return 0.0

    return SequenceMatcher(None, a_norm, b_norm).ratio()


def token_f1(a: str, b: str) -> float:
    a_tokens = set(normalize_text(a).split())
    b_tokens = set(normalize_text(b).split())

    if not a_tokens and not b_tokens:
        return 1.0

    if not a_tokens or not b_tokens:
        return 0.0

    overlap = a_tokens & b_tokens

    if not overlap:
        return 0.0

    precision = len(overlap) / len(b_tokens)
    recall = len(overlap) / len(a_tokens)

    return 2 * precision * recall / (precision + recall)


def format_for_reference_type_classifier(data: TopicLabelRequest) -> str:
    active_topic_name = data.active_topic_name or "NONE"

    return "\n".join(
        [
            f"message: {data.message}",
            f"active_topic_name: {active_topic_name}",
            f"current_topic_names: {' | '.join(data.current_topic_names)}",
            f"previous_user_messages: {' | '.join(data.previous_user_messages)}",
        ]
    )


def format_for_label_generator(data: TopicLabelRequest) -> str:
    return "\n".join(
        [
            "Task: Extract the best concise topic label from the user's message.",
            "",
            f"message: {data.message}",
            "",
            "Return only the topic label.",
        ]
    )


def load_models() -> None:
    global _reference_type_classifier
    global _tokenizer
    global _label_generator

    if _reference_type_classifier is not None and _tokenizer is not None and _label_generator is not None:
        return

    if not REFERENCE_TYPE_MODEL_PATH.exists():
        raise FileNotFoundError(f"Missing reference-type model: {REFERENCE_TYPE_MODEL_PATH}")

    if not LABEL_GENERATOR_MODEL_DIR.exists():
        raise FileNotFoundError(f"Missing T5 label-generator model: {LABEL_GENERATOR_MODEL_DIR}")

    _reference_type_classifier = joblib.load(REFERENCE_TYPE_MODEL_PATH)
    _tokenizer = AutoTokenizer.from_pretrained(LABEL_GENERATOR_MODEL_DIR)
    _label_generator = AutoModelForSeq2SeqLM.from_pretrained(LABEL_GENERATOR_MODEL_DIR)
    _label_generator.to(_device)
    _label_generator.eval()


@app.on_event("startup")
def startup_event() -> None:
    load_models()


def predict_topic_reference_and_label(data: TopicLabelRequest) -> ModelPrediction:
    load_models()

    assert _reference_type_classifier is not None
    assert _tokenizer is not None
    assert _label_generator is not None

    classifier_input = format_for_reference_type_classifier(data)
    topic_reference_type = _reference_type_classifier.predict([classifier_input])[0]

    extracted_label: str | None = None

    if topic_reference_type == "explicit_topic_reference":
        generator_input = format_for_label_generator(data)

        encoded = _tokenizer(
            generator_input,
            return_tensors="pt",
            max_length=MAX_INPUT_LENGTH,
            truncation=True,
        )

        encoded = {key: value.to(_device) for key, value in encoded.items()}

        with torch.no_grad():
            generated = _label_generator.generate(
                **encoded,
                max_new_tokens=MAX_LABEL_TOKENS,
                num_beams=4,
                early_stopping=True,
            )

        extracted_label = _tokenizer.decode(
            generated[0],
            skip_special_tokens=True,
        ).strip()

        if not extracted_label:
            extracted_label = None

    return ModelPrediction(
        topic_reference_type=topic_reference_type,
        extracted_label=extracted_label,
    )


def find_exact_match(extracted_label: str, current_topic_names: list[str]) -> dict[str, Any] | None:
    extracted_norm = normalize_text(extracted_label)

    for topic in current_topic_names:
        if normalize_text(topic) == extracted_norm:
            return {
                "matched_topic_name": topic,
                "match_type": "exact_existing_topic",
                "score": 1.0,
            }

    return None


def find_alias_match(extracted_label: str, current_topic_names: list[str]) -> dict[str, Any] | None:
    extracted_norm = normalize_text(extracted_label)

    if extracted_norm not in CANONICAL_ALIAS_MAP:
        return None

    canonical = CANONICAL_ALIAS_MAP[extracted_norm]

    if any(normalize_text(topic) == normalize_text(canonical) for topic in current_topic_names):
        return {
            "matched_topic_name": canonical,
            "match_type": "alias_exact_to_existing_topic",
            "score": 1.0,
        }

    return {
        "matched_topic_name": canonical,
        "match_type": "alias_to_new_canonical_topic",
        "score": 0.96,
    }


def find_fuzzy_match(extracted_label: str, current_topic_names: list[str]) -> dict[str, Any] | None:
    best_topic = None
    best_score = 0.0
    best_seq = 0.0
    best_token = 0.0

    for topic in current_topic_names:
        seq = sequence_similarity(extracted_label, topic)
        tok = token_f1(extracted_label, topic)
        score = max(seq, tok)

        if score > best_score:
            best_topic = topic
            best_score = score
            best_seq = seq
            best_token = tok

    if best_topic is None:
        return None

    if best_score >= 0.88:
        return {
            "matched_topic_name": best_topic,
            "match_type": "fuzzy_existing_topic",
            "score": round(best_score, 4),
            "sequence_similarity": round(best_seq, 4),
            "token_f1": round(best_token, 4),
        }

    return None


def route_topic(data: TopicLabelRequest, prediction: ModelPrediction) -> RouteResult:
    topic_reference_type = prediction.topic_reference_type
    extracted_label = prediction.extracted_label

    if topic_reference_type == "active_topic_reference":
        return RouteResult(
            route_decision="stay_active",
            topic_reference_type=topic_reference_type,
            extracted_label=None,
            matched_topic_name=data.active_topic_name,
            reason="Model predicted active_topic_reference, so router keeps the active topic.",
        )

    if topic_reference_type == "no_topic":
        return RouteResult(
            route_decision="clarify_no_topic",
            topic_reference_type=topic_reference_type,
            extracted_label=None,
            matched_topic_name=None,
            reason="Model predicted no_topic, so router should ask a grounding/clarifying question instead of creating a topic.",
        )

    if topic_reference_type == "unclear_topic":
        return RouteResult(
            route_decision="clarify_topic_intent",
            topic_reference_type=topic_reference_type,
            extracted_label=None,
            matched_topic_name=None,
            reason="Model predicted unclear_topic, so router should ask whether to stay, switch, or create.",
        )

    if topic_reference_type != "explicit_topic_reference":
        return RouteResult(
            route_decision="error_unknown_reference_type",
            topic_reference_type=topic_reference_type,
            extracted_label=extracted_label,
            matched_topic_name=None,
            reason=f"Unknown topic_reference_type: {topic_reference_type}",
        )

    if not extracted_label:
        return RouteResult(
            route_decision="clarify_topic_intent",
            topic_reference_type=topic_reference_type,
            extracted_label=None,
            matched_topic_name=None,
            reason="Model predicted explicit_topic_reference but produced no extracted_label.",
        )

    exact = find_exact_match(extracted_label, data.current_topic_names)
    if exact:
        return RouteResult(
            route_decision="switch_existing",
            topic_reference_type=topic_reference_type,
            extracted_label=extracted_label,
            reason="Extracted label exactly matched an existing topic.",
            **exact,
        )

    alias = find_alias_match(extracted_label, data.current_topic_names)
    if alias:
        if alias["match_type"] == "alias_exact_to_existing_topic":
            return RouteResult(
                route_decision="switch_existing",
                topic_reference_type=topic_reference_type,
                extracted_label=extracted_label,
                reason="Extracted label matched an alias for an existing topic.",
                **alias,
            )

        return RouteResult(
            route_decision="create_new",
            topic_reference_type=topic_reference_type,
            extracted_label=extracted_label,
            reason="Extracted label matched a known canonical alias, but the canonical topic does not exist yet.",
            **alias,
        )

    fuzzy = find_fuzzy_match(extracted_label, data.current_topic_names)
    if fuzzy:
        return RouteResult(
            route_decision="switch_existing",
            topic_reference_type=topic_reference_type,
            extracted_label=extracted_label,
            reason="Extracted label fuzzily matched an existing topic.",
            **fuzzy,
        )

    return RouteResult(
        route_decision="create_new",
        topic_reference_type=topic_reference_type,
        extracted_label=extracted_label,
        matched_topic_name=title_case_label(extracted_label),
        match_type="no_existing_match",
        score=None,
        reason="Explicit topic reference had no exact, alias, or fuzzy match to current topics, so router would create a new topic.",
    )


@app.get("/health")
def health() -> dict[str, Any]:
    models_loaded = (
        _reference_type_classifier is not None
        and _tokenizer is not None
        and _label_generator is not None
    )

    return {
        "ok": True,
        "service": "topic_labeler_v3",
        "models_loaded": models_loaded,
        "device": str(_device),
        "reference_type_model_path": str(REFERENCE_TYPE_MODEL_PATH),
        "label_generator_model_dir": str(LABEL_GENERATOR_MODEL_DIR),
    }


@app.post("/label-topic", response_model=TopicLabelResponse)
def label_topic(request: TopicLabelRequest) -> TopicLabelResponse:
    prediction = predict_topic_reference_and_label(request)
    route = route_topic(request, prediction)

    return TopicLabelResponse(
        ok=True,
        model_version="topic_labeler_v3_reference_classifier_plus_message_only_t5",
        model_prediction=prediction,
        route=route,
    )