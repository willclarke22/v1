export async function embedTexts(texts: string[]): Promise<number[][]> {
  const baseUrl = process.env.EMBEDDINGS_URL;

  if (!baseUrl) {
    throw new Error("Missing EMBEDDINGS_URL");
  }

  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error("embedTexts requires at least one text");
  }

  const normalizedTexts = texts.map((text, index) => {
    if (typeof text !== "string") {
      throw new Error(`embedTexts expected string at index ${index}`);
    }
    return text.trim();
  });

  const res = await fetch(`${baseUrl}/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ texts: normalizedTexts }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Embedding service failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { vectors?: unknown };

  if (!Array.isArray(data.vectors)) {
    throw new Error("Embedding service returned invalid response: vectors missing");
  }

  const vectors = data.vectors.map((vector, index) => {
    if (!Array.isArray(vector)) {
      throw new Error(`Embedding service returned invalid vector at index ${index}`);
    }

    const numericVector = vector.map((value, valueIndex) => {
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(
          `Embedding service returned non-numeric value at vector ${index}, position ${valueIndex}`
        );
      }
      return value;
    });

    if (numericVector.length === 0) {
      throw new Error(`Embedding service returned empty vector at index ${index}`);
    }

    return numericVector;
  });

  return vectors;
}

export async function embedText(text: string): Promise<number[]> {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("embedText requires a non-empty string");
  }

  const vectors = await embedTexts([text]);

  if (!vectors[0]) {
    throw new Error("No embedding returned");
  }

  return vectors[0];
}