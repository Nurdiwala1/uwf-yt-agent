type ResearchResult = {
  research: string;
  script: string;
  title: string;
  description: string;
  tags: string[];
  seo: string;
};

const apiKey = () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return process.env.GEMINI_API_KEY;
};

const model = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";

async function generateContent(
  input: string,
  options: { webSearch?: boolean; json?: boolean } = {},
) {
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: input }] }],
  };

  if (options.webSearch) body.tools = [{ google_search: {} }];

  if (options.json) {
    body.generationConfig = {
      responseMimeType: "application/json",
      temperature: 0.7,
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent?key=${encodeURIComponent(apiKey())}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${details}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();

  if (!text) throw new Error("Gemini returned no output text.");
  return text;
}

export async function researchTopic(topic: string, format: "short" | "long") {
  return generateContent(
    `Research this YouTube topic for UWF: ${topic}. Format: ${format}. Use Google Search grounding to verify current information where useful. Return a concise factual research brief with key facts, recent developments, important numbers/dates, and source names. Do not invent facts.`,
    { webSearch: true },
  );
}

export async function buildContent(
  topic: string,
  research: string,
  format: "short" | "long",
): Promise<ResearchResult> {
  const duration = format === "short" ? "30-60 seconds" : "5-10 minutes";
  const output = await generateContent(
    `You are the UWF YouTube content producer. Topic: ${topic}. Target duration: ${duration}.\n\nResearch:\n${research}\n\nCreate production-ready English content. Return ONLY valid JSON with keys: script, title, description, tags, seo.\n- script: natural, engaging male-voice narration; factual and easy to understand.\n- title: clickable without misleading claims.\n- description: YouTube-ready description.\n- tags: array of 10-15 relevant keywords.\n- seo: briefly explain the primary keyword, search intent, and why the title/description match it.`,
    { json: true },
  );

  const cleaned = output
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);

  if (!parsed.script || !parsed.title || !parsed.description || !Array.isArray(parsed.tags)) {
    throw new Error("AI content response is incomplete.");
  }

  return {
    research,
    script: parsed.script,
    title: parsed.title,
    description: parsed.description,
    tags: parsed.tags,
    seo: parsed.seo ?? "",
  };
}
