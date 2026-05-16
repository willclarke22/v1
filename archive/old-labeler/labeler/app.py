from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Literal


from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


APP_NAME = "myway-topic-labeler"

# Ollama settings
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_MODEL_NAME = os.getenv("TOPIC_LABELER_MODEL", "qwen2.5:3b")
OLLAMA_KEEP_ALIVE = os.getenv("TOPIC_LABELER_KEEP_ALIVE", "30m")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("TOPIC_LABELER_TIMEOUT_SECONDS", "120"))

# Prompt / output shaping
MAX_INPUT_CHARS = int(os.getenv("TOPIC_LABELER_MAX_INPUT_CHARS", "1200"))
MAX_EXISTING_TOPICS = int(os.getenv("TOPIC_LABELER_MAX_EXISTING_TOPICS", "5"))
MAX_SEMANTIC_TOPICS = int(os.getenv("TOPIC_LABELER_MAX_SEMANTIC_TOPICS", "5"))
TEMPERATURE = float(os.getenv("TOPIC_LABELER_TEMPERATURE", "0.0"))


app = FastAPI(title=APP_NAME)


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


def normalize_label_key(text: str | None) -> str:
    if not text:
        return ""
    text = normalize_space(text).lower()
    text = text.replace("&", "and")
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"[^\w\s\-\']", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def sanitize_label(label: str) -> str:
    label = normalize_space(label)
    label = re.sub(r"^[\-\*\d\.\)\s]+", "", label)
    label = re.sub(r"^label\s*:\s*", "", label, flags=re.I)
    label = re.sub(r"^best_label\s*:\s*", "", label, flags=re.I)
    label = re.sub(r"^topic\s*:\s*", "", label, flags=re.I)
    label = re.sub(r"^answer\s*:\s*", "", label, flags=re.I)
    label = re.sub(r"^best topic\s*:\s*", "", label, flags=re.I)
    label = label.strip(" \"'`")
    label = re.sub(r"\s+", " ", label).strip()
    return label


def word_tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", normalize_label_key(text))


def significant_tokens(text: str) -> set[str]:
    stop = {
        "the", "a", "an", "of", "in", "on", "for", "to", "and", "or", "vs", "versus",
        "how", "what", "why", "is", "are", "that", "this", "these", "those", "part",
        "thing", "topic", "concept", "rule", "rules"
    }
    return {t for t in word_tokens(text) if t not in stop}


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
            " in ",
            " of ",
        ]
    ):
        return "subtopic"

    return "object"


def build_candidate_pool(req: LabelRequest) -> list[str]:
    candidates: list[str] = []

    if req.active_topic_name:
        candidates.append(req.active_topic_name)

    if req.deterministic_label:
        candidates.append(req.deterministic_label)

    candidates.extend(dedupe_keep_order(req.top_semantic_topic_names)[:MAX_SEMANTIC_TOPICS])
    candidates.extend(dedupe_keep_order(req.existing_topic_names)[:MAX_EXISTING_TOPICS])

    return dedupe_keep_order([c for c in candidates if c])


def is_meta_followup_message(message: str) -> bool:
    low = normalize_label_key(message)

    exact_like = {
        "can you say that again",
        "show me another example",
        "show another example",
        "can we do that again",
        "do that again",
        "i still dont get it",
        "i still do not get it",
        "wait what do you mean",
        "what do you mean",
        "can you explain that again",
    }

    if low in exact_like:
        return True

    patterns = [
        r"\bthat again\b",
        r"\banother example\b",
        r"\bstill don'?t get it\b",
        r"\bwhat do you mean\b",
        r"\bsay that again\b",
        r"\bdo that again\b",
        r"\bgo over that again\b",
    ]
    return any(re.search(p, low) for p in patterns)


def message_requests_comparison(message: str) -> bool:
    low = normalize_label_key(message)

    patterns = [
        r"\bcompare\b",
        r"\bcomparison\b",
        r"\bdifference between\b",
        r"\bvs\b",
        r"\bversus\b",
        r"\bmixing up\b",
        r"\bmix up\b",
        r"\bkeep blending together\b",
        r"\bkeep forgetting when to use\b",
        r"\bbetween .+ and .+\b",
    ]
    return any(re.search(p, low) for p in patterns)


