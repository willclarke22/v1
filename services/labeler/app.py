from __future__ import annotations

import os
import re
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from transformers import pipeline


APP_NAME = "myway-topic-labeler"
DEFAULT_MODEL_NAME = os.getenv("TOPIC_LABELER_MODEL", "google/flan-t5-small")
MAX_INPUT_CHARS = int(os.getenv("TOPIC_LABELER_MAX_INPUT_CHARS", "2500"))
MAX_EXISTING_TOPICS = int(os.getenv("TOPIC_LABELER_MAX_EXISTING_TOPICS", "12"))
MAX_NEW_TOKENS = int(os.getenv("TOPIC_LABELER_MAX_NEW_TOKENS", "48"))


app = FastAPI(title=APP_NAME)

_generator = pipeline(
    "text-generation",
    model=DEFAULT_MODEL_NAME,
    tokenizer=DEFAULT_MODEL_NAME,
)


class LabelRequest(BaseModel):
    message: str = Field(..., min_length=1)
    active_topic_name: str | None = None
    existing_topic_names: list[str] = Field(default_factory=list)
    deterministic_label: str | None = None
    deterministic_confidence: float | None = None
    ambiguity_flags: list[str] = Field(default_factory=list)
    top_semantic_topic_names: list[str] = Field(default_factory=list)


class LabelResponse(BaseModel):
    best_label: str | None
    alternate_labels: list[str]
    label_type: Literal["object", "process", "comparison", "subtopic", "unknown"]
    reason_short: str
    raw_output: str


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def clip_text(text: str, limit: int) -> str:
    text = normalize_space(text)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def dedupe_keep_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        key = item.lower().strip()
        if not key or key in seen:
            continue
        seen.add(key)
        output.append(item.strip())
    return output


def sanitize_label(label: str) -> str:
    label = normalize_space(label)
    label = re.sub(r"^[\-\*\d\.\)\s]+", "", label)
    label = re.sub(r"^label\s*:\s*", "", label, flags=re.I)
    label = re.sub(r"^best_label\s*:\s*", "", label, flags=re.I)
    label = re.sub(r"^topic\s*:\s*", "", label, flags=re.I)
    label = label.strip(" \"'`")
    return label


def infer_label_type(label: str | None) -> Literal["object", "process", "comparison", "subtopic", "unknown"]:
    if not label:
        return "unknown"

    low = label.lower()

    if " vs " in low or " versus " in low or "difference between" in low:
        return "comparison"

    if any(
        phrase in low
        for phrase in [
            "how ",
            "why ",
            "process",
            "mechanism",
            "pathway",
            "cycle",
            "steps of",
            "phases of",
            "rules of",
            "flow of",
            "what happens",
            "works",
            "work",
        ]
    ):
        return "process"

    if any(
        phrase in low
        for phrase in [
            "part of",
            "phase of",
            "step of",
            "types of",
            "kind of",
            "in ",
            "of ",
        ]
    ):
        return "subtopic"

    return "object"


def build_prompt(req: LabelRequest) -> str:
    message = clip_text(req.message, MAX_INPUT_CHARS)

    existing_topic_names = dedupe_keep_order(req.existing_topic_names)[:MAX_EXISTING_TOPICS]
    top_semantic_topic_names = dedupe_keep_order(req.top_semantic_topic_names)[:MAX_EXISTING_TOPICS]
    ambiguity_flags = dedupe_keep_order(req.ambiguity_flags)

    existing_text = ", ".join(existing_topic_names) if existing_topic_names else "None"
    semantic_text = ", ".join(top_semantic_topic_names) if top_semantic_topic_names else "None"
    ambiguity_text = ", ".join(ambiguity_flags) if ambiguity_flags else "None"
    deterministic_confidence = (
        f"{req.deterministic_confidence:.2f}"
        if req.deterministic_confidence is not None
        else "None"
    )

    return f"""
You are labeling a learner's message for an educational app.

Task:
Return the best concise topic label for the message.
The label should usually be 1 to 5 words.
Prefer the true focus of confusion or learning.
Prefer the narrower real target over a broader earlier topic if the message singles it out.
If the message is about how something works, a process/mechanism label is allowed.
Do not output commentary first.

Good examples:
- "I'm learning about neurotransmitters, receptors, and reuptake, but I'm mainly confused about reuptake."
  -> Reuptake
- "I want to learn about how LLMs work."
  -> How LLMs Work
- "What's the difference between mitosis and meiosis?"
  -> Mitosis vs Meiosis
- "Why can't I understand the rules of curling?"
  -> Rules of Curling

Output format exactly:
BEST_LABEL: <label>
ALTERNATES: <label 1> | <label 2> | <label 3>
REASON: <short reason>

Learner message:
{message}

Current active topic:
{req.active_topic_name or "None"}

Deterministic label:
{req.deterministic_label or "None"}

Deterministic confidence:
{deterministic_confidence}

Ambiguity flags:
{ambiguity_text}

Existing topic names:
{existing_text}

Top semantic topic names:
{semantic_text}
""".strip()


def parse_generation(raw_output: str) -> tuple[str | None, list[str], str]:
    text = normalize_space(raw_output)

    best_label: str | None = None
    alternates: list[str] = []
    reason = "Model generated a label."

    best_match = re.search(r"BEST_LABEL:\s*(.+?)(?:\s+ALTERNATES:|\s+REASON:|$)", text, flags=re.I)
    if best_match:
        best_label = sanitize_label(best_match.group(1))

    alt_match = re.search(r"ALTERNATES:\s*(.+?)(?:\s+REASON:|$)", text, flags=re.I)
    if alt_match:
        raw_alts = [sanitize_label(part) for part in alt_match.group(1).split("|")]
        alternates = [a for a in raw_alts if a]

    reason_match = re.search(r"REASON:\s*(.+)$", text, flags=re.I)
    if reason_match:
        reason = normalize_space(reason_match.group(1))

    if not best_label:
        lines = [sanitize_label(line) for line in text.splitlines() if sanitize_label(line)]
        best_label = lines[0] if lines else None

    if best_label:
        alternates = dedupe_keep_order([a for a in alternates if a.lower() != best_label.lower()])

    return best_label, alternates[:3], reason


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": APP_NAME,
        "model": DEFAULT_MODEL_NAME,
    }


@app.post("/label", response_model=LabelResponse)
def label(req: LabelRequest):
    try:
        prompt = build_prompt(req)

        result = _generator(
            prompt,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=False,
            temperature=None,
        )

        if not result or "generated_text" not in result[0]:
            raise HTTPException(status_code=500, detail="No generated text returned from model.")

        raw_output = result[0]["generated_text"]
        best_label, alternates, reason = parse_generation(raw_output)

        if best_label:
            best_label = clip_text(best_label, 80)

        alternates = [clip_text(a, 80) for a in alternates]

        return LabelResponse(
            best_label=best_label,
            alternate_labels=alternates,
            label_type=infer_label_type(best_label),
            reason_short=clip_text(reason, 160),
            raw_output=raw_output,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Topic labeling failed: {exc}") from exc