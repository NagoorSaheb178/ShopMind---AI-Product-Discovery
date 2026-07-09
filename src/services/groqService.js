export async function streamAIRecommendations(userQuery, products, onChunk, signal) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Gemini API key is not configured. Please check your .env file.");

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse`;

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
   - PRICE SEARCH: 
     * If "under X" or "less than X": Return EVERY SINGLE PRODUCT whose price is strictly less than X. Do not leave any out!
     * If "exact cost X" or "for X": Return ONLY products whose price is exactly X. 
     * You MUST do mathematical verification on every product.
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

  const doFetch = () =>
    fetch(GEMINI_API_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          { role: "user", parts: [{ text: userMessage }] }
        ],
        generationConfig: {
          temperature: 0.1
        }
      }),
    });

  let response = await doFetch();

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
            const textDelta = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
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

  // Clean up any markdown code fences that Gemini might accidentally inject
  const cleanedText = accumulatedText.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  if (signal?.aborted) return null;
  return JSON.parse(cleanedText);
}
