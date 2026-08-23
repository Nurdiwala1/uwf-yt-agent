import { store } from "./store";
import type { ContentJob } from "./types";
import { researchTopic, buildContent } from "./ai";
import { generateVoice } from "./voice";
import { startVideo, getVideo } from "./video";

export async function runLiveStage(job: ContentJob) {
  try {
    if (job.state === "researching") {
      store.log(job.id, "Live research started using OpenAI web search.");
      const research = await researchTopic(job.topic, job.format);
      store.patch(job.id, { research }); store.update(job.id, "scripting");
      store.log(job.id, "Research completed; script generation started.");
    }
    const current = store.get(job.id)!;
    if (current.state === "scripting") {
      const content = await buildContent(current.topic, current.research ?? "", current.format);
      store.patch(job.id, { script: content.script, title: content.title, description: content.description, tags: content.tags, seo: content.seo });
      store.update(job.id, "generating_voice"); store.log(job.id, "Script, title, description, tags and SEO generated.");
    }
    const afterScript = store.get(job.id)!;
    if (afterScript.state === "generating_voice") {
      const voice = await generateVoice(afterScript.script ?? "");
      store.patch(job.id, { voiceId: voice.voiceId, voiceBytes: voice.audioBytes });
      store.update(job.id, "generating_visuals"); store.log(job.id, `Voice generated successfully (${voice.audioBytes} bytes).`);
    }
    const afterVoice = store.get(job.id)!;
    if (afterVoice.state === "generating_visuals") {
      if (afterVoice.videoId) {
        const video = await getVideo(afterVoice.videoId);
        if (video.status === "completed") { store.update(job.id, "assembling"); store.log(job.id, "Sora video generation completed; assembly is ready for the next worker stage."); }
        else if (video.status === "failed" || video.error) throw new Error(video.error?.message ?? "Sora video generation failed.");
        else store.log(job.id, `Sora video still ${video.status ?? "in progress"}.`);
      } else {
        const prompt = `Create a ${afterVoice.format === "short" ? "vertical 12-second" : "landscape 20-second"} YouTube finance/crypto visual for this topic: ${afterVoice.topic}. Use fast, premium, realistic mixed visuals, clean financial graphics, charts and market imagery. No copyrighted logos. The narration script is: ${afterVoice.script ?? ""}.`;
        const video = await startVideo(prompt, afterVoice.format);
        store.patch(job.id, { videoId: video.id }); store.log(job.id, `Sora video job created: ${video.id}.`);
      }
    }
    return store.get(job.id)!;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline error";
    store.update(job.id, "failed", message); store.log(job.id, message, "error"); throw error;
  }
}
