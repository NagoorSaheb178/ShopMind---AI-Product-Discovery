const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function streamAIRecommendations(userQuery, products, onChunk, signal) {
  // We use VITE_GROQ_API_KEY for Groq
  const apiKey = import.meta.env.VITE_GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("Groq API key is not configured.");

  // Extremely minimal token payload to prevent hitting Groq's Tokens Per Minute (TPM) limit
  const productSummary = products.map(p => 
    `[${p.id}]${p.name}($${p.price},${p.brand})-${p.description}`
  ).join('\n');

  const systemPrompt = `You are a strict product recommendation assistant.
Return ONLY a JSON object — no extra text, no markdown.

Rules:
1. BRAND SEARCH: Return EVERY product for that brand.
2. CATEGORY SEARCH: Return ALL products in that category.
3. PRICE SEARCH (CRITICAL): 
   * If user asks for "under X", check: is product price strictly less than X?
   * If product price >= X, DO NOT INCLUDE IT. ZERO EXCEPTIONS.
   * Example: "under 200" means price must be 199 or less. $249 or $449 are NOT under $200.
4. If NOTHING matches, return [].

JSON format:
{
  "recommendedIds": [1, 2],
  "explanation": "Brief explanation...",
  "reasoning": ["Reason 1", "Reason 2"]
}`;

  const userMessage = `Query: "${userQuery}"\nCatalog:\n${productSummary}`;

  const doFetch = (retrying = false) =>
    fetch(GROQ_API_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant", // The official, active Llama 3.1 model on Groq
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userMessage },
        ],
        temperature: 0.1,
        stream: true,
      }),
    });

  let response = await doFetch();

  if (response.status === 429 && !signal?.aborted) {
    const retryAfter = parseInt(response.headers.get("retry-after") || "2", 10);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    response = await doFetch(true);
  }

  if (!response.ok) {
    let msg = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body.error?.message) msg = body.error.message;
    } catch (e) {}
    throw new Error(msg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let accumulatedText = "";
  let lineBuffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop(); // keep the incomplete line
      
      for (const line of lines) {
        if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
          try {
            const parsed = JSON.parse(line.slice(6));
            const textDelta = parsed.choices?.[0]?.delta?.content;
            if (textDelta) {
              accumulatedText += textDelta;
              if (!signal?.aborted) onChunk(accumulatedText);
            }
          } catch (e) {
            // Ignore parse errors on incomplete JSON chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Clean up any stray markdown formatting the AI might add
  const cleanedText = accumulatedText.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  if (signal?.aborted) return null;
  return JSON.parse(cleanedText);
}
