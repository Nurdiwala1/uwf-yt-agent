import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { runLiveStage } from "@/lib/worker";

// Each request performs one durable pipeline stage. The worker owns the
// single-flight lease so concurrent browser tabs cannot start duplicate jobs.
export const maxDuration = 300;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const job = await store.get(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (["published", "scheduled"].includes(job.state)) {
    return NextResponse.json({ error: "This job is already complete", job }, { status: 409 });
  }

  try {
    const result = await runLiveStage(job);
    return NextResponse.json(
      { job: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pipeline failed", job: await store.get(id) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
