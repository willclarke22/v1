from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI()
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

class EmbedRequest(BaseModel):
    texts: list[str]

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/embed")
def embed(req: EmbedRequest):
    vectors = model.encode(
        req.texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    return {
        "vectors": [v.tolist() for v in vectors]
    }