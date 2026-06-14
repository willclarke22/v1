import json
import re
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import joblib
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


PROJECT_ROOT = Path.cwd()

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


TopicLabelInput = dict[str, Any]


# Simple hand-built aliases for first router prototype.
# Later, this should be expanded with embeddings, historical topic aliases, and learned mappings.
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
    output = []

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


def format_for_reference_type_classifier(data: TopicLabelInput) -> str:
    message = data.get("message") or ""
    active_topic_name = data.get("active_topic_name") or "NONE"
    current_topic_names = data.get("current_topic_names") or []
    previous_user_messages = data.get("previous_user_messages") or []

    return "\n".join(
        [
            f"message: {message}",
            f"active_topic_name: {active_topic_name}",
            f"current_topic_names: {' | '.join(current_topic_names)}",
            f"previous_user_messages: {' | '.join(previous_user_messages)}",
        ]
    )


def format_for_label_generator(data: TopicLabelInput) -> str:
    message = data.get("message") or ""

    return "\n".join(
        [
            "Task: Extract the best concise topic label from the user's message.",
            "",
            f"message: {message}",
            "",
            "Return only the topic label.",
        ]
    )


def load_models():
    if not REFERENCE_TYPE_MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Missing reference-type model: {REFERENCE_TYPE_MODEL_PATH}"
        )

    if not LABEL_GENERATOR_MODEL_DIR.exists():
        raise FileNotFoundError(
            f"Missing T5 label-generator model: {LABEL_GENERATOR_MODEL_DIR}"
        )

    print("Loading V3 reference-type classifier...")
    reference_type_classifier = joblib.load(REFERENCE_TYPE_MODEL_PATH)

    print("Loading V3 message-only T5 label generator...")
    tokenizer = AutoTokenizer.from_pretrained(LABEL_GENERATOR_MODEL_DIR)
    label_generator = AutoModelForSeq2SeqLM.from_pretrained(LABEL_GENERATOR_MODEL_DIR)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    label_generator.to(device)
    label_generator.eval()

    print(f"Device: {device}")
    print("Models loaded.")
    print("")

    return reference_type_classifier, tokenizer, label_generator, device


def predict_topic_reference_and_label(
    data: TopicLabelInput,
    reference_type_classifier,
    tokenizer,
    label_generator,
    device,
) -> dict[str, Any]:
    classifier_input = format_for_reference_type_classifier(data)
    topic_reference_type = reference_type_classifier.predict([classifier_input])[0]

    extracted_label = None

    if topic_reference_type == "explicit_topic_reference":
        generator_input = format_for_label_generator(data)

        encoded = tokenizer(
            generator_input,
            return_tensors="pt",
            max_length=MAX_INPUT_LENGTH,
            truncation=True,
        )

        encoded = {key: value.to(device) for key, value in encoded.items()}

        with torch.no_grad():
            generated = label_generator.generate(
                **encoded,
                max_new_tokens=MAX_LABEL_TOKENS,
                num_beams=4,
                early_stopping=True,
            )

        extracted_label = tokenizer.decode(
            generated[0],
            skip_special_tokens=True,
        ).strip()

        if not extracted_label:
            extracted_label = None

    return {
        "topic_reference_type": topic_reference_type,
        "extracted_label": extracted_label,
    }


def find_alias_match(extracted_label: str, current_topic_names: list[str]) -> dict[str, Any] | None:
    extracted_norm = normalize_text(extracted_label)

    if extracted_norm in CANONICAL_ALIAS_MAP:
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

    return None


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


