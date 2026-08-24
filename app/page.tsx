import { cookies } from "next/headers";
import { Dashboard } from "./dashboard";
import { PipelineAutoRunner } from "./pipeline-auto-runner";
import { store } from "@/lib/store";
import { getYoutubeAnalytics, getYoutubeChannelStats } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("uwf_youtube_refresh_token")?.value;
  const oauthConfigured = Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REDIRECT_URI);

  let youtubeConnected = false;
  let channelStats = null;
  let youtubeAnalytics = null;
  if (refreshToken && oauthConfigured) {
    try {
      channelStats = await getYoutubeChannelStats(refreshToken);
      youtubeConnected = true;
      try { youtubeAnalytics = await getYoutubeAnalytics(refreshToken); } catch { youtubeAnalytics = null; }
    } catch { youtubeConnected = false; }
  }

  const initialJobs = await store.list();
  const initialLogs = await store.logs();

  return (
    <>
      <PipelineAutoRunner jobs={initialJobs} />
      <Dashboard initialJobs={initialJobs} initialLogs={initialLogs} configured={oauthConfigured} youtubeConnected={youtubeConnected} channelStats={channelStats} youtubeAnalytics={youtubeAnalytics} />
    </>
  );
}
