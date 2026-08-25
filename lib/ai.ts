import { z } from "zod";

type UnknownRecord = Record<string, unknown>;

type ResearchResult = {
  research: string;
  script: string;
  title: string;
  description: string;
  tags: string[];
  seo: string;
};

const researchSchema = z.object({ research: z.string().min(1), script: z.string().min(1) });

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

function parseJsonCandidates(raw: string): UnknownRecord {
  const candidates = [raw.trim()];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced) candidates.push(fenced);
  const extracted = extractJsonObject(raw);
  if (extracted && extracted !== candidates[0]) candidates.push(extracted);

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as UnknownRecord;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("AI metadata response was not valid JSON.");
}

function normalizeMetadata(metadata: UnknownRecord, topic: string): ResearchResult["title"] extends string ? Omit<ResearchResult, "research" | "script"> : never {
  const title = typeof metadata.title === "string" && metadata.title.trim() ? metadata.title.trim() : `The Truth About ${topic}`;
  const description = typeof metadata.description === "string" && metadata.description.trim()
    ? metadata.description.trim()
    : `In this UWF video, we break down ${topic} with clear facts, key insights, and practical takeaways.`;
  const rawTags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const tags = rawTags
    .filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim()))
    .map(tag => tag.trim())
    .slice(0, 15);
  if (!tags.length) tags.push(...topic.split(/[^a-zA-Z0-9]+/).filter(Boolean).slice(0, 10).map(word => word.toLowerCase()));
  const seo = typeof metadata.seo === "string" ? metadata.seo.trim() : `Primary keyword: ${topic}. Search intent: viewers looking for clear information and analysis about this topic.`;
  return { title, description, tags, seo };
}

function fallbackMetadata(topic: string): Omit<ResearchResult, "research" | "script"> {
  const cleanTopic = topic.trim() || "this topic";
  const words = cleanTopic.split(/[^a-zA-Z0-9]+/).filter(Boolean).slice(0, 10).map(word => word.toLowerCase());
  const tags = Array.from(new Set([cleanTopic, ...words, "finance", "investment", "crypto", "money", "UWF"])).slice(0, 15);
  return {
    title: `The Truth About ${cleanTopic}`,
    description: `A clear UWF breakdown of ${cleanTopic}, with key facts, practical insights, and important things viewers should know.`,
    tags,
    seo: `Primary keyword: ${cleanTopic}. Related: finance, investment, crypto, money, market analysis.`,
  };
}

async function callAI(prompt: string): Promise<string> {
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openRouterModel = process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";
  const groqModel = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";

  const providers: Array<{ name: string; url: string; key?: string; model: string }> = [
    { name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", key: openRouterKey, model: openRouterModel },
    { name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: groqKey, model: groqModel },
  ].filter(provider => Boolean(provider.key));

  let lastError = "No AI provider is configured.";
  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        }),
      });
      const text = await response.text();
      if (!response.ok) {
        lastError = `${provider.name} failed (${response.status}): ${text}`;
        continue;
      }
      const data = JSON.parse(text) as { choices?: Array<{ message?: { content?: unknown } }> };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) return content.trim();
      lastError = `${provider.name} returned an empty response.`;
    } catch (error) {
      lastError = `${provider.name} request failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }
  throw new Error(lastError);
}

export async function researchTopic(topic: string) {
  const prompt = `Research this topic for a UWF English-language YouTube finance/crypto/investment video. Return ONLY valid JSON with exactly one key: research. Topic: ${topic}`;
  try {
    const raw = await callAI(prompt);
    const parsed = parseJsonCandidates(raw);
    const result = researchSchema.safeParse(parsed);
    if (result.success) return result.data.research;
    if (typeof parsed.research === "string" && parsed.research.trim()) return parsed.research.trim();
    return raw;
  } catch {
    return `Research summary for ${topic}: explain the core concept, recent context, major risks, practical implications, and what viewers should verify before making financial decisions.`;
  }
}

export async function buildContent(topic: string, research: string): Promise<Omit<ResearchResult, "research">> {
  const prompt = `Create content for a UWF English male-narrated long-form YouTube video about ${topic}. Length target: 5-10 minutes. Research: ${research}. Return ONLY valid JSON with exactly these keys: script, title, description, tags, seo. The script must be natural spoken English and suitable for TTS. tags must be an array of strings.`;
  let metadata: UnknownRecord = {};
  let script = "";
  try {
    const raw = await callAI(prompt);
    metadata = parseJsonCandidates(raw);
    if (typeof metadata.script === "string") script = metadata.script.trim();
  } catch {
    // Use deterministic fallbacks below.
  }
  if (!script) {
    script = `Welcome to UWF. Today we are breaking down ${topic}. ${research}\n\nThe key takeaway is to understand the opportunity, the risks, and the information that still needs to be verified. Always research carefully before making financial decisions.`;
  }
  const normalized = normalizeMetadata(metadata, topic);
  return { script, ...normalized };
}
