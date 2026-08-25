import type { ContentJob, JobLog } from "./types";

type DbJob = Record<string, unknown>;
type DbLog = Record<string, unknown>;

const baseUrl = () => (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const secretKey = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const persistenceConfigured = () => Boolean(baseUrl() && secretKey());

// UWF is short-form only. Legacy database rows are normalized to short format.
const mapJob = (row: DbJob): ContentJob => ({ id: String(row.id), title: String(row.title), topic: String(row.topic), format: "short", state: String(row.state) as ContentJob["state"], scheduledFor: String(row.scheduled_for), createdAt: String(row.created_at), attempts: Number(row.attempts ?? 0), error: typeof row.error === "string" ? row.error : undefined, youtubeVideoId: typeof row.youtube_video_id === "string" ? row.youtube_video_id : undefined, research: typeof row.research === "string" ? row.research : undefined, script: typeof row.script === "string" ? row.script : undefined, description: typeof row.description === "string" ? row.description : undefined, tags: Array.isArray(row.tags) ? row.tags.filter((v): v is string => typeof v === "string") : [], seo: typeof row.seo === "string" ? row.seo : undefined, voiceId: typeof row.voice_id === "string" ? row.voice_id : undefined, voiceBytes: typeof row.voice_bytes === "number" ? row.voice_bytes : undefined, videoId: typeof row.video_id === "string" ? row.video_id : undefined });
const mapLog = (row: DbLog): JobLog => ({ id: String(row.id), jobId: String(row.job_id), level: row.level === "error" ? "error" : "info", message: String(row.message), createdAt: String(row.created_at) });

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = baseUrl(); const key = secretKey();
  if (!url || !key) throw new Error("Supabase persistence is not configured.");
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, cache: "no-store", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${await response.text()}`);
  const text = await response.text(); return (text ? JSON.parse(text) : null) as T;
}

export const db = {
  jobs: {
    list: () => request<DbJob[]>("uwf_content_jobs?select=*&order=scheduled_for.asc").then((rows) => rows.map(mapJob)),
    get: (id: string) => request<DbJob[]>(`uwf_content_jobs?select=*&id=eq.${encodeURIComponent(id)}&limit=1`).then((rows) => rows[0] ? mapJob(rows[0]) : null),
    insert: (job: ContentJob) => request<DbJob[]>("uwf_content_jobs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ id: job.id, title: job.title, topic: job.topic, format: "short", state: job.state, scheduled_for: job.scheduledFor, created_at: job.createdAt, attempts: job.attempts, error: job.error ?? null, youtube_video_id: job.youtubeVideoId ?? null, research: job.research ?? null, script: job.script ?? null, description: job.description ?? null, tags: job.tags ?? [], seo: job.seo ?? null, voice_id: job.voiceId ?? null, voice_bytes: job.voiceBytes ?? null, video_id: job.videoId ?? null }) }).then((rows) => mapJob(rows[0])),
    update: (id: string, patch: Partial<ContentJob>) => {
      const body: Record<string, unknown> = {};
      if (patch.title !== undefined) body.title = patch.title; if (patch.topic !== undefined) body.topic = patch.topic; if (patch.format !== undefined) body.format = "short"; if (patch.state !== undefined) body.state = patch.state; if (patch.scheduledFor !== undefined) body.scheduled_for = patch.scheduledFor; if (patch.attempts !== undefined) body.attempts = patch.attempts; if (patch.error !== undefined) body.error = patch.error ?? null; if (patch.youtubeVideoId !== undefined) body.youtube_video_id = patch.youtubeVideoId ?? null; if (patch.research !== undefined) body.research = patch.research ?? null; if (patch.script !== undefined) body.script = patch.script ?? null; if (patch.description !== undefined) body.description = patch.description ?? null; if (patch.tags !== undefined) body.tags = patch.tags ?? []; if (patch.seo !== undefined) body.seo = patch.seo ?? null; if (patch.voiceId !== undefined) body.voice_id = patch.voiceId ?? null; if (patch.voiceBytes !== undefined) body.voice_bytes = patch.voiceBytes ?? null; if (patch.videoId !== undefined) body.video_id = patch.videoId ?? null;
      return request<DbJob[]>(`uwf_content_jobs?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) }).then((rows) => rows[0] ? mapJob(rows[0]) : null);
    },
    claim: (id: string) => request<boolean>("rpc/claim_uwf_job", { method: "POST", body: JSON.stringify({ p_id: id }) }),
    release: (id: string) => request<boolean>("rpc/release_uwf_job", { method: "POST", body: JSON.stringify({ p_id: id }) }),
  },
  logs: {
    list: (jobId?: string) => request<DbLog[]>(`uwf_job_logs?select=*&${jobId ? `job_id=eq.${encodeURIComponent(jobId)}&` : ""}order=created_at.desc&limit=50`).then((rows) => rows.map(mapLog)),
    insert: (log: JobLog) => request<DbLog[]>("uwf_job_logs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ id: log.id, job_id: log.jobId, level: log.level, message: log.message, created_at: log.createdAt }) }).then((rows) => mapLog(rows[0])),
  },
};
