import { google } from "googleapis";
import { Readable } from "node:stream";

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

export type YoutubeAnalytics = {
  watchTimeHours: number;
  recentViews: number;
  recentSubscribers: number;
  previousViews: number;
  previousSubscribers: number;
  recentDays: number;
};

export function youtubeAuthUrl() {
  return oauth().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
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

export async function getYoutubeAnalytics(refreshToken: string): Promise<YoutubeAnalytics> {
  const client = oauth();
  client.setCredentials({ refresh_token: refreshToken });
  await client.getAccessToken();

  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 13);

  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const response = await google.youtubeAnalytics("v2").reports.query({
    auth: client,
    ids: "channel==MINE",
    startDate: iso(start),
    endDate: iso(end),
    metrics: "estimatedMinutesWatched,views,subscribersGained",
    dimensions: "day",
    sort: "day",
    maxResults: 14,
  });

  const rows = (response.data.rows ?? []).map((row) => ({
    minutes: Number(row[1] ?? 0),
    views: Number(row[2] ?? 0),
    subscribers: Number(row[3] ?? 0),
  }));
  const recent = rows.slice(-7);
  const previous = rows.slice(0, Math.max(0, rows.length - 7));
  const sum = (items: typeof rows, key: "minutes" | "views" | "subscribers") => items.reduce((total, item) => total + item[key], 0);

  return {
    watchTimeHours: sum(recent, "minutes") / 60,
    recentViews: sum(recent, "views"),
    recentSubscribers: sum(recent, "subscribers"),
    previousViews: sum(previous, "views"),
    previousSubscribers: sum(previous, "subscribers"),
    recentDays: recent.length,
  };
}

export async function uploadToYouTube(
  refreshToken: string,
  metadata: {
    title: string;
    description: string;
    tags: string[];
    privacyStatus: "private" | "unlisted" | "public";
    publishAt?: string;
  },
  videoBody: ReadableStream<Uint8Array>,
) {
  const client = oauth();
  client.setCredentials({ refresh_token: refreshToken });
  await client.getAccessToken();

  const body = Readable.fromWeb(videoBody as Parameters<typeof Readable.fromWeb>[0]);
  return google.youtube("v3").videos.insert({
    auth: client,
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title: metadata.title, description: metadata.description, tags: metadata.tags },
      status: { privacyStatus: metadata.privacyStatus, publishAt: metadata.publishAt },
    },
    media: { body },
  });
}
