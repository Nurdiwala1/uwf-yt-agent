import type { ContentJob, JobLog, JobState } from "./types";
import { formatForDate, dailySlots } from "./schedule";

declare global { var uwfStore: { jobs: ContentJob[]; logs: JobLog[] } | undefined; }
const now = new Date();
const format = formatForDate(now);
const seed = (): ContentJob[] => dailySlots(now).map((slot, index) => ({
  id: `seed-${index + 1}`, title: index ? "Bitcoin: What Moves the Market Today?" : "Smart Investing: Today’s Crypto Setup",
  topic: index ? "Crypto market analysis" : "Investment education", format, state: index ? "queued" : "researching",
  scheduledFor: slot.toISOString(), createdAt: now.toISOString(), attempts: 0,
}));
const db = () => (global.uwfStore ??= { jobs: seed(), logs: [{ id: "log-1", jobId: "seed-1", level: "info", message: "Research workflow started.", createdAt: now.toISOString() }] });
export const store = {
  list: () => db().jobs.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)),
  get: (id: string) => db().jobs.find((j) => j.id === id),
  create: (input: Pick<ContentJob, "title" | "topic" | "format" | "scheduledFor">) => { const job: ContentJob = { ...input, id: crypto.randomUUID(), state: "queued", createdAt: new Date().toISOString(), attempts: 0 }; db().jobs.push(job); return job; },
  update: (id: string, state: JobState, error?: string) => { const job = store.get(id); if (!job) return undefined; job.state = state; job.error = error; if (state === "scheduled" || state === "published") job.attempts++; return job; },
  patch: (id: string, patch: Partial<ContentJob>) => { const job = store.get(id); if (!job) return undefined; Object.assign(job, patch); return job; },
  logs: (jobId?: string) => db().logs.filter((log) => !jobId || log.jobId === jobId),
  log: (jobId: string, message: string, level: JobLog["level"] = "info") => { db().logs.unshift({ id: crypto.randomUUID(), jobId, message, level, createdAt: new Date().toISOString() }); },
};
