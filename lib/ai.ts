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

// Keep the stronger model for research/script and use the lighter model for
// high-volume metadata work. Both can be overridden from Vercel env vars.
const primaryModel = () => process.env.GEMINI_MODEL || "gemini-3.6-flash";
const liteModel = () => process.env.GEMINI_LITE_MODEL || "gemini-3.5-flash-lite";

async function generateContent(
  input: string,
  options: { webSearch?: boolean; json?: boolean; modelName?: string } = {},
) {
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: input }] }],
  };

  if (options.webSearch) body.tools = [{ google_search: {} }];

  if (options.json) {
    body.generationConfig = {
      responseMimeType: "application/json",
    };
  }

  const selectedModel = options.modelName || primaryModel();
  const maxRetries = 3;
  let lastDetails = "";

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${encodeURIComponent(apiKey())}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (response.ok) {
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("")
        .trim();

      if (!text) throw new Error("Gemini returned no output text.");
      return text;
    }

    lastDetails = await response.text();

    // Gemini returns 429 for RPM/TPM/RPD/quota exhaustion. Back off before
    // retrying instead of immediately hammering the same quota again.
    if (response.status === 429 && attempt < maxRetries) {
      const delayMs = 1500 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    throw new Error(`Gemini request failed (${response.status}): ${lastDetails}`);
  }

  throw new Error(`Gemini request failed: ${lastDetails}`);
}

export async function researchTopic(topic: string, format: "short" | "long") {
  return generateContent(
    `Research this YouTube topic for UWF: ${topic}. Format: ${format}. Use Google Search grounding to verify current information where useful. Return a concise factual research brief with key facts, recent developments, important numbers/dates, and source names. Do not invent facts.`,
    { webSearch: true, modelName: primaryModel() },
  );
}

export async function buildContent(
  topic: string,
  research: string,
  format: "short" | "long",
): Promise<ResearchResult> {
  const duration = format === "short" ? "30-60 seconds" : "5-10 minutes";

  // Use 3.6 Flash for the actual narration/script because it is the more
  // capable agentic model, while keeping metadata generation on Lite.
  const scriptOutput = await generateContent(
    `You are the UWF YouTube content producer. Topic: ${topic}. Target duration: ${duration}.\n\nResearch:\n${research}\n\nWrite only the production-ready English narration script. It must be factual, engaging, natural for a male voice, and easy to understand. Do not add title, description, tags, headings, stage directions, or markdown.`,
    { modelName: primaryModel() },
  );

  const metadataOutput = await generateContent(
    `You are the UWF YouTube SEO producer. Topic: ${topic}. Target duration: ${duration}.\n\nResearch:\n${research}\n\nScript:\n${scriptOutput}\n\nReturn ONLY valid JSON with exactly these keys: title, description, tags, seo.\n- title: clickable without misleading claims.\n- description: YouTube-ready description.\n- tags: array of 10-15 relevant keywords.\n- seo: briefly explain the primary keyword, search intent, and why the title/description match it.`,
    { json: true, modelName: liteModel() },
  );

  const cleaned = metadataOutput
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);

  if (!scriptOutput || !parsed.title || !parsed.description || !Array.isArray(parsed.tags)) {
    throw new Error("AI content response is incomplete.");
  }

  return {
    research,
    script: scriptOutput,
    title: parsed.title,
    description: parsed.description,
    tags: parsed.tags,
    seo: parsed.seo ?? "",
  };
}
