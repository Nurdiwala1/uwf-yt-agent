type ResearchResult = { research: string; script: string; title: string; description: string; tags: string[]; seo: string };

const apiKey = () => {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  return process.env.OPENAI_API_KEY;
};

async function responses(input: string, webSearch = false) {
  const body: Record<string, unknown> = {
    model: process.env.OPENAI_MODEL || "gpt-5.6",
    input,
  };
  if (webSearch) body.tools = [{ type: "web_search_preview" }];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}): ${await response.text()}`);
  const data = await response.json();
  if (!data.output_text) throw new Error("OpenAI returned no output text.");
  return data.output_text as string;
}

export async function researchTopic(topic: string, format: "short" | "long") {
  return responses(`Research this YouTube topic for UWF: ${topic}. Format: ${format}. Use current web information where useful. Return a concise factual research brief with key facts, recent developments, important numbers/dates, and source names. Do not invent facts.`, true);
}

export async function buildContent(topic: string, research: string, format: "short" | "long"): Promise<ResearchResult> {
  const duration = format === "short" ? "30-60 seconds" : "5-10 minutes";
  const output = await responses(`You are the UWF YouTube content producer. Topic: ${topic}. Target duration: ${duration}. Research:\n${research}\n\nCreate production-ready English content. Return ONLY valid JSON with keys: script, title, description, tags, seo. script must be natural male-voice narration, factual and engaging. title must be clickable without misleading claims. description should be YouTube-ready. tags must be an array of 10-15 relevant keywords. seo should briefly explain the primary keyword, search intent, and why the title/description match it.`);
  const cleaned = output.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed.script || !parsed.title || !parsed.description || !Array.isArray(parsed.tags)) throw new Error("AI content response is incomplete.");
  return { research, script: parsed.script, title: parsed.title, description: parsed.description, tags: parsed.tags, seo: parsed.seo ?? "" };
}
