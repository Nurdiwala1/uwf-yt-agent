const openAiKey = () => {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  return process.env.OPENAI_API_KEY;
};

const runwayKey = () => process.env.RUNWAYML_API_SECRET;

/** Short video generation. Prefer Runway when configured; fall back to Sora. */
export async function startVideo(prompt: string) {
  const runway = runwayKey();
  if (runway) {
    const response = await fetch("https://api.dev.runwayml.com/v1/recipes/multi_shot_video", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runway}`,
        "X-Runway-Version": "2024-11-06",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "2026-06",
        mode: "auto",
        prompt: prompt.slice(0, 2400),
        duration: 15,
        ratio: "720:1280",
      }),
    });
    if (response.ok) {
      const data = await response.json();
      if (!data.id) throw new Error("Runway returned no task id.");
      return { id: `runway:${data.id}`, status: data.status ?? "PENDING" };
    }
    // If the optional backup provider is unavailable/rate-limited, fall through to Sora.
  }

  const form = new FormData();
  form.append("model", process.env.VIDEO_PROVIDER === "sora-2-pro" ? "sora-2-pro" : "sora-2");
  form.append("seconds", "12");
  form.append("size", "720x1280");
  form.append("prompt", prompt);
  const response = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey()}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Video generation request failed (${response.status}): ${await response.text()}`);
  const data = await response.json();
  if (!data.id) throw new Error("Video provider returned no job id.");
  return { id: data.id as string, status: data.status as string };
}

export async function getVideo(videoId: string) {
  if (videoId.startsWith("runway:")) {
    const key = runwayKey();
    if (!key) throw new Error("RUNWAYML_API_SECRET is not configured.");
    const id = videoId.slice("runway:".length);
    const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}`, "X-Runway-Version": "2024-11-06" }, cache: "no-store",
    });
    if (!response.ok) throw new Error(`Runway status request failed (${response.status}): ${await response.text()}`);
    const data = await response.json();
    return { ...data, status: String(data.status ?? "").toLowerCase(), outputUrl: Array.isArray(data.output) ? data.output[0] : undefined };
  }
  const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${openAiKey()}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error(`Video status request failed (${response.status}): ${await response.text()}`);
  return response.json();
}

export async function downloadVideo(videoId: string) {
  if (videoId.startsWith("runway:")) {
    const video = await getVideo(videoId);
    if (video.status !== "succeeded" || !video.outputUrl) throw new Error("Runway video is not ready for download.");
    const response = await fetch(video.outputUrl, { cache: "no-store" });
    if (!response.ok || !response.body) throw new Error(`Runway video download failed (${response.status}).`);
    return response.body;
  }
  const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(videoId)}/content`, {
    headers: { Authorization: `Bearer ${openAiKey()}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error(`Video download failed (${response.status}): ${await response.text()}`);
  if (!response.body) throw new Error("Video provider returned an empty video body.");
  return response.body;
}
