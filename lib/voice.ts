type Voice = {
  voice_id?: string;
  name?: string;
  labels?: Record<string, string>;
};

type ElevenResponse = { voiceId: string; audioBytes: number; provider: "elevenlabs" };

async function listVoices(apiKey: string) {
  const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
    headers: { "xi-api-key": apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ElevenLabs voice list failed (${response.status}): ${await response.text()}`);
  const data = await response.json() as { voices?: Voice[] };
  return (data.voices ?? []).filter((voice) => Boolean(voice.voice_id));
}

async function generateWithElevenLabs(script: string, apiKey: string): Promise<ElevenResponse> {
  const voices = await listVoices(apiKey);
  if (!voices.length) throw new Error("ElevenLabs returned no usable voices.");

  // Do not depend on hard-coded voice IDs or a male-only restriction. Prefer a
  // natural-sounding English voice when the account exposes language/gender labels,
  // but allow any available voice so the account remains fully flexible.
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
    // A deleted/invalid voice should never stop the whole pipeline. Try another
    // live voice from the account before falling through to the backup provider.
    if (response.status === 401 || response.status === 429 || response.status >= 500) break;
  }

  throw new Error(lastError || "ElevenLabs could not generate audio.");
}

async function generateWithGoogleTTS(script: string): Promise<ElevenResponse> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY?.trim();
  if (!apiKey) throw new Error("GOOGLE_TTS_API_KEY is not configured.");

  const languageCode = process.env.GOOGLE_TTS_LANGUAGE_CODE?.trim() || "en-US";
  const voiceName = process.env.GOOGLE_TTS_VOICE_NAME?.trim() || "en-US-Neural2-D";
  const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      input: { text: script },
      voice: { languageCode, name: voiceName },
      audioConfig: { audioEncoding: "MP3" },
    }),
  });
  if (!response.ok) throw new Error(`Google Cloud TTS failed (${response.status}): ${await response.text()}`);
  const data = await response.json() as { audioContent?: string };
  if (!data.audioContent) throw new Error("Google Cloud TTS returned no audio.");
  return { voiceId: `${languageCode}:${voiceName}`, audioBytes: Buffer.from(data.audioContent, "base64").byteLength, provider: "elevenlabs" };
}

export async function generateVoice(script: string) {
  if (!script.trim()) throw new Error("Voice generation received an empty script.");

  const elevenKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (elevenKey) {
    try {
      return await generateWithElevenLabs(script, elevenKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ElevenLabs error";
      console.warn(`[voice] ElevenLabs failed; trying Google Cloud TTS fallback: ${message}`);
    }
  }

  try {
    const google = await generateWithGoogleTTS(script);
    return { ...google, provider: "google" as const };
  } catch (error) {
    const googleMessage = error instanceof Error ? error.message : "Unknown Google TTS error";
    if (!elevenKey) throw new Error(`ElevenLabs is not configured and Google Cloud TTS failed: ${googleMessage}`);
    throw new Error(`All voice providers failed. ElevenLabs was unavailable and Google Cloud TTS failed: ${googleMessage}`);
  }
}
