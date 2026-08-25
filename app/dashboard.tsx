"use client";

import { useEffect, useRef, useState } from "react";
import type { ContentJob, JobLog } from "@/lib/types";
import type { YoutubeAnalytics, YoutubeChannelStats } from "@/lib/youtube";

const labels: Record<string, string> = {
  queued: "Queued",
  researching: "Researching",
  scripting: "Scripting",
  generating_voice: "Voice",
  generating_visuals: "Video",
  assembling: "Uploading",
  uploading: "Uploading",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
};

const pipelineStages = ["Research", "Script", "Voice", "Video", "Title", "Description", "Tags & Keywords", "SEO", "YouTube Upload", "Publish"] as const;
type PipelineStatus = "pending" | "active" | "done" | "error";
type JobState = ContentJob["state"];

const isTerminal = (job: ContentJob) => ["scheduled", "published", "failed"].includes(job.state);
const isShort = (job: ContentJob) => job.format === "short";

function stageStatus(job: ContentJob | null, index: number): PipelineStatus {
  if (!job) return "pending";
  if (job.state === "scheduled" || job.state === "published") return "done";

  const done: boolean[] = [
    ["researching", "scripting", "generating_voice", "generating_visuals", "assembling", "uploading", "scheduled", "published"].includes(job.state),
    ["generating_voice", "generating_visuals", "assembling", "uploading", "scheduled", "published"].includes(job.state),
    ["generating_visuals", "assembling", "uploading", "scheduled", "published"].includes(job.state) || Boolean(job.voiceId),
    ["assembling", "uploading", "scheduled", "published"].includes(job.state) || Boolean(job.videoId && ["assembling", "uploading", "scheduled", "published"].includes(job.state)),
    Boolean(job.title) && ["generating_voice", "generating_visuals", "assembling", "uploading", "scheduled", "published"].includes(job.state),
    Boolean(job.description) && ["generating_voice", "generating_visuals", "assembling", "uploading", "scheduled", "published"].includes(job.state),
    Boolean(job.tags?.length) && ["generating_voice", "generating_visuals", "assembling", "uploading", "scheduled", "published"].includes(job.state),
    Boolean(job.seo) && ["generating_voice", "generating_visuals", "assembling", "uploading", "scheduled", "published"].includes(job.state),
    ["scheduled", "published"].includes(job.state),
    job.state === "published",
  ];

  if (job.state === "failed") {
    const failureIndex = !job.research ? 0 : !job.script ? 1 : !job.voiceId ? 2 : !job.videoId ? 3 : 8;
    return index === failureIndex ? "error" : index < failureIndex || done[index] ? "done" : "pending";
  }

  if (done[index]) return "done";
  const activeStage: Record<JobState, number> = {
    queued: -1,
    researching: 0,
    scripting: 1,
    generating_voice: 2,
    generating_visuals: 3,
    assembling: 8,
    thumbnail: 8,
    quality_check: 8,
    uploading: 8,
    scheduled: 9,
    published: 9,
    failed: -1,
  };
  return activeStage[job.state] === index ? "active" : "pending";
}

function stageIcon(status: PipelineStatus) {
  return status === "done" ? "✓" : status === "error" ? "!" : status === "active" ? "•" : "";
}

