import type { ContentJob, JobLog, JobState } from "./types";
import { formatForDate, dailySlots } from "./schedule";
import { db, persistenceConfigured } from "./db";

declare global { var uwfStore: { jobs: ContentJob[]; logs: JobLog[] } | undefined; }

const now = new Date();
const format = formatForDate(now);
const seedJob = (): ContentJob => ({
  id: `seed-${now.toISOString().slice(0, 10)}`,
  title: "Smart Investing: Today’s Crypto Setup",
  topic: "Investment education",
  format,
  state: "researching",
  scheduledFor: dailySlots(now)[0].toISOString(),
  createdAt: now.toISOString(),
  attempts: 0,
});

const memory = () => (global.uwfStore ??= {
  jobs: [seedJob()],
  logs: [{ id: "log-1", jobId: seedJob().id, level: "info", message: "Research workflow started.", createdAt: now.toISOString() }],
});

async function ensureDbSeed() {
  const jobs = await db.jobs.list();
  if (jobs.length) return jobs;
  const job = seedJob();
  await db.jobs.insert(job);
  await db.logs.insert({ id: crypto.randomUUID(), jobId: job.id, level: "info", message: "Research workflow started.", createdAt: new Date().toISOString() });
}

export const store = {
  list: async () => {
    if (!persistenceConfigured()) return memory().jobs.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    await ensureDbSeed();
    return db.jobs.list();
  },
  get: async (id: string) => persistenceConfigured() ? db.jobs.get(id) : memory().jobs.find((j) => j.id === id),
  create: async (input: Pick<ContentJob, "title" | "topic" | "format" | "scheduledFor">) => {
    const job: ContentJob = { ...input, id: crypto.randomUUID(), state: "queued", createdAt: new Date().toISOString(), attempts: 0 };
    if (persistenceConfigured()) return db.jobs.insert(job);
    memory().jobs.push(job); return job;
  },
  update: async (id: string, state: JobState, error?: string) => {
    const current = await store.get(id);
    if (!current) return undefined;
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
  logs: async (jobId?: string) => persistenceConfigured() ? db.logs.list(jobId) : memory().logs.filter((log) => !jobId || log.jobId === jobId),
  log: async (jobId: string, message: string, level: JobLog["level"] = "info") => {
    const log: JobLog = { id: crypto.randomUUID(), jobId, message, level, createdAt: new Date().toISOString() };
    if (persistenceConfigured()) { await db.logs.insert(log); return; }
    memory().logs.unshift(log);
  },
};
