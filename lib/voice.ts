type Voice = {
  voice_id?: string;
  name?: string;
  labels?: Record<string, string>;
};

async function findMaleVoice(apiKey: string) {
  const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
    headers: { "xi-api-key": apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ElevenLabs voice list failed (${response.status}): ${await response.text()}`);
  const data = await response.json() as { voices?: Voice[] };
  const voices = data.voices ?? [];
  const male = voices.find((voice) => {
    const gender = (voice.labels?.gender ?? "").toLowerCase();
    return Boolean(voice.voice_id) && gender === "male";
  });
  const fallback = voices.find((voice) => Boolean(voice.voice_id));
  if (!male?.voice_id && !fallback?.voice_id) throw new Error("ElevenLabs returned no usable voices.");
  return male?.voice_id ?? fallback!.voice_id!;
}

function configuredVoiceId() {
  return process.env.ELEVENLABS_VOICE_ID?.trim() || "";
}

export async function generateVoice(script: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");

  // Prefer the user's configured voice. If it was deleted/invalid, automatically
  // discover a live male voice from the connected ElevenLabs account.
  let voiceId = configuredVoiceId();
  if (!voiceId) voiceId = await findMaleVoice(apiKey);

  let response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
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

  // Recover from the old hard-coded/deleted voice problem without requiring a
  // redeploy or manual voice-ID hunt.
  if (response.status === 404 && configuredVoiceId()) {
    voiceId = await findMaleVoice(apiKey);
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
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
  }

  if (!response.ok) {
    throw new Error(`ElevenLabs generation failed (${response.status}): ${await response.text()}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  return { voiceId, audioBytes: audio.byteLength };
}