def find_fuzzy_match(extracted_label: str, current_topic_names: list[str]) -> dict[str, Any] | None:
    best_topic = None
    best_score = 0.0
    best_seq = 0.0
    best_token = 0.0

    for topic in current_topic_names:
        seq = sequence_similarity(extracted_label, topic)
        tok = token_f1(extracted_label, topic)

        # Weighted because token overlap is useful but SequenceMatcher catches morphology.
        score = max(seq, tok)

        if score > best_score:
            best_topic = topic
            best_score = score
            best_seq = seq
            best_token = tok

    if best_topic is None:
        return None

    # Conservative threshold for this first prototype.
    # Later embeddings can handle true semantic matches.
    if best_score >= 0.88:
        return {
            "matched_topic_name": best_topic,
            "match_type": "fuzzy_existing_topic",
            "score": round(best_score, 4),
            "sequence_similarity": round(best_seq, 4),
            "token_f1": round(best_token, 4),
        }

    return None


def route_topic(data: TopicLabelInput, model_prediction: dict[str, Any]) -> dict[str, Any]:
    topic_reference_type = model_prediction["topic_reference_type"]
    extracted_label = model_prediction.get("extracted_label")

    active_topic_name = data.get("active_topic_name")
    current_topic_names = data.get("current_topic_names") or []

    if topic_reference_type == "active_topic_reference":
        return {
            "route_decision": "stay_active",
            "topic_reference_type": topic_reference_type,
            "extracted_label": None,
            "matched_topic_name": active_topic_name,
            "reason": "Model predicted active_topic_reference, so router keeps the active topic.",
        }

    if topic_reference_type == "no_topic":
        return {
            "route_decision": "clarify_no_topic",
            "topic_reference_type": topic_reference_type,
            "extracted_label": None,
            "matched_topic_name": None,
            "reason": "Model predicted no_topic, so router should ask a grounding/clarifying question instead of creating a topic.",
        }

    if topic_reference_type == "unclear_topic":
        return {
            "route_decision": "clarify_topic_intent",
            "topic_reference_type": topic_reference_type,
            "extracted_label": None,
            "matched_topic_name": None,
            "reason": "Model predicted unclear_topic, so router should ask whether to stay, switch, or create.",
        }

    if topic_reference_type != "explicit_topic_reference":
        return {
            "route_decision": "error_unknown_reference_type",
            "topic_reference_type": topic_reference_type,
            "extracted_label": extracted_label,
            "matched_topic_name": None,
            "reason": f"Unknown topic_reference_type: {topic_reference_type}",
        }

    if not extracted_label:
        return {
            "route_decision": "clarify_topic_intent",
            "topic_reference_type": topic_reference_type,
            "extracted_label": None,
            "matched_topic_name": None,
            "reason": "Model predicted explicit_topic_reference but produced no extracted_label.",
        }

    exact = find_exact_match(extracted_label, current_topic_names)
    if exact:
        return {
            "route_decision": "switch_existing",
            "topic_reference_type": topic_reference_type,
            "extracted_label": extracted_label,
            **exact,
            "reason": "Extracted label exactly matched an existing topic.",
        }

    alias = find_alias_match(extracted_label, current_topic_names)
    if alias:
        if alias["match_type"] == "alias_exact_to_existing_topic":
            return {
                "route_decision": "switch_existing",
                "topic_reference_type": topic_reference_type,
                "extracted_label": extracted_label,
                **alias,
                "reason": "Extracted label matched an alias for an existing topic.",
            }

        return {
            "route_decision": "create_new",
            "topic_reference_type": topic_reference_type,
            "extracted_label": extracted_label,
            **alias,
            "reason": "Extracted label matched a known canonical alias, but the canonical topic does not exist yet.",
        }

    fuzzy = find_fuzzy_match(extracted_label, current_topic_names)
    if fuzzy:
        return {
            "route_decision": "switch_existing",
            "topic_reference_type": topic_reference_type,
            "extracted_label": extracted_label,
            **fuzzy,
            "reason": "Extracted label fuzzily matched an existing topic.",
        }

    return {
        "route_decision": "create_new",
        "topic_reference_type": topic_reference_type,
        "extracted_label": extracted_label,
        "matched_topic_name": title_case_label(extracted_label),
        "match_type": "no_existing_match",
        "score": None,
        "reason": "Explicit topic reference had no exact, alias, or fuzzy match to current topics, so router would create a new topic.",
    }


