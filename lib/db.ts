import type { ContentJob, JobLog } from "./types";

const baseUrl = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const secretKey = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const persistenceConfigured = () => Boolean(baseUrl() && secretKey());

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = baseUrl();
  const key = secretKey();
  if (!url || !key) throw new Error("Supabase persistence is not configured.");

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status}): ${await response.text()}`);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const db = {
  jobs: {
    list: () => request<ContentJob[]>("uwf_content_jobs?select=*&order=scheduled_for.asc"),
    get: (id: string) => request<ContentJob[]>(`uwf_content_jobs?select=*&id=eq.${encodeURIComponent(id)}&limit=1`).then((rows) => rows[0] ?? null),
    insert: (job: ContentJob) => request<ContentJob[]>("uwf_content_jobs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id: job.id,
        title: job.title,
        topic: job.topic,
        format: job.format,
        state: job.state,
        scheduled_for: job.scheduledFor,
        created_at: job.createdAt,
        attempts: job.attempts,
        error: job.error ?? null,
        youtube_video_id: job.youtubeVideoId ?? null,
        research: job.research ?? null,
        script: job.script ?? null,
        description: job.description ?? null,
        tags: job.tags ?? [],
        seo: job.seo ?? null,
        voice_id: job.voiceId ?? null,
        voice_bytes: job.voiceBytes ?? null,
        video_id: job.videoId ?? null,
      },
    }).then((rows) => rows[0]!),
    update: (id: string, patch: Partial<ContentJob>) => {
      const body: Record<string, unknown> = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.topic !== undefined) body.topic = patch.topic;
      if (patch.format !== undefined) body.format = patch.format;
      if (patch.state !== undefined) body.state = patch.state;
      if (patch.scheduledFor !== undefined) body.scheduled_for = patch.scheduledFor;
      if (patch.attempts !== undefined) body.attempts = patch.attempts;
      if (patch.error !== undefined) body.error = patch.error ?? null;
      if (patch.youtubeVideoId !== undefined) body.youtube_video_id = patch.youtubeVideoId ?? null;
      if (patch.research !== undefined) body.research = patch.research ?? null;
      if (patch.script !== undefined) body.script = patch.script ?? null;
      if (patch.description !== undefined) body.description = patch.description ?? null;
      if (patch.tags !== undefined) body.tags = patch.tags ?? [];
      if (patch.seo !== undefined) body.seo = patch.seo ?? null;
      if (patch.voiceId !== undefined) body.voice_id = patch.voiceId ?? null;
      if (patch.voiceBytes !== undefined) body.voice_bytes = patch.voiceBytes ?? null;
      if (patch.videoId !== undefined) body.video_id = patch.videoId ?? null;
      return request<ContentJob[]>(`uwf_content_jobs?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(body),
      }).then((rows) => rows[0] ?? null);
    },
    claim: (id: string) => request<boolean[]>("rpc/claim_uwf_job", {
      method: "POST",
      body: JSON.stringify({ p_id: id }),
    }).then((value) => Boolean(value)),
  },
  logs: {
    list: (jobId?: string) => request<JobLog[]>(`uwf_job_logs?select=*&${jobId ? `job_id=eq.${encodeURIComponent(jobId)}&` : ""}order=created_at.desc&limit=50`),
    insert: (log: JobLog) => request<JobLog[]>("uwf_job_logs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ id: log.id, job_id: log.jobId, level: log.level, message: log.message, created_at: log.createdAt }),
    }).then((rows) => rows[0]!),
  },
};
