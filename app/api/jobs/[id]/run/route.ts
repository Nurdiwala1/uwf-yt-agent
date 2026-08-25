import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { runLiveStage } from "@/lib/worker";

export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const retry = new URL(request.url).searchParams.get("retry") === "1";
  let job = await store.get(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (["published", "scheduled"].includes(job.state)) {
    return NextResponse.json({ error: "This job is already complete", job }, { status: 409 });
  }

  // A failed job must never restart automatically. It can only be reset by
  // the visible Retry button, which calls this endpoint with ?retry=1.
  if (job.state === "failed") {
    if (!retry) {
      return NextResponse.json({ job, error: job.error || "Pipeline failed. Manual retry required." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    job = (await store.update(id, "queued")) ?? job;
    await store.log(id, "Manual retry requested. Pipeline reset to queued.");
  }

  try {
    const result = await runLiveStage(job);
    return NextResponse.json(
      { job: result, error: result.error },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const latest = await store.get(id);
    const message = latest?.error || (error instanceof Error ? error.message : "Pipeline failed");
    return NextResponse.json(
      { error: message, job: latest },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