def run_pipeline(
    data: TopicLabelInput,
    reference_type_classifier,
    tokenizer,
    label_generator,
    device,
) -> dict[str, Any]:
    model_prediction = predict_topic_reference_and_label(
        data,
        reference_type_classifier,
        tokenizer,
        label_generator,
        device,
    )

    route = route_topic(data, model_prediction)

    return {
        "model_prediction": model_prediction,
        "route": route,
    }


def run_examples():
    reference_type_classifier, tokenizer, label_generator, device = load_models()

    examples: list[TopicLabelInput] = [
        {
            "message": "I don't understand electricity. I know it powers lights but I don't get where it comes from.",
            "active_topic_name": "Dopamine",
            "current_topic_names": ["Dopamine", "Osmosis", "Profit Margin"],
            "previous_user_messages": [],
        },
        {
            "message": "I still don't get that part.",
            "active_topic_name": "Electricity",
            "current_topic_names": ["Electricity", "Osmosis", "Profit Margin"],
            "previous_user_messages": [
                "I don't understand how electricity can come from so many sources.",
                "The wind and battery example helped a little.",
            ],
        },
        {
            "message": "Can we go back to dopamine? I think I left that one too early.",
            "active_topic_name": "Electricity",
            "current_topic_names": [
                "Electricity",
                "Dopamine",
                "Osmosis",
                "Action Potentials",
            ],
            "previous_user_messages": [
                "We switched to electricity for a bit.",
                "The generator example helped.",
            ],
        },
        {
            "message": "I don't even know what I'm confused about. I just feel stuck.",
            "active_topic_name": "Pragmatics",
            "current_topic_names": ["Pragmatics", "Embeddings", "Profit Margin"],
            "previous_user_messages": [
                "Can we stay on pragmatics for a bit?",
                "The example made sense while I was reading it.",
            ],
        },
        {
            "message": "I don't want to switch topics accidentally, but I think I might be asking a different question.",
            "active_topic_name": "Embeddings",
            "current_topic_names": ["Embeddings", "Vector Search", "Neural Networks"],
            "previous_user_messages": [
                "Can we stay on embeddings?",
                "The idea of comparing meanings kind of makes sense.",
            ],
        },
        {
            "message": "Actually I think the thing I need now is circuit breakers, not electricity in general.",
            "active_topic_name": "Electricity",
            "current_topic_names": ["Electricity", "Voltage vs Current", "Resistance"],
            "previous_user_messages": [
                "Electricity as a broad idea helped.",
                "The part about charges moving made some sense.",
            ],
        },
        {
            "message": "I thought I was asking about cellular respiration, but the real blocker is the sign-in handoff.",
            "active_topic_name": "Cellular Respiration",
            "current_topic_names": ["Cellular Respiration", "OAuth Flow", "API Authentication"],
            "previous_user_messages": [],
        },
        {
            "message": "hmm wait, I mean the thing in the electrical panel.",
            "active_topic_name": "Electricity",
            "current_topic_names": ["Electricity", "Circuit Breakers", "Voltage vs Current"],
            "previous_user_messages": [],
        },
        {
            "message": "also what even is how much a customer is worth? if that makes sense",
            "active_topic_name": "Budgeting",
            "current_topic_names": ["Budgeting", "Lifetime Value", "Profit Margin"],
            "previous_user_messages": [],
        },
        {
            "message": "ok the better label is which past tense to use. What is it actually doing in the example?",
            "active_topic_name": "Spanish Pronouns",
            "current_topic_names": ["Spanish Pronouns", "Preterite vs Imperfect", "Ser vs Estar"],
            "previous_user_messages": [],
        },
    ]

    for index, example in enumerate(examples, start=1):
        result = run_pipeline(
            example,
            reference_type_classifier,
            tokenizer,
            label_generator,
            device,
        )

        print("=" * 80)
        print(f"Example {index}")
        print("")
        print("Input:")
        print(json.dumps(example, indent=2, ensure_ascii=False))
        print("")
        print("Result:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        print("")


if __name__ == "__main__":
    run_examples()