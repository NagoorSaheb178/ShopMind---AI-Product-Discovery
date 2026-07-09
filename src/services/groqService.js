const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function streamAIRecommendations(userQuery, products, onChunk, signal) {
  // We use VITE_GROQ_API_KEY for Groq
  const apiKey = import.meta.env.VITE_GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("Groq API key is not configured.");

  const queryLower = userQuery.trim().toLowerCase();
  const allBrandsLower = [...new Set(products.map(p => p.brand.toLowerCase()))];
  
  // Fast path for exact brand matches
  if (allBrandsLower.includes(queryLower)) {
    const brandProducts = products.filter(p => p.brand.toLowerCase() === queryLower);
    const result = {
      recommendedIds: brandProducts.map(p => p.id),
      explanation: `All ${brandProducts[0].brand} products.`,
      reasoning: brandProducts.map(p => `Brand match for ${brandProducts[0].brand}`)
    };
    onChunk(JSON.stringify(result));
    return result;
  }

  // Extremely minimal token payload with cleanly separated numbers for the tokenizer
  const productSummary = products.map(p => 
    `ID:${p.id} PRICE:${p.price} NAME:${p.name} BRAND:${p.brand} DESC:${p.description}`
  ).join('\n');

  const systemPrompt = `You are a strict product recommendation assistant.
Return ONLY a JSON object — no extra text, no markdown.

Rules:
1. BRAND SEARCH: If the user query is a brand name (e.g. "samsung", "apple", "all samsung products"), you MUST return EVERY single product from that brand.
2. CATEGORY SEARCH: Return ALL products in that category.
3. PRICE SEARCH (CRITICAL): 
   * If user asks for "under X" or "below X", check: is product price strictly less than X?
   * If product price >= X, DO NOT INCLUDE IT. ZERO EXCEPTIONS.
   * You MUST return EVERY SINGLE product in the catalog that fits the user's criteria. Do NOT limit to just 1 or 2 items. Return all of them.
4. EXACT ITEM SEARCH: If the user searches for a specific product by name (e.g. "samsung a54", "macbook air"), return ONLY that specific product. Do not include other products from the brand.
5. If NOTHING matches, return [].

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
  
  let finalResult;
  try {
    finalResult = JSON.parse(cleanedText);
  } catch(e) {
    throw new Error("AI returned invalid data format.");
  }

  // --- BULLETPROOF JAVASCRIPT MATH FILTER ---
  // Small LLMs hallucinate math. We intercept the query here and force the math check in JS.
  let maxPrice = Infinity;
  let exactPrice = null;
  
  const underMatch = userQuery.match(/(?:under|less than|below)\s*\$?(\d+)/i);
  if (underMatch) maxPrice = parseInt(underMatch[1], 10);
  
  const exactMatch = userQuery.match(/(?:exact|exactly|for)\s*\$?(\d+)/i);
  if (exactMatch) exactPrice = parseInt(exactMatch[1], 10);

  // Brand strict enforcement
  // We already calculated queryLower above, but let's re-use it or just use the existing logic
  const allBrands = [...new Set(products.map(p => p.brand.toLowerCase()))];
  // Match whole words to avoid partial matches like "son" matching "sony"
  const mentionedBrands = allBrands.filter(b => queryLower.match(new RegExp(`\\b${b}\\b`)));

  // Forcefully remove any AI recommendations that violate rules
  if (finalResult.recommendedIds && Array.isArray(finalResult.recommendedIds)) {
    const validIds = [];
    const validReasonings = [];
    
    finalResult.recommendedIds.forEach((id, index) => {
      const product = products.find(p => p.id === id);
      if (!product) return;
      
      // Math enforcement
      if (exactPrice !== null && product.price !== exactPrice) return;
      if (product.price >= maxPrice) return;
      
      // Brand enforcement (if a brand is mentioned, ONLY allow that brand)
      if (mentionedBrands.length > 0) {
        if (!mentionedBrands.includes(product.brand.toLowerCase())) return;
      }
      
      validIds.push(id);
      if (finalResult.reasoning && finalResult.reasoning[index]) {
        validReasonings.push(finalResult.reasoning[index]);
      }
    });
    
    finalResult.recommendedIds = validIds;
    finalResult.reasoning = validReasonings;
  }

  return finalResult;
}
