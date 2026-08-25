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

  // No hard-coded voice IDs and no male-only restriction. Prefer English voices
  // when labels expose that information, while allowing any account voice.
  const english = voices.filter((voice) => {
    const labels = Object.values(voice.labels ?? {}).join(" ").toLowerCase();
    return labels.includes("english") || labels.includes("en-") || labels.includes("american") || labels.includes("british");
  });
  const candidates = english.length ? english : voices;
  const ordered = [...candidates].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  let lastError = "";
  for (const voice of ordered.slice(0, Math.min(8, ordered.length))) {
    const voiceId = voice.voice_id!;
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: script,
        model_id: "eleven_multilingual_v2",
        output_format: "mp3_44100_128",
      }),
    });

    if (response.ok) {
      const audio = Buffer.from(await response.arrayBuffer());
      return { voiceId, audioBytes: audio.byteLength, provider: "elevenlabs" };
    }

    lastError = `ElevenLabs voice ${voiceId} failed (${response.status}): ${await response.text()}`;
    if (response.status === 401 || response.status === 429 || response.status >= 500) break;
  }

  throw new Error(lastError || "ElevenLabs could not generate audio.");
}

async function generateWithDeepgram(script: string): Promise<VoiceResponse> {
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not configured.");

  // Aura-2 is Deepgram's current general-purpose TTS family. Keep the model
  // configurable so a different available voice can be selected later without
  // changing application code.
  const model = process.env.DEEPGRAM_TTS_MODEL?.trim() || "aura-2-thalia-en";
  const response = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=mp3`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text: script }),
  });

  if (!response.ok) {
    throw new Error(`Deepgram TTS failed (${response.status}): ${await response.text()}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.byteLength) throw new Error("Deepgram TTS returned empty audio.");
  return { voiceId: model, audioBytes: audio.byteLength, provider: "deepgram" };
}

export async function generateVoice(script: string) {
  if (!script.trim()) throw new Error("Voice generation received an empty script.");

  const elevenKey = process.env.ELEVENLABS_API_KEY?.trim();
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
    if (!elevenKey) {
      throw new Error(`ElevenLabs is not configured and Deepgram TTS failed: ${deepgramMessage}`);
    }
    throw new Error(`All voice providers failed. ElevenLabs was unavailable and Deepgram TTS failed: ${deepgramMessage}`);
  }
}
