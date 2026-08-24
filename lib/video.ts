const key = () => {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  return process.env.OPENAI_API_KEY;
};

/** Long-form video generation only. */
export async function startVideo(prompt: string) {
  const form = new FormData();
  form.append("model", process.env.VIDEO_PROVIDER === "sora-2-pro" ? "sora-2-pro" : "sora-2");
  form.append("seconds", "20");
  form.append("size", "1280x720");
  const response = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Video generation request failed (${response.status}): ${await response.text()}`);
  const data = await response.json();
  if (!data.id) throw new Error("Video provider returned no job id.");
  return { id: data.id as string, status: data.status as string };
}

export async function getVideo(videoId: string) {
  const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${key()}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error(`Video status request failed (${response.status}): ${await response.text()}`);
  return response.json();
}

export async function downloadVideo(videoId: string) {
  const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(videoId)}/content`, {
    headers: { Authorization: `Bearer ${key()}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error(`Video download failed (${response.status}): ${await response.text()}`);
  if (!response.body) throw new Error("Video provider returned an empty video body.");
  return response.body;
}
