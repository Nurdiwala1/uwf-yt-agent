import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { runAutomatedShortStage } from "@/lib/automation-worker";

export const maxDuration = 60;
const FALLBACK_AUTOMATION_KEY = "JsACSy0eflHpU3nrbjVjMgsfCY2bSw80MJhVVDcSuSk";

function authorized(request: Request) {
  const configured = process.env.CRON_SECRET || process.env.UWF_AUTOMATION_KEY;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-uwf-automation-key");
  return Boolean(supplied && supplied === (configured || FALLBACK_AUTOMATION_KEY));
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const jobs = await store.list();
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayJob = jobs.find((j) => j.scheduledFor.slice(0, 10) === todayKey);
    if (!todayJob) return NextResponse.json({ error: "Daily Short job was not created." }, { status: 500 });
    if (["published", "scheduled", "failed"].includes(todayJob.state)) return NextResponse.json({ ok: true, job: todayJob, message: `Today is already ${todayJob.state}.` });
    const result = await runAutomatedShortStage(todayJob);
    return NextResponse.json({ ok: true, job: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation tick failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
