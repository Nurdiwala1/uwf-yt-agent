const FALLBACK_VOICE_IDS = [
  "cCYjmrGZaI86GUJ7F2Nn",
  "HKFOb9iktHA85uKXydRT",
  "s3TPKV1kjDlVtZbl4Ksh",
];

function getVoiceIds() {
  const configured = process.env.ELEVENLABS_VOICE_ID?.trim();
  return Array.from(new Set([configured, ...FALLBACK_VOICE_IDS].filter(Boolean) as string[]));
}

export async function generateVoice(script: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");

  const voiceIds = getVoiceIds();
  const failures: string[] = [];

  for (const voiceId of voiceIds) {
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
      return { voiceId, audioBytes: audio.byteLength };
    }

    const detail = await response.text();
    failures.push(`${voiceId}: ${response.status}`);

    // A missing voice can be safely retried with the next configured fallback.
    // For authentication/quota/server errors, stop immediately instead of hiding
    // the real account problem behind multiple identical requests.
    if (response.status !== 404) {
      throw new Error(`ElevenLabs generation failed (${response.status}): ${detail}`);
    }
  }

  throw new Error(`ElevenLabs generation failed: no configured voice was found. Tried ${failures.join(", ")}`);
}
