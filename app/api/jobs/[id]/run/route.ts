import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { runLiveStage } from "@/lib/worker";

// Keep Run Live responsive: one durable pipeline stage per request.
export const maxDuration = 300;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const job = await store.get(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (["published", "scheduled"].includes(job.state)) {
    return NextResponse.json({ error: "This job is already complete", job }, { status: 409 });
  }

  // The durable store lease is the single-flight guard. If another browser/tab
  // is already executing this job, return its current state instead of starting
  // a second provider request.
  try {
    const claimed = await store.claim(id);
    if (!claimed) {
      const current = await store.get(id);
      return NextResponse.json(
        { job: current ?? job, running: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const current = await store.get(id);
    if (!current) return NextResponse.json({ error: "Job disappeared from the store." }, { status: 404 });

    const result = await runLiveStage(current);
    return NextResponse.json(
      { job: result, running: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pipeline failed", job: await store.get(id) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
