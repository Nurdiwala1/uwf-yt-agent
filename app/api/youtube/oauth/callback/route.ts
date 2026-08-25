import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { exchangeYoutubeCode, getYoutubeChannelStats } from "@/lib/youtube";
import { db, persistenceConfigured } from "@/lib/db";

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  if (error || !code) return NextResponse.redirect(new URL(`/?youtube_error=${encodeURIComponent(error ?? "No authorization code")}`, request.url));
  try {
    const tokens = await exchangeYoutubeCode(code);
    const existingToken = (await cookies()).get("uwf_youtube_refresh_token")?.value;
    const refreshToken = tokens.refresh_token ?? existingToken;
    if (!refreshToken) return NextResponse.redirect(new URL("/?youtube_error=missing_refresh_token", request.url));
    if (persistenceConfigured()) {
      const stats = await getYoutubeChannelStats(refreshToken);
      await db.youtube.saveRefreshToken(refreshToken, stats.channelId, stats.title, stats.thumbnail);
    }
    const response = NextResponse.redirect(new URL("/?youtube=connected", request.url));
    response.cookies.set("uwf_youtube_refresh_token", refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/?youtube_error=token_exchange_failed", request.url));
  }
}
