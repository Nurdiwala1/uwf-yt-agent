"use client";

import { useEffect } from "react";
import type { ContentJob } from "@/lib/types";

const terminal = new Set(["failed", "published", "scheduled"]);

export function PipelineAutoRunner({ jobs }: { jobs: ContentJob[] }) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const active = jobs.find((job) => !terminal.has(job.state));
    if (!active) return;

    const tick = async () => {
      if (cancelled) return;
      try {
        const response = await fetch(`/api/jobs/${active.id}/run`, { method: "POST", cache: "no-store" });
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
        // Keep retrying; the durable job state remains authoritative.
      }
      timer = setTimeout(tick, active.state === "generating_visuals" ? 10_000 : 5_000);
    };

    timer = setTimeout(tick, 1_500);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [jobs]);

  return null;
}