def strip_bad_suffixes(label: str) -> str:
    text = sanitize_label(label)

    # Repeatedly strip common junk suffixes the model adds.
    suffix_patterns = [
        r"\s+(method|methods)$",
        r"\s+(definition|definitions)$",
        r"\s+(concept|concepts)$",
        r"\s+(confusion)$",
        r"\s+(complexity)$",
        r"\s+(types|type)$",
        r"\s+(mistake|mistakes)$",
        r"\s+(rule)$",
    ]

    changed = True
    while changed:
        changed = False
        for pattern in suffix_patterns:
            new_text = re.sub(pattern, "", text, flags=re.I).strip()
            if new_text != text:
                text = new_text
                changed = True

    # Clean trailing isolated X from broken comparison-ish outputs.
    text = re.sub(r"\s+[xX]$", "", text).strip()
    return text


def choose_best_candidate_by_overlap(output: str, candidates: list[str]) -> str | None:
    if not output or not candidates:
        return None

    out_key = normalize_label_key(output)
    out_tokens = significant_tokens(output)

    best_candidate = None
    best_score = -1.0

    for candidate in candidates:
        cand_key = normalize_label_key(candidate)
        cand_tokens = significant_tokens(candidate)

        if not cand_tokens:
            continue

        if out_key == cand_key:
            return candidate

        score = 0.0

        if cand_key in out_key or out_key in cand_key:
            score += 3.0

        overlap = len(out_tokens & cand_tokens)
        score += overlap * 1.5

        # Bias toward exact semantic candidate forms.
        if candidate in candidates[:]:
            score += 0.0

        # Prefer fuller canonical candidates when overlap is good.
        score += min(len(cand_tokens), 6) * 0.1

        if score > best_score:
            best_score = score
            best_candidate = candidate

    # Require some real evidence before snapping to a candidate.
    if best_candidate and best_score >= 2.5:
        return best_candidate

    return None


def expand_comparison_from_candidates(output: str, candidates: list[str]) -> str | None:
    low = normalize_label_key(output)
    if " vs " not in low and " versus " not in low:
        return None

    parts = re.split(r"\bvs\b|\bversus\b", low)
    parts = [p.strip() for p in parts if p.strip()]
    if len(parts) != 2:
        return None

    left, right = parts

    left_candidate = None
    right_candidate = None

    for candidate in candidates:
        cand_key = normalize_label_key(candidate)
        if left and (left == cand_key or left in cand_key):
            left_candidate = candidate
        if right and (right == cand_key or right in cand_key):
            right_candidate = candidate

    if left_candidate and right_candidate:
        return f"{left_candidate} vs {right_candidate}"

    return None


def prefer_side_of_nonrequested_comparison(output: str, req: LabelRequest, candidates: list[str]) -> str | None:
    low = normalize_label_key(output)
    if " vs " not in low and " versus " not in low:
        return None

    parts = re.split(r"\bvs\b|\bversus\b", output, flags=re.I)
    parts = [sanitize_label(p) for p in parts if sanitize_label(p)]
    if not parts:
        return None

    # If the message did not request a comparison, choose the best single side.
    # Usually the left side is the intended narrow target in these failures,
    # but we still score against candidates.
    side_candidates = []
    for part in parts:
        stripped = strip_bad_suffixes(part)
        if stripped:
            side_candidates.append(stripped)

    # Try to snap each side to a canonical candidate.
    for side in side_candidates:
        mapped = choose_best_candidate_by_overlap(side, candidates)
        if mapped:
            return mapped

    return side_candidates[0] if side_candidates else None


def contains_non_ascii(text: str) -> bool:
    return any(ord(ch) > 127 for ch in text)


