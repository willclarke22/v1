import time
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI()
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

# Warm the model once at startup so the first user-facing embedding request is less likely
# to pay one-time initialization costs.
_warmup_started = time.perf_counter()
model.encode(
    ["warmup"],
    normalize_embeddings=True,
    convert_to_numpy=True,
    show_progress_bar=False,
)
_warmup_ms = round((time.perf_counter() - _warmup_started) * 1000, 2)


class EmbedRequest(BaseModel):
    texts: list[str]


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": "sentence-transformers/all-MiniLM-L6-v2",
        "warmup_ms": _warmup_ms,
    }


@app.post("/embed")
def embed(req: EmbedRequest) -> dict[str, Any]:
    started = time.perf_counter()

    normalized_texts = [text.strip() for text in req.texts if text and text.strip()]

    if not normalized_texts:
        return {
            "vectors": [],
            "timing": {
                "total_ms": round((time.perf_counter() - started) * 1000, 2),
                "normalize_ms": 0,
                "encode_ms": 0,
                "serialize_ms": 0,
                "text_count": 0,
                "vector_count": 0,
                "vector_size": None,
                "warmup_ms": _warmup_ms,
            },
        }

    normalize_ms = round((time.perf_counter() - started) * 1000, 2)

    encode_started = time.perf_counter()
    vectors = model.encode(
        normalized_texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    encode_ms = round((time.perf_counter() - encode_started) * 1000, 2)

    serialize_started = time.perf_counter()
    vector_lists = [vector.tolist() for vector in vectors]
    serialize_ms = round((time.perf_counter() - serialize_started) * 1000, 2)

    total_ms = round((time.perf_counter() - started) * 1000, 2)

    return {
        "vectors": vector_lists,
        "timing": {
            "total_ms": total_ms,
            "normalize_ms": normalize_ms,
            "encode_ms": encode_ms,
            "serialize_ms": serialize_ms,
            "text_count": len(normalized_texts),
            "vector_count": len(vector_lists),
            "vector_size": len(vector_lists[0]) if vector_lists else None,
            "warmup_ms": _warmup_ms,
        },
    }
