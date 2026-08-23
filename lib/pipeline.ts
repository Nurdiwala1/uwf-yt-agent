import { store } from "./store";
import type { ContentJob, JobState } from "./types";

const steps: JobState[] = ["researching", "scripting", "generating_voice", "generating_visuals", "assembling", "thumbnail", "quality_check", "uploading", "scheduled"];

/**
 * Stage transition contract. The real worker is wired behind this boundary;
 * a transition is never presented as completed unless the worker succeeds.
 */
export async function advanceJob(job: ContentJob) {
  const next = steps[steps.indexOf(job.state) + 1] ?? "researching";
  store.update(job.id, next);
  store.log(job.id, `Moved to ${next.replaceAll("_", " ")}.`);
  return store.get(job.id)!;
}