def build_messages(req: LabelRequest) -> list[dict[str, str]]:
    message = clip_text(req.message, MAX_INPUT_CHARS)
    candidates = build_candidate_pool(req)

    candidate_text = " | ".join(candidates) if candidates else "None"
    active_topic = req.active_topic_name or "None"
    deterministic_label = req.deterministic_label or "None"
    comparison_expected = "yes" if message_requests_comparison(message) else "no"
    followup_hint = "yes" if (req.active_topic_name and is_meta_followup_message(message)) else "no"

    system_prompt = """
You assign canonical topic labels for learner messages in an educational app.

Return exactly one label on one line and nothing else.

Follow these rules strictly:
1. Prefer an exact existing candidate label when one fits.
2. If the message is a generic follow-up and there is an active topic, return the active topic exactly.
3. Do not invent a comparison label unless the message clearly compares two things.
4. Do not add extra words like:
   method, methods, definition, definitions, concept, concepts, confusion, complexity, types, mistake, rule.
5. Prefer the narrower actual target over a broader surrounding topic.
6. When a comparison is truly requested, use the full canonical form:
   <full label A> vs <full label B>
7. Do not explain.
8. Do not output prefixes.
9. If unsure, choose the best exact candidate label rather than inventing a new phrase.
""".strip()

    user_prompt = f"""
Message: {message}
Active topic: {active_topic}
Deterministic label: {deterministic_label}
Comparison requested: {comparison_expected}
Generic follow-up with active topic: {followup_hint}
Candidate labels: {candidate_text}

Return one canonical label only.
""".strip()

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def parse_generation(raw_output: str) -> str | None:
    if not raw_output:
        return None

    lines = [sanitize_label(line) for line in raw_output.splitlines() if sanitize_label(line)]
    if not lines:
        return None

    for line in lines:
        low = normalize_label_key(line)

        if not low:
            continue

        blocked_exact = {
            "label",
            "best label",
            "message",
            "candidate labels",
            "active topic",
            "deterministic label",
            "comparison requested",
            "generic follow up with active topic",
            "return one canonical label only",
        }
        if low in blocked_exact:
            continue

        blocked_starts = (
            "return exactly",
            "follow these rules",
            "prefer an exact",
            "if the message",
            "do not invent",
            "do not add",
            "prefer the narrower",
            "when a comparison",
            "do not explain",
            "if unsure",
            "message",
            "candidate labels",
            "active topic",
            "deterministic label",
            "comparison requested",
            "generic follow up",
            "return one canonical",
            "label",
            "best label",
        )
        if low.startswith(blocked_starts):
            continue

        return sanitize_label(line)

    return None


def postprocess_best_label(best_label: str | None, req: LabelRequest) -> tuple[str | None, str]:
    candidates = build_candidate_pool(req)
    deterministic = req.deterministic_label or None
    active_topic = req.active_topic_name or None
    message = req.message

    # Strong shortcut for generic follow-up turns.
    if active_topic and is_meta_followup_message(message):
        return active_topic, "Used active topic for generic follow-up message."

    if not best_label:
        if deterministic:
            return deterministic, "Fell back to deterministic label because helper returned nothing useful."
        return active_topic, "Fell back to active topic because helper returned nothing useful."

    best_label = clip_text(best_label, 80)
    best_label = strip_bad_suffixes(best_label)
    low = normalize_label_key(best_label)
    normalized_message = normalize_label_key(message)

    bad_exact = {
        "none",
        "n a",
        "unknown",
        "topic",
        "label",
        "best label",
        "message",
        "candidate labels",
        "no explanation",
        "return one canonical label only",
        "comparison requested",
        "generic follow up with active topic",
    }

    if low in bad_exact:
        if deterministic:
            return deterministic, "Fell back to deterministic label because helper output was junk."
        return active_topic, "Fell back to active topic because helper output was junk."

    if low == normalized_message:
        if deterministic:
            return deterministic, "Fell back to deterministic label because helper repeated the full message."
        return active_topic, "Fell back to active topic because helper repeated the full message."

    if contains_non_ascii(best_label):
        mapped = choose_best_candidate_by_overlap(best_label, candidates)
        if mapped:
            return mapped, "Mapped non-canonical helper output to closest candidate label."
        if deterministic:
            return deterministic, "Fell back to deterministic label because helper output was non-canonical."
        return active_topic, "Fell back to active topic because helper output was non-canonical."

    wants_comparison = message_requests_comparison(message)

    if wants_comparison:
        expanded = expand_comparison_from_candidates(best_label, candidates)
        if expanded:
            return expanded, "Expanded helper comparison to full canonical candidate labels."
    else:
        if " vs " in low or " versus " in low:
            side_choice = prefer_side_of_nonrequested_comparison(best_label, req, candidates)
            if side_choice:
                return side_choice, "Removed accidental comparison framing from helper output."

    mapped_candidate = choose_best_candidate_by_overlap(best_label, candidates)
    if mapped_candidate:
        return mapped_candidate, "Mapped helper output to closest canonical candidate label."

    if len(best_label.split()) > 8:
        if deterministic:
            return deterministic, "Fell back to deterministic label because helper output was too long."
        return active_topic, "Fell back to active topic because helper output was too long."

    return best_label, "Used helper-generated label."


