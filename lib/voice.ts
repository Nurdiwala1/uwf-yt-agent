const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJg"; // ElevenLabs Adam (male)

function getVoiceId() {
  // Prefer an explicitly configured voice, otherwise use a stable male fallback.
  return process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
}

export async function generateVoice(script: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");

  const voiceId = getVoiceId();
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

  if (!response.ok) {
    throw new Error(`ElevenLabs generation failed (${response.status}): ${await response.text()}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  return { voiceId, audioBytes: audio.byteLength };
}
