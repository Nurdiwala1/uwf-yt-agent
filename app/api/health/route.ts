import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ status: "ok", timestamp: new Date().toISOString(), services: { youtubeOAuth: Boolean(process.env.YOUTUBE_CLIENT_ID), supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), ai: Boolean(process.env.OPENAI_API_KEY) } }); }
