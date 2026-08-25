type Voice = {
  voice_id?: string;
  name?: string;
  labels?: Record<string, string>;
};

type VoiceResponse = {
  voiceId: string;
  audioBytes: number;
  provider: "elevenlabs" | "deepgram";
};

// Deepgram currently rejects payloads above 2000 characters. Keep chunks
// comfortably below that limit and prefer sentence/paragraph boundaries so
// long-form narration can be synthesized without losing the script.
const TTS_CHUNK_LIMIT = 1800;

function splitForTTS(script: string): string[] {
  const normalized = script.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= TTS_CHUNK_LIMIT) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > TTS_CHUNK_LIMIT) {
    const window = remaining.slice(0, TTS_CHUNK_LIMIT + 1);
    let cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"));
    if (cut < TTS_CHUNK_LIMIT * 0.55) {
      const sentenceCut = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("? "),
        window.lastIndexOf("! "),
      );
      cut = sentenceCut >= TTS_CHUNK_LIMIT * 0.55 ? sentenceCut + 1 : -1;
    }
    if (cut < TTS_CHUNK_LIMIT * 0.55) cut = TTS_CHUNK_LIMIT;
    const chunk = remaining.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function listVoices(apiKey: string) {
  const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
    headers: { "xi-api-key": apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ElevenLabs voice list failed (${response.status}): ${await response.text()}`);
  const data = await response.json() as { voices?: Voice[] };
  return (data.voices ?? []).filter((voice) => Boolean(voice.voice_id));
}

async function generateWithElevenLabs(script: string, apiKey: string): Promise<VoiceResponse> {
  const voices = await listVoices(apiKey);
  if (!voices.length) throw new Error("ElevenLabs returned no usable voices.");

  const english = voices.filter((voice) => {
    const labels = Object.values(voice.labels ?? {}).join(" ").toLowerCase();
    return labels.includes("english") || labels.includes("en-") || labels.includes("american") || labels.includes("british");
  });
  const candidates = english.length ? english : voices;
  const ordered = [...candidates].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const chunks = splitForTTS(script);
  if (!chunks.length) throw new Error("Voice generation received an empty script.");

  let lastError = "";
  for (const voice of ordered.slice(0, Math.min(8, ordered.length))) {
    const voiceId = voice.voice_id!;
    let totalBytes = 0;
    let failed = false;

    for (const chunk of chunks) {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: chunk,
          model_id: "eleven_multilingual_v2",
          output_format: "mp3_44100_128",
        }),
      });

      if (!response.ok) {
        lastError = `ElevenLabs voice ${voiceId} failed (${response.status}): ${await response.text()}`;
        failed = true;
        if (response.status === 401 || response.status === 429 || response.status >= 500) break;
        break;
      }
      totalBytes += Buffer.byteLength(Buffer.from(await response.arrayBuffer()));
    }

    if (!failed && totalBytes > 0) {
      return { voiceId, audioBytes: totalBytes, provider: "elevenlabs" };
    }
  }

  throw new Error(lastError || "ElevenLabs could not generate audio.");
}

async function generateWithDeepgram(script: string): Promise<VoiceResponse> {
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not configured.");

  const model = process.env.DEEPGRAM_TTS_MODEL?.trim() || "aura-2-thalia-en";
  const chunks = splitForTTS(script);
  if (!chunks.length) throw new Error("Voice generation received an empty script.");

  let totalBytes = 0;
  for (const chunk of chunks) {
    const response = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=mp3`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text: chunk }),
    });

    if (!response.ok) {
      throw new Error(`Deepgram TTS failed (${response.status}): ${await response.text()}`);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.byteLength) throw new Error("Deepgram TTS returned empty audio.");
    totalBytes += audio.byteLength;
  }

  return { voiceId: model, audioBytes: totalBytes, provider: "deepgram" };
}

export async function generateVoice(script: string) {
  if (!script.trim()) throw new Error("Voice generation received an empty script.");

  const configuredElevenKey = process.env.ELEVENLABS_API_KEY?.trim();
  // ElevenLabs API keys are different from voice IDs/key IDs. A valid API key
  // starts with `sk_`. If a voice ID or key ID was accidentally pasted here,
  // do not waste a request on ElevenLabs; use the configured Deepgram fallback.
  const elevenKey = configuredElevenKey && /^sk_[A-Za-z0-9_-]+$/.test(configuredElevenKey)
    ? configuredElevenKey
    : undefined;

  if (configuredElevenKey && !elevenKey) {
    console.warn("[voice] ELEVENLABS_API_KEY is not a valid sk_ API key; skipping ElevenLabs and using Deepgram fallback.");
  }

  if (elevenKey) {
    try {
      return await generateWithElevenLabs(script, elevenKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ElevenLabs error";
      console.warn(`[voice] ElevenLabs failed; trying Deepgram TTS fallback: ${message}`);
    }
  }

  try {
    return await generateWithDeepgram(script);
  } catch (error) {
    const deepgramMessage = error instanceof Error ? error.message : "Unknown Deepgram TTS error";
    if (!configuredElevenKey) {
      throw new Error(`ElevenLabs is not configured and Deepgram TTS failed: ${deepgramMessage}`);
    }
    throw new Error(`All voice providers failed. ElevenLabs was unavailable and Deepgram TTS failed: ${deepgramMessage}`);
  }
}
