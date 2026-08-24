import { store } from "./store";
import type { ContentJob, JobState } from "./types";

const steps: JobState[] = ["researching", "scripting", "generating_voice", "generating_visuals", "assembling", "thumbnail", "quality_check", "uploading", "scheduled"];
/** Orchestrator contract. Workers should call one stage at a time; external generation is intentionally not faked. */
export async function advanceJob(job: ContentJob) {
  const next = steps[steps.indexOf(job.state) + 1] ?? "researching";
  await store.update(job.id, next);
  await store.log(job.id, `Moved to ${next.replaceAll("_", " ")}.`);
  return (await store.get(job.id))!;
}
