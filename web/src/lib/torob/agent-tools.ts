/**
 * Catalog of tools the LLM shopping agent can call.
 *
 * The z-ai SDK exposes an OpenAI-compatible chat.completions API. We use a
 * prompt-based function-calling protocol (the model emits a single JSON object
 * describing which tool to call and its arguments) rather than relying on
 * native tool-calling, for portability. The orchestrator executes the chosen
 * tool against the TS ShoppingTools and feeds the result back to the model
 * for a final Persian answer.
 */

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export const TOOL_CATALOG = [
  {
    name: "search_products",
    description:
      "جست‌وجوی محصول در دیتاست. ورودی: query (مثلا «ماوس بی‌سیم»)، و فیلترهای اختیاری max_price، min_price، brand، category، near (نام محله تهران مثل صادقیه)، radius_km، fast_delivery (bool)، sort (relevance|price_asc|price_desc|distance)، limit، offset.",
    args: {
      query: "string (لازم)",
      max_price: "number? (تومان)",
      min_price: "number? (تومان)",
      brand: "string?",
      category: "string?",
      near: "string? (نام محله)",
      radius_km: "number?",
      fast_delivery: "boolean?",
      sort: "string? (relevance|price_asc|price_desc|distance)",
      limit: "number?",
    },
  },
  {
    name: "get_product_details",
    description: "جزئیات کامل یک محصول با شناسه product_id.",
    args: { product_id: "string (لازم، با پیشوند product_)" },
  },
  {
    name: "compare_offers",
    description:
      "مقایسه پیشنهادهای قیمت یک محصول در فروشگاه‌های مختلف. فیلترهای اختیاری مثل near/radius_km/sort پشتیبانی می‌شود.",
    args: {
      product_id: "string (لازم)",
      near: "string?",
      radius_km: "number?",
      sort: "string?",
      limit: "number?",
    },
  },
  {
    name: "find_shops",
    description:
      "کشف فروشگاه‌ها بر اساس فیلتر و موقعیت. خروجی شامل فاصله و تعداد پیشنهادهای منطبق است.",
    args: {
      near: "string? (نام محله)",
      radius_km: "number?",
      category: "string?",
      fast_delivery: "boolean?",
      sort: "string?",
      limit: "number?",
    },
  },
  {
    name: "find_alternatives",
    description: "جایگزین‌های هم‌دسته یک محصول، با بودجه اختیاری (تومان).",
    args: {
      product_id: "string (لازم)",
      budget: "number? (تومان)",
      limit: "number?",
    },
  },
  {
    name: "plan_shopping_trip",
    description:
      "برنامه‌ریزی سفر خرید برای چند کالا با حداکثر چند فروشگاه. فاصله‌ها تقریبی (هوایی) هستند.",
    args: {
      items: "array of {product_id} (لازم)",
      start: "{lat,lon}? (موقعیت شروع)",
      max_shops: "number?",
    },
  },
] as const;

export const AGENT_SYSTEM_PROMPT = `You are "طرب‌گارد"، a Persian shopping assistant for Tehran. You help users find products, compare prices across shops, discover nearby shops, suggest alternatives, and plan shopping trips.

You have access to the following tools backed by a real product/offer/shop dataset (prices in toman):

${TOOL_CATALOG.map(
  (t) =>
    `- ${t.name}: ${t.description}\n  آرگومان‌ها: ${JSON.stringify(t.args)}`
).join("\n\n")}

RULES:
1. Reply ONLY in Persian (Farsi). Use Persian digits and currency (تومان) in prose.
2. To answer a user question, FIRST decide which single tool best matches the intent, then emit EXACTLY one JSON object on its own, with no other text, in this shape:
   {"tool":"<tool name>","args":{...}}
3. Choose arguments carefully. For free-text product queries, put the product phrase into "query". For neighborhood names, use "near".
4. If the user asks about a specific product they already see, use its product_id in get_product_details / compare_offers / find_alternatives.
5. For a shopping list (multiple products), use plan_shopping_trip with items.
6. Never invent product_ids, prices, or shop names. If you do not have a product_id, run search_products first.
7. Be honest about dataset limitations: shop names are synthetic, prices may be stale (timestamps go back to 2020), and there is no stock information. Mention these when relevant.

Output ONLY the JSON object now.`;

export const AGENT_SUMMARY_PROMPT = `You are "طرب‌گارد"، a Persian shopping assistant. You just called a tool and received its JSON result. Now write a concise, friendly Persian answer for the user based on the result.

RULES:
1. Reply ONLY in Persian. Use Persian digits and currency (تومان).
2. Present useful specifics from the result: product titles, cheapest price, number of offers, shop names WITH a note that shop names are synthetic, distances, timestamps (note prices may be stale).
3. If the result has no matches, say so clearly and suggest a broader query.
4. Do NOT invent data not present in the result.
5. Keep it short (3-8 lines). Use simple bullet points where helpful.

User's original question:
{QUESTION}

Tool called: {TOOL}
Result:
{RESULT}

Write the Persian answer now.`;
