import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { advanceJob } from "@/lib/pipeline";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = await store.get((await params).id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (["failed", "published", "scheduled"].includes(job.state)) return NextResponse.json({ error: "This job cannot advance" }, { status: 409 });
  return NextResponse.json({ job: await advanceJob(job) });
}
