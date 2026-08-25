import { store } from "./store";
import type { ContentJob } from "./types";
import { researchTopic, buildContent } from "./ai";
import { generateVoice } from "./voice";
import { startVideo, getVideo, downloadVideo } from "./video";
import { db, persistenceConfigured } from "./db";
import { uploadToYouTube, getStoredRefreshToken } from "./youtube";

export async function runAutomatedShortStage(input: ContentJob) {
  if (!persistenceConfigured()) throw new Error("Supabase persistence is required for unattended automation.");
  const latest = await store.get(input.id);
  if (!latest || ["failed", "published", "scheduled"].includes(latest.state)) return latest;
  const claimed = await store.claim(latest.id);
  if (!claimed) return (await store.get(latest.id)) ?? latest;
  try {
    let current = await store.get(latest.id);
    if (!current) throw new Error("Job disappeared from the store.");
    if (current.state === "queued") current = (await store.update(current.id, "researching"))!;
    if (current.state === "researching") { const research = await researchTopic(current.topic); await store.patch(current.id, { research }); return (await store.update(current.id, "scripting"))!; }
    if (current.state === "scripting") { const content = await buildContent(current.topic, current.research ?? ""); await store.patch(current.id, { script: content.script, title: content.title, description: content.description, tags: content.tags, seo: content.seo }); return (await store.update(current.id, "generating_voice"))!; }
    if (current.state === "generating_voice") { const voice = await generateVoice(current.script ?? ""); await store.patch(current.id, { voiceId: voice.voiceId, voiceBytes: voice.audioBytes }); return (await store.update(current.id, "generating_visuals"))!; }
    if (current.state === "generating_visuals") {
      if (current.videoId) {
        const video = await getVideo(current.videoId); const status = String(video.status ?? "").toLowerCase();
        if (["completed", "succeeded"].includes(status)) return (await store.update(current.id, "assembling"))!;
        if (["failed", "error", "canceled", "cancelled"].includes(status) || video.error) throw new Error(video.error?.message ?? "Short video generation failed.");
        return current;
      }
      const prompt = `Create a vertical YouTube Short about: ${current.topic}. Target 30-60 seconds. English male narration. Educational finance/crypto story with realistic mixed visuals and clean financial graphics. No copyrighted logos, no on-screen paragraphs and no narration text. Synchronize visuals to this narration: ${current.script ?? ""}.`;
      const video = await startVideo(prompt); await store.patch(current.id, { videoId: video.id }); return (await store.get(current.id))!;
    }
    if (current.state === "assembling") {
      const refreshToken = await getStoredRefreshToken();
      if (!refreshToken) throw new Error("YouTube authorization is not stored. Connect YouTube once from Settings.");
      if (!current.videoId) throw new Error("No completed Short video is attached.");
      const body = await downloadVideo(current.videoId); const scheduled = new Date(current.scheduledFor); const shouldSchedule = scheduled.getTime() > Date.now() + 60_000;
      const result = await uploadToYouTube(refreshToken, { title: current.title, description: current.description ?? "", tags: current.tags ?? [], privacyStatus: shouldSchedule ? "private" : "public", ...(shouldSchedule ? { publishAt: scheduled.toISOString() } : {}) }, body);
      const videoId = result.data.id; if (!videoId) throw new Error("YouTube returned no video ID.");
      await store.patch(current.id, { youtubeVideoId: videoId }); return (await store.update(current.id, shouldSchedule ? "scheduled" : "published"))!;
    }
    return current;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown automation error";
    await store.update(latest.id, "failed", message); await store.log(latest.id, message, "error"); throw error;
  } finally { try { await db.jobs.release(latest.id); } catch {} }
}
