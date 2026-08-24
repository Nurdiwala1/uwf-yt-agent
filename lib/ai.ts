type ResearchResult = { research: string; script: string; title: string; description: string; tags: string[]; seo: string };
type Provider = "groq" | "openrouter" | "ollama";
type GenerateOptions = { webSearch?: boolean; json?: boolean; modelName?: string; timeoutMs?: number; maxTokens?: number };
type UnknownRecord = Record<string, unknown>;

const configuredProvider = (): "auto" | Provider => {
  const value = (process.env.AI_PROVIDER || "auto").toLowerCase();
  if (value === "groq" || value === "openrouter" || value === "ollama") return value;
  return "auto";
};
const providerAvailability = (provider: Provider) => provider === "groq" ? Boolean(process.env.GROQ_API_KEY) : provider === "openrouter" ? Boolean(process.env.OPENROUTER_API_KEY) : Boolean(process.env.OLLAMA_BASE_URL);
const providerOrder = (): Provider[] => { const preferred = configuredProvider(); const all: Provider[] = ["groq", "openrouter", "ollama"]; return preferred === "auto" ? all : [preferred, ...all.filter(p => p !== preferred)]; };
const modelFor = (provider: Provider, options: GenerateOptions) => {
  if (options.modelName) return options.modelName;
  if (provider === "groq") return options.webSearch ? process.env.GROQ_RESEARCH_MODEL || "groq/compound-mini" : process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  if (provider === "openrouter") return process.env.OPENROUTER_MODEL || "openrouter/free";
  return process.env.OLLAMA_MODEL || "llama3.2:3b";
};
const parseResponseText = (data: unknown): string => {
  if (!data || typeof data !== "object") throw new Error("AI provider returned an invalid response.");
  const record = data as UnknownRecord; const choices = Array.isArray(record.choices) ? record.choices : []; const firstChoice = choices[0];
  const firstMessage = firstChoice && typeof firstChoice === "object" ? (firstChoice as UnknownRecord).message : undefined;
  const openAiText = firstMessage && typeof firstMessage === "object" ? (firstMessage as UnknownRecord).content : undefined;
  if (typeof openAiText === "string" && openAiText.trim()) return openAiText.trim();
  const ollamaMessage = record.message; const ollamaText = ollamaMessage && typeof ollamaMessage === "object" ? (ollamaMessage as UnknownRecord).content : record.response;
  if (typeof ollamaText === "string" && ollamaText.trim()) return ollamaText.trim();
  throw new Error("AI provider returned no output text.");
};
const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = 20_000) => { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs); try { return await fetch(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timeout); } };
async function requestGroq(input: string, options: GenerateOptions) { const apiKey = process.env.GROQ_API_KEY; if (!apiKey) throw new Error("GROQ_API_KEY is not configured."); const model = modelFor("groq", options); const body: Record<string, unknown> = { model, messages: [{ role: "user", content: input }] }; if (options.maxTokens) body.max_completion_tokens = options.maxTokens; if (options.json) body.response_format = { type: "json_object" }; const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) }, options.timeoutMs ?? 20_000); if (!response.ok) throw new Error(`Groq request failed (${response.status}): ${await response.text()}`); return parseResponseText(await response.json()); }
async function requestOpenRouter(input: string, options: GenerateOptions) { const apiKey = process.env.OPENROUTER_API_KEY; if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured."); const body: Record<string, unknown> = { model: modelFor("openrouter", options), messages: [{ role: "user", content: input }] }; if (options.maxTokens) body.max_tokens = options.maxTokens; if (options.json) body.response_format = { type: "json_object" }; const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://uwf-yt-agent.vercel.app", "X-Title": "UWF YT Agent" }, body: JSON.stringify(body) }, options.timeoutMs ?? 20_000); if (!response.ok) throw new Error(`OpenRouter request failed (${response.status}): ${await response.text()}`); return parseResponseText(await response.json()); }
async function requestOllama(input: string, options: GenerateOptions) { const baseUrl = (process.env.OLLAMA_BASE_URL || "").replace(/\/$/, ""); if (!baseUrl) throw new Error("OLLAMA_BASE_URL is not configured."); const body: Record<string, unknown> = { model: modelFor("ollama", options), messages: [{ role: "user", content: input }], stream: false }; if (options.json) body.format = "json"; const response = await fetchWithTimeout(`${baseUrl}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, options.timeoutMs ?? 20_000); if (!response.ok) throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`); return parseResponseText(await response.json()); }
async function requestProvider(provider: Provider, input: string, options: GenerateOptions) { return provider === "groq" ? requestGroq(input, options) : provider === "openrouter" ? requestOpenRouter(input, options) : requestOllama(input, options); }
async function generateContent(input: string, options: GenerateOptions = {}) { const errors: string[] = []; const providers = providerOrder().filter(providerAvailability); if (!providers.length) throw new Error("No AI provider is configured. Add GROQ_API_KEY, OPENROUTER_API_KEY, or OLLAMA_BASE_URL in Vercel Environment Variables."); for (const provider of providers) { try { return await requestProvider(provider, input, options); } catch (error) { errors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`); } } throw new Error(`All AI providers failed. ${errors.join(" | ")}`); }

export async function researchTopic(topic: string) {
  const prompt = `Research this UWF YouTube long-form topic: ${topic}. Return a concise factual research brief with key facts, important numbers/dates, recent developments, and source names. Keep it under 700 words. Do not invent facts. If you do not know a current fact, clearly say that it needs verification.`;
  return generateContent(prompt, { webSearch: false, timeoutMs: 20_000, maxTokens: 900 });
}
export async function buildContent(topic: string, research: string): Promise<ResearchResult> {
  const duration = "5-10 minutes";
  const scriptOutput = await generateContent(`You are the UWF YouTube content producer. Topic: ${topic}. Target duration: ${duration}.\n\nResearch:\n${research}\n\nWrite only the production-ready English narration script. It must be factual, engaging, natural for a male voice, and easy to understand. Do not add title, description, tags, headings, stage directions, or markdown.`, { timeoutMs: 20_000, maxTokens: 1600 });
  const metadataOutput = await generateContent(`You are the UWF YouTube SEO producer. Topic: ${topic}. Target duration: ${duration}.\n\nResearch:\n${research}\n\nScript:\n${scriptOutput}\n\nReturn ONLY valid JSON with exactly these keys: title, description, tags, seo.\n- title: clickable without misleading claims.\n- description: YouTube-ready description.\n- tags: array of 10-15 relevant keywords.\n- seo: briefly explain the primary keyword, search intent, and why the title/description match it.`, { json: true, timeoutMs: 20_000, maxTokens: 900 });
  const cleaned = metadataOutput.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim(); const parsed: unknown = JSON.parse(cleaned); if (!parsed || typeof parsed !== "object") throw new Error("AI metadata response is not valid JSON.");
  const metadata = parsed as UnknownRecord; const title = metadata.title; const description = metadata.description; const tags = metadata.tags; const seo = metadata.seo;
  if (typeof title !== "string" || typeof description !== "string" || !Array.isArray(tags)) throw new Error("AI content response is incomplete.");
  return { research, script: scriptOutput, title, description, tags: tags.filter((tag): tag is string => typeof tag === "string"), seo: typeof seo === "string" ? seo : "" };
}
