const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Streams AI product recommendations.
 *
 * Key reliability fixes:
 *  - Uses AbortController so the caller can cancel an in-flight request
 *  - Maintains a line-buffer across raw byte chunks (SSE lines can span chunks)
 *  - Retries once on 429 (rate-limit) after the server's Retry-After delay
 *  - Throws user-friendly errors on all failure paths
 *  - Cleans up the reader on abort/error
 *
 * @param {string}   userQuery
 * @param {Array}    products
 * @param {Function} onChunk   – called with accumulated JSON text on every token
 * @param {AbortSignal} [signal] – pass an AbortController.signal to cancel
 */
export async function streamAIRecommendations(userQuery, products, onChunk, signal) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) throw new Error("API key is not configured. Please check your .env file.");

  // Condense catalog into a highly token-efficient string format
  // This drastically reduces token usage so we don't hit the strict TPM rate limit
  const productSummary = products.map(p => 
    `[${p.id}] ${p.name} ($${p.price}, ${p.brand}) - ${p.description} Tags: ${p.tags.join(',')}`
  ).join('\n');

  const systemPrompt = `You are a strict product recommendation assistant.
Analyze the user query and return ONLY a JSON object — no markdown fences, no extra text.

Rules:
1. EXTREME STRICTNESS: You MUST ONLY return products that EXACTLY match the user's intent.
2. DO NOT add random products just to fill up space. If only 1 product matches, return an array with ONLY 1 item (e.g. [6]).
3. If the user searches for a specific brand or item (e.g., "macbook" or "apple"), DO NOT return items from other brands (like Samsung) or unrelated categories (like cameras or tablets).
4. DO NOT recommend accessories unless explicitly asked for.
5. If NOTHING matches, return an empty array [].
6. reasoning[] must have the same length as recommendedIds[].

JSON format (respond with this exact structure):
{
  "recommendedIds": [1, 2, 3],
  "explanation": "Provide a brief explanation of the product or category the user is searching for (e.g. what it is, key benefits), followed by a friendly intro to your top picks.",
  "reasoning": ["Why product 1 matches.", "Why product 2 matches.", "Why product 3 matches."]
}`;

  const userMessage = `Query: "${userQuery}"\n\nCatalogue:\n${productSummary}`;

  const doFetch = (retrying = false) =>
    fetch(GROQ_API_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 800,
        stream: true,
      }),
    });

  let response = await doFetch();

  // Handle rate-limit: wait for Retry-After then try once more
  if (response.status === 429 && !signal?.aborted) {
    const retryAfter = parseInt(response.headers.get("retry-after") || "3", 10);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    response = await doFetch(true);
  }

  if (!response.ok) {
    let msg = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error?.message) msg = body.error.message;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  // ── SSE stream reader ─────────────────────────────────────────────────
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let accumulated = "";
  let lineBuffer = ""; // holds partial lines across byte chunks

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Append raw text to lineBuffer, then process complete lines
      lineBuffer += decoder.decode(value, { stream: true });

      // Split on newlines but keep any trailing partial line in the buffer
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop(); // last element may be incomplete

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            onChunk(accumulated);
          }
        } catch {
          // JSON parse failed for this line — safe to skip
        }
      }
    }

    // Process any remaining buffered text
    if (lineBuffer.trim().startsWith("data: ")) {
      try {
        const json = JSON.parse(lineBuffer.trim().slice(6));
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) { accumulated += delta; onChunk(accumulated); }
      } catch { /* ignore */ }
    }

  } catch (err) {
    reader.cancel().catch(() => {});
    if (err.name === "AbortError") return null; // caller cancelled — not an error
    throw err;
  } finally {
    reader.releaseLock();
  }

  if (!accumulated.trim()) throw new Error("Empty response. Please try again.");

  // ── Parse final JSON ──────────────────────────────────────────────────
  let jsonStr = accumulated.trim();
  // Strip accidental markdown fences the model might add despite instructions
  jsonStr = jsonStr.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();

  // Extract the first {...} block in case the model added any preamble
  const braceStart = jsonStr.indexOf("{");
  const braceEnd   = jsonStr.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1) {
    jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error("Could not parse AI response. Please try again.");
  }

  return {
    recommendedIds: Array.isArray(parsed.recommendedIds) ? parsed.recommendedIds : [],
    explanation:    typeof parsed.explanation === "string" ? parsed.explanation : "Here are your recommendations.",
    reasoning:      Array.isArray(parsed.reasoning) ? parsed.reasoning : [],
  };
}
