import { NextResponse } from "next/server";

export async function GET() {
  const aiConfigured = Boolean(
    process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OLLAMA_BASE_URL,
  );
  const supabaseConfigured = Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
  const youtubeConfigured = Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REDIRECT_URI);
  const voiceConfigured = Boolean(process.env.ELEVENLABS_API_KEY || process.env.DEEPGRAM_API_KEY);
  const videoConfigured = Boolean(process.env.OPENAI_API_KEY || process.env.RUNWAYML_API_SECRET);

  return NextResponse.json({
    status: aiConfigured && supabaseConfigured && youtubeConfigured && voiceConfigured && videoConfigured ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      ai: aiConfigured,
      supabase: supabaseConfigured,
      youtubeOAuth: youtubeConfigured,
      voice: voiceConfigured,
      video: videoConfigured,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
