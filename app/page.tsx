import { cookies } from "next/headers";
import { Dashboard } from "./dashboard";
import { store } from "@/lib/store";
import { getYoutubeChannelStats } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("uwf_youtube_refresh_token")?.value;
  const oauthConfigured = Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REDIRECT_URI);

  let youtubeConnected = false;
  let channelStats = null;
  if (refreshToken && oauthConfigured) {
    try {
      channelStats = await getYoutubeChannelStats(refreshToken);
      youtubeConnected = true;
    } catch {
      youtubeConnected = false;
    }
  }

  return (
    <Dashboard
      initialJobs={store.list()}
      initialLogs={store.logs()}
      configured={oauthConfigured}
      youtubeConnected={youtubeConnected}
      channelStats={channelStats}
    />
  );
}
