import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { runLiveStage } from "@/lib/worker";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const job = store.get(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (["failed", "published", "scheduled"].includes(job.state)) return NextResponse.json({ error: "This job cannot run" }, { status: 409 });
  try {
    return NextResponse.json({ job: await runLiveStage(job) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Pipeline failed", job: store.get(id) }, { status: 500 });
  }
}
