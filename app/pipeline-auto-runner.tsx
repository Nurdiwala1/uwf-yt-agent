"use client";

import { useEffect } from "react";
import type { ContentJob } from "@/lib/types";

// A queued job must never start by itself. Run Live is the explicit trigger.
// Once a job has started, the runner continues one durable stage at a time.
const terminal = new Set(["queued", "failed", "published", "scheduled"]);

export function PipelineAutoRunner({ jobs }: { jobs: ContentJob[] }) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const active = jobs.find((job) => !terminal.has(job.state));
    if (!active) return;

    const tick = async () => {
      if (cancelled) return;
      try {
        const response = await fetch(`/api/jobs/${active.id}/run`, {
          method: "POST",
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok && data.job) {
          const next = data.job as ContentJob;
          if (next.state !== active.state) {
            window.location.reload();
            return;
          }
        }
      } catch {
        // Durable state is authoritative; retry the same stage on the next tick.
      }
      timer = setTimeout(tick, active.state === "generating_visuals" ? 10_000 : 3_000);
    };

    timer = setTimeout(tick, 1_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobs]);

  return null;
}
