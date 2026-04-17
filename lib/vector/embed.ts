export async function embedTexts(texts: string[]): Promise<number[][]> {
  const baseUrl = process.env.EMBEDDINGS_URL;

  if (!baseUrl) {
    throw new Error("Missing EMBEDDINGS_URL");
  }

  const res = await fetch(`${baseUrl}/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ texts }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Embedding service failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { vectors?: number[][] };

  if (!data.vectors || !Array.isArray(data.vectors)) {
    throw new Error("Embedding service returned invalid response");
  }

  return data.vectors;
}

export async function embedText(text: string): Promise<number[]> {
  const vectors = await embedTexts([text]);

  if (!vectors[0]) {
    throw new Error("No embedding returned");
  }

  return vectors[0];
}