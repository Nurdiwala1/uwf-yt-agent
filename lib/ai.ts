type ResearchResult = { research: string; script: string; title: string; description: string; tags: string[]; seo: string };
type Provider = "groq" | "openrouter" | "ollama";
type GenerateOptions = { json?: boolean; modelName?: string; timeoutMs?: number; maxTokens?: number };
type RecordLike = Record<string, unknown>;

const configured = (): "auto" | Provider => {
  const value = (process.env.AI_PROVIDER || "auto").toLowerCase();
  return value === "groq" || value === "openrouter" || value === "ollama" ? value : "auto";
};
const available = (p: Provider) => p === "groq" ? Boolean(process.env.GROQ_API_KEY) : p === "openrouter" ? Boolean(process.env.OPENROUTER_API_KEY) : Boolean(process.env.OLLAMA_BASE_URL);
const providers = (): Provider[] => { const preferred = configured(); const all: Provider[] = ["groq", "openrouter", "ollama"]; return preferred === "auto" ? all : [preferred, ...all.filter(p => p !== preferred)]; };
const modelFor = (p: Provider, o: GenerateOptions) => o.modelName || (p === "groq" ? process.env.GROQ_MODEL || "openai/gpt-oss-120b" : p === "openrouter" ? process.env.OPENROUTER_MODEL || "openrouter/free" : process.env.OLLAMA_MODEL || "llama3.2:3b");
const textOf = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : Array.isArray(v) ? v.map(x => typeof x === "string" ? x : x && typeof x === "object" && typeof (x as RecordLike).text === "string" ? (x as RecordLike).text : x && typeof x === "object" && typeof (x as RecordLike).content === "string" ? (x as RecordLike).content : "").filter(Boolean).join("\n").trim() || null : null;
const parseText = (data: unknown): string => {
  if (!data || typeof data !== "object") throw new Error("AI provider returned an invalid response.");
  const r = data as RecordLike;
  const direct = textOf(r.output_text); if (direct) return direct;
  const choice = Array.isArray(r.choices) ? r.choices[0] : null;
  if (choice && typeof choice === "object") { const c = choice as RecordLike; const m = c.message; if (m && typeof m === "object") { const t = textOf((m as RecordLike).content) || textOf((m as RecordLike).reasoning_content); if (t) return t; } const t = textOf(c.text); if (t) return t; }
  const om = r.message; if (om && typeof om === "object") { const t = textOf((om as RecordLike).content); if (t) return t; }
  const response = textOf(r.response); if (response) return response;
  throw new Error("AI provider returned no output text.");
};
const request = async (url: string, init: RequestInit, timeout = 20000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout); try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); } };

async function requestProvider(p: Provider, input: string, o: GenerateOptions) {
  const model = modelFor(p, o);
  if (p === "groq") {
    const key = process.env.GROQ_API_KEY; if (!key) throw new Error("GROQ_API_KEY is not configured.");
    const body: RecordLike = { model, messages: [{ role: "user", content: input }] }; if (o.maxTokens) body.max_completion_tokens = o.maxTokens; if (o.json) body.response_format = { type: "json_object" };
    const res = await request("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body) }, o.timeoutMs);
    if (!res.ok) throw new Error(`Groq request failed (${res.status}): ${await res.text()}`); return parseText(await res.json());
  }
  if (p === "openrouter") {
    const key = process.env.OPENROUTER_API_KEY; if (!key) throw new Error("OPENROUTER_API_KEY is not configured.");
    const body: RecordLike = { model, messages: [{ role: "user", content: input }] }; if (o.maxTokens) body.max_tokens = o.maxTokens; if (o.json && process.env.OPENROUTER_JSON_MODE === "true") body.response_format = { type: "json_object" };
    const res = await request("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://uwf-yt-agent.vercel.app", "X-Title": "UWF YT Agent" }, body: JSON.stringify(body) }, o.timeoutMs);
    if (!res.ok) throw new Error(`OpenRouter request failed (${res.status}): ${await res.text()}`); return parseText(await res.json());
  }
  const base = (process.env.OLLAMA_BASE_URL || "").replace(/\/$/, ""); if (!base) throw new Error("OLLAMA_BASE_URL is not configured.");
  const body: RecordLike = { model, messages: [{ role: "user", content: input }], stream: false }; if (o.json) body.format = "json";
  const res = await request(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, o.timeoutMs);
  if (!res.ok) throw new Error(`Ollama request failed (${res.status}): ${await res.text()}`); return parseText(await res.json());
}

