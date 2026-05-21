/**
 * Cosine-similarity helpers and optional embedding fetching.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function fetchEmbedding(
  apiUrl: string,
  model: string,
  text: string,
): Promise<number[] | null> {
  // Support both Ollama-style (prompt) and OpenAI-style (input) payloads.
  const payload =
    apiUrl.includes("openai.com") || apiUrl.includes("/v1/")
      ? { model, input: text }
      : { model, prompt: text };

  try {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1000),
    });

    if (!resp.ok) {
      process.stderr.write(
        `[shack-semantic-cache] embedding endpoint returned ${resp.status}\n`
      );
      return null;
    }

    const val = (await resp.json()) as Record<string, unknown>;

    // Ollama response: { "embedding": [...] }
    if (Array.isArray(val["embedding"])) {
      const vec = (val["embedding"] as unknown[]).map(Number).filter(isFinite);
      if (vec.length > 0) return vec;
    }

    // OpenAI response: { "data": [{ "embedding": [...] }] }
    const data = val["data"];
    if (Array.isArray(data) && data.length > 0) {
      const inner = (data[0] as Record<string, unknown>)["embedding"];
      if (Array.isArray(inner)) {
        const vec = (inner as unknown[]).map(Number).filter(isFinite);
        if (vec.length > 0) return vec;
      }
    }
  } catch (err) {
    process.stderr.write(
      `[shack-semantic-cache] embedding fetch failed: ${err}\n`
    );
  }

  return null;
}

export function findSimilarityMatch(
  rows: Array<{ result: string; embedding: string }>,
  queryEmb: number[],
  threshold: number,
): string | null {
  let bestSim = -1;
  let bestResult: string | null = null;

  for (const { result, embedding } of rows) {
    let cached: number[];
    try {
      cached = JSON.parse(embedding) as number[];
    } catch {
      continue;
    }
    const sim = cosineSimilarity(queryEmb, cached);
    if (sim >= threshold && sim > bestSim) {
      bestSim = sim;
      bestResult = result;
    }
  }

  return bestResult;
}
