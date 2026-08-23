import { NextResponse } from "next/server";
import { youtubeAuthUrl } from "@/lib/youtube";
export async function GET() { try { return NextResponse.redirect(youtubeAuthUrl()); } catch (error) { const message = error instanceof Error ? error.message : "OAuth setup failed"; return NextResponse.json({ error: message, hint: "Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI on the server." }, { status: 503 }); } }
