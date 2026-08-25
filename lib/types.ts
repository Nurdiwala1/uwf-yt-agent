export const JOB_STATES = ["queued", "researching", "scripting", "generating_voice", "generating_visuals", "assembling", "thumbnail", "quality_check", "uploading", "scheduled", "published", "failed"] as const;
export type JobState = (typeof JOB_STATES)[number];
export type ContentFormat = "short";
export interface ContentJob {
  id: string; title: string; topic: string; format: ContentFormat; state: JobState;
  scheduledFor: string; createdAt: string; attempts: number; error?: string; youtubeVideoId?: string;
  research?: string; script?: string; description?: string; tags?: string[]; seo?: string;
  voiceId?: string; voiceBytes?: number; videoId?: string;
}
export interface JobLog { id: string; jobId: string; level: "info" | "error"; message: string; createdAt: string; }