def ollama_post_json(path: str, payload: dict) -> dict:
    url = f"{OLLAMA_BASE_URL.rstrip('/')}{path}"
    request_data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=request_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=OLLAMA_TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=502,
            detail=f"Ollama HTTP error {exc.code}: {detail}",
        ) from exc
    except urllib.error.URLError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Could not reach Ollama at {OLLAMA_BASE_URL}. "
                f"Make sure Ollama is running and the model is available. Error: {exc.reason}"
            ),
        ) from exc
    except TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail="Timed out waiting for Ollama response.",
        ) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="Received invalid JSON from Ollama.",
        ) from exc


def ollama_get_json(path: str) -> dict:
    url = f"{OLLAMA_BASE_URL.rstrip('/')}{path}"
    req = urllib.request.Request(url, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=OLLAMA_TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=502,
            detail=f"Ollama HTTP error {exc.code}: {detail}",
        ) from exc
    except urllib.error.URLError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Could not reach Ollama at {OLLAMA_BASE_URL}. "
                f"Make sure Ollama is running. Error: {exc.reason}"
            ),
        ) from exc
    except TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail="Timed out waiting for Ollama response.",
        ) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="Received invalid JSON from Ollama.",
        ) from exc


def generate_text(messages: list[dict[str, str]]) -> tuple[str, dict]:
    payload = {
        "model": DEFAULT_MODEL_NAME,
        "messages": messages,
        "stream": False,
        "keep_alive": OLLAMA_KEEP_ALIVE,
    }

    if TEMPERATURE > 0:
        payload["options"] = {"temperature": TEMPERATURE}

    response_json = ollama_post_json("/api/chat", payload)

    raw_output = (
        response_json.get("message", {}).get("content", "")
        if isinstance(response_json, dict)
        else ""
    )

    return raw_output, response_json


@app.get("/health")
def health():
    version_json = ollama_get_json("/api/version")
    return {
        "ok": True,
        "service": APP_NAME,
        "runtime": "ollama",
        "base_url": OLLAMA_BASE_URL,
        "model": DEFAULT_MODEL_NAME,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "ollama_version": version_json.get("version"),
    }


@app.post("/label", response_model=LabelResponse)
def label(req: LabelRequest):
    try:
        messages = build_messages(req)
        raw_output, response_json = generate_text(messages)

        if not raw_output:
            raise HTTPException(status_code=500, detail="No generated text returned from Ollama.")

        parsed_label = parse_generation(raw_output)
        best_label, reason_short = postprocess_best_label(parsed_label, req)

        _ = response_json

        return LabelResponse(
            best_label=best_label,
            alternate_labels=[],
            label_type=infer_label_type(best_label),
            reason_short=clip_text(reason_short, 160),
            raw_output=raw_output,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Topic labeling failed: {exc}") from exc