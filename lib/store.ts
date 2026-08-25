import type { ContentJob, JobLog, JobState } from "./types";
import { db, persistenceConfigured } from "./db";
import { dailySlots } from "./schedule";

declare global { var uwfStore: { jobs: ContentJob[]; logs: JobLog[] } | undefined; }

function todaySeed(): ContentJob {
  const now = new Date();
  const slot = dailySlots(now)[0];
  const dateKey = slot.toISOString().slice(0, 10);
  return {
    id: `short-${dateKey}`,
    title: `UWF Daily Short — ${dateKey}`,
    topic: "Crypto, finance, investment or earning education",
    format: "short",
    state: "queued",
    scheduledFor: slot.toISOString(),
    createdAt: now.toISOString(),
    attempts: 0,
  };
}

const memory = () => (global.uwfStore ??= { jobs: [], logs: [] });

async function ensureTodayJob() {
  const slot = dailySlots(new Date())[0];
  const dateKey = slot.toISOString().slice(0, 10);
  const existing = await db.jobs.list();
  if (existing.some((j) => j.id === `short-${dateKey}` || j.scheduledFor.slice(0, 10) === dateKey)) return existing;
  const job = todaySeed();
  await db.jobs.insert(job);
  await db.logs.insert({ id: crypto.randomUUID(), jobId: job.id, level: "info", message: "Daily Shorts-only job created automatically.", createdAt: new Date().toISOString() });
  return [job, ...existing];
}

export const store = {
  list: async () => {
    if (!persistenceConfigured()) {
      const m = memory();
      const slot = dailySlots(new Date())[0];
      const dateKey = slot.toISOString().slice(0, 10);
      if (!m.jobs.some((j) => j.scheduledFor.slice(0, 10) === dateKey)) {
        const job = todaySeed(); m.jobs.push(job); m.logs.unshift({ id: crypto.randomUUID(), jobId: job.id, level: "info", message: "Daily Shorts-only job created automatically.", createdAt: new Date().toISOString() });
      }
      return m.jobs.filter((j) => j.format === "short").sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    }
    return (await ensureTodayJob()).filter((j) => j.format === "short").sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  },
  get: async (id: string) => persistenceConfigured() ? db.jobs.get(id) : memory().jobs.find((j) => j.id === id),
  create: async (input: Pick<ContentJob, "title" | "topic" | "scheduledFor"> & { format?: "short" | "long" }) => {
    const job: ContentJob = { title: input.title, topic: input.topic, format: "short", scheduledFor: input.scheduledFor, id: crypto.randomUUID(), state: "queued", createdAt: new Date().toISOString(), attempts: 0 };
    if (persistenceConfigured()) return db.jobs.insert(job);
    memory().jobs.push(job); return job;
  },
  update: async (id: string, state: JobState, error?: string) => {
    const current = await store.get(id); if (!current) return undefined;
    const attempts = state === "scheduled" || state === "published" ? current.attempts + 1 : current.attempts;
    const updated = { state, error, attempts } satisfies Partial<ContentJob>;
    if (persistenceConfigured()) return db.jobs.update(id, updated);
    Object.assign(current, updated); return current;
  },
  patch: async (id: string, patch: Partial<ContentJob>) => {
    if (persistenceConfigured()) return db.jobs.update(id, patch);
    const job = memory().jobs.find((j) => j.id === id); if (!job) return undefined;
    Object.assign(job, patch); return job;
  },
  claim: async (id: string) => persistenceConfigured() ? db.jobs.claim(id) : true,
  release: async (id: string) => persistenceConfigured() ? db.jobs.release(id) : true,
  logs: async (jobId?: string) => persistenceConfigured() ? db.logs.list(jobId) : memory().logs.filter((log) => !jobId || log.jobId === jobId),
  log: async (jobId: string, message: string, level: JobLog["level"] = "info") => {
    const log: JobLog = { id: crypto.randomUUID(), jobId, message, level, createdAt: new Date().toISOString() };
    if (persistenceConfigured()) { await db.logs.insert(log); return; }
    memory().logs.unshift(log);
  },
};