async function generate(input: string, o: GenerateOptions = {}) {
  const errors: string[] = [];
  for (const p of providers().filter(available)) { try { return await requestProvider(p, input, o); } catch (e) { errors.push(`${p}: ${e instanceof Error ? e.message : String(e)}`); } }
  throw new Error(`All AI providers failed. ${errors.join(" | ") || "No AI provider is configured."}`);
}

function jsonObject(text: string): RecordLike {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{"); if (start < 0) throw new Error("AI metadata response was not valid JSON.");
  let depth = 0, string = false, escaped = false;
  for (let i = start; i < cleaned.length; i++) { const ch = cleaned[i]; if (string) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') string = false; continue; } if (ch === '"') string = true; else if (ch === "{") depth++; else if (ch === "}" && --depth === 0) { const parsed = JSON.parse(cleaned.slice(start, i + 1)); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as RecordLike; break; } }
  throw new Error("AI metadata response was not valid JSON.");
}

function fallback(topic: string) { const clean = topic.trim() || "this topic"; const tags = Array.from(new Set([clean, "finance", "crypto", "investment", "money", "UWF", ...clean.split(/[^a-zA-Z0-9]+/).filter(Boolean)])).slice(0, 15); return { title: `${clean} Explained in 60 Seconds`, description: `A quick UWF breakdown of ${clean}, with the key facts and takeaways you need to know.`, tags, seo: `Primary keyword: ${clean}. Search intent: viewers seeking a quick explanation and useful insights.` }; }

export async function researchTopic(topic: string) {
  return generate(`Research this UWF YouTube Short topic: ${topic}. Return a concise factual brief with only the key facts, numbers/dates and recent context needed for a 30-60 second educational video. Do not invent facts.`, { maxTokens: 500, timeoutMs: 20000 });
}

export async function buildContent(topic: string, research: string): Promise<ResearchResult> {
  const script = await generate(`You are the UWF YouTube Shorts producer. Topic: ${topic}. Research: ${research}\nWrite ONLY a production-ready English narration script for a 30-60 second YouTube Short. Aim for roughly 90-140 words. Hook immediately, deliver the most useful facts, and finish with a concise takeaway. No headings, stage directions, markdown, title, or SEO text.`, { maxTokens: 500, timeoutMs: 20000 });
  const prompt = `Return ONLY one valid JSON object, with no markdown or extra text. Topic: ${topic}. Script: ${script}\nSchema: {"title":"string","description":"string","tags":["string"],"seo":"string"}. Title should be clickable but truthful. Description should be YouTube-ready. Tags should contain 8-15 relevant strings. SEO should state the primary keyword and search intent. The first character must be { and the last character must be }.`;
  let metadata: RecordLike | null = null;
  try { metadata = jsonObject(await generate(prompt, { json: true, maxTokens: 500, timeoutMs: 20000 })); } catch {
    try { metadata = jsonObject(await generate(`Return ONLY JSON for this YouTube Short. Topic: ${topic}. Script: ${script}. Schema: {"title":"string","description":"string","tags":["string"],"seo":"string"}.`, { json: true, maxTokens: 500, timeoutMs: 20000 })); } catch { metadata = null; }
  }
  const base = fallback(topic);
  const title = typeof metadata?.title === "string" && metadata.title.trim() ? metadata.title.trim() : base.title;
  const description = typeof metadata?.description === "string" && metadata.description.trim() ? metadata.description.trim() : base.description;
  const tags = Array.isArray(metadata?.tags) ? metadata.tags.filter((x): x is string => typeof x === "string" && Boolean(x.trim())).slice(0, 15) : base.tags;
  const seo = typeof metadata?.seo === "string" && metadata.seo.trim() ? metadata.seo.trim() : base.seo;
  return { research, script, title, description, tags, seo };
}
