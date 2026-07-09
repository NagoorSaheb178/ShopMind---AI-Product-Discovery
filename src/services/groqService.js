const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function streamAIRecommendations(userQuery, products, onChunk, signal) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) throw new Error("API key is not configured. Please check your .env file.");

  const productSummary = products.map(p => 
    `[${p.id}] ${p.name} ($${p.price}, ${p.brand}) - ${p.description} Tags: ${p.tags.join(',')}`
  ).join('\n');

  const systemPrompt = `You are a strict product recommendation assistant.
Analyze the user query and return ONLY a JSON object — no markdown fences, no extra text.

Rules:
1. E-COMMERCE SEARCH BEHAVIOR:
   - BRAND SEARCH (e.g., "google", "samsung", "apple"): You MUST return EVERY SINGLE PRODUCT in the catalogue that belongs to this brand. Do not leave any out! NEVER include competing brands.
   - CATEGORY SEARCH (e.g., "phones", "tablets"): Return ALL products in that category.
   - SPECIFIC PRODUCT SEARCH (e.g., "macbook", "a54"): Return ONLY that exact product. DO NOT include accessories or other models.
   - FEATURE SEARCH (e.g., "ANC", "OLED"): Return products where the description or tags match the feature.
   - PRICE SEARCH (e.g., "under $200"): STRICTLY exclude any product whose price is greater than the user's limit. Do mathematical verification.
2. DO NOT add random filler products. If only 1 product matches, return an array with just 1 item.
3. You can return as many products as genuinely match (no maximum limit).
4. If NOTHING matches, return an empty array [].
5. reasoning[] must have the same length as recommendedIds[].

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
        model: "gemma2-9b-it", // Using Gemma 2 9B to avoid decommissioned models and rate limits
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
    const retryAfter = parseInt(response.headers.get("retry-after") || "3", 10);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    response = await doFetch(true);
  }

  if (!response.ok) {
    let msg = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body.error?.message) msg = body.error.message;
    } catch (e) {}
    if (response.status === 429) throw new Error("AI is busy (rate limited). Please wait a moment and try again.");
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
            if (parsed.choices?.[0]?.delta?.content) {
              accumulatedText += parsed.choices[0].delta.content;
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
}
