async function getVoiceId(apiKey: string) {
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  const response = await fetch("https://api.elevenlabs.io/v2/voices", { headers: { "xi-api-key": apiKey } });
  if (!response.ok) throw new Error(`ElevenLabs voices request failed (${response.status}).`);
  const data = await response.json();
  const male = (data.voices ?? []).find((voice: { labels?: { gender?: string } }) => voice.labels?.gender?.toLowerCase() === "male");
  const selected = male ?? data.voices?.[0];
  if (!selected?.voice_id) throw new Error("No ElevenLabs voice is available.");
  return selected.voice_id as string;
}

export async function generateVoice(script: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");
  const voiceId = await getVoiceId(apiKey);
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: script, model_id: "eleven_multilingual_v2", output_format: "mp3_44100_128" }),
  });
  if (!response.ok) throw new Error(`ElevenLabs generation failed (${response.status}): ${await response.text()}`);
  const audio = Buffer.from(await response.arrayBuffer());
  return { voiceId, audioBytes: audio.byteLength };
}
