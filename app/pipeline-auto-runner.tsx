"use client";

import type { ContentJob } from "@/lib/types";

/**
 * Background automation is handled by the authenticated server-side tick.
 * The dashboard is intentionally read-only so opening it can never create
 * duplicate pipeline workers or accidental retries.
 */
export function PipelineAutoRunner(_props: { jobs: ContentJob[] }) {
  return null;
}
