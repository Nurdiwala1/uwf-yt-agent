import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/store";

const bodySchema = z.object({
  title: z.string().min(3).max(120),
  topic: z.string().min(3).max(300),
  format: z.enum(["short", "long"]),
  scheduledFor: z.string().datetime(),
});

export async function GET() {
  return NextResponse.json({ jobs: await store.list() });
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const job = await store.create(parsed.data);
  await store.log(job.id, "Job queued through API.");

  return NextResponse.json({ job }, { status: 201 });
}