function pipelineProgress(job: ContentJob | null) {
  if (!job) return 0;
  if (job.state === "scheduled" || job.state === "published") return 100;
  const completed = pipelineStages.reduce((n, _, i) => n + (stageStatus(job, i) === "done" ? 1 : 0), 0);
  return Math.round((completed / pipelineStages.length) * 100);
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function hours(value: number) {
  return value < 10 ? value.toFixed(1) : compact(value);
}

function changePercent(current: number, previous: number) {
  if (previous === 0) return current > 0 ? "+100%" : "0%";
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`;
}

export function Dashboard({
  initialJobs,
  initialLogs,
  configured,
  youtubeConnected,
  channelStats,
  youtubeAnalytics,
}: {
  initialJobs: ContentJob[];
  initialLogs: JobLog[];
  configured: boolean;
  youtubeConnected: boolean;
  channelStats: YoutubeChannelStats | null;
  youtubeAnalytics: YoutubeAnalytics | null;
}) {
  const [jobs, setJobs] = useState(initialJobs.filter(isShort));
  const [logs, setLogs] = useState(initialLogs);
  const [runningId, setRunningId] = useState<string | null>(null);
  const runningRef = useRef<string | null>(null);

  const applyJob = (job: ContentJob) => {
    if (!isShort(job)) return;
    setJobs((all) => (all.some((j) => j.id === job.id) ? all.map((j) => (j.id === job.id ? job : j)) : [job, ...all]));
  };

  const addLog = (jobId: string, level: JobLog["level"], message: string) => {
    setLogs((all) => [{ id: crypto.randomUUID(), jobId, level, message, createdAt: new Date().toISOString() }, ...all]);
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const runJob = async (id: string) => {
    if (runningRef.current) return;
    runningRef.current = id;
    setRunningId(id);
    try {
      for (let attempt = 0; attempt < 180; attempt += 1) {
        const res = await fetch(`/api/jobs/${id}/run`, { method: "POST", cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (data.job) applyJob(data.job as ContentJob);
        if (!res.ok) {
          addLog(id, "error", data.error || "Pipeline request failed.");
          break;
        }
        const job = data.job as ContentJob | undefined;
        if (job?.state === "published" || job?.state === "scheduled") {
          addLog(id, "info", "✓ Short production and YouTube publishing completed.");
          break;
        }
        if (job?.state === "failed") {
          addLog(id, "error", "Short pipeline stopped with an error. Retry is available.");
          break;
        }
        await sleep(900);
      }
    } catch (error) {
      addLog(id, "error", error instanceof Error ? error.message : "Pipeline request failed.");
    } finally {
      runningRef.current = null;
      setRunningId(null);
    }
  };

  useEffect(() => {
    let stopped = false;
    const sync = async () => {
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (stopped || !Array.isArray(data.jobs)) return;
        const shortJobs = (data.jobs as ContentJob[]).filter(isShort);
        setJobs(shortJobs);
        const active = shortJobs.find((job) => !isTerminal(job) && job.state !== "queued");
        if (active && !runningRef.current) void runJob(active.id);
      } catch {
        // Poll again on the next interval.
      }
    };
    void sync();
    const timer = window.setInterval(sync, 2500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  const today = jobs.filter((j) => new Date(j.scheduledFor).toDateString() === new Date().toDateString());
  const activeJob = jobs.find((j) => !isTerminal(j)) ?? null;
  const progress = pipelineProgress(activeJob);
  const allDone = jobs.length > 0 && jobs.every((j) => j.state === "published" || j.state === "scheduled");

  return (
    <main>
      <aside>
        <div className="brand"><span>UWF</span> YT Agent</div>
        <nav>
          <a className="active">Overview</a>
          <a>Content pipeline</a>
          <a>Schedule</a>
          <a>Video library</a>
          <a href="/settings">Settings</a>
        </nav>
        <div className="sidebar-foot">Operations console<br /><small>Shorts only · v1.2.0</small></div>
      </aside>

      <section className="content">
        <header>
          <div>
            <p className="eyebrow">CONTENT OPERATIONS</p>
            <h1>Good morning, UWF.</h1>
            <p className="muted">Your autonomous YouTube Shorts publishing desk is ready.</p>
          </div>
          {youtubeConnected ? <span className="button connected-button">✓ Connected</span> : <a className="button" href="/api/youtube/oauth">{configured ? "Connect YouTube" : "Configure YouTube"}</a>}
        </header>

        <div className="metrics">
          <Metric name="Today’s jobs" value={`${today.length}/1`} hint="1 Short / day" />
          <Metric name="Pipeline active" value={String(jobs.filter((j) => !isTerminal(j)).length)} hint="Short content in progress" />
          <Metric name="YouTube" value={youtubeConnected ? "Connected" : configured ? "Ready" : "Setup needed"} hint={youtubeConnected ? "Uploads authorized" : "Add OAuth secrets"} />
          <Metric name="API health" value="Healthy" hint="Server responding" />
        </div>

        <div className="grid">
          <section className="panel wide">
            <div className="panel-title">
              <div><p className="eyebrow">TODAY</p><h2>Publishing queue</h2></div>
              <span className="muted">1 Short / day</span>
            </div>
            <div className="jobs">
              {jobs.slice(0, 5).map((job) => {
                const active = !isTerminal(job);
                const canRun = !runningId && !active && !["scheduled", "published"].includes(job.state);
                return (
                  <article className="job" key={job.id}>
                    <div className="job-icon">▶</div>
                    <div className="job-main"><strong>{job.title}</strong><span>{job.topic} · 30–60 sec YouTube Short</span></div>
                    <time>{new Date(job.scheduledFor).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                    <span className={`badge ${job.state}`}>{labels[job.state]}</span>
                    {active ? <span className="muted">Working…</span> : canRun ? <button onClick={() => void runJob(job.id)}>{job.state === "failed" ? "Retry" : "Run live"}</button> : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <p className="eyebrow">CHANNEL CONNECTION</p><h2>YouTube Studio</h2>
            <div className={`connection ${youtubeConnected ? "ok" : "warn"}`}>
              <b>{youtubeConnected ? "✓ Connected" : configured ? "Authorization required" : "Action required"}</b>
              <p>{youtubeConnected ? `${channelStats?.title ?? "Your YouTube channel"} is authorized for Shorts uploads.` : configured ? "Connect your Google account to authorize uploads." : "Add YouTube OAuth credentials in your server environment."}</p>
            </div>
            {youtubeConnected ? <span className="connected-note">Google account authorized</span> : <a className="text-link" href="/api/youtube/oauth">Open authorization →</a>}
          </section>

          <section className="panel wide analytics-panel">
            <div className="panel-title"><div><p className="eyebrow">YOUTUBE ANALYTICS</p><h2>{channelStats?.title ?? "Channel analytics"}</h2></div><span className="muted">Live channel totals</span></div>
            {channelStats ? <>
              <div className="analytics-grid">
                <Metric name="Subscribers" value={compact(channelStats.subscriberCount)} hint="Current subscribers" />
                <Metric name="Total views" value={compact(channelStats.viewCount)} hint="Lifetime channel views" />
                <Metric name="Videos" value={compact(channelStats.videoCount)} hint="Published videos" />
                <Metric name="Watch time" value={youtubeAnalytics ? `${hours(youtubeAnalytics.watchTimeHours)}h` : "—"} hint={youtubeAnalytics ? `Last ${youtubeAnalytics.recentDays} days` : "Analytics API needed"} />
              </div>
              <div className="recent-performance"><div><p className="eyebrow">RECENT PERFORMANCE</p><h3>Last 7 days</h3></div>{youtubeAnalytics ? <div className="performance-grid"><div><b>{compact(youtubeAnalytics.recentViews)}</b><span>Views · {changePercent(youtubeAnalytics.recentViews, youtubeAnalytics.previousViews)}</span></div><div><b>{compact(youtubeAnalytics.recentSubscribers)}</b><span>Subscribers · {changePercent(youtubeAnalytics.recentSubscribers, youtubeAnalytics.previousSubscribers)}</span></div><div><b>{hours(youtubeAnalytics.watchTimeHours)}h</b><span>Watch time</span></div></div> : <p className="muted">Enable the YouTube Analytics API to load recent performance.</p>}</div>
            </> : <div className="analytics-empty">{youtubeConnected ? "Channel analytics are temporarily unavailable." : "Connect YouTube to load channel statistics."}</div>}
          </section>

          <section className="panel wide">
            <div className="panel-title">
              <div><p className="eyebrow">AUTOMATION PIPELINE</p><h2>Short production stages</h2></div>
              <div style={{ minWidth: 190, textAlign: "right" }}><strong style={{ fontSize: 22 }}>{progress}%</strong><span className={`pipeline-overall ${allDone ? "all-done" : activeJob?.state === "failed" ? "has-error" : "in-progress"}`} style={{ display: "block", marginTop: 6 }}>{allDone ? "✓ All Done" : activeJob?.state === "failed" ? "✕ Error" : activeJob ? "Live worker execution" : "Ready to run"}</span></div>
            </div>
            <div style={{ height: 8, width: "100%", background: "rgba(128,128,128,.18)", borderRadius: 999, overflow: "hidden", margin: "4px 0 18px" }}><div style={{ height: "100%", width: `${progress}%`, background: "currentColor", borderRadius: 999, transition: "width .35s ease" }} /></div>
            <div className="pipeline-checklist">
              {pipelineStages.map((stage, index) => { const status = stageStatus(activeJob, index); return <div key={stage} className={`pipeline-stage ${status}`}><b>{status === "pending" ? index + 1 : stageIcon(status)}</b><span>{stage}</span><em>{status === "done" ? "Complete · 10%" : status === "error" ? "Error" : status === "active" ? "In progress" : "Pending"}</em></div>; })}
            </div>
            <p className="muted pipeline-note">{allDone ? "Short production completed and the Short is published/scheduled on YouTube." : activeJob ? `Pipeline completion: ${progress}% · ✓ complete, • in progress, ! error, or pending.` : "Pipeline is ready. Press Run live to start the Short."}</p>
          </section>

          <section className="panel wide">
            <div className="panel-title"><div><p className="eyebrow">ACTIVITY</p><h2>Pipeline logs</h2></div></div>
            <div className="logs">{logs.slice(0, 6).map((log) => <p key={log.id}><span className={log.level}>●</span> {log.message}<time>{new Date(log.createdAt).toLocaleTimeString()}</time></p>)}</div>
          </section>

          <section className="panel">
            <p className="eyebrow">SCHEDULE RULE</p><h2>Weekly format</h2>
            <p className="schedule"><b>Monday–Sunday</b><br />YouTube Shorts only<br /><br /><b>Daily</b><br />1 Short · 30–60 seconds<br /><br /><span className="muted">Long-form videos are disabled. Long-form and manual-only Short scheduling are removed from the agent.</span></p>
          </section>
        </div>
      </section>
    </main>
  );
}

function Metric({ name, value, hint }: { name: string; value: string; hint: string }) {
  return <article className="metric"><p>{name}</p><strong>{value}</strong><span>{hint}</span></article>;
}
