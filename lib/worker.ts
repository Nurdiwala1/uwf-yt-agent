import { cookies } from "next/headers";
import { store } from "./store";
import type { ContentJob } from "./types";
import { researchTopic, buildContent } from "./ai";
import { generateVoice } from "./voice";
import { startVideo, getVideo, downloadVideo } from "./video";
import { db, persistenceConfigured } from "./db";
import { uploadToYouTube } from "./youtube";

export async function runLiveStage(input: ContentJob) {
  const latest = await store.get(input.id);
  if (!latest) throw new Error("Job not found.");
  if (["failed", "published", "scheduled"].includes(latest.state)) return latest;
  const claimed = await store.claim(latest.id);
  if (!claimed) return (await store.get(latest.id)) ?? latest;
  try {
    let current = await store.get(latest.id);
    if (!current) throw new Error("Job disappeared from the store.");
    if (current.state === "queued") {
      current = (await store.update(current.id, "researching"))!;
      await store.log(current.id, "Shorts research workflow started by Run Live.");
    }
    if (current.state === "researching") {
      await store.log(current.id, "Shorts research stage running.");
      const research = await researchTopic(current.topic);
      await store.patch(current.id, { research });
      const updated = (await store.update(current.id, "scripting"))!;
      await store.log(current.id, "Research completed; short script stage is ready.");
      return updated;
    }
    if (current.state === "scripting") {
      await store.log(current.id, "Short-form script, title, description, tags and SEO generation started.");
      const content = await buildContent(current.topic, current.research ?? "");
      await store.patch(current.id, { script: content.script, title: content.title, description: content.description, tags: content.tags, seo: content.seo });
      const updated = (await store.update(current.id, "generating_voice"))!;
      await store.log(current.id, "Short script and SEO completed; voice stage is ready.");
      return updated;
    }
    if (current.state === "generating_voice") {
      await store.log(current.id, "Short voice generation started.");
      const voice = await generateVoice(current.script ?? "");
      await store.patch(current.id, { voiceId: voice.voiceId, voiceBytes: voice.audioBytes });
      const updated = (await store.update(current.id, "generating_visuals"))!;
      await store.log(current.id, `Voice generated successfully (${voice.audioBytes} bytes); short video generation is ready.`);
      return updated;
    }
    if (current.state === "generating_visuals") {
      if (current.videoId) {
        const video = await getVideo(current.videoId);
        if (video.status === "completed") {
          const updated = (await store.update(current.id, "assembling"))!;
          await store.log(current.id, "Short video generation completed; publishing is ready.");
          return updated;
        }
        if (video.status === "failed" || video.error) throw new Error(video.error?.message ?? "Video generation failed.");
        await store.log(current.id, `Short video still ${video.status ?? "in progress"}.`);
        return current;
      }
      const prompt = `Create a vertical YouTube Short about: ${current.topic}. Target a concise 30-60 second educational finance/crypto story. Generate an energetic sequence of realistic mixed visuals, clean financial graphics and market imagery. No copyrighted logos, no on-screen paragraphs, and no narration text. Keep the visual story synchronized to this short narration: ${current.script ?? ""}.`;
      const video = await startVideo(prompt);
      const updated = (await store.patch(current.id, { videoId: video.id }))!;
      await store.log(current.id, `Short video job created: ${video.id}.`);
      return updated;
    }
    if (current.state === "assembling") {
      const refreshToken = (await cookies()).get("uwf_youtube_refresh_token")?.value;
      if (!refreshToken) throw new Error("YouTube is not connected. Connect the channel before publishing.");
      if (!current.videoId) throw new Error("No completed short video is attached to this job.");
      await store.log(current.id, "Downloading completed Short for YouTube upload.");
      const videoBody = await downloadVideo(current.videoId);
      const scheduled = new Date(current.scheduledFor);
      const shouldSchedule = scheduled.getTime() > Date.now() + 60_000;
      const result = await uploadToYouTube(refreshToken, { title: current.title, description: current.description ?? "", tags: current.tags ?? [], privacyStatus: shouldSchedule ? "private" : "public", ...(shouldSchedule ? { publishAt: scheduled.toISOString() } : {}) }, videoBody);
      const videoId = result.data.id;
      if (!videoId) throw new Error("YouTube returned no video ID after Short upload.");
      await store.patch(current.id, { youtubeVideoId: videoId });
      const nextState = shouldSchedule ? "scheduled" : "published";
      const updated = (await store.update(current.id, nextState))!;
      await store.log(current.id, shouldSchedule ? `Short uploaded and scheduled for ${scheduled.toISOString()}.` : `Short uploaded and published on YouTube: ${videoId}.`);
      return updated;
    }
    return current;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline error";
    await store.update(latest.id, "failed", message);
    await store.log(latest.id, message, "error");
    throw error;
  } finally {
    if (persistenceConfigured()) { try { await db.jobs.release(latest.id); } catch { /* lease will expire */ } }
  }
}
