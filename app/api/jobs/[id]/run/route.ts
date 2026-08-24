import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { runLiveStage } from "@/lib/worker";

export const maxDuration = 60;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const job = await store.get(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (["published", "scheduled"].includes(job.state)) return NextResponse.json({ error: "This job cannot run", job }, { status: 409 });
  try {
    const retryJob = job.state === "failed" ? await store.update(id, "queued") : job;
    const result = await runLiveStage(retryJob ?? job);
    return NextResponse.json({ job: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Pipeline failed", job: await store.get(id) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
