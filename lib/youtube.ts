import { google } from "googleapis";

function oauth() {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI } = process.env;
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REDIRECT_URI) throw new Error("YouTube OAuth is not configured.");
  return new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI);
}

export type YoutubeChannelStats = {
  channelId: string;
  title: string;
  thumbnail?: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
};

export function youtubeAuthUrl() {
  return oauth().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
  });
}

export async function exchangeYoutubeCode(code: string) {
  return (await oauth().getToken(code)).tokens;
}

export async function getYoutubeChannelStats(refreshToken: string): Promise<YoutubeChannelStats> {
  const client = oauth();
  client.setCredentials({ refresh_token: refreshToken });
  await client.getAccessToken();

  const response = await google.youtube("v3").channels.list({
    auth: client,
    part: ["snippet", "statistics"],
    mine: true,
  });
  const channel = response.data.items?.[0];
  if (!channel?.id || !channel.snippet || !channel.statistics) {
    throw new Error("No authorized YouTube channel was found.");
  }

  return {
    channelId: channel.id,
    title: channel.snippet.title ?? "YouTube channel",
    thumbnail: channel.snippet.thumbnails?.default?.url ?? undefined,
    subscriberCount: Number(channel.statistics.subscriberCount ?? 0),
    viewCount: Number(channel.statistics.viewCount ?? 0),
    videoCount: Number(channel.statistics.videoCount ?? 0),
  };
}

export async function uploadToYouTube(accessToken: string, metadata: { title: string; description: string; tags: string[]; privacyStatus: "private" | "unlisted" | "public"; publishAt?: string }, videoBody: NodeJS.ReadableStream) {
  const client = oauth();
  client.setCredentials({ access_token: accessToken });
  return google.youtube("v3").videos.insert({
    auth: client,
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title: metadata.title, description: metadata.description, tags: metadata.tags },
      status: { privacyStatus: metadata.privacyStatus, publishAt: metadata.publishAt },
    },
    media: { body: videoBody },
  });
}
